"use client";

import { useEffect, useState } from "react";
import { X, Link as LinkIcon, Plus, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

interface AddReelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdded: () => void;
}

function detectPlatform(url: string): string {
  if (url.includes("tiktok.com")) return "TikTok";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "YouTube Shorts";
  if (url.includes("facebook.com")) return "Facebook";
  return "Instagram";
}

export default function AddReelModal({ isOpen, onClose, onAdded }: AddReelModalProps) {
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Fechar com Esc
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

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
        }, 900);
      } else {
        setError(data.error || "Erro ao adicionar o reel");
      }
    } catch {
      setError("Sem conexão com o servidor. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-reel-title"
        className="relative w-full max-w-md card p-6 shadow-[0_24px_60px_rgba(0,0,0,0.6)]"
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex flex-col gap-1">
            <h2 id="add-reel-title" className="m-0 text-[17px] font-semibold">
              Adicionar reel
            </h2>
            <p className="m-0 text-[13px] text-muted">Cole o link de um vídeo do Instagram, TikTok, YouTube ou Facebook</p>
          </div>
          <button type="button" className="btn btn-icon -mr-2 -mt-2" onClick={onClose} aria-label="Fechar">
            <X />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <div className="flex items-center justify-between">
              <label className="label" htmlFor="reel-url">
                Link do vídeo
              </label>
              {detected && <span className="chip text-[11px] py-0.5 px-2 mb-1.5">{detected}</span>}
            </div>
            <div className="relative">
              <LinkIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" aria-hidden="true" />
              <input
                id="reel-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.instagram.com/reel/..."
                className="input pl-10"
                required
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="reel-caption">
              Legenda própria (opcional)
            </label>
            <textarea
              id="reel-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Em branco, a IA reescreve a legenda original"
              rows={3}
              className="textarea"
            />
          </div>

          {error && (
            <div className="alert alert-err" role="alert">
              <AlertCircle />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="alert alert-ok" role="status">
              <CheckCircle2 />
              <span>Reel adicionado à fila.</span>
            </div>
          )}

          <button type="submit" disabled={!url.trim() || submitting} className="btn btn-primary w-full mt-1">
            {submitting ? <Loader2 className="animate-spin" /> : <Plus />}
            {submitting ? "Adicionando..." : "Adicionar à fila"}
          </button>
        </form>
      </div>
    </div>
  );
}
