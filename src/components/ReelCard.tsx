"use client";

import { ExternalLink, Play, RotateCcw, Trash2 } from "lucide-react";
import type { Reel, ReelStage } from "@/types";
import { timeAgo } from "@/components/time";

/** Rótulo e cor de cada etapa do pipeline */
export const STAGE_META: Record<ReelStage, { label: string; chip: string }> = {
  discovered: { label: "Na fila", chip: "chip" },
  downloading: { label: "Baixando", chip: "chip chip-info" },
  downloaded: { label: "Baixado", chip: "chip chip-info" },
  processing: { label: "Marca d'água", chip: "chip chip-info" },
  processed: { label: "Processado", chip: "chip chip-info" },
  uploading: { label: "Enviando", chip: "chip chip-info" },
  uploaded: { label: "Pronto", chip: "chip chip-accent" },
  publishing: { label: "Publicando", chip: "chip chip-info" },
  published: { label: "Publicado", chip: "chip chip-ok" },
  error: { label: "Erro", chip: "chip chip-err" },
};

function platformName(url: string): string {
  if (!url) return "Instagram";
  if (url.includes("tiktok.com")) return "TikTok";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "YouTube";
  if (url.includes("facebook.com")) return "Facebook";
  return "Instagram";
}

function previewUrl(reel: Reel): string | null {
  if (reel.r2_url) return reel.r2_url;
  if (reel.processed_path) return `/api/videos?id=${reel.id}&type=processed`;
  if (reel.local_path) return `/api/videos?id=${reel.id}&type=local`;
  return null;
}

interface ReelCardProps {
  reel: Reel;
  onPublish?: (reelId: number) => void;
  onReprocess?: (reelId: number) => void;
  onDelete?: (reelId: number) => void;
}

/** Uma linha da fila de reels */
export default function ReelCard({ reel, onPublish, onReprocess, onDelete }: ReelCardProps) {
  const stage = STAGE_META[reel.stage] || STAGE_META.discovered;
  const video = previewUrl(reel);
  const caption = reel.caption || reel.original_caption || "Sem legenda";
  const isError = reel.stage === "error";

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_128px_84px_auto] items-center gap-x-4 gap-y-2 px-5 py-3 border-b border-[#202327] last:border-b-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-[52px] shrink-0 rounded-md bg-[#24272c] overflow-hidden flex items-center justify-center">
          {video ? (
            <video
              src={video}
              muted
              loop
              playsInline
              preload="metadata"
              className="w-full h-full object-cover"
              onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
              onMouseLeave={(e) => {
                e.currentTarget.pause();
                e.currentTarget.currentTime = 0;
              }}
            />
          ) : (
            <Play className="w-3 h-3 text-[#6e747c]" fill="currentColor" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 flex flex-col gap-0.5">
          <span className="font-medium truncate" title={caption}>
            {caption}
          </span>
          <span className={`text-xs truncate ${isError ? "text-err-ink" : "text-muted"}`} title={reel.error_message || undefined}>
            @{reel.source_username} · {isError && reel.error_message ? reel.error_message : platformName(reel.instagram_url)}
          </span>
          {(reel.ig_post_id || reel.fb_post_id) && (
            <span className="flex gap-1.5 mt-0.5">
              {reel.ig_post_id && <span className="chip text-[11px] py-0.5 px-2">Instagram</span>}
              {reel.fb_post_id && <span className="chip text-[11px] py-0.5 px-2">Facebook</span>}
            </span>
          )}
        </div>
      </div>

      <span className={`${stage.chip} justify-self-end md:justify-self-start`}>{stage.label}</span>

      <span className="hidden md:block text-[13px] text-muted" suppressHydrationWarning>
        {timeAgo(reel.published_at || reel.created_at)}
      </span>

      <div className="col-span-2 md:col-span-1 flex items-center justify-end gap-1.5">
        {reel.stage === "uploaded" && onPublish && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onPublish(reel.id)}>
            Publicar
          </button>
        )}
        {(reel.stage === "discovered" || isError) && onReprocess && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onReprocess(reel.id)}>
            {isError ? <RotateCcw /> : <Play />}
            {isError ? "Reprocessar" : "Processar"}
          </button>
        )}
        {reel.instagram_url && (
          <a
            href={reel.instagram_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-icon"
            aria-label="Abrir vídeo original"
            title="Abrir vídeo original"
          >
            <ExternalLink />
          </a>
        )}
        {reel.stage !== "published" && onDelete && (
          <button
            type="button"
            className="btn btn-icon"
            aria-label="Excluir reel"
            title="Excluir reel"
            onClick={() => {
              if (confirm("Excluir este reel e os arquivos dele?")) onDelete(reel.id);
            }}
          >
            <Trash2 />
          </button>
        )}
      </div>
    </li>
  );
}
