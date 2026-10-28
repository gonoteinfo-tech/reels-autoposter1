import { test, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

test("a ready publication proceeds while another Reel is still being prepared", { timeout: 10_000 }, async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "reels-throughput-"));
  process.env.DATA_DIR = path.join(directory, "data");
  process.env.PIPELINE_TEST_MARKER = path.join(directory, "preparing");
  process.env.FFMPEG_PATH = path.join(directory, "slow-ffmpeg");
  process.env.FFPROBE_PATH = path.join(directory, "ffprobe");
  fs.writeFileSync(process.env.FFMPEG_PATH, '#!/bin/sh\n: > "$PIPELINE_TEST_MARKER"\nwhile :; do sleep 0.1; done\n', { mode: 0o700 });
  fs.writeFileSync(process.env.FFPROBE_PATH, '#!/bin/sh\nprintf \'%s\' \'{"streams":[{"codec_type":"video","codec_name":"h264","width":1080,"height":1920}],"format":{"duration":"1","bit_rate":"1000"}}\'\n', { mode: 0o700 });
  for (const key of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME", "R2_PUBLIC_URL"]) process.env[key] = "test";
  const db = await import("../src/services/database");
  const { getQueue } = await import("../src/services/pipeline");
  const { runWorker } = await import("../src/services/worker");
  db.initDatabase();
  db.updateSettings(1, {
    facebook_page_access_token: "test", facebook_page_id: "page",
    instagram_business_account_id: "ig", instagram_enabled: true,
    facebook_enabled: false, auto_publish: true, publish_interval_minutes: 0,
    cron_schedule: "0 0 1 1 *",
  });
  const source = db.createSource({ username: "manual", user_id: 1 });
  const preparing = db.createReel({ source_id: source.id, source_username: "manual", user_id: 1, instagram_url: "https://www.instagram.com/reel/Slow123/" })!;
  const input = path.join(directory, "input.mp4");
  fs.writeFileSync(input, "test media handled by the controlled process fixture");
  db.updateReel(preparing.id, { local_path: input, caption: "Legenda já reescrita.", stage: "downloaded" }, 1);
  const q = getQueue();
  q.setState("legacy_imported", "true");
  q.enqueue(1, "prepare", preparing.id);
  const fake = mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    assert.ok(url.endsWith("/ig/media_publish"), `Unexpected external request: ${url}`);
    return Response.json({ id: "ready-post" });
  });
  t.after(() => fake.mock.restore());
  const stop = new AbortController();
  const running = runWorker(stop.signal);
  try {
    const deadline = Date.now() + 2500;
    while (!fs.existsSync(process.env.PIPELINE_TEST_MARKER) && Date.now() < deadline) await delay(20);
    assert.ok(fs.existsSync(process.env.PIPELINE_TEST_MARKER), "the preparation process must be running");
    const ready = db.createReel({ source_id: source.id, source_username: "manual", user_id: 1, instagram_url: "https://www.instagram.com/reel/Ready123/" })!;
    db.updateReel(ready.id, { r2_url: "https://video.example.com/ready.mp4", caption: "Legenda já reescrita.", stage: "uploaded" }, 1);
    q.db.prepare("INSERT INTO pipeline_publications(reel_id,user_id,target,phase,remote_id,updated_at) VALUES(?,1,'instagram','ready','container',?)").run(ready.id, Date.now());
    q.enqueue(1, "publish", ready.id, { target: "instagram" });
    const publishDeadline = Date.now() + 2500;
    while (!db.getReelById(ready.id, 1)?.ig_post_id && Date.now() < publishDeadline) await delay(20);
    assert.equal(db.getReelById(ready.id, 1)?.ig_post_id, "ready-post", "publishing must not wait for another Reel's preparation to finish");
    assert.equal(q.db.prepare("SELECT status FROM pipeline_jobs WHERE kind='prepare' AND ref_id=?").get(preparing.id).status, "running");
  } finally {
    stop.abort();
    await running;
  }
});
