import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
test("worker boots without an HTTP request and releases its durable lock on shutdown", async () => {
  process.env.DATA_DIR = fs.mkdtempSync(
    path.join(os.tmpdir(), "reels-worker-"),
  );
  const { runWorker } = await import("../src/services/worker");
  const { getQueue } = await import("../src/services/pipeline");
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 100);
  try {
    await runWorker(stop.signal);
  } finally {
    clearTimeout(timer);
  }
  const q = getQueue();
  assert.equal(q.state("worker_lock"), "null");
  assert.equal(q.state("heartbeat"), "0");
  assert.equal(q.state("legacy_imported"), "true");
  assert.ok(
    q.db
      .prepare("SELECT next_at FROM pipeline_schedules WHERE user_id=1")
      .get(),
  );
});
