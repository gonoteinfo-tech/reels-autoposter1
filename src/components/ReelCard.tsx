"use client";

import { useState } from "react";
import { Check, Clock3, ExternalLink, Film, Loader2, Play, RotateCcw, Trash2 } from "lucide-react";
import type { Reel, ReelStage } from "@/types";
import { timeAgo } from "@/components/time";

export const STAGE_META: Record<ReelStage, { label: string; chip: string }> = {
  discovered: { label: "Na fila", chip: "chip" },
  downloading: { label: "Baixando", chip: "chip chip-info" },
  downloaded: { label: "Baixado", chip: "chip chip-info" },
  processing: { label: "Processando", chip: "chip chip-info" },
  processed: { label: "Processado", chip: "chip chip-info" },
  uploading: { label: "Enviando", chip: "chip chip-info" },
  uploaded: { label: "Pronto para publicar", chip: "chip chip-accent" },
  publishing: { label: "Publicando", chip: "chip chip-info" },
  published: { label: "Publicado", chip: "chip chip-ok" },
  error: { label: "Precisa de atenção", chip: "chip chip-err" },
};

function platformName(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "TikTok";
    if (host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com")) return "YouTube";
    if (host === "facebook.com" || host.endsWith(".facebook.com")) return "Facebook";
  } catch { /* Older imported records may not have a source URL. */ }
  return "Instagram";
}

