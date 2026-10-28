import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./paths";
import { JobQueue, type Job, safeError } from "./jobs";
import { PipelineError, publishStep } from "./publications";
import * as db from "./database";
import {
  getPublishCredentials,
  hasPublishDestination,
} from "./publish-credentials";
import {
  startProfileDiscovery,
  collectProfileDiscovery,
  isBrightDataConfigured,
  startSingleReelDiscovery,
} from "./brightdata-discoverer";
import { downloadMedia, checkDiskSpace, runTool } from "./media";
import { normalizeVideo } from "./video-processor";
import { rewriteCaption, ensureMinimumHashtags } from "./ai-caption";
import { uploadVideo } from "./storage";
import { getUserLogoPath } from "./logo-storage";
import { extractVideoId, normalizeVideoUrl } from "./instagram-downloader";
import type { AppSettings, Reel } from "@/types";

class Wait extends Error {
  constructor(public when: number) {
    super("Aguardando próxima etapa.");
  }
}
export function getQueue() {
  return new JobQueue(db.getDb());
}
export function buildCaption(
  caption: string,
  hashtags: string,
  template: string,
): string {
  const text = template
    ? template
        .replace("{caption}", caption || "")
        .replace("{hashtags}", hashtags || "")
    : [caption, caption.includes("#") ? "" : hashtags]
        .filter(Boolean)
        .join("\n\n");
  return ensureMinimumHashtags(text, hashtags, 6).slice(0, 2200);
}

function destination(userId: number, settings: AppSettings) {
  const creds = getPublishCredentials(userId, settings);
  if (!hasPublishDestination(creds))
    throw new PipelineError(
      "Conecte e selecione sua página em Configurações → Conta Meta.",
      "blocked",
      "credentials",
    );
  if (!settings.instagram_enabled && !settings.facebook_enabled)
    throw new PipelineError(
      "Ative Instagram ou Facebook nas Configurações.",
      "blocked",
      "destinations",
    );
  return creds;
}

export function enqueueReel(
  userId: number,
  reelId: number,
  revive = false,
  q = getQueue(),
): Job {
  const reel = db.getReelById(reelId, userId);
  if (!reel)
    throw new PipelineError("Reel não encontrado.", "failed", "not_found");
  return q.enqueue(userId, "prepare", reelId, { manual: revive }, revive);
}
export function enqueueSource(
  userId: number,
  sourceId: number,
  force = false,
  q = getQueue(),
): Job {
  const source = db.getSourceById(sourceId, userId);
  if (!source || source.username === "manual")
    throw new PipelineError(
      "Fonte não encontrada ou manual.",
      "failed",
      "not_found",
    );
  return source.pending_snapshot_id
    ? q.enqueue(
        userId,
        "collect",
        sourceId,
        { snapshot: source.pending_snapshot_id },
        true,
      )
    : q.enqueue(userId, "discover", sourceId, { force }, true);
}
export function enqueueUserRun(
  userId: number,
  force = false,
  q = getQueue(),
): Job[] {
  const jobs: Job[] = [];
  for (const source of db.getActiveSources(userId))
    if (source.username !== "manual")
      jobs.push(enqueueSource(userId, source.id, force, q));
  const settings = db.getAppSettings(userId);
  const reels = q.db
    .prepare(
      `SELECT * FROM reels WHERE user_id=? AND stage NOT IN ('published','error') ORDER BY created_at LIMIT ?`,
    )
    .all(userId, settings.max_reels_per_run) as Reel[];
  for (const reel of reels) jobs.push(enqueueReel(userId, reel.id, force, q));
  return jobs;
}

