import { test, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

test("zero interval wakes an old pacing wait without repeatedly waking remote processing", { timeout: 8000 }, async (t) => {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "reels-worker-pacing-"));
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
  const reel = db.createReel({ source_id: source.id, source_username: "manual", user_id: 1, instagram_url: "https://www.instagram.com/reel/Deferred123/" })!;
  db.updateReel(reel.id, { r2_url: "https://video.example.com/a.mp4", caption: "Legenda.", stage: "uploaded" }, 1);
  const q = getQueue();
  q.setState("legacy_imported", "true");
  const job = q.enqueue(1, "publish", reel.id, { target: "instagram" });
  q.defer(q.claim("old-worker", Date.now(), 60_000, ["publish"])!, Date.now() + 10 * 60_000);
  q.db.prepare("INSERT INTO pipeline_windows VALUES(1,999,?)").run(Date.now() + 10 * 60_000);
  let creates = 0;
  let requests = 0;
  const stub = mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    requests++;
    assert.ok(url.endsWith("/ig/media"), `Unexpected external request: ${url}`);
    creates++;
    return Response.json({ id: "container" });
  });
  t.after(() => stub.mock.restore());
  const stop = new AbortController();
  const running = runWorker(stop.signal);
  try {
    const deadline = Date.now() + 2500;
    while (q.db.prepare("SELECT phase FROM pipeline_publications WHERE reel_id=?").get(reel.id)?.phase !== "processing" && Date.now() < deadline) await delay(20);
    assert.equal(creates, 1, "an old interval must not keep the first publication parked for ten minutes");
    assert.equal(q.db.prepare("SELECT phase FROM pipeline_publications WHERE reel_id=?").get(reel.id).phase, "processing");
    assert.ok(q.get(job.id, 1)!.available_at > Date.now(), "external processing must retain its poll wait");
  } finally {
    stop.abort();
    await running;
  }
  const restart = new AbortController();
  const timer = setTimeout(() => restart.abort(), 100);
  try { await runWorker(restart.signal); }
  finally { clearTimeout(timer); }
  assert.equal(requests, 1, "refresh must not wake a container that is waiting for remote processing");
});