function durationLabel(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${hours ? `${hours}:${String(minutes).padStart(2, "0")}` : minutes}:${String(total % 60).padStart(2, "0")}`;
}

interface ReelCardProps {
  reel: Reel;
  onPublish?: (reelId: number) => void;
  onReprocess?: (reelId: number) => void;
  onDelete?: (reelId: number) => void;
  busy?: boolean;
  canPublish?: boolean;
  working?: boolean;
}

export default function ReelCard({ reel, onPublish, onReprocess, onDelete, busy = false, canPublish, working: activeWork }: ReelCardProps) {
  const [failedMedia, setFailedMedia] = useState<string | null>(null);
  const working = activeWork ?? ["downloading", "processing", "uploading", "publishing"].includes(reel.stage);
  const stage = reel.stage === "publishing" && !working
    ? reel.ig_post_id || reel.fb_post_id
      ? { label: "Publicação parcial", chip: "chip chip-warn" }
      : { label: "Publicação na fila", chip: "chip chip-info" }
    : STAGE_META[reel.stage] || STAGE_META.discovered;
  const publishAvailable = canPublish ?? reel.stage === "uploaded";
  const mediaKey = `${reel.id}:${reel.processed_path}:${reel.local_path}:${reel.r2_url}:${reel.updated_at}`;
  const hasMedia = Boolean(reel.processed_path || reel.local_path || reel.r2_url);
  const videoAvailable = hasMedia && failedMedia !== mediaKey;
  const caption = reel.caption || reel.original_caption || "Sem legenda";
  const username = reel.source_username?.replace(/^@/, "") || "fonte manual";
  const duration = durationLabel(reel.duration_seconds);
  const isError = reel.stage === "error";

  return (
    <li className="card flex min-w-0 flex-col overflow-hidden shadow-[0_3px_16px_rgba(30,35,42,0.025)]" aria-busy={busy || undefined}>
      <div className={`relative isolate aspect-[9/16] overflow-hidden ${videoAvailable ? "bg-black" : "bg-inset"}`}>
        {videoAvailable ? (
          <video
            key={mediaKey}
            src={`/api/videos?id=${reel.id}`}
            controls
            playsInline
            preload="metadata"
            tabIndex={0}
            aria-label={`Assistir vídeo de @${username}`}
            className="h-full w-full object-contain"
            onError={() => setFailedMedia(mediaKey)}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface text-faint"><Film className="h-6 w-6" aria-hidden="true" /></span>
            <div>
              <p className="m-0 text-sm font-medium text-ink-2">Prévia indisponível</p>
              <p className="mb-0 mt-2 text-xs leading-relaxed text-muted">
                {hasMedia ? "Não foi possível carregar este arquivo." : "O vídeo aparecerá aqui após o download."}
              </p>
            </div>
            {reel.instagram_url && (
              <a href={reel.instagram_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
                Abrir vídeo original <ExternalLink aria-hidden="true" />
              </a>
            )}
          </div>
        )}
        {videoAvailable && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-black/45 to-transparent px-3 py-3 pb-8 text-white">
            <span className="rounded-md bg-black/35 px-2 py-1 text-[11px] font-medium">{platformName(reel.instagram_url)}</span>
            {duration && <span className="rounded-md bg-black/45 px-2 py-1 font-mono text-[11px]">{duration}</span>}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className={`${stage.chip} min-w-0 text-[11px]`}>
            {working && <Loader2 className="h-3 w-3 motion-safe:animate-spin" aria-hidden="true" />}
            {stage.label}
          </span>
          {!videoAvailable && <span className="shrink-0 text-[11px] text-muted">{platformName(reel.instagram_url)}{duration ? ` · ${duration}` : ""}</span>}
        </div>
        <div className="min-w-0">
          <p className="mb-1 mt-0 truncate text-xs font-medium text-muted" title={`@${username}`}>@{username}</p>
          <p className="m-0 line-clamp-2 min-h-[2.75rem] break-words text-sm font-medium leading-[1.4rem] text-ink" title={caption}>{caption}</p>
        </div>
        {isError && reel.error_message && <p className="m-0 line-clamp-3 break-words text-xs leading-relaxed text-err-ink" title={reel.error_message}>{reel.error_message}</p>}
        {(reel.ig_post_id || reel.fb_post_id) && (
          <div className="flex flex-wrap gap-1.5" aria-label="Destinos publicados">
            {reel.ig_post_id && <span className="chip chip-ok text-[10px]"><Check className="h-3 w-3" aria-hidden="true" />Instagram</span>}
            {reel.fb_post_id && <span className="chip chip-ok text-[10px]"><Check className="h-3 w-3" aria-hidden="true" />Facebook</span>}
          </div>
        )}
        <div className="mt-auto flex items-center gap-1.5 pt-1 text-[11px] text-faint" suppressHydrationWarning>
          <Clock3 className="h-3 w-3" aria-hidden="true" />
          {timeAgo(reel.published_at || reel.created_at)}
          {busy && <span role="status" className="ml-auto inline-flex items-center gap-1.5 text-muted"><Loader2 className="h-3 w-3 motion-safe:animate-spin" aria-hidden="true" />Aguarde…</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {publishAvailable && onPublish && (
            <button type="button" className="btn btn-primary btn-sm flex-1" disabled={busy || working} onClick={() => onPublish(reel.id)}>
              <Play aria-hidden="true" />Publicar
            </button>
          )}
          {(reel.stage === "discovered" || isError) && onReprocess && (
            <button type="button" className="btn btn-secondary btn-sm flex-1" disabled={busy} onClick={() => onReprocess(reel.id)}>
              {isError ? <RotateCcw aria-hidden="true" /> : <Play aria-hidden="true" />}
              {isError ? "Reprocessar" : "Processar"}
            </button>
          )}
          {reel.instagram_url && videoAvailable && (
            <a href={reel.instagram_url} target="_blank" rel="noopener noreferrer" className="btn btn-icon ml-auto" aria-label="Abrir vídeo original" title="Abrir vídeo original"><ExternalLink aria-hidden="true" /></a>
          )}
          {reel.stage !== "published" && onDelete && (
            <button type="button" className="btn btn-icon ml-auto" disabled={busy || working} aria-label="Excluir reel" title={working ? "Aguarde o trabalho em andamento" : "Excluir reel"} onClick={() => onDelete(reel.id)}><Trash2 aria-hidden="true" /></button>
          )}
          {reel.stage === "published" && <span className="text-xs text-muted">Publicação concluída</span>}
        </div>
      </div>
    </li>
  );
}
