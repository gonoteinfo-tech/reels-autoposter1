import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { JobQueue } from "../src/services/jobs";
import {
  acquireWorker,
  releaseWorker,
  recoverInterruptedPublications,
} from "../src/services/worker";
test("only one worker owns scheduling and processing; stale owner cannot release successor", () => {
  const db = new Database(":memory:");
  const q = new JobQueue(db);
  assert.equal(acquireWorker(q, "a", 1000), true);
  assert.equal(acquireWorker(q, "b", 2000), false);
  assert.equal(acquireWorker(q, "b", 62_000), true);
  releaseWorker(q, "a");
  assert.equal(acquireWorker(q, "c", 63_000), false);
  releaseWorker(q, "b");
  assert.equal(acquireWorker(q, "c", 63_000), true);
  db.close();
});

test("crash recovery preserves deliberate review and exhausted-attempt states", () => {
  const db = new Database(":memory:");
  const q = new JobQueue(db);
  const jobs = [];
  for (const [id, code] of [
    [1, "interrupted"],
    [2, "expired_session"],
    [3, "uncertain"],
    [4, "interrupted"],
  ] as const) {
    const job = q.enqueue(2, "publish", id, { target: "instagram" });
    jobs.push(job);
    q.fail(q.claim("worker")!, code, "review", "needs_review");
    db.prepare(
      "INSERT INTO pipeline_publications(reel_id,user_id,target,phase,updated_at) VALUES(?,2,'instagram','processing',?)",
    ).run(id, Date.now());
  }
  db.prepare(
    "UPDATE pipeline_jobs SET attempts=max_attempts WHERE ref_id=4",
  ).run();
  assert.equal(recoverInterruptedPublications(q), 1);
  assert.equal(q.get(jobs[0].id, 2)?.status, "retry_wait");
  for (const job of jobs.slice(1))
    assert.equal(q.get(job.id, 2)?.status, "needs_review");
  db.close();
});