interface DownloadResult {
  filePath: string;
  caption: string;
  duration: number;
}
async function downloadOther(
  url: string,
  directory: string,
  signal?: AbortSignal,
): Promise<DownloadResult> {
  const parsed = new URL(url);
  if (
    ![
      "www.facebook.com",
      "facebook.com",
      "www.tiktok.com",
      "tiktok.com",
      "vm.tiktok.com",
      "vt.tiktok.com",
      "www.youtube.com",
      "youtube.com",
      "youtu.be",
      "www.instagram.com",
      "instagram.com",
    ].includes(parsed.hostname)
  )
    throw new PipelineError(
      "Plataforma de vídeo inválida.",
      "failed",
      "invalid_url",
    );
  fs.mkdirSync(directory, { recursive: true });
  const args = [
    "--no-playlist",
    "--no-warnings",
    "--write-info-json",
    "--max-filesize",
    String(Number(process.env.MAX_VIDEO_BYTES) || 512 * 1024 * 1024),
    "--match-filter",
    `duration <= ${Number(process.env.MAX_VIDEO_SECONDS) || 900}`,
    "-f",
    "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best",
    "--remux-video",
    "mp4",
    "-o",
    path.join(directory, "input.%(ext)s"),
  ];
  if (process.env.COOKIES_FILE)
    args.push("--cookies", path.resolve(process.env.COOKIES_FILE));
  args.push(url);
  await runTool(process.env.YTDLP_PATH || "yt-dlp", args, {
    timeout: 300_000,
    signal,
  });
  const filePath = path.join(directory, "input.mp4");
  if (!fs.existsSync(filePath))
    throw new PipelineError(
      "Download não produziu um vídeo MP4.",
      "failed",
      "invalid_media",
    );
  const metadataPath = path.join(directory, "input.info.json");
  const meta = fs.existsSync(metadataPath)
    ? JSON.parse(fs.readFileSync(metadataPath, "utf8"))
    : {};
  if (
    fs.statSync(filePath).size >
    (Number(process.env.MAX_VIDEO_BYTES) || 512 * 1024 * 1024)
  ) {
    fs.rmSync(filePath);
    throw new PipelineError(
      "Vídeo excede o limite de tamanho.",
      "failed",
      "invalid_media",
    );
  }
  return {
    filePath,
    caption: meta.description || meta.title || "",
    duration: Number(meta.duration) || 0,
  };
}

async function discoverOther(
  username: string,
  platform: "tiktok" | "youtube",
  limit: number,
  signal?: AbortSignal,
): Promise<string[]> {
  if (!/^[\w.-]+$/.test(username))
    throw new PipelineError(
      "Nome da fonte inválido.",
      "failed",
      "invalid_source",
    );
  const url =
    platform === "tiktok"
      ? `https://www.tiktok.com/@${username}`
      : `https://www.youtube.com/@${username}/shorts`;
  const output = await runTool(
    process.env.YTDLP_PATH || "yt-dlp",
    [
      "--flat-playlist",
      "--dump-json",
      "--playlist-end",
      String(limit),
      "--no-warnings",
      url,
    ],
    { timeout: 120_000, signal },
  );
  return output
    .trim()
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      const item = JSON.parse(line);
      const raw = item.webpage_url || item.url || "";
      const canonical = normalizeVideoUrl(raw, platform);
      return canonical ? [canonical] : [];
    });
}

export interface PipelineAdapters {
  download: typeof downloadMedia;
  caption: typeof rewriteCaption;
  normalize: typeof normalizeVideo;
  upload: typeof uploadVideo;
}
const defaultAdapters: PipelineAdapters = {
  download: downloadMedia,
  caption: rewriteCaption,
  normalize: normalizeVideo,
  upload: uploadVideo,
};

function queueTargets(
  reel: Reel,
  settings: AppSettings,
  q: JobQueue,
  manual = false,
) {
  for (const target of ["instagram", "facebook"] as const) {
    if (settings[`${target}_enabled`])
      q.enqueue(reel.user_id, "publish", reel.id, { target, manual }, true);
  }
}

