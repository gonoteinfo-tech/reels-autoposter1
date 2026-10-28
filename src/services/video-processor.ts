import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { runTool, FFMPEG, FFPROBE } from "./media";

export type LogoPosition =
  "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
const positions: Record<LogoPosition, string> = {
  "top-left": "30:30",
  "top-right": "main_w-overlay_w-30:30",
  "bottom-left": "30:main_h-overlay_h-30",
  "bottom-right": "main_w-overlay_w-30:main_h-overlay_h-30",
  center: "(main_w-overlay_w)/2:(main_h-overlay_h)/2",
};

export async function getVideoInfo(filePath: string, signal?: AbortSignal) {
  const data = JSON.parse(
    await runTool(
      FFPROBE,
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", filePath],
      { timeout: 30_000, signal },
    ),
  );
  const video = data.streams?.find(
    (s: { codec_type: string }) => s.codec_type === "video",
  );
  if (!video) throw new Error("Nenhum stream de vídeo encontrado.");
  const audio = data.streams.filter(
    (s: { codec_type: string }) => s.codec_type === "audio",
  );
  // Only skip encoding when the source already matches our normal output shape.
  const canCopy =
    data.streams.filter((s: { codec_type: string }) => s.codec_type === "video").length === 1 &&
    video.codec_name === "h264" &&
    ["Constrained Baseline", "Baseline", "Main", "High"].includes(video.profile) &&
    video.level > 0 && video.level <= 42 &&
    video.pix_fmt === "yuv420p" &&
    video.width === 1080 && video.height === 1920 &&
    video.sample_aspect_ratio === "1:1" &&
    video.field_order === "progressive" &&
    video.r_frame_rate === "30/1" && video.avg_frame_rate === "30/1" &&
    !video.tags?.rotate &&
    !video.side_data_list?.some((s: { side_data_type: string }) => s.side_data_type === "Display Matrix") &&
    Number(video.bit_rate) > 0 && Number(video.bit_rate) <= 25_000_000 &&
    Number(data.format.bit_rate) > 0 && Number(data.format.bit_rate) <= 25_000_000 &&
    audio.length <= 1 && audio.every((s: {
      codec_name: string; profile: string; sample_rate: string; channels: number; bit_rate: string;
    }) => s.codec_name === "aac" && s.profile === "LC" &&
      s.sample_rate === "48000" && (s.channels === 1 || s.channels === 2) &&
      Number(s.bit_rate) > 0 && Number(s.bit_rate) <= 192_000);
  return {
    duration: Number(data.format.duration) || 0,
    width: Number(video.width) || 0,
    height: Number(video.height) || 0,
    codec: String(video.codec_name),
    bitrate: Number(data.format.bit_rate) || 0,
    canCopy,
  };
}

export async function normalizeVideo(
  input: string,
  output: string,
  logo?: string | null,
  position = "bottom-right",
  scale = 80,
  signal?: AbortSignal,
): Promise<string> {
  const info = await getVideoInfo(input, signal);
  if (
    info.duration <= 0 ||
    info.duration > (Number(process.env.MAX_VIDEO_SECONDS) || 900)
  )
    throw new Error("Duração de vídeo inválida ou excedida.");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temp = output + "." + randomUUID() + ".tmp.mp4";
  const args = ["-nostdin", "-y", "-i", input];
  const base =
    "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30";
  if (logo) {
    if (!Number.isFinite(scale) || scale < 10 || scale > 500)
      throw new Error("Escala de logo inválida.");
    args.push(
      "-i",
      logo,
      "-filter_complex",
      `[0:v]${base}[v];[1:v]scale=${scale}:-1[l];[v][l]overlay=${positions[position as LogoPosition] || positions["bottom-right"]}[out]`,
      "-map",
      "[out]",
    );
  } else args.push("-vf", base, "-map", "0:v:0");
  args.push(
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "48000",
    "-threads",
    String(Number(process.env.FFMPEG_THREADS) || 2),
    "-movflags",
    "+faststart",
    temp,
  );
  try {
    const options = {
      timeout: Number(process.env.FFMPEG_TIMEOUT_MS) || 600_000,
      signal,
    };
    let copied = false;
    if (!logo && info.canCopy) {
      try {
        await runTool(FFMPEG, [
          "-nostdin", "-y", "-i", input, "-map", "0:v:0", "-map", "0:a?",
          "-c:v", "copy", "-c:a", "copy", "-movflags", "+faststart", temp,
        ], options);
        await getVideoInfo(temp, signal);
        copied = true;
      } catch {
        signal?.throwIfAborted();
        fs.rmSync(temp, { force: true });
      }
    }
    if (!copied) {
      await runTool(FFMPEG, args, options);
      await getVideoInfo(temp, signal);
    }
    signal?.throwIfAborted();
    fs.renameSync(temp, output);
    return output;
  } finally {
    fs.rmSync(temp, { force: true });
  }
}
export function addLogoToVideo(
  input: string,
  logo: string,
  output: string,
  position = "bottom-right",
  scale = 80,
) {
  return normalizeVideo(input, output, logo, position, scale);
}
export function resizeVideo(input: string, output: string) {
  return normalizeVideo(input, output);
}
export async function generateThumbnail(
  input: string,
  output: string,
  timestamp = 1,
): Promise<string> {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  await runTool(
    FFMPEG,
    [
      "-nostdin",
      "-y",
      "-ss",
      String(timestamp),
      "-i",
      input,
      "-frames:v",
      "1",
      output,
    ],
    { timeout: 30_000 },
  );
  return output;
}
