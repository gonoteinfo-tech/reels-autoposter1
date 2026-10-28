import type { SchedulerStatus } from "@/types";
import { getErrorsTodayCount, getPublishedTodayCount } from "./database";
import { getQueue, enqueueUserRun } from "./pipeline";

export function isSchedulerActive(): boolean {
  const q = getQueue();
  return (
    q.state("paused") !== "true" &&
    Date.now() - Number(q.state("heartbeat") || 0) < 30_000
  );
}
export function startScheduler(): void {
  getQueue().setState("paused", "false");
}
export function stopScheduler(): void {
  getQueue().setState("paused", "true");
}
export function runNow(userId: number) {
  const q = getQueue();
  q.setState(`last_run:${userId}`, new Date().toISOString());
  return enqueueUserRun(userId, true, q);
}
export function getSchedulerStatus(userId: number): SchedulerStatus {
  const q = getQueue();
  const heartbeat = Number(q.state("heartbeat") || 0);
  const online = Date.now() - heartbeat < 30_000;
  const jobs = q.db
    .prepare(
      `SELECT id,kind,ref_id,status,attempts,error_message,available_at,updated_at,
    json_extract(payload,'$.target') AS target FROM pipeline_jobs WHERE user_id=?
    ORDER BY CASE status WHEN 'needs_review' THEN 0 WHEN 'blocked' THEN 1 WHEN 'failed' THEN 2 WHEN 'running' THEN 3 ELSE 4 END, updated_at DESC LIMIT 30`,
    )
    .all(userId) as NonNullable<SchedulerStatus["jobs"]>;
  const current = jobs.find((j) => j.status === "running");
  const schedule = q.db
    .prepare("SELECT next_at FROM pipeline_schedules WHERE user_id=?")
    .get(userId) as { next_at: number } | undefined;
  return {
    is_running: online && !!current,
    scheduler_active: online && q.state("paused") !== "true",
    worker_online: online,
    paused: q.state("paused") === "true",
    heartbeat_at: heartbeat ? new Date(heartbeat).toISOString() : null,
    last_run_at: q.state(`last_run:${userId}`) || null,
    next_run_at:
      online && q.state("paused") !== "true" && schedule?.next_at
        ? new Date(schedule.next_at).toISOString()
        : null,
    current_task: current ? `${current.kind} #${current.ref_id}` : null,
    reels_processed_today: getPublishedTodayCount(userId),
    errors_today: getErrorsTodayCount(userId),
    schedule_error: q.state(`schedule_error:${userId}`) || null,
    jobs,
  };
}
