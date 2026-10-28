import { test, mock } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { JobQueue } from "../src/services/jobs";
import { publishStep, type MetaTransport } from "../src/services/publications";

test("publication checkpoints remote container and never sends a completed target twice", async () => {
  const db = new Database(":memory:"),
    q = new JobQueue(db);
  const calls: string[] = [];
  const api: MetaTransport = async (method, url) => {
    calls.push(method + " " + url);
    return url.endsWith("/media_publish")
      ? { id: "post-1" }
      : method === "GET"
        ? { status_code: "FINISHED" }
        : { id: "container-1" };
  };
  const args = {
    db,
    userId: 2,
    reelId: 10,
    target: "instagram" as const,
    token: "mock",
    accountId: "ig",
    pageId: "fb",
    videoUrl: "https://example.com/a.mp4",
    caption: "editada",
    assertOwned: () => {},
    api,
  };
  assert.equal((await publishStep(args)).done, false);
  assert.equal((await publishStep(args)).done, false);
  assert.equal((await publishStep(args)).postId, "post-1");
  const count = calls.length;
  assert.equal((await publishStep(args)).postId, "post-1");
  assert.equal(calls.length, count);
  assert.equal(calls.filter((c) => c.endsWith("/media")).length, 1);
  assert.equal(
    q.db.prepare("SELECT remote_id FROM pipeline_publications").get().remote_id,
    "container-1",
  );
  db.close();
});

test("timeout after external publish is held for review, not blindly resubmitted", async () => {
  const db = new Database(":memory:");
  new JobQueue(db);
  let posts = 0;
  const api: MetaTransport = async (method, url) => {
    if (url.endsWith("/media_publish")) {
      posts++;
      throw new Error("connection lost after send");
    }
    return method === "GET" ? { status_code: "FINISHED" } : { id: "container" };
  };
  const args = {
    db,
    userId: 2,
    reelId: 11,
    target: "instagram" as const,
    token: "mock",
    accountId: "ig",
    pageId: "fb",
    videoUrl: "https://example.com/a.mp4",
    caption: "editada",
    assertOwned: () => {},
    api,
  };
  await publishStep(args);
  await publishStep(args);
  await assert.rejects(() => publishStep(args), {
    disposition: "needs_review",
  });
  await assert.rejects(() => publishStep(args), {
    disposition: "needs_review",
  });
  assert.equal(posts, 1);
  db.close();
});

test("Facebook is not successful until remote processing confirms publication", async () => {
  const db = new Database(":memory:");
  new JobQueue(db);
  let ready = false;
  const api: MetaTransport = async (method, url) =>
    url.includes("rupload.")
      ? { success: true }
      : method === "GET"
        ? {
            status: {
              video_status: ready ? "ready" : "processing",
              publishing_phase: { status: ready ? "complete" : "not_started" },
            },
          }
        : {
            success: true,
            video_id: "fb-video",
            upload_url:
              "https://rupload.facebook.com/video-upload/v21.0/fb-video",
          };
  const args = {
    db,
    userId: 2,
    reelId: 12,
    target: "facebook" as const,
    token: "mock",
    accountId: "ig",
    pageId: "fb",
    videoUrl: "https://example.com/a.mp4",
    caption: "editada",
    assertOwned: () => {},
    api,
  };
  for (let i = 0; i < 4; i++)
    assert.equal((await publishStep(args)).done, false);
  ready = true;
  assert.deepEqual(await publishStep(args), { done: true, postId: "fb-video" });
  db.close();
});

test("HTTP 500 with a non-HTTP Graph error code never releases an uncertain mutation for retry", async () => {
  const db = new Database(":memory:");
  new JobQueue(db);
  let calls = 0;
  const stub = mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json(
      { error: { code: 2, message: "Temporary server error" } },
      { status: 500 },
    );
  });
  const args = {
    db,
    userId: 2,
    reelId: 99,
    target: "instagram" as const,
    token: "mock",
    accountId: "ig",
    videoUrl: "https://example.com/a.mp4",
    caption: "edited",
    assertOwned: () => {},
  };
  try {
    await assert.rejects(() => publishStep(args), {
      disposition: "needs_review",
    });
    await assert.rejects(() => publishStep(args), {
      disposition: "needs_review",
    });
    assert.equal(calls, 1);
    assert.equal(
      (
        db.prepare("SELECT phase FROM pipeline_publications").get() as {
          phase: string;
        }
      ).phase,
      "needs_review",
    );
  } finally {
    stub.mock.restore();
    db.close();
  }
});
