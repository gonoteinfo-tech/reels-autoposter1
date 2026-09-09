"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Link as LinkIcon,
  Plus,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { Instagram, Facebook, TikTok, YouTube } from "@/components/icons";

interface AddReelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdded: () => void;
}

function detectPlatform(url: string): { name: string; icon: React.ReactNode; color: string } {
  if (url.includes("tiktok.com")) return { name: "TikTok", icon: <TikTok className="w-3.5 h-3.5" />, color: "#00f2fe" };
  if (url.includes("youtube.com") || url.includes("youtu.be")) return { name: "YouTube Shorts", icon: <YouTube className="w-3.5 h-3.5" />, color: "#ff0000" };
  if (url.includes("facebook.com")) return { name: "Facebook", icon: <Facebook className="w-3.5 h-3.5" />, color: "#1877f2" };
  return { name: "Instagram Reel", icon: <Instagram className="w-3.5 h-3.5" />, color: "#e1306c" };
}

export default function AddReelModal({
  isOpen,
  onClose,
  onAdded,
}: AddReelModalProps) {
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const detected = url.trim() ? detectPlatform(url) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || submitting) return;

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/reels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), caption: caption.trim() }),
      });
      const data = await res.json();

      if (data.success) {
        setSuccess(true);
        setTimeout(() => {
          onAdded();
          setUrl("");
          setCaption("");
          setSuccess(false);
          onClose();
        }, 1000);
      } else {
        setError(data.error || "Erro ao adicionar Reel");
      }
    } catch {
      setError("Erro de conexão com o servidor");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 15 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="w-full max-w-md rounded-2xl p-6 bg-[#12121c] border border-white/10 shadow-[0_25px_60px_rgba(0,0,0,0.8)] pointer-events-auto relative overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Top ambient glow */}
              <div className="absolute -top-16 -right-16 w-36 h-36 rounded-full bg-purple-600/20 blur-2xl pointer-events-none" />

              {/* Header */}
              <div className="flex items-center justify-between mb-5 relative z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 flex items-center justify-center shadow-inner">
                    <Sparkles className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-white text-base">Adicionar Novo Reel</h3>
                    <p className="text-xs text-slate-400">
                      Importe vídeo de qualquer rede social
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
                {/* URL */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="label mb-0">URL do Vídeo</label>
                    {detected && (
                      <span 
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border"
                        style={{
                          color: detected.color,
                          borderColor: `${detected.color}40`,
                          backgroundColor: `${detected.color}15`,
                        }}
                      >
                        {detected.icon}
                        {detected.name}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <LinkIcon className="w-4 h-4 text-slate-500" />
                    </div>
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://www.instagram.com/reel/... ou TikTok / YouTube"
                      className="input input-with-icon text-white placeholder-slate-500"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                {/* Caption */}
                <div>
                  <label className="label">Legenda personalizada (opcional)</label>
                  <textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Deixe em branco para manter a legenda original e hashtags..."
                    rows={3}
                    className="input text-white placeholder-slate-500 resize-none"
                    style={{ minHeight: "85px" }}
                  />
                </div>

                {/* Error */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 text-xs p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400"
                  >
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                  </motion.div>
                )}

                {/* Success */}
                {success && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 text-xs p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400"
                  >
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    <span>Reel adicionado com sucesso à fila!</span>
                  </motion.div>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={!url.trim() || submitting}
                  className="btn btn-primary w-full py-2.5 mt-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Adicionando à Fila...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Adicionar ao Pipeline
                    </>
                  )}
                </button>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
