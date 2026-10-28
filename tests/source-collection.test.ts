import { test, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "reels-collection-"));
process.env.BRIGHTDATA_API_TOKEN = "test";

test("a finished crawler failure is recorded, releases its snapshot and permits a fresh manual sync", async (t) => {
  const db = await import("../src/services/database");
  const p = await import("../src/services/pipeline");
  db.initDatabase();
  db.updateSettings(1, {
    facebook_page_access_token: "test", facebook_page_id: "test",
    facebook_enabled: true, instagram_enabled: false, auto_publish: false,
  });
  const source = db.createSource({ username: "metropoles", user_id: 1 });
  db.setSourcePendingSnapshot(source.id, "failed");
  db.getDb().prepare("UPDATE source_profiles SET last_checked_at=? WHERE id=?").run("2026-10-28 17:58:32", source.id);
  const q = p.getQueue();
  const job = p.enqueueSource(1, source.id, true, q);
  let triggers = 0;
  const fake = mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("/trigger?")) {
      triggers++;
      return Response.json({ snapshot_id: "recovered" });
    }
    if (url.includes("/progress/")) return Response.json({ status: "ready" });
    if (url.includes("/snapshot/failed")) return Response.json([{
      timestamp: "2026-10-28T17:59:52Z", input: { url: "https://www.instagram.com/metropoles/" },
      error: "Crawler error: Request failed for https://instagram.example/ too many requests", error_code: "crawler_error",
    }]);
    return Response.json([{ shortcode: "New123", video_url: "https://video.example.com/new.mp4", description: "Notícia confirmada." }]);
  });
  t.after(() => fake.mock.restore());

  await p.executeJob(q.claim("worker", Date.now(), 60_000, ["collect"])!, q);
  assert.equal(q.get(job.id, 1)?.status, "failed");
  assert.equal(q.get(job.id, 1)?.error_code, "scraper_rate_limited");
  assert.equal(db.getSourceById(source.id, 1)?.pending_snapshot_id, null);
  assert.equal(db.getSourceById(source.id, 1)?.last_checked_at, "2026-10-28 17:58:32");
  assert.equal(triggers, 0, "a failed completed snapshot must not automatically trigger paid retries");

  const next = p.enqueueSource(1, source.id, true, q);
  assert.equal(next.kind, "discover");
  await p.executeJob(q.claim("worker", Date.now(), 60_000, ["discover"])!, q);
  assert.equal(triggers, 1);
  await p.executeJob(q.claim("worker", Date.now(), 60_000, ["collect"])!, q);
  assert.equal(q.get(job.id, 1)?.status, "succeeded");
  assert.equal(db.getSourceById(source.id, 1)?.pending_snapshot_id, null);
  assert.equal(db.getDb().prepare("SELECT COUNT(*) n FROM reels WHERE source_id=?").get(source.id).n, 1);
});

test("a temporary error reading a snapshot preserves it for retry", async (t) => {
  const db = await import("../src/services/database");
  const p = await import("../src/services/pipeline");
  const source = db.createSource({ username: "temporary", user_id: 1 });
  db.setSourcePendingSnapshot(source.id, "still-readable-later");
  const q = p.getQueue();
  const job = p.enqueueSource(1, source.id, true, q);
  const fake = mock.method(globalThis, "fetch", async () => Response.json({ error: "Temporary gateway failure" }, { status: 503 }));
  t.after(() => fake.mock.restore());
  await p.executeJob(q.claim("worker", Date.now(), 60_000, ["collect"])!, q);
  assert.equal(q.get(job.id, 1)?.status, "retry_wait");
  assert.equal(db.getSourceById(source.id, 1)?.pending_snapshot_id, "still-readable-later");
});

test("a completed old snapshot cannot clear a newer collection for the source", async (t) => {
  const db = await import("../src/services/database");
  const p = await import("../src/services/pipeline");
  const source = db.createSource({ username: "newer-collection", user_id: 1 });
  const q = p.getQueue();
  const job = q.enqueue(1, "collect", source.id, { snapshot: "old-snapshot" });
  db.setSourcePendingSnapshot(source.id, "new-snapshot");
  const fake = mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    return Response.json(url.includes("/progress/") ? { status: "ready" } : [{ error: "too many requests" }]);
  });
  t.after(() => fake.mock.restore());
  await p.executeJob(q.claim("worker", Date.now(), 60_000, ["collect"])!, q);
  assert.equal(q.get(job.id, 1)?.status, "failed");
  assert.equal(db.getSourceById(source.id, 1)?.pending_snapshot_id, "new-snapshot");
});
