import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { JobQueue } from "../src/services/jobs";
import { reviewJob } from "../src/services/job-review";
test("uncertain publication requires owner confirmation before it can be sent again", () => {
  const db = new Database(":memory:");
  const q = new JobQueue(db);
  const job = q.enqueue(2, "publish", 10, { target: "instagram" });
  const claimed = q.claim("worker")!;
  q.fail(claimed, "uncertain", "Confira o resultado", "needs_review");
  assert.throws(
    () => reviewJob(q, 3, job.id, "confirm-not-published"),
    /encontrada/i,
  );
  reviewJob(q, 2, job.id, "confirm-published", "post-confirmed");
  const row = db
    .prepare("SELECT phase,post_id FROM pipeline_publications")
    .get() as { phase: string; post_id: string };
  assert.equal(row.phase, "succeeded");
  assert.equal(row.post_id, "post-confirmed");
  assert.equal(q.get(job.id, 2)?.status, "queued");
  assert.throws(
    () => reviewJob(q, 2, job.id, "confirm-not-published"),
    /revis/i,
  );
  db.close();
});
