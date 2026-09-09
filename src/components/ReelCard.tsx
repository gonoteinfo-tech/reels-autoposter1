"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  Play,
  Clock,
  AlertCircle,
  CheckCircle2,
  Download,
  Upload,
  Loader2,
  ExternalLink,
  RotateCcw,
  Trash2,
  Sparkles,
} from "lucide-react";
import { Instagram, Facebook, TikTok, YouTube } from "@/components/icons";
import type { Reel, ReelStage } from "@/types";

function detectPlatform(url: string): 'instagram' | 'tiktok' | 'facebook' | 'youtube' {
  if (!url) return 'instagram';
  if (url.includes('tiktok.com')) return 'tiktok';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  if (url.includes('facebook.com')) return 'facebook';
  return 'instagram';
}

const STAGE_CONFIG: Record<
  ReelStage,
  { label: string; color: string; bg: string; border: string; icon: React.ComponentType<{ className?: string }>; step: number }
> = {
  discovered: { label: "Descoberto", color: "#60a5fa", bg: "rgba(59, 130, 246, 0.15)", border: "rgba(59, 130, 246, 0.3)", icon: Clock, step: 0 },
  downloading: { label: "Baixando", color: "#fbbf24", bg: "rgba(245, 158, 11, 0.15)", border: "rgba(245, 158, 11, 0.3)", icon: Download, step: 1 },
  downloaded: { label: "Baixado", color: "#60a5fa", bg: "rgba(59, 130, 246, 0.15)", border: "rgba(59, 130, 246, 0.3)", icon: CheckCircle2, step: 2 },
  processing: { label: "Processando", color: "#c084fc", bg: "rgba(168, 85, 247, 0.18)", border: "rgba(168, 85, 247, 0.35)", icon: Loader2, step: 3 },
  processed: { label: "Processado", color: "#c084fc", bg: "rgba(168, 85, 247, 0.18)", border: "rgba(168, 85, 247, 0.35)", icon: CheckCircle2, step: 4 },
  uploading: { label: "Enviando", color: "#fbbf24", bg: "rgba(245, 158, 11, 0.15)", border: "rgba(245, 158, 11, 0.3)", icon: Upload, step: 5 },
  uploaded: { label: "Pronto", color: "#c084fc", bg: "rgba(168, 85, 247, 0.18)", border: "rgba(168, 85, 247, 0.35)", icon: Sparkles, step: 6 },
  publishing: { label: "Publicando", color: "#f472b6", bg: "rgba(236, 72, 153, 0.15)", border: "rgba(236, 72, 153, 0.3)", icon: Instagram, step: 7 },
  published: { label: "Publicado", color: "#34d399", bg: "rgba(16, 185, 129, 0.15)", border: "rgba(16, 185, 129, 0.3)", icon: CheckCircle2, step: 8 },
  error: { label: "Falhou", color: "#f87171", bg: "rgba(239, 68, 68, 0.15)", border: "rgba(239, 68, 68, 0.3)", icon: AlertCircle, step: -1 },
};

const TOTAL_STEPS = 8;

interface ReelCardProps {
  reel: Reel;
  onPublish?: (reelId: number) => void;
  onReprocess?: (reelId: number) => void;
  onDelete?: (reelId: number) => void;
}

