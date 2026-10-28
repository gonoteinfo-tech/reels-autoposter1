import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
test("commands isolate users, deduplicate and status reads never restart a paused worker", async () => {
  process.env.DATA_DIR = fs.mkdtempSync(
    path.join(os.tmpdir(), "reels-commands-"),
  );
  const db = await import("../src/services/database");
  const p = await import("../src/services/pipeline");
  const s = await import("../src/services/scheduler");
  db.initDatabase();
  const source = db.createSource({ username: "test", user_id: 1 });
  const first = p.enqueueSource(1, source.id, true);
  assert.equal(p.enqueueSource(1, source.id, true).id, first.id);
  assert.throws(() => p.enqueueSource(2, source.id, true));
  s.stopScheduler();
  for (let i = 0; i < 3; i++)
    assert.equal(s.getSchedulerStatus(1).scheduler_active, false);
  assert.equal(p.getQueue().state("paused"), "true");
  assert.equal(
    p
      .getQueue()
      .db.prepare("SELECT COUNT(*) n FROM pipeline_jobs WHERE status='running'")
      .get().n,
    0,
  );
});
