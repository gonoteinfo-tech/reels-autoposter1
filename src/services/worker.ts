import { randomUUID } from "node:crypto";
import cron, { type ScheduledTask } from "node-cron";
import { setTimeout as delay } from "node:timers/promises";
import { getAllUsers, getAppSettings } from "./database";
import {
  getQueue,
  enqueueUserRun,
  executeJob,
  importLegacyJobs,
} from "./pipeline";
import { JobQueue, safeError, type JobKind } from "./jobs";

export function acquireWorker(
  q: JobQueue,
  owner: string,
  now = Date.now(),
): boolean {
  return q.db
    .transaction(() => {
      const state = JSON.parse(q.state("worker_lock") || "null") as {
        owner: string;
        until: number;
      } | null;
      if (state && state.owner !== owner && state.until > now) return false;
      q.setState("worker_lock", JSON.stringify({ owner, until: now + 60_000 }));
      q.setState("heartbeat", String(now));
      return true;
    })
    .immediate();
}
export function releaseWorker(q: JobQueue, owner: string): void {
  q.db
    .transaction(() => {
      const state = JSON.parse(q.state("worker_lock") || "null");
      if (state?.owner === owner) {
        q.setState("worker_lock", "null");
        q.setState("heartbeat", "0");
      }
    })
    .immediate();
}

export function recoverInterruptedPublications(q: JobQueue): number {
  return q.db
    .prepare(
      `UPDATE pipeline_jobs SET status='retry_wait',available_at=0
    WHERE status='needs_review' AND kind='publish' AND error_code='interrupted' AND attempts<max_attempts
    AND EXISTS(SELECT 1 FROM pipeline_publications p WHERE p.reel_id=pipeline_jobs.ref_id AND p.user_id=pipeline_jobs.user_id
      AND p.target=json_extract(pipeline_jobs.payload,'$.target') AND p.phase IN ('processing','ready','created','transferred','submitted','succeeded'))`,
    )
    .run().changes;
}

/** One VPS worker, one heavy video operation, plus one lightweight collector. */
export async function runWorker(signal: AbortSignal): Promise<void> {
  const q = getQueue(),
    owner = randomUUID();
  if (!acquireWorker(q, owner)) throw new Error("Outro worker já está ativo.");
  importLegacyJobs(q);
  const stop = new AbortController();
  const abort = AbortSignal.any([signal, stop.signal]);
  const schedules = new Map<
    number,
    { expression: string; task: ScheduledTask }
  >();
  const running = new Map<string, Promise<void>>();
  const heartbeat = setInterval(() => {
    if (!acquireWorker(q, owner)) {
      stop.abort(new Error("Worker lease perdida."));
      return;
    }
  }, 10_000);
  const start = (lane: string, kinds: JobKind[]) => {
    if (running.has(lane)) return;
    const job = q.claim(owner, Date.now(), 60_000, kinds);
    if (!job) return;
    const pulse = setInterval(() => {
      if (!q.renew(job)) stop.abort(new Error("Job lease perdida."));
    }, 10_000);
    const task = executeJob(job, q, abort)
      .catch((error) =>
        console.error(
          JSON.stringify({
            event: "job_interrupted",
            job_id: job.id,
            user_id: job.user_id,
            error: safeError(error),
          }),
        ),
      )
      .finally(() => {
        clearInterval(pulse);
        running.delete(lane);
      });
    running.set(lane, task);
  };
  const refresh = () => {
    q.db
      .prepare("DELETE FROM pipeline_events WHERE created_at < ?")
      .run(Date.now() - 30 * 24 * 60 * 60_000);
    const enabled = q.state("paused") !== "true";
    const users = getAllUsers();
    for (const [id, entry] of schedules)
      if (!users.some((u) => u.id === id) || !enabled) {
        entry.task.destroy();
        schedules.delete(id);
      }
    if (!enabled) return;
    for (const user of users) {
      const settings = getAppSettings(user.id);
      const expression = settings.cron_schedule;
      if (!cron.validate(expression)) {
        q.setState(
          `schedule_error:${user.id}`,
          "Expressão cron inválida nas Configurações.",
        );
        continue;
      }
      q.setState(`schedule_error:${user.id}`, "");
      if (schedules.get(user.id)?.expression !== expression) {
        schedules.get(user.id)?.task.destroy();
        const task = cron.schedule(
          expression,
          () => {
            enqueueUserRun(user.id, false, q);
            q.setState(`last_run:${user.id}`, new Date().toISOString());
          },
          { timezone: process.env.TZ || "America/Sao_Paulo", noOverlap: true },
        );
        schedules.set(user.id, { expression, task });
        enqueueUserRun(user.id, false, q);
      }
      const next = schedules.get(user.id)!.task.getNextRun();
      q.db
        .prepare(
          "INSERT INTO pipeline_schedules VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET cron=excluded.cron,next_at=excluded.next_at",
        )
        .run(user.id, expression, next?.getTime() || 0);
    }
    recoverInterruptedPublications(q);
  };
  try {
    refresh();
    let nextRefresh = Date.now() + 15_000;
    while (!abort.aborted) {
      if (Date.now() >= nextRefresh) {
        refresh();
        nextRefresh = Date.now() + 15_000;
      }
      if (q.state("paused") !== "true") {
        start("heavy", ["prepare", "publish"]);
        start("collection", ["collect", "discover"]);
      }
      await delay(1000, undefined, { signal: abort });
    }
  } catch (error) {
    if (!abort.aborted) throw error;
  } finally {
    for (const entry of schedules.values()) entry.task.destroy();
    stop.abort();
    await Promise.allSettled(running.values());
    clearInterval(heartbeat);
    releaseWorker(q, owner);
  }
}
