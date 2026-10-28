import { test, mock } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JobQueue } from "../src/services/jobs";
import { publishStep, type MetaTransport } from "../src/services/publications";

test("Facebook session creation and transfer can continue without a processing wait", async () => {
  const db = new Database(":memory:");
  new JobQueue(db);
  const api: MetaTransport = async (_method, url) => url.includes("rupload.")
    ? { success: true }
    : { video_id: "video", upload_url: "https://rupload.facebook.com/video-upload/v26.0/video" };
  const args = { db, userId: 1, reelId: 1, target: "facebook" as const, token: "test", pageId: "page", videoUrl: "https://video.example.com/a.mp4", caption: "Legenda.", assertOwned: () => {}, api };
  try {
    assert.equal(((await publishStep(args)) as { waitMs?: number }).waitMs, 0);
    assert.equal(((await publishStep(args)) as { waitMs?: number }).waitMs, 0);
  } finally { db.close(); }
});

test("Instagram waits for remote processing but immediately continues once the container is ready", async () => {
  const db = new Database(":memory:");
  new JobQueue(db);
  db.prepare("INSERT INTO pipeline_publications VALUES(1,1,'instagram','processing','container',NULL,NULL,NULL,?)").run(Date.now());
  let ready = false;
  const api: MetaTransport = async (method) => method === "GET"
    ? { status_code: ready ? "FINISHED" : "IN_PROGRESS" }
    : { id: "post" };
  const args = { db, userId: 1, reelId: 1, target: "instagram" as const, token: "test", accountId: "ig", videoUrl: "https://video.example.com/a.mp4", caption: "Legenda.", assertOwned: () => {}, api };
  try {
    const processing = await publishStep(args) as { done: boolean; waitMs?: number };
    assert.equal(processing.done, false);
    assert.ok((processing.waitMs ?? 15000) > 0);
    ready = true;
    assert.equal(((await publishStep(args)) as { waitMs?: number }).waitMs, 0);
    assert.equal((await publishStep(args)).postId, "post");
  } finally { db.close(); }
});

test("setting the publication interval to zero bypasses an older reserved interval", async (t) => {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "reels-pacing-"));
  const db = await import("../src/services/database");
  const { getQueue, executeJob } = await import("../src/services/pipeline");
  db.initDatabase();
  db.updateSettings(1, { facebook_page_access_token: "test", facebook_page_id: "page", instagram_business_account_id: "ig", instagram_enabled: true, facebook_enabled: false, auto_publish: true, publish_interval_minutes: 0 });
  const source = db.createSource({ username: "manual", user_id: 1 });
  const reel = db.createReel({ source_id: source.id, source_username: "manual", user_id: 1, instagram_url: "https://www.instagram.com/reel/Ready123/" })!;
  db.updateReel(reel.id, { r2_url: "https://video.example.com/a.mp4", caption: "Legenda.", stage: "uploaded" }, 1);
  const q = getQueue();
  q.db.prepare("INSERT INTO pipeline_publications VALUES(?,1,'instagram','ready','container',NULL,NULL,NULL,?)").run(reel.id, Date.now());
  q.db.prepare("INSERT INTO pipeline_windows VALUES(1,999,?)").run(Date.now() + 30 * 60_000);
  const job = q.enqueue(1, "publish", reel.id, { target: "instagram" });
  const stub = mock.method(globalThis, "fetch", async () => Response.json({ id: "post-without-delay" }));
  t.after(() => stub.mock.restore());
  await executeJob(q.claim("worker", Date.now(), 60_000, ["publish"])!, q);
  assert.equal(q.get(job.id, 1)?.status, "succeeded");
  assert.equal(db.getReelById(reel.id, 1)?.ig_post_id, "post-without-delay");
});

test("the pipeline immediately schedules a known next Facebook step", async (t) => {
  const db = await import("../src/services/database");
  const { getQueue, executeJob } = await import("../src/services/pipeline");
  db.updateSettings(1, { instagram_enabled: false, facebook_enabled: true, publish_interval_minutes: 0 });
  const source = db.getAllSources(1)[0];
  const reel = db.createReel({ source_id: source.id, source_username: "manual", user_id: 1, instagram_url: "https://www.facebook.com/reel/12345/" })!;
  db.updateReel(reel.id, { r2_url: "https://video.example.com/a.mp4", caption: "Legenda.", stage: "uploaded" }, 1);
  const q = getQueue();
  const job = q.enqueue(1, "publish", reel.id, { target: "facebook" });
  const stub = mock.method(globalThis, "fetch", async () => Response.json({ video_id: "fb-video", upload_url: "https://rupload.facebook.com/video-upload/v26.0/fb-video" }));
  t.after(() => stub.mock.restore());
  await executeJob(q.claim("worker", Date.now(), 60_000, ["publish"])!, q);
  assert.equal(q.get(job.id, 1)?.status, "retry_wait");
  const next = q.claim("worker", Date.now(), 60_000, ["publish"]);
  assert.equal(next?.id, job.id, "the next step must be claimable without a 15-second delay");
  q.finish(next!);
});

test("a positive configured publication interval still delays the next Reel", async (t) => {
  const db = await import("../src/services/database");
  const { getQueue, executeJob } = await import("../src/services/pipeline");
  db.updateSettings(1, { publish_interval_minutes: 30 });
  const source = db.getAllSources(1)[0];
  const reel = db.createReel({ source_id: source.id, source_username: "manual", user_id: 1, instagram_url: "https://www.facebook.com/reel/67890/" })!;
  db.updateReel(reel.id, { r2_url: "https://video.example.com/a.mp4", caption: "Legenda.", stage: "uploaded" }, 1);
  const q = getQueue();
  const job = q.enqueue(1, "publish", reel.id, { target: "facebook" });
  let calls = 0;
  const stub = mock.method(globalThis, "fetch", async () => { calls++; return Response.json({ video_id: "unexpected" }); });
  t.after(() => stub.mock.restore());
  await executeJob(q.claim("worker", Date.now(), 60_000, ["publish"])!, q);
  assert.equal(q.get(job.id, 1)?.status, "retry_wait");
  assert.ok(q.get(job.id, 1)!.available_at > Date.now());
  assert.equal(calls, 0);
});
