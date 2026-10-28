import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("caption failure checkpoints download; retry resumes without downloading again", async () => {
  process.env.DATA_DIR = fs.mkdtempSync(
    path.join(os.tmpdir(), "reels-pipeline-"),
  );
  for (const key of [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "R2_PUBLIC_URL",
    "GEMINI_API_KEY",
  ])
    process.env[key] = "test";
  const db = await import("../src/services/database");
  const { executeJob } = await import("../src/services/pipeline");
  const { JobQueue } = await import("../src/services/jobs");
  db.initDatabase();
  db.updateSettings(1, {
    facebook_page_access_token: "mock",
    facebook_page_id: "mock",
    instagram_enabled: false,
  });
  const source = db.createSource({ username: "test", user_id: 1 });
  const reel = db.createReel({
    source_id: source.id,
    source_username: "test",
    user_id: 1,
    instagram_url: "https://www.instagram.com/reel/abc/",
    direct_video_url: "https://example.com/test.mp4",
    original_caption: "Um fato real.",
  })!;
  const q = new JobQueue(db.getDb());
  q.enqueue(1, "prepare", reel.id);
  let downloads = 0,
    captions = 0;
  const adapters = {
    download: async (_url: string, output: string) => {
      downloads++;
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, "video");
      return output;
    },
    caption: async () => {
      captions++;
      if (captions === 1) throw new Error("temporary outage");
      return "Legenda editada";
    },
    normalize: async (_input: string, output: string) => {
      fs.writeFileSync(output, "processed");
      return output;
    },
    upload: async () => "https://example.com/processed.mp4",
  };
  await executeJob(q.claim("test")!, q, undefined, adapters);
  assert.equal(
    q.db.prepare("SELECT status FROM pipeline_jobs").get().status,
    "retry_wait",
  );
  assert.ok(db.getReelById(reel.id)?.local_path);
  q.db.prepare("UPDATE pipeline_jobs SET available_at=0").run();
  await executeJob(q.claim("test")!, q, undefined, adapters);
  assert.equal(downloads, 1);
  assert.equal(
    db.getReelById(reel.id)?.r2_url,
    "https://example.com/processed.mp4",
  );
  assert.equal(
    q.db
      .prepare("SELECT COUNT(*) AS n FROM pipeline_jobs WHERE kind='publish'")
      .get().n,
    1,
  );
});

test("missing connected page is explicit and recoverable after configuration changes", async () => {
  const db = await import("../src/services/database");
  const { executeJob } = await import("../src/services/pipeline");
  const { JobQueue } = await import("../src/services/jobs");
  db.updateSettings(1, {
    facebook_page_access_token: "",
    facebook_page_id: "",
  });
  const q = new JobQueue(db.getDb());
  const job = q.enqueue(1, "prepare", 999);
  await executeJob(q.claim("test", Date.now(), 60_000, ["prepare"])!, q);
  assert.equal(q.get(job.id, 1)?.status, "blocked");
  assert.equal(q.unblock(1), 1);
});

test("a confirmed post is reconciled after a crash without sending it again", async () => {
  const db = await import("../src/services/database");
  const { executeJob } = await import("../src/services/pipeline");
  const { JobQueue } = await import("../src/services/jobs");
  const q = new JobQueue(db.getDb());
  q.db.prepare("DELETE FROM pipeline_jobs").run();
  const source = db.getAllSources(1)[0];
  const reel = db.createReel({
    source_id: source.id,
    source_username: "test",
    user_id: 1,
    instagram_url: "https://www.facebook.com/reel/987/",
  })!;
  db.updateReel(reel.id, {
    stage: "publishing",
    fb_post_id: "already-published",
    r2_url: "https://example.com/a.mp4",
  });
  const job = q.enqueue(1, "publish", reel.id, { target: "facebook" });
  await executeJob(q.claim("test")!, q);
  assert.equal(q.get(job.id, 1)?.status, "succeeded");
  assert.equal(db.getReelById(reel.id)?.stage, "published");
});