async function prepare(
  job: Job,
  q: JobQueue,
  settings: AppSettings,
  signal: AbortSignal | undefined,
  a: PipelineAdapters,
) {
  destination(job.user_id, settings);
  const payload = JSON.parse(job.payload);
  if (!settings.auto_publish && !payload.manual)
    throw new PipelineError(
      "Publicação automática desligada.",
      "blocked",
      "disabled",
    );
  let reel = db.getReelById(job.ref_id, job.user_id);
  if (!reel) throw new PipelineError("Reel removido.", "failed", "not_found");
  if (reel.stage === "published") return;
  if (reel.r2_url) {
    queueTargets(reel, settings, q, !!payload.manual);
    return;
  }
  for (const key of [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "R2_PUBLIC_URL",
  ])
    if (!process.env[key])
      throw new PipelineError(
        `${key} ausente no servidor. Configure e tente novamente.`,
        "blocked",
        "configuration",
      );
  if (
    !reel.caption &&
    reel.original_caption &&
    !process.env.GEMINI_API_KEY &&
    !process.env.GOOGLE_API_KEY
  )
    throw new PipelineError(
      "Configure GEMINI_API_KEY para reescrever legendas.",
      "blocked",
      "configuration",
    );
  const directory = path.join(
    DATA_DIR,
    "work",
    String(job.user_id),
    String(job.ref_id),
    `${job.id}-${job.attempts}-${job.lease_token?.split(":").at(-1)}`,
  );
  checkDiskSpace(directory);
  const save = (patch: Parameters<typeof db.updateReel>[1]) => {
    q.assertOwned(job);
    reel = db.updateReel(job.ref_id, patch, job.user_id)!;
  };

  if (!reel.local_path || !fs.existsSync(reel.local_path)) {
    save({ stage: "downloading", error_message: null });
    if (
      !reel.direct_video_url &&
      reel.instagram_url.includes("instagram.com")
    ) {
      if (!isBrightDataConfigured())
        throw new PipelineError(
          "Configure BRIGHTDATA_API_TOKEN para baixar do Instagram.",
          "blocked",
          "configuration",
        );
      if (!payload.single_snapshot) {
        if (payload.triggering)
          throw new PipelineError(
            "Coleta avulsa incerta; revise a Bright Data antes de reenviar.",
            "needs_review",
          );
        q.checkpoint(job, { ...payload, triggering: true });
        const snapshot = await startSingleReelDiscovery(reel.instagram_url);
        q.checkpoint(job, {
          ...payload,
          single_snapshot: snapshot,
          snapshot_started: Date.now(),
        });
        throw new Wait(Date.now() + 15_000);
      }
      const items = await collectProfileDiscovery(
        payload.single_snapshot,
        reel.source_username,
        "instagram",
        1,
      );
      if (!items) {
        if (Date.now() - payload.snapshot_started > 30 * 60_000)
          throw new PipelineError(
            "Coleta avulsa excedeu 30 minutos.",
            "failed",
            "snapshot_timeout",
          );
        throw new Wait(Date.now() + 15_000);
      }
      if (!items.length)
        throw new PipelineError(
          "Nenhum vídeo disponível para este link.",
          "failed",
          "empty_media",
        );
      save({
        direct_video_url: items[0].videoUrl,
        original_caption: reel.original_caption || items[0].caption,
        hashtags: items[0].hashtags.join(" "),
      });
    }
    if (reel.direct_video_url) {
      try {
        const file = await a.download(
          reel.direct_video_url,
          path.join(directory, "input.mp4"),
          signal,
        );
        save({ local_path: file, stage: "downloaded" });
      } catch (error) {
        // Renew an expiring Instagram CDN URL through a persisted collection on next attempt.
        if (
          reel.instagram_url.includes("instagram.com") &&
          /HTTP 40[134]/.test(String(error))
        ) {
          save({ direct_video_url: null });
          q.checkpoint(job, {});
        }
        throw error;
      }
    } else {
      const result = await downloadOther(reel.instagram_url, directory, signal);
      save({
        local_path: result.filePath,
        original_caption: reel.original_caption || result.caption,
        duration_seconds: result.duration,
        stage: "downloaded",
      });
    }
  }
  if (!reel.caption) {
    q.assertOwned(job);
    const caption = await a.caption(reel.original_caption, reel.hashtags);
    save({ caption, error_message: null });
  }
  if (!reel.processed_path || !fs.existsSync(reel.processed_path)) {
    save({ stage: "processing" });
    const output = path.join(directory, "processed.mp4");
    await a.normalize(
      reel.local_path!,
      output,
      getUserLogoPath(job.user_id),
      settings.logo_position,
      settings.logo_scale,
      signal,
    );
    save({ processed_path: output, stage: "processed" });
  }
  save({ stage: "uploading" });
  const url = await a.upload(
    reel.processed_path!,
    `reels/user_${job.user_id}/reel_${job.ref_id}.mp4`,
  );
  save({ r2_url: url, stage: "uploaded", error_message: null });
  queueTargets(reel, settings, q, !!payload.manual);
}

