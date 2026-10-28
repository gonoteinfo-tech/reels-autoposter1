import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runTool, FFMPEG, FFPROBE } from "../src/services/media";
import { getVideoInfo } from "../src/services/video-processor";

const exec = promisify(execFile);

async function fixture(dir: string, name = "input", extra: string[] = []) {
  const input = path.join(dir, `${name}.mp4`);
  await runTool(FFMPEG, [
    "-v", "error", "-y", "-f", "lavfi", "-i",
    "testsrc2=s=1080x1920:r=30:d=0.2", "-f", "lavfi", "-i",
    "sine=frequency=440:sample_rate=48000:duration=0.2",
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
    "-threads", "2", "-c:a", "aac", "-b:a", "128k", ...extra, input,
  ]);
  return input;
}

async function normalize(dir: string, input: string, options: {
  logo?: string; failCopy?: boolean; abortCopy?: boolean;
} = {}) {
  const output = path.join(dir, "output.mp4");
  const log = path.join(dir, "ffmpeg.jsonl");
  const wrapper = path.join(dir, "ffmpeg-wrapper.cjs");
  fs.writeFileSync(wrapper, `#!${process.execPath}
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.TEST_FFMPEG_LOG, JSON.stringify(args) + '\\n');
if (args.includes('copy') && process.env.TEST_ABORT_COPY) {
  fs.writeFileSync(args.at(-1), 'partial');
  fs.writeFileSync(process.env.TEST_ABORT_COPY, 'ready');
  setTimeout(() => process.exit(1), 10000);
} else if (args.includes('copy') && process.env.TEST_FAIL_COPY) {
  process.exit(1);
} else {
  const result = spawnSync(process.env.TEST_REAL_FFMPEG, args, { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
`, { mode: 0o755 });
  const abortMarker = path.join(dir, "abort-ready");
  const code = `
    import fs from 'node:fs';
    import { normalizeVideo } from './src/services/video-processor.ts';
    const signal = new AbortController();
    const timer = process.env.TEST_ABORT_COPY ? setInterval(() => {
      if (fs.existsSync(process.env.TEST_ABORT_COPY)) signal.abort();
    }, 10) : undefined;
    try {
      await normalizeVideo(process.argv[1], process.argv[2], process.argv[3] || null,
        'bottom-right', 80, signal.signal);
    } finally { clearInterval(timer); }
  `;
  const run = () => exec(process.execPath, [
    "--import", "tsx", "--input-type=module", "-e", code,
    input, output, options.logo || "",
  ], {
    cwd: process.cwd(), timeout: 30_000,
    env: { ...process.env, FFMPEG_PATH: wrapper, TEST_REAL_FFMPEG: FFMPEG,
      TEST_FFMPEG_LOG: log, TEST_FAIL_COPY: options.failCopy ? "1" : "",
      TEST_ABORT_COPY: options.abortCopy ? abortMarker : "" },
  });
  return { output, log, run, calls: () => fs.readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line) as string[]) };
}

async function packetHashes(input: string) {
  return JSON.parse(await runTool(FFPROBE, [
    "-v", "error", "-show_packets", "-show_data_hash", "sha256",
    "-show_entries", "packet=stream_index,data_hash", "-of", "json", input,
  ])).packets;
}

test("compatible video and AAC are stream copied to a faststart MP4", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reels-copy-"));
  try {
    const input = await fixture(dir);
    const result = await normalize(dir, input);
    await result.run();
    const [args] = result.calls();
    assert.equal(args[args.indexOf("-c:v") + 1], "copy");
    assert.equal(args[args.indexOf("-c:a") + 1], "copy");
    assert.ok(args.includes("+faststart"));
    assert.notEqual(args.at(-1), result.output);
    assert.deepEqual(await packetHashes(result.output), await packetHashes(input));
    const bytes = fs.readFileSync(result.output);
    assert.ok(bytes.indexOf(Buffer.from("moov")) < bytes.indexOf(Buffer.from("mdat")));
    assert.deepEqual(fs.readdirSync(dir).filter((name) => name.endsWith(".tmp.mp4")), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("incompatible dimensions, frame rate, audio, rotation and logos retain encoding", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reels-encode-"));
  try {
    const compatible = await fixture(dir);
    const rotated = path.join(dir, "rotated.mp4");
    await runTool(FFMPEG, ["-v", "error", "-y", "-display_rotation", "90", "-i", compatible, "-c", "copy", rotated]);
    assert.match(await runTool(FFPROBE, ["-v", "error", "-show_entries", "stream_side_data", "-of", "json", rotated]), /"rotation": 90/);
    const logo = path.join(dir, "logo.ppm");
    fs.writeFileSync(logo, Buffer.concat([Buffer.from("P6\n8 8\n255\n"), Buffer.alloc(8 * 8 * 3, 255)]));
    const cases = [
      { input: await fixture(dir, "square", ["-vf", "scale=64:64"]) },
      { input: await fixture(dir, "fps", ["-r", "24"]) },
      { input: await fixture(dir, "audio", ["-ar", "44100"]) },
      { input: rotated },
      { input: compatible, logo },
    ];
    for (const [index, item] of cases.entries()) {
      const caseDir = path.join(dir, String(index));
      fs.mkdirSync(caseDir);
      const result = await normalize(caseDir, item.input, { logo: item.logo });
      await result.run();
      assert.equal(result.calls()[0].includes("copy"), false, `must encode ${item.input}${item.logo ? " with logo" : ""}`);
      assert.ok(result.calls()[0].includes("libx264"));
      const info = await getVideoInfo(result.output);
      assert.equal(info.width, 1080);
      assert.equal(info.height, 1920);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("a failed stream copy falls back to normalization", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reels-copy-fallback-"));
  try {
    const result = await normalize(dir, await fixture(dir), { failCopy: true });
    await result.run();
    const calls = result.calls();
    assert.equal(calls.length, 2);
    assert.ok(calls[0].includes("copy"));
    assert.ok(calls[1].includes("libx264"));
    assert.equal((await getVideoInfo(result.output)).codec, "h264");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("aborting stream copy preserves the previous output and removes partial temp files", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reels-copy-abort-"));
  try {
    const result = await normalize(dir, await fixture(dir), { abortCopy: true });
    fs.writeFileSync(result.output, "previous output");
    await assert.rejects(result.run, /AbortError/);
    assert.equal(result.calls().length, 1);
    assert.equal(fs.readFileSync(result.output, "utf8"), "previous output");
    assert.deepEqual(fs.readdirSync(dir).filter((name) => name.endsWith(".tmp.mp4")), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
