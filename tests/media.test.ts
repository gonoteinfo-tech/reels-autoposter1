import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateMediaUrl, runTool } from "../src/services/media";
import { resizeVideo, getVideoInfo } from "../src/services/video-processor";

test("media rejects local addresses, credentials and non-HTTPS before making requests", async () => {
  for (const url of [
    "http://example.com/a",
    "https://127.0.0.1/a",
    "https://169.254.169.254/a",
    "https://[::1]/a",
    "https://[::ffff:127.0.0.1]/a",
    "https://name:pass@example.com/a",
    "https://example.com:3000/a",
  ]) {
    await assert.rejects(() => validateMediaUrl(url));
  }
});

test("child process is killed on timeout", async () => {
  const start = Date.now();
  await assert.rejects(() =>
    runTool(process.execPath, ["-e", "setTimeout(()=>{},10000)"], {
      timeout: 100,
    }),
  );
  assert.ok(Date.now() - start < 3000);
});

test("real FFmpeg normalizes a video without a logo", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reels-media-"));
  try {
    const input = path.join(dir, "in.mp4"),
      output = path.join(dir, "out.mp4");
    await runTool(process.env.FFMPEG_PATH || "ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=64x64:d=0.2",
      "-c:v",
      "libx264",
      input,
    ]);
    await resizeVideo(input, output);
    const info = await getVideoInfo(output);
    assert.equal(info.width, 1080);
    assert.equal(info.height, 1920);
    assert.equal(info.codec, "h264");
    assert.ok(info.duration > 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