async function discover(
  job: Job,
  q: JobQueue,
  settings: AppSettings,
  signal?: AbortSignal,
) {
  destination(job.user_id, settings);
  const source = db.getSourceById(job.ref_id, job.user_id);
  if (!source || !source.is_active) return;
  if (source.pending_snapshot_id) {
    q.enqueue(
      job.user_id,
      "collect",
      source.id,
      { snapshot: source.pending_snapshot_id },
      true,
    );
    return;
  }
  const payload = JSON.parse(job.payload);
  if (!payload.force && source.last_checked_at) {
    const last = Date.parse(
      source.last_checked_at.replace(" ", "T").replace(/Z?$/, "Z"),
    );
    if (Date.now() - last < settings.discovery_interval_minutes * 60_000)
      return;
  }
  const platform = source.platform || "instagram";
  if (platform === "instagram" || platform === "facebook") {
    if (!isBrightDataConfigured())
      throw new PipelineError(
        "Configure BRIGHTDATA_API_TOKEN no servidor.",
        "blocked",
        "configuration",
      );
    if (payload.triggering)
      throw new PipelineError(
        "Coleta paga incerta; revise o resultado na Bright Data.",
        "needs_review",
        "uncertain",
      );
    q.checkpoint(job, { ...payload, triggering: true });
    let snapshot: string;
    try {
      snapshot = await startProfileDiscovery(
        source.username,
        platform,
        settings.discovery_limit,
      );
    } catch (error) {
      if (/token|permissão/i.test(String(error)))
        throw new PipelineError(
          "Confira o token e as permissões Bright Data.",
          "blocked",
          "credentials",
        );
      throw new PipelineError(
        "Não foi possível confirmar o disparo da coleta; confira a Bright Data.",
        "needs_review",
        "uncertain",
      );
    }
    q.assertOwned(job);
    q.db.transaction(() => {
      db.setSourcePendingSnapshot(source.id, snapshot);
      db.updateSourceLastChecked(source.id);
      q.enqueue(
        job.user_id,
        "collect",
        source.id,
        { snapshot, started: Date.now() },
        true,
      );
      q.checkpoint(job, { snapshot });
    })();
  } else {
    const urls = await discoverOther(
      source.username,
      platform,
      settings.discovery_limit,
      signal,
    );
    q.assertOwned(job);
    for (const url of urls) {
      const reel = db.createReel({
        source_id: source.id,
        source_username: source.username,
        user_id: job.user_id,
        instagram_url: url,
        instagram_id: extractVideoId(url, platform) || undefined,
      });
      if (reel && settings.auto_publish)
        enqueueReel(job.user_id, reel.id, false, q);
    }
    db.updateSourceLastChecked(source.id);
  }
}

