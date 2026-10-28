import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export type JobKind = "discover" | "collect" | "prepare" | "publish";
export type JobStatus =
  | "queued"
  | "running"
  | "retry_wait"
  | "blocked"
  | "succeeded"
  | "failed"
  | "needs_review"
  | "cancelled";
export interface Job {
  id: string;
  user_id: number;
  kind: JobKind;
  ref_id: number;
  payload: string;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  available_at: number;
  lease_token: string | null;
  lease_until: number | null;
  error_code: string | null;
  error_message: string | null;
  created_at: number;
  updated_at: number;
}

export function migrateJobs(db: Database.Database): void {
  db.transaction(() =>
    db.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_jobs (
      id TEXT PRIMARY KEY, dedupe_key TEXT NOT NULL UNIQUE, user_id INTEGER NOT NULL,
      kind TEXT NOT NULL, ref_id INTEGER NOT NULL, payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5, available_at INTEGER NOT NULL,
      lease_token TEXT, lease_until INTEGER, error_code TEXT, error_message TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_due ON pipeline_jobs(status, available_at);
    CREATE INDEX IF NOT EXISTS idx_jobs_user ON pipeline_jobs(user_id, updated_at);
    CREATE TABLE IF NOT EXISTS pipeline_events (
      id INTEGER PRIMARY KEY, job_id TEXT NOT NULL, user_id INTEGER NOT NULL,
      status TEXT NOT NULL, message TEXT, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pipeline_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT OR IGNORE INTO pipeline_state VALUES ('paused', 'false');
    CREATE TABLE IF NOT EXISTS pipeline_publications (
      reel_id INTEGER NOT NULL, user_id INTEGER NOT NULL, target TEXT NOT NULL,
      phase TEXT NOT NULL DEFAULT 'new', remote_id TEXT, post_id TEXT, error TEXT, upload_url TEXT,
      updated_at INTEGER NOT NULL, PRIMARY KEY(reel_id, target)
    );
    CREATE TABLE IF NOT EXISTS pipeline_schedules (
      user_id INTEGER PRIMARY KEY, cron TEXT NOT NULL, next_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pipeline_windows (user_id INTEGER PRIMARY KEY, reel_id INTEGER NOT NULL, until_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS pipeline_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')));
    INSERT OR IGNORE INTO pipeline_migrations(version) VALUES(1);
  `),
  )();
}

// Keep diagnostics useful without leaking provider URLs, access tokens or cookies.
export function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/https?:\/\/\S+/g, "[URL omitida]")
    .replace(/(authorization|cookie)(\s*[:=]\s*)[^\r\n]+/gi, "$1$2[oculto]")
    .replace(
      /(token|api[_-]?key|authorization|cookie|secret)(["'\s:=]+)[^\s,;}]+/gi,
      "$1$2[oculto]",
    )
    .slice(0, 1500);
}

export class JobQueue {
  constructor(public readonly db: Database.Database) {
    migrateJobs(db);
  }

  enqueue(
    userId: number,
    kind: JobKind,
    refId: number,
    payload: Record<string, unknown> = {},
    revive = false,
  ): Job {
    const key = `${userId}:${kind}:${refId}:${payload.target || ""}`;
    const now = Date.now();
    return this.db
      .transaction(() => {
        this.db
          .prepare(
            `INSERT OR IGNORE INTO pipeline_jobs
        (id,dedupe_key,user_id,kind,ref_id,payload,available_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            randomUUID(),
            key,
            userId,
            kind,
            refId,
            JSON.stringify(payload),
            0,
            now,
            now,
          );
        let job = this.db
          .prepare("SELECT * FROM pipeline_jobs WHERE dedupe_key=?")
          .get(key) as Job;
        if (
          revive &&
          [
            "failed",
            "cancelled",
            "blocked",
            ...(kind === "publish" ? [] : ["succeeded"]),
          ].includes(job.status)
        ) {
          this.db
            .prepare(
              `UPDATE pipeline_jobs SET status='queued', attempts=0, payload=?,
          available_at=0, error_code=NULL, error_message=NULL, updated_at=? WHERE id=?`,
            )
            .run(
              JSON.stringify(
                kind === "prepare"
                  ? { ...JSON.parse(job.payload), ...payload }
                  : payload,
              ),
              now,
              job.id,
            );
          job = this.get(job.id, userId)!;
        }
        if (
          revive &&
          payload.manual === true &&
          ["queued", "retry_wait"].includes(job.status)
        ) {
          this.db
            .prepare(
              "UPDATE pipeline_jobs SET payload=json_set(payload,'$.manual',json('true')) WHERE id=?",
            )
            .run(job.id);
          job = this.get(job.id, userId)!;
        }
        return job;
      })
      .immediate();
  }

  get(id: string, userId: number): Job | undefined {
    return this.db
      .prepare("SELECT * FROM pipeline_jobs WHERE id=? AND user_id=?")
      .get(id, userId) as Job | undefined;
  }

  claim(
    owner: string,
    now = Date.now(),
    leaseMs = 60_000,
    kinds: JobKind[] = ["discover", "collect", "prepare", "publish"],
  ): Job | undefined {
    return this.db
      .transaction(() => {
        const expired = this.db
          .prepare(
            `SELECT * FROM pipeline_jobs WHERE status='running' AND lease_until <= ?`,
          )
          .all(now) as Job[];
        for (const job of expired) {
          const uncertain = job.kind === "publish" || job.kind === "discover";
          this.db
            .prepare(
              `UPDATE pipeline_jobs SET status=?, lease_token=NULL, lease_until=NULL,
          error_code='interrupted', error_message=?, updated_at=? WHERE id=?`,
            )
            .run(
              uncertain
                ? "needs_review"
                : job.attempts >= job.max_attempts
                  ? "failed"
                  : "queued",
              uncertain
                ? "Execução interrompida: confira o resultado remoto antes de reenviar."
                : "Retomando após interrupção.",
              now,
              job.id,
            );
        }
        const job = this.db
          .prepare(
            `SELECT * FROM pipeline_jobs WHERE status IN ('queued','retry_wait')
        AND available_at<=? AND attempts<max_attempts AND kind IN (${kinds.map(() => "?").join(",")})
        ORDER BY CASE kind WHEN 'collect' THEN 0 WHEN 'publish' THEN 1 WHEN 'prepare' THEN 2 ELSE 3 END,available_at,created_at LIMIT 1`,
          )
          .get(now, ...kinds) as Job | undefined;
        if (!job) return undefined;
        const token = `${owner}:${randomUUID()}`;
        this.db
          .prepare(
            `UPDATE pipeline_jobs SET status='running', attempts=attempts+1,
        lease_token=?, lease_until=?, updated_at=? WHERE id=?`,
          )
          .run(token, now + leaseMs, now, job.id);
        return this.get(job.id, job.user_id);
      })
      .immediate();
  }

  assertOwned(job: Job, now = Date.now()): void {
    const row = this.db
      .prepare(
        `SELECT 1 FROM pipeline_jobs WHERE id=? AND status='running'
      AND lease_token=? AND lease_until>?`,
      )
      .get(job.id, job.lease_token, now);
    if (!row) throw new Error("Job lease perdida; execução cancelada.");
  }

  renew(job: Job, now = Date.now(), leaseMs = 60_000): boolean {
    return (
      this.db
        .prepare(
          `UPDATE pipeline_jobs SET lease_until=?,updated_at=? WHERE id=?
      AND lease_token=? AND status='running' AND lease_until>?`,
        )
        .run(now + leaseMs, now, job.id, job.lease_token, now).changes === 1
    );
  }

  checkpoint(job: Job, payload: Record<string, unknown>): void {
    this.assertOwned(job);
    this.db
      .prepare(
        "UPDATE pipeline_jobs SET payload=? WHERE id=? AND lease_token=?",
      )
      .run(JSON.stringify(payload), job.id, job.lease_token);
    job.payload = JSON.stringify(payload);
  }

  finish(job: Job, now = Date.now()): void {
    this.transition(job, "succeeded", null, null, 0, now);
  }

  fail(
    job: Job,
    code: string,
    message: string,
    status: JobStatus = "retry_wait",
    availableAt = Date.now() + 30_000,
  ): void {
    const next =
      status === "retry_wait" && job.attempts >= job.max_attempts
        ? "failed"
        : status;
    this.transition(job, next, code, safeError(message), availableAt);
  }

  defer(job: Job, availableAt: number): void {
    this.db
      .transaction(() => {
        this.transition(job, "retry_wait", null, null, availableAt);
        // Waiting for a snapshot or a publishing window is not a failed attempt.
        this.db
          .prepare(
            "UPDATE pipeline_jobs SET attempts=MAX(0,attempts-1) WHERE id=?",
          )
          .run(job.id);
      })
      .immediate();
  }

  private transition(
    job: Job,
    status: JobStatus,
    code: string | null,
    message: string | null,
    availableAt: number,
    now = Date.now(),
  ): void {
    this.db
      .transaction(() => {
        this.assertOwned(job, now);
        this.db
          .prepare(
            `UPDATE pipeline_jobs SET status=?,error_code=?,error_message=?,available_at=?,
        lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=?`,
          )
          .run(
            status,
            code,
            message,
            availableAt,
            now,
            job.id,
            job.lease_token,
          );
        this.db
          .prepare(
            "INSERT INTO pipeline_events(job_id,user_id,status,message,created_at) VALUES(?,?,?,?,?)",
          )
          .run(job.id, job.user_id, status, message, now);
      })
      .immediate();
  }

  unblock(userId: number): number {
    return this.db
      .prepare(
        `UPDATE pipeline_jobs SET status='queued',attempts=0,available_at=0,
      error_code=NULL,error_message=NULL WHERE user_id=? AND status='blocked'
      AND error_code IN ('credentials','configuration','destinations','disabled','media','plan_limit','meta_190','meta_10','meta_200')`,
      )
      .run(userId).changes;
  }

  state(key: string): string | undefined {
    return (
      this.db
        .prepare("SELECT value FROM pipeline_state WHERE key=?")
        .get(key) as { value: string } | undefined
    )?.value;
  }
  setState(key: string, value: string): void {
    this.db
      .prepare(
        "INSERT INTO pipeline_state VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, value);
  }
}
