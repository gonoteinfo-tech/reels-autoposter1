import { getDashboardStats, getDb } from "./database";
import type { DashboardStats, Reel, ReelStage } from "@/types";

const processingStages: ReelStage[] = [
  "downloading", "downloaded", "processing", "processed", "uploading", "publishing",
];

export interface DashboardReelPage {
  reels: Reel[];
  total: number;
  page: number;
  totalPages: number;
}

function boundedInteger(
  value: string | null,
  fallback: number,
  maximum: number,
): number {
  if (!value?.trim()) return fallback;
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(maximum, Math.max(1, Math.floor(number)))
    : fallback;
}

/** Search and filters apply to the complete owned library before pagination. */
export function listDashboardReels(
  userId: number,
  searchParams: URLSearchParams,
): DashboardReelPage {
  const database = getDb();
  const page = boundedInteger(searchParams.get("page"), 1, 1_000_000);
  const limit = boundedInteger(searchParams.get("limit"), 20, 100);
  const conditions = ["user_id = ?"];
  const parameters: (string | number)[] = [userId];
  const stage = searchParams.get("stage");
  const stageGroup = searchParams.get("stage_group");
  const sourceId = searchParams.get("source_id");
  const query = searchParams.get("q")?.trim();

  if (stage) {
    conditions.push("stage = ?");
    parameters.push(stage);
  }
  if (stageGroup) {
    const stages = stageGroup === "processing" ? processingStages : [stageGroup];
    conditions.push(`stage IN (${stages.map(() => "?").join(", ")})`);
    parameters.push(...stages);
  }
  if (sourceId) {
    const id = Number(sourceId);
    if (Number.isSafeInteger(id)) {
      conditions.push("source_id = ?");
      parameters.push(id);
    } else {
      conditions.push("0");
    }
  }
  if (query) {
    const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(
      "(caption LIKE ? ESCAPE '\\' OR original_caption LIKE ? ESCAPE '\\' OR source_username LIKE ? ESCAPE '\\')",
    );
    parameters.push(pattern, pattern, pattern);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const { total } = database.prepare(`SELECT COUNT(*) AS total FROM reels ${where}`)
    .get(...parameters) as { total: number };
  const reels = database.prepare(
    `SELECT * FROM reels ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
  ).all(...parameters, limit, (page - 1) * limit) as Reel[];

  return { reels, total, page, totalPages: Math.ceil(total / limit) };
}

/** Global dashboard data is independent of the currently filtered library. */
export function getDashboardSummary(userId: number): DashboardStats {
  const database = getDb();
  const stageCounts: Record<ReelStage, number> = {
    discovered: 0,
    downloading: 0,
    downloaded: 0,
    processing: 0,
    processed: 0,
    uploading: 0,
    uploaded: 0,
    publishing: 0,
    published: 0,
    error: 0,
  };
  const counts = database.prepare(
    "SELECT stage, COUNT(*) AS count FROM reels WHERE user_id = ? GROUP BY stage",
  ).all(userId) as { stage: ReelStage; count: number }[];
  for (const { stage, count } of counts) {
    if (Object.hasOwn(stageCounts, stage)) stageCounts[stage] = count;
  }
  const recentPublished = database.prepare(
    "SELECT * FROM reels WHERE user_id = ? AND stage = 'published' ORDER BY published_at DESC, id DESC LIMIT 5",
  ).all(userId) as Reel[];
  const nextReel = database.prepare(`
    SELECT * FROM reels WHERE user_id = ? AND stage IN ('uploaded', 'discovered')
    ORDER BY CASE WHEN stage = 'uploaded' THEN 0 ELSE 1 END, created_at ASC, id ASC
    LIMIT 1
  `).get(userId) as Reel | undefined;
  const activity = database.prepare(`
    SELECT jobs.ref_id AS reel_id,
      MAX(CASE WHEN jobs.status = 'running' THEN 1 ELSE 0 END) AS running,
      MAX(CASE WHEN jobs.status = 'needs_review' THEN 1 ELSE 0 END) AS needs_review
    FROM pipeline_jobs AS jobs
    JOIN reels ON reels.id = jobs.ref_id AND reels.user_id = jobs.user_id
    WHERE jobs.user_id = ? AND jobs.kind IN ('prepare', 'publish')
      AND jobs.status IN ('running', 'needs_review')
    GROUP BY jobs.ref_id
  `).all(userId) as { reel_id: number; running: number; needs_review: number }[];
  const reelActivity: DashboardStats["reel_activity"] = {};
  for (const row of activity) {
    reelActivity[row.reel_id] = {
      running: row.running === 1,
      needs_review: row.needs_review === 1,
    };
  }

  return {
    ...getDashboardStats(userId),
    stage_counts: stageCounts,
    recent_published: recentPublished,
    next_reel: nextReel ?? null,
    reel_activity: reelActivity,
  };
}