async function collect(job: Job, q: JobQueue, settings: AppSettings) {
  const source = db.getSourceById(job.ref_id, job.user_id);
  if (!source) return;
  const payload = JSON.parse(job.payload);
  const snapshot = payload.snapshot || source.pending_snapshot_id;
  if (!snapshot) return;
  const platform = source.platform === "facebook" ? "facebook" : "instagram";
  const items = await collectProfileDiscovery(
    snapshot,
    source.username,
    platform,
    settings.discovery_limit,
  );
  if (!items) {
    const start =
      payload.started ||
      Date.parse((source.pending_snapshot_at || "").replace(" ", "T") + "Z") ||
      job.created_at;
    if (Date.now() - start > 30 * 60_000)
      throw new PipelineError(
        "Coleta excedeu 30 minutos; confira a Bright Data.",
        "failed",
        "snapshot_timeout",
      );
    throw new Wait(Date.now() + 15_000);
  }
  q.assertOwned(job);
  q.db.transaction(() => {
    for (const item of items) {
      const reel = db.createReel({
        source_id: source.id,
        source_username: source.username,
        user_id: job.user_id,
        instagram_url: item.url,
        instagram_id: item.id,
        original_caption: item.caption,
        hashtags: item.hashtags.join(" "),
        direct_video_url: item.videoUrl,
      });
      if (reel && settings.auto_publish)
        enqueueReel(job.user_id, reel.id, false, q);
    }
    db.clearSourcePendingSnapshotIf(source.id, snapshot);
    db.updateSourceLastChecked(source.id);
  })();
}

function reserveWindow(job: Job, q: JobQueue, settings: AppSettings): number {
  return q.db
    .transaction(() => {
      q.assertOwned(job);
      const row = q.db
        .prepare(
          "SELECT reel_id,until_at FROM pipeline_windows WHERE user_id=?",
        )
        .get(job.user_id) as { reel_id: number; until_at: number } | undefined;
      if (row && row.reel_id !== job.ref_id && row.until_at > Date.now())
        return row.until_at;
      if (!row || row.reel_id !== job.ref_id) {
        const last = db.getLastPublishedAt(job.user_id);
        const at = last
          ? Date.parse(last) + settings.publish_interval_minutes * 60_000
          : 0;
        if (at > Date.now()) return at;
        q.db
          .prepare(
            "INSERT INTO pipeline_windows VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET reel_id=excluded.reel_id,until_at=excluded.until_at",
          )
          .run(
            job.user_id,
            job.ref_id,
            Date.now() + settings.publish_interval_minutes * 60_000,
          );
      }
      return 0;
    })
    .immediate();
}

function completeReel(reel: Reel, settings: AppSettings) {
  const complete =
    (!settings.instagram_enabled || !!reel.ig_post_id) &&
    (!settings.facebook_enabled || !!reel.fb_post_id);
  if (complete) {
    db.updateReel(reel.id, { stage: "published" }, reel.user_id);
    for (const file of [reel.local_path, reel.processed_path]) {
      if (
        file &&
        path.resolve(file).startsWith(DATA_DIR + path.sep) &&
        !db.isVideoFileUsedByPendingReel(file, reel.id)
      )
        fs.rmSync(file, { force: true });
    }
    db.updateReel(
      reel.id,
      { local_path: null, processed_path: null },
      reel.user_id,
    );
  }
}

