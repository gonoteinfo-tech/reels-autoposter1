import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Reel, ReelStage } from "../src/types";
import type { JobKind, JobStatus } from "../src/services/jobs";

let database: typeof import("../src/services/database");
let temporaryDirectory: string;

before(async () => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "reels-dashboard-"));
  process.env.DATA_DIR = temporaryDirectory;
  database = await import("../src/services/database");
  database.initDatabase();
  database.getDb().exec(`
    INSERT INTO users (id, email, name) VALUES (2, 'other@example.test', 'Other');
    INSERT INTO source_profiles (id, user_id, username, is_active) VALUES
      (11, 1, 'primary', 1), (12, 1, 'secondary', 0), (21, 2, 'private', 1);
  `);
});

beforeEach(() => {
  database.getDb().prepare("DELETE FROM pipeline_jobs").run();
  database.getDb().prepare("DELETE FROM reels").run();
});

after(() => {
  database?.getDb().close();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

async function queries() {
  try {
    return await import("../src/services/dashboard");
  } catch (error) {
    assert.fail(`Dashboard queries must be available: ${String(error)}`);
  }
}

function insertReel(reel: Partial<Reel> & { id: number }): void {
  database.getDb().prepare(`
    INSERT INTO reels (
      id, user_id, source_id, source_username, instagram_url, caption,
      original_caption, stage, created_at, updated_at, published_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    reel.id,
    reel.user_id ?? 1,
    reel.source_id ?? 11,
    reel.source_username ?? "primary",
    `https://www.instagram.com/reel/dashboard-${reel.id}/`,
    reel.caption ?? "Ordinary video",
    reel.original_caption ?? "",
    reel.stage ?? "discovered",
    reel.created_at ?? "2026-01-01 10:00:00",
    reel.updated_at ?? "2026-01-01 10:00:00",
    reel.published_at ?? null,
  );
}

function insertJob(job: {
  id: string;
  ref_id: number;
  kind: JobKind;
  status: JobStatus;
  user_id?: number;
  updated_at?: number;
}): void {
  database.getDb().prepare(`
    INSERT INTO pipeline_jobs (
      id, dedupe_key, user_id, kind, ref_id, status, available_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?)
  `).run(job.id, job.id, job.user_id ?? 1, job.kind, job.ref_id, job.status, job.updated_at ?? 0);
}

test("pagination reaches older than fifty records with deterministic ordering and ownership", async () => {
  const { listDashboardReels } = await queries();
  for (let id = 1; id <= 65; id++) insertReel({ id });
  insertReel({ id: 66, created_at: "2025-01-01 10:00:00" });
  insertReel({ id: 100, user_id: 2, source_id: 21 });

  const result = listDashboardReels(1, new URLSearchParams("page=2&limit=50"));
  assert.equal(result.total, 66);
  assert.equal(result.page, 2);
  assert.equal(result.totalPages, 2);
  assert.deepEqual(result.reels.map((reel) => reel.id), [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 66]);
});

test("search covers older captions, original captions and usernames before pagination", async () => {
  const { listDashboardReels } = await queries();
  for (let id = 1; id <= 60; id++) insertReel({ id });
  insertReel({ id: 61, caption: "a Hidden story", created_at: "2025-01-01" });
  insertReel({ id: 62, original_caption: "HIDDEN original", created_at: "2025-01-01" });
  insertReel({ id: 63, source_username: "hidden_creator", created_at: "2025-01-01" });
  insertReel({ id: 64, user_id: 2, source_id: 21, caption: "Hidden private" });

  const result = listDashboardReels(1, new URLSearchParams("q=+hidden+&limit=2"));
  assert.equal(result.total, 3);
  assert.equal(result.totalPages, 2);
  assert.deepEqual(result.reels.map((reel) => reel.id), [63, 62]);
  assert.deepEqual(listDashboardReels(1, new URLSearchParams("q=hidden&page=2&limit=2")).reels.map((reel) => reel.id), [61]);
});

test("search treats percent, underscore, backslash and SQL text literally", async () => {
  const { listDashboardReels } = await queries();
  insertReel({ id: 1, caption: "100% ready" });
  insertReel({ id: 2, caption: "name_part" });
  insertReel({ id: 3, caption: "folder\\video" });
  insertReel({ id: 4, caption: "anything else" });
  for (const [q, expected] of [["%", [1]], ["_", [2]], ["\\", [3]], ["%' OR 1=1 --", []]] as const) {
    assert.deepEqual(listDashboardReels(1, new URLSearchParams({ q })).reels.map((reel) => reel.id), expected);
  }
});

test("processing group includes every intermediate stage and preserves exact filters", async () => {
  const { listDashboardReels } = await queries();
  const stages: ReelStage[] = ["discovered", "downloading", "downloaded", "processing", "processed", "uploading", "uploaded", "publishing", "published", "error"];
  stages.forEach((stage, index) => insertReel({ id: index + 1, stage }));
  insertReel({ id: 20, stage: "processing", source_id: 12 });
  insertReel({ id: 30, stage: "processing", user_id: 2, source_id: 21 });

  const grouped = listDashboardReels(1, new URLSearchParams("stage_group=processing"));
  assert.deepEqual(grouped.reels.map((reel) => reel.id), [20, 8, 6, 5, 4, 3, 2]);
  for (const [group, expected] of [["discovered", [1]], ["uploaded", [7]], ["published", [9]], ["error", [10]]] as const) {
    assert.deepEqual(listDashboardReels(1, new URLSearchParams({ stage_group: group })).reels.map((reel) => reel.id), expected);
  }
  assert.deepEqual(listDashboardReels(1, new URLSearchParams("stage=processing&source_id=11&stage_group=processing")).reels.map((reel) => reel.id), [4]);
  assert.equal(listDashboardReels(1, new URLSearchParams("source_id=21")).total, 0);
  assert.equal(listDashboardReels(1, new URLSearchParams("source_id=invalid")).total, 0);
});

test("pagination normalizes invalid values to finite bounded integers", async () => {
  const { listDashboardReels } = await queries();
  for (let id = 1; id <= 105; id++) insertReel({ id });

  const defaults = listDashboardReels(1, new URLSearchParams("page=Infinity&limit=NaN"));
  assert.equal(defaults.page, 1);
  assert.equal(defaults.reels.length, 20);
  const fractions = listDashboardReels(1, new URLSearchParams("page=2.9&limit=3.8"));
  assert.equal(fractions.page, 2);
  assert.deepEqual(fractions.reels.map((reel) => reel.id), [102, 101, 100]);
  const lowerBounds = listDashboardReels(1, new URLSearchParams("page=-3&limit=-2"));
  assert.equal(lowerBounds.page, 1);
  assert.equal(lowerBounds.reels.length, 1);
  const maximumLimit = listDashboardReels(1, new URLSearchParams("limit=999999999"));
  assert.equal(maximumLimit.reels.length, 100);
  const maximumPage = listDashboardReels(1, new URLSearchParams("page=1e100"));
  assert.ok(Number.isSafeInteger(maximumPage.page));
  assert.ok(maximumPage.page <= 1_000_000);
  assert.equal(maximumPage.reels.length, 0);
});

test("dashboard summaries include all stages and remain independent of listing filters", async () => {
  const { listDashboardReels, getDashboardSummary } = await queries();
  insertReel({ id: 1 });
  insertReel({ id: 2, stage: "uploaded" });
  insertReel({ id: 3, stage: "processing" });
  insertReel({ id: 4, stage: "published", published_at: "2026-01-01 12:00:00" });
  insertReel({ id: 5, stage: "error" });
  insertReel({ id: 6, user_id: 2, source_id: 21, stage: "published", published_at: "2026-02-01 12:00:00" });
  const before = getDashboardSummary(1);
  assert.equal(listDashboardReels(1, new URLSearchParams("q=missing&stage_group=error")).total, 0);
  assert.deepEqual(getDashboardSummary(1), before);
  assert.deepEqual(before.stage_counts, {
    discovered: 1, downloading: 0, downloaded: 0, processing: 1,
    processed: 0, uploading: 0, uploaded: 1, publishing: 0,
    published: 1, error: 1,
  });
  assert.equal(before.total_sources, 2);
  assert.equal(before.active_sources, 1);
  assert.equal(before.total_reels, 5);
  assert.equal(before.published_total, 1);
  assert.equal(before.pipeline_queue, 3);
  assert.equal(before.storage_used_mb, 0);
  assert.deepEqual(before.recent_published.map((reel) => reel.id), [4]);
  assert.equal(before.next_reel?.id, 2);
});

test("recent publications use latest publication time with five-record limit and ownership", async () => {
  const { getDashboardSummary } = await queries();
  for (let id = 1; id <= 7; id++) {
    insertReel({ id, stage: "published", published_at: `2026-01-0${id} 12:00:00`, created_at: `2026-02-0${8 - id}` });
  }
  insertReel({ id: 8, stage: "published", published_at: "2026-01-07 12:00:00" });
  insertReel({ id: 9, stage: "uploaded", published_at: "2026-03-01 12:00:00" });
  insertReel({ id: 10, user_id: 2, source_id: 21, stage: "published", published_at: "2026-04-01 12:00:00" });
  assert.deepEqual(getDashboardSummary(1).recent_published.map((reel) => reel.id), [8, 7, 6, 5, 4]);
});

test("next reel prefers oldest uploaded, falls back to oldest discovered, and is null when empty", async () => {
  const { getDashboardSummary } = await queries();
  assert.equal(getDashboardSummary(1).next_reel, null);
  insertReel({ id: 1, stage: "discovered", created_at: "2025-01-01" });
  insertReel({ id: 2, stage: "uploaded", created_at: "2026-01-02" });
  insertReel({ id: 3, stage: "uploaded", created_at: "2026-01-01" });
  insertReel({ id: 4, stage: "uploaded", created_at: "2026-01-01" });
  insertReel({ id: 5, stage: "uploaded", user_id: 2, source_id: 21, created_at: "2024-01-01" });
  assert.equal(getDashboardSummary(1).next_reel?.id, 3);
  database.getDb().prepare("DELETE FROM reels WHERE user_id = 1 AND stage = 'uploaded'").run();
  assert.equal(getDashboardSummary(1).next_reel?.id, 1);
  database.getDb().prepare("DELETE FROM reels WHERE user_id = 1").run();
  const empty = getDashboardSummary(1);
  assert.equal(empty.next_reel, null);
  assert.deepEqual(empty.recent_published, []);
  assert.equal(Object.values(empty.stage_counts).every((count) => count === 0), true);
});

test("reel activity aggregates all owned running and review jobs beyond the latest thirty", async () => {
  const { getDashboardSummary } = await queries();
  insertReel({ id: 1, stage: "publishing" });
  insertReel({ id: 2, stage: "publishing" });
  insertReel({ id: 3, stage: "uploaded" });
  insertJob({ id: "old-running", ref_id: 1, kind: "prepare", status: "running" });
  insertJob({ id: "old-review", ref_id: 1, kind: "publish", status: "needs_review" });
  insertJob({ id: "review-only", ref_id: 2, kind: "publish", status: "needs_review" });
  insertJob({ id: "running-only", ref_id: 3, kind: "publish", status: "running" });
  for (let id = 100; id < 135; id++) {
    insertReel({ id });
    insertJob({ id: `recent-${id}`, ref_id: id, kind: "prepare", status: "succeeded", updated_at: id });
  }

  assert.deepEqual(getDashboardSummary(1).reel_activity, {
    1: { running: true, needs_review: true },
    2: { running: false, needs_review: true },
    3: { running: true, needs_review: false },
  });
});

test("reel activity excludes discovery IDs, inactive statuses and jobs or reels owned by others", async () => {
  const { getDashboardSummary } = await queries();
  assert.deepEqual(getDashboardSummary(1).reel_activity, {});
  insertReel({ id: 11 });
  insertReel({ id: 21, user_id: 2, source_id: 21 });
  insertJob({ id: "source-discover", ref_id: 11, kind: "discover", status: "running" });
  insertJob({ id: "source-collect", ref_id: 11, kind: "collect", status: "needs_review" });
  insertJob({ id: "foreign-job", ref_id: 11, user_id: 2, kind: "prepare", status: "running" });
  insertJob({ id: "foreign-reel", ref_id: 21, kind: "publish", status: "running" });
  for (const status of ["queued", "retry_wait", "blocked", "succeeded", "failed", "cancelled"] as const) {
    insertJob({ id: `inactive-${status}`, ref_id: 11, kind: "publish", status });
  }

  assert.deepEqual(getDashboardSummary(1).reel_activity, {});
});