export default function ReelCard({ reel, onPublish, onReprocess, onDelete }: ReelCardProps) {
  const stage = STAGE_CONFIG[reel.stage] || STAGE_CONFIG.discovered;
  const StageIcon = stage.icon;
  const isAnimating = ["downloading", "processing", "uploading", "publishing"].includes(reel.stage);
  const plat = detectPlatform(reel.instagram_url);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="reel-card group"
    >
      {/* Video Thumbnail (9:16) */}
      <div className="reel-card-thumbnail">
        {reel.local_path || reel.processed_path || reel.r2_url ? (
          <video
            src={reel.r2_url || (reel.processed_path ? `/api/videos?id=${reel.id}&type=processed` : reel.local_path ? `/api/videos?id=${reel.id}&type=local` : "")}
            muted
            loop
            playsInline
            onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
            onMouseLeave={(e) => {
              const v = e.target as HTMLVideoElement;
              v.pause();
              v.currentTime = 0;
            }}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-950/80">
            <div className="w-12 h-12 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center">
              <Play className="w-5 h-5 text-slate-500 ml-0.5" />
            </div>
            <span className="text-[11px] text-slate-500 mt-2 font-medium">Prévia Indisponível</span>
          </div>
        )}

        {/* Hover overlay with action controls */}
        <div className="reel-card-overlay">
          <div className="flex flex-col gap-2">
            {reel.stage === "uploaded" && onPublish && (
              <div className="flex gap-1.5">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPublish(reel.id);
                  }}
                  className="btn btn-sm btn-instagram flex-1 shadow-lg"
                >
                  <Instagram className="w-3.5 h-3.5" />
                  Instagram
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPublish(reel.id);
                  }}
                  className="btn btn-sm btn-facebook flex-1 shadow-lg"
                >
                  <Facebook className="w-3.5 h-3.5" />
                  Facebook
                </button>
              </div>
            )}
            {reel.instagram_url && (
              <a
                href={reel.instagram_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm btn-secondary w-full justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Ver Original
              </a>
            )}
          </div>
        </div>

        {/* Top Badges */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none z-10">
          {/* Stage badge */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold backdrop-blur-md border shadow-md"
            style={{
              background: stage.bg,
              borderColor: stage.border,
              color: stage.color,
            }}
          >
            <StageIcon className={`w-3 h-3 ${isAnimating ? "animate-spin" : ""}`} />
            <span>{stage.label}</span>
          </div>

          {/* Platform / Duration badge */}
          <div className="flex items-center gap-1">
            {reel.duration_seconds > 0 && (
              <div className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-black/60 backdrop-blur-md text-white border border-white/10">
                {Math.floor(reel.duration_seconds / 60)}:
                {Math.floor(reel.duration_seconds % 60).toString().padStart(2, "0")}
              </div>
            )}
            <div className="p-1 rounded-md bg-black/60 backdrop-blur-md border border-white/10">
              {plat === 'tiktok' && <TikTok className="w-3.5 h-3.5 text-[#00f2fe]" />}
              {plat === 'youtube' && <YouTube className="w-3.5 h-3.5 text-[#ff0000]" />}
              {plat === 'facebook' && <Facebook className="w-3.5 h-3.5 text-[#1877f2]" />}
              {plat === 'instagram' && <Instagram className="w-3.5 h-3.5 text-[#e1306c]" />}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="reel-card-body">
        <div>
          {/* Source username */}
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs font-bold text-slate-300">
              @{reel.source_username}
            </span>
          </div>

          {/* Caption */}
          <p className="text-xs text-slate-300 line-clamp-2 mb-3 leading-relaxed">
            {reel.caption || reel.original_caption || "Sem legenda fornecida"}
          </p>
        </div>

        <div>
          {/* Pipeline progress bar */}
          <div className="pipeline-bar mb-2.5">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div
                key={i}
                className={`pipeline-step ${
                  reel.stage === "error"
                    ? i === 0
                      ? "error"
                      : ""
                    : i < stage.step
                    ? "completed"
                    : i === stage.step
                    ? "active"
                    : ""
                }`}
              />
            ))}
          </div>

          {/* Published social badges */}
          {(reel.ig_post_id || reel.fb_post_id) && (
            <div className="flex items-center gap-1.5 mb-2.5">
              {reel.ig_post_id && (
                <span className="badge badge-instagram text-[9px] py-0.5">
                  <Instagram className="w-3 h-3" />
                  Instagram
                </span>
              )}
              {reel.fb_post_id && (
                <span className="badge badge-facebook text-[9px] py-0.5">
                  <Facebook className="w-3 h-3" />
                  Facebook
                </span>
              )}
            </div>
          )}

          {/* Error message */}
          {reel.stage === "error" && reel.error_message && (
            <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 mb-2">
              <p className="text-[10px] text-red-400 line-clamp-2 leading-tight" title={reel.error_message}>
                {reel.error_message}
              </p>
            </div>
          )}

          {/* Action buttons */}
          {reel.stage !== "published" && (
            <div className="flex gap-1.5 pt-1">
              {onReprocess && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onReprocess(reel.id);
                  }}
                  className="btn btn-sm flex-1 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[11px]"
                >
                  {reel.stage === "discovered" ? (
                    <Play className="w-3 h-3 text-purple-400" />
                  ) : (
                    <RotateCcw className="w-3 h-3 text-purple-400" />
                  )}
                  {reel.stage === "discovered" ? "Processar" : "Reprocessar"}
                </button>
              )}
              {onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("Deseja realmente excluir este reel e arquivos?")) {
                      onDelete(reel.id);
                    }
                  }}
                  className="btn btn-sm bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-[11px] px-2.5"
                  title="Excluir Reel"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
