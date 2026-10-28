import type Database from "better-sqlite3";
import { safeError } from "./jobs";
import { META_GRAPH_VERSION as version, GRAPH_URL } from "./meta-config";
export { GRAPH_URL } from "./meta-config";

export class PipelineError extends Error {
  constructor(
    message: string,
    public readonly disposition:
      "blocked" | "retry_wait" | "needs_review" | "failed" = "retry_wait",
    public readonly code = "provider",
    public readonly retryAfterMs = 30_000,
    public readonly httpStatus?: number,
  ) {
    super(message);
  }
}
export type MetaTransport = (
  method: "GET" | "POST",
  url: string,
  token: string,
  params: Record<string, string>,
  signal?: AbortSignal,
) => Promise<Record<string, unknown>>;
export const metaRequest: MetaTransport = async (
  method,
  url,
  token,
  params,
  signal,
) => {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  let body: URLSearchParams | undefined;
  if (url.startsWith("https://rupload.facebook.com/")) {
    headers.Authorization = `OAuth ${token}`;
    headers.file_url = params.file_url;
  } else if (method === "POST") body = new URLSearchParams(params);
  else url += "?" + new URLSearchParams(params);
  const timeout = AbortSignal.timeout(120_000);
  const response = await fetch(url, {
    method,
    headers,
    body,
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  const data = await response.json();
  if (!response.ok || data.error) {
    const code = Number(data.error?.code);
    const disposition =
      code === 190 || code === 10 || code === 200
        ? "blocked"
        : response.status === 429 || response.status >= 500
          ? "retry_wait"
          : "failed";
    throw new PipelineError(
      safeError(data.error?.message || `Meta HTTP ${response.status}`),
      disposition,
      `meta_${code || response.status}`,
      Math.max(30_000, Number(response.headers.get("retry-after")) * 1000 || 0),
      response.status,
    );
  }
  return data;
};

interface Publication {
  phase: string;
  remote_id: string | null;
  post_id: string | null;
  error: string | null;
  upload_url: string | null;
  updated_at: number;
}
interface PublishOptions {
  db: Database.Database;
  userId: number;
  reelId: number;
  target: "instagram" | "facebook";
  token: string;
  accountId?: string;
  pageId?: string;
  videoUrl: string;
  caption: string;
  assertOwned: () => void;
  signal?: AbortSignal;
  api?: MetaTransport;
}

/** Each invocation performs at most one remote step and checkpoints it durably. */
export async function publishStep(
  o: PublishOptions,
): Promise<{ done: boolean; postId?: string }> {
  const { db, userId, reelId, target } = o;
  o.assertOwned();
  db.prepare(
    `INSERT OR IGNORE INTO pipeline_publications(reel_id,user_id,target,phase,updated_at) VALUES(?,?,?,'new',?)`,
  ).run(reelId, userId, target, Date.now());
  const row = db
    .prepare(
      "SELECT * FROM pipeline_publications WHERE reel_id=? AND user_id=? AND target=?",
    )
    .get(reelId, userId, target) as Publication;
  const save = (
    phase: string,
    remoteId = row.remote_id,
    postId = row.post_id,
    uploadUrl = row.upload_url,
  ) => {
    o.assertOwned();
    db.prepare(
      `UPDATE pipeline_publications SET phase=?,remote_id=?,post_id=?,upload_url=?,updated_at=? WHERE reel_id=? AND user_id=? AND target=?`,
    ).run(
      phase,
      remoteId,
      postId,
      uploadUrl,
      Date.now(),
      reelId,
      userId,
      target,
    );
  };
  const api = o.api || metaRequest;
  if (row.phase === "succeeded") return { done: true, postId: row.post_id! };
  if (["creating", "submitting", "needs_review"].includes(row.phase))
    throw new PipelineError(
      "Resultado remoto incerto; revise a publicação antes de reenviar.",
      "needs_review",
      "uncertain",
    );
  if (row.phase !== "new" && Date.now() - row.updated_at > 24 * 60 * 60 * 1000)
    throw new PipelineError(
      "Sessão de publicação antiga; revise no provedor antes de reenviar.",
      "needs_review",
      "expired_session",
    );

  const mutate = async (
    phase: string,
    fn: () => Promise<Record<string, unknown>>,
  ) => {
    save(phase);
    try {
      const data = await fn();
      o.assertOwned();
      return data;
    } catch (error) {
      // An explicit 4xx/429 rejection is safe to retry; a timeout/5xx might have succeeded remotely.
      if (
        error instanceof PipelineError &&
        error.disposition !== "needs_review" &&
        error.httpStatus !== undefined &&
        error.httpStatus < 500
      ) {
        save(row.phase);
        throw error;
      }
      save("needs_review");
      throw new PipelineError(
        "Resposta incerta após envio à Meta; confira o resultado remoto antes de reenviar.",
        "needs_review",
        "uncertain",
      );
    }
  };

  if (row.phase === "new") {
    const data = await mutate("creating", () =>
      target === "instagram"
        ? api(
            "POST",
            `${GRAPH_URL}/${o.accountId}/media`,
            o.token,
            {
              media_type: "REELS",
              video_url: o.videoUrl,
              caption: o.caption,
              share_to_feed: "true",
            },
            o.signal,
          )
        : api(
            "POST",
            `${GRAPH_URL}/${o.pageId}/video_reels`,
            o.token,
            { upload_phase: "start" },
            o.signal,
          ),
    );
    const remoteId = String(data.id || data.video_id || "");
    if (!remoteId) {
      save("needs_review");
      throw new PipelineError(
        "Meta não retornou o ID da sessão.",
        "needs_review",
        "missing_remote_id",
      );
    }
    const uploadUrl =
      target === "facebook"
        ? String(
            data.upload_url ||
              `https://rupload.facebook.com/video-upload/${version}/${remoteId}`,
          )
        : null;
    if (
      uploadUrl &&
      (!uploadUrl.startsWith("https://rupload.facebook.com/") ||
        new URL(uploadUrl).hostname !== "rupload.facebook.com")
    ) {
      save("needs_review", remoteId);
      throw new PipelineError("URL de upload Meta inválida.", "needs_review");
    }
    save(
      target === "instagram" ? "processing" : "created",
      remoteId,
      null,
      uploadUrl,
    );
    return { done: false };
  }
  if (target === "instagram") {
    if (row.phase === "processing") {
      const status = await api(
        "GET",
        `${GRAPH_URL}/${row.remote_id}`,
        o.token,
        { fields: "status_code,status" },
        o.signal,
      );
      if (status.status_code === "FINISHED") save("ready");
      else if (status.status_code === "PUBLISHED")
        throw new PipelineError(
          "Container já publicado; confirme o ID do post no Instagram.",
          "needs_review",
        );
      else if (["ERROR", "EXPIRED"].includes(String(status.status_code)))
        throw new PipelineError(
          "Container Instagram rejeitado ou expirado.",
          "failed",
          "invalid_media",
        );
      return { done: false };
    }
    const data = await mutate("submitting", () =>
      api(
        "POST",
        `${GRAPH_URL}/${o.accountId}/media_publish`,
        o.token,
        { creation_id: row.remote_id! },
        o.signal,
      ),
    );
    if (!data.id) {
      save("needs_review");
      throw new PipelineError(
        "Publicação sem ID de confirmação.",
        "needs_review",
      );
    }
    save("succeeded", row.remote_id, String(data.id));
    return { done: true, postId: String(data.id) };
  }
  if (row.phase === "created") {
    // Upload is repeatable to the same session and cannot create a second post.
    await api(
      "POST",
      row.upload_url!,
      o.token,
      { file_url: o.videoUrl },
      o.signal,
    );
    save("transferred");
    return { done: false };
  }
  if (row.phase === "transferred") {
    await mutate("submitting", () =>
      api(
        "POST",
        `${GRAPH_URL}/${o.pageId}/video_reels`,
        o.token,
        {
          upload_phase: "finish",
          video_id: row.remote_id!,
          video_state: "PUBLISHED",
          description: o.caption,
          title: o.caption.slice(0, 100),
        },
        o.signal,
      ),
    );
    save("submitted");
    return { done: false };
  }
  const data = await api(
    "GET",
    `${GRAPH_URL}/${row.remote_id}`,
    o.token,
    { fields: "status" },
    o.signal,
  );
  const status = data.status as
    | { video_status?: string; publishing_phase?: { status?: string } }
    | undefined;
  if (
    status?.video_status === "error" ||
    status?.publishing_phase?.status === "error"
  )
    throw new PipelineError(
      "Meta rejeitou o processamento do Reel.",
      "failed",
      "invalid_media",
    );
  if (
    status?.video_status === "ready" &&
    status?.publishing_phase?.status === "complete"
  ) {
    save("succeeded", row.remote_id, row.remote_id);
    return { done: true, postId: row.remote_id! };
  }
  return { done: false };
}