async function publish(
  job: Job,
  q: JobQueue,
  settings: AppSettings,
  signal?: AbortSignal,
) {
  const target = JSON.parse(job.payload).target as "instagram" | "facebook";
  const reel = db.getReelById(job.ref_id, job.user_id);
  if (!reel) throw new PipelineError("Reel removido.", "failed", "not_found");
  const knownId = target === "instagram" ? reel.ig_post_id : reel.fb_post_id;
  if (knownId) {
    q.assertOwned(job);
    completeReel(reel, settings);
    return;
  }
  const credentials = destination(job.user_id, settings);
  if (!settings.auto_publish && !JSON.parse(job.payload).manual)
    throw new PipelineError(
      "Publicação automática desligada.",
      "blocked",
      "disabled",
    );
  if (!["instagram", "facebook"].includes(target))
    throw new PipelineError("Destino inválido.", "failed", "invalid_target");
  if (!settings[`${target}_enabled`])
    throw new PipelineError(
      "Destino desativado nas Configurações.",
      "blocked",
      "disabled",
    );
  if (target === "instagram" && !credentials.igAccountId)
    throw new PipelineError(
      "Vincule um Instagram Business à página selecionada.",
      "blocked",
      "credentials",
    );
  if (target === "facebook" && !credentials.pageId)
    throw new PipelineError(
      "Selecione uma página do Facebook.",
      "blocked",
      "credentials",
    );
  if (!reel.r2_url)
    throw new PipelineError(
      "Prepare o vídeo antes de publicar.",
      "blocked",
      "media",
    );
  const user = db.getUserById(job.user_id);
  if (
    user?.plan === "free" &&
    !reel.ig_post_id &&
    !reel.fb_post_id &&
    db.getPublishedTotalCount(job.user_id) >= 1
  )
    throw new PipelineError(
      "Limite do plano gratuito atingido.",
      "blocked",
      "plan_limit",
    );
  const until = reserveWindow(job, q, settings);
  if (until) throw new Wait(until);
  q.assertOwned(job);
  db.updateReel(job.ref_id, { stage: "publishing" }, job.user_id);
  const result = await publishStep({
    db: q.db,
    userId: job.user_id,
    reelId: job.ref_id,
    target,
    token: credentials.pageToken!,
    accountId: credentials.igAccountId,
    pageId: credentials.pageId,
    videoUrl: reel.r2_url,
    caption: buildCaption(
      reel.caption,
      reel.hashtags,
      settings.custom_caption_template,
    ),
    assertOwned: () => q.assertOwned(job),
    signal,
  });
  if (!result.done) throw new Wait(Date.now() + 15_000);
  q.assertOwned(job);
  const updated = db.updateReel(
    job.ref_id,
    {
      [target === "instagram" ? "ig_post_id" : "fb_post_id"]: result.postId,
      published_at: reel.published_at || new Date().toISOString(),
      error_message: null,
    },
    job.user_id,
  )!;
  completeReel(updated, settings);
}

export async function executeJob(
  job: Job,
  q: JobQueue,
  signal?: AbortSignal,
  overrides: Partial<PipelineAdapters> = {},
): Promise<void> {
  try {
    const settings = db.getAppSettings(job.user_id);
    if (!db.getUserById(job.user_id)) {
      q.finish(job);
      return;
    }
    if (job.kind === "discover") await discover(job, q, settings, signal);
    else if (job.kind === "collect") await collect(job, q, settings);
    else if (job.kind === "prepare")
      await prepare(job, q, settings, signal, {
        ...defaultAdapters,
        ...overrides,
      });
    else await publish(job, q, settings, signal);
    q.finish(job);
  } catch (error) {
    q.assertOwned(job);
    if (error instanceof Wait) {
      q.defer(job, error.when);
      return;
    }
    const failure =
      error instanceof PipelineError
        ? error
        : new PipelineError(
            safeError(error),
            /token.*(inválid|expired)|401|403/i.test(String(error))
              ? "blocked"
              : "retry_wait",
          );
    const backoff = Math.min(
      30 * 60_000,
      Math.max(failure.retryAfterMs, 15_000 * 2 ** job.attempts) +
        Math.floor(Math.random() * 1000),
    );
    q.fail(
      job,
      failure.code,
      failure.message,
      failure.disposition,
      Date.now() + backoff,
    );
    if (job.kind === "prepare" || job.kind === "publish")
      db.updateReel(
        job.ref_id,
        {
          error_message: failure.message,
          stage:
            failure.disposition === "needs_review" ? "publishing" : "error",
        },
        job.user_id,
      );
  }
}

/** Import legacy work without automatically resending ambiguous historical publications. */
export function importLegacyJobs(q = getQueue()): void {
  if (q.state("legacy_imported") === "true") return;
  q.db.transaction(() => {
    const reels = q.db
      .prepare("SELECT * FROM reels WHERE stage!='published'")
      .all() as Reel[];
    for (const reel of reels) {
      const job = q.enqueue(reel.user_id, "prepare", reel.id);
      if (reel.stage === "error" || reel.stage === "publishing") {
        q.db
          .prepare(
            "UPDATE pipeline_jobs SET status=?,error_code='legacy',error_message=? WHERE id=?",
          )
          .run(
            reel.stage === "publishing" ? "needs_review" : "blocked",
            reel.error_message ||
              "Confira o estado antigo antes de reprocessar.",
            job.id,
          );
      }
    }
    q.setState("legacy_imported", "true");
  })();
}
