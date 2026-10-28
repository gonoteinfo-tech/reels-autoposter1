import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { JobQueue, safeError } from "../src/services/jobs";

test("queue is durable, deduplicates requests and rejects stale completion", () => {
  const db = new Database(":memory:");
  const queue = new JobQueue(db);
  const a = queue.enqueue(2, "prepare", 10);
  assert.equal(queue.enqueue(2, "prepare", 10).id, a.id);
  const first = queue.claim("a", 1000, 100);
  assert.equal(first?.id, a.id);
  assert.equal(queue.claim("b", 1050, 100), undefined);
  const recovered = queue.claim("b", 1101, 100);
  assert.equal(recovered?.id, a.id);
  assert.throws(() => queue.finish(first!, 1102), /lease/i);
  queue.finish(recovered!, 1102);
  assert.equal(queue.get(a.id, 2)?.status, "succeeded");
  assert.equal(queue.get(a.id, 3), undefined);
  new JobQueue(db);
  assert.equal(queue.get(a.id, 2)?.status, "succeeded");
  db.close();
});

test("temporary failure backs off; blocked jobs reactivate only for their owner", () => {
  const db = new Database(":memory:");
  const q = new JobQueue(db);
  const now = Date.now();
  q.enqueue(2, "prepare", 1);
  const j = q.claim("worker", now)!;
  q.fail(j, "temporary", "rede falhou", "retry_wait", now + 2000);
  assert.equal(q.claim("worker", now + 1500), undefined);
  const retry = q.claim("worker", now + 2000)!;
  assert.equal(retry.attempts, 2);
  q.fail(retry, "credentials", "Conecte a página", "blocked");
  assert.equal(q.unblock(3), 0);
  assert.equal(q.unblock(2), 1);
  assert.equal(q.claim("worker")?.id, j.id);
  db.close();
});

test("expired publication and paid trigger are held for review, never blindly resent", () => {
  for (const kind of ["publish", "discover"] as const) {
    const db = new Database(":memory:");
    const q = new JobQueue(db);
    const j = q.enqueue(2, kind, 1);
    q.claim("old", 1000, 100);
    assert.equal(q.claim("new", 1101), undefined);
    assert.equal(q.get(j.id, 2)?.status, "needs_review");
    assert.equal(q.enqueue(2, kind, 1, {}, true).status, "needs_review");
    db.close();
  }
});

test("a completed target cannot be republished through queue revival", () => {
  const db = new Database(":memory:");
  const q = new JobQueue(db);
  const j = q.enqueue(2, "publish", 10, { target: "instagram" });
  q.finish(q.claim("worker")!);
  assert.equal(
    q.enqueue(2, "publish", 10, { target: "instagram" }, true).id,
    j.id,
  );
  assert.equal(q.claim("worker"), undefined);
  db.close();
});

test("diagnostics redact authorization bearer credentials and cookies", () => {
  const message = safeError(
    "Authorization: Bearer secret-bearer\nCookie: session=secret-cookie\ntoken=secret-token https://cdn.example.com/a?sig=secret-signature",
  );
  for (const value of [
    "secret-bearer",
    "secret-cookie",
    "secret-token",
    "secret-signature",
  ])
    assert.ok(!message.includes(value));
});

test("queue preserves rows across process connections and caps actual failures", () => {
  const db = new Database(":memory:");
  const q = new JobQueue(db);
  const job = q.enqueue(2, "prepare", 20);
  for (let i = 1; i <= 5; i++) {
    const claimed = q.claim("worker")!;
    assert.equal(claimed.attempts, i);
    q.fail(claimed, "network", "falha", "retry_wait", 0);
  }
  assert.equal(q.get(job.id, 2)?.status, "failed");
  assert.equal(q.claim("worker"), undefined);
  db.close();
});

test("saving corrected credentials reactivates Meta token and permission failures only for the owner", () => {
  const db = new Database(":memory:");
  const q = new JobQueue(db);
  for (const [id, code] of [
    [190, "meta_190"],
    [10, "meta_10"],
    [200, "meta_200"],
  ] as const) {
    q.enqueue(2, "publish", id, { target: "instagram" });
    q.fail(q.claim("worker")!, code, "Reconnect Meta", "blocked");
  }
  assert.equal(q.unblock(3), 0);
  assert.equal(q.unblock(2), 3);
  db.close();
});
