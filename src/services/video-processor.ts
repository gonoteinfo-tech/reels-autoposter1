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

export async function getVideoInfo(filePath: string) {
  const data = JSON.parse(
    await runTool(
      FFPROBE,
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", filePath],
      { timeout: 30_000 },
    ),
  );
  const video = data.streams?.find(
    (s: { codec_type: string }) => s.codec_type === "video",
  );
  if (!video) throw new Error("Nenhum stream de vídeo encontrado.");
  return {
    duration: Number(data.format.duration) || 0,
    width: Number(video.width) || 0,
    height: Number(video.height) || 0,
    codec: String(video.codec_name),
    bitrate: Number(data.format.bit_rate) || 0,
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
  const info = await getVideoInfo(input);
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
    await runTool(FFMPEG, args, {
      timeout: Number(process.env.FFMPEG_TIMEOUT_MS) || 600_000,
      signal,
    });
    await getVideoInfo(temp);
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
