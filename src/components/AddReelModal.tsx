"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link as LinkIcon, Plus, Loader2, AlertCircle } from "lucide-react";
import Modal from "@/components/Modal";

interface AddReelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdded: () => void;
}

function detectPlatform(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "TikTok";
    if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") return "YouTube Shorts";
    if (host === "facebook.com" || host.endsWith(".facebook.com")) return "Facebook";
    if (host === "instagram.com" || host.endsWith(".instagram.com")) return "Instagram";
  } catch { /* The server validates the complete URL on submission. */ }
  return null;
}

function AddReelForm({ onClose, onAdded }: Omit<AddReelModalProps, "isOpen">) {
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const pendingRequest = useRef<AbortController | null>(null);

  useEffect(() => () => {
    pendingRequest.current?.abort();
    pendingRequest.current = null;
  }, []);

  const close = () => {
    pendingRequest.current?.abort();
    pendingRequest.current = null;
    onClose();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!url.trim() || pendingRequest.current) return;
    const controller = new AbortController();
    pendingRequest.current = controller;
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/reels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), caption: caption.trim() }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (controller.signal.aborted || pendingRequest.current !== controller) return;
      if (res.ok && data.success) {
        onAdded();
        onClose();
      } else {
        setError(data.error || "Não foi possível adicionar o reel. Tente novamente.");
      }
    } catch {
      if (!controller.signal.aborted && pendingRequest.current === controller) setError("Sem conexão com o servidor. Tente novamente.");
    } finally {
      if (pendingRequest.current === controller) {
        pendingRequest.current = null;
        setSubmitting(false);
      }
    }
  };

  const detected = detectPlatform(url.trim());

  return (
    <Modal title="Adicionar vídeo" description="Cole um link do Instagram, TikTok, YouTube ou Facebook para começar." onClose={close}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" aria-busy={submitting}>
        <div>
          <div className="flex items-center justify-between gap-2">
            <label className="label" htmlFor="reel-url">Link do vídeo</label>
            {detected && <span className="chip mb-1.5 px-2 py-0.5 text-[11px]">{detected}</span>}
          </div>
          <div className="relative">
            <LinkIcon className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden="true" />
            <input
              id="reel-url"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://www.instagram.com/reel/..."
              className="input pl-10"
              required
              disabled={submitting}
              data-modal-autofocus
              aria-describedby={error ? "add-reel-error" : undefined}
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="reel-caption">Legenda própria <span className="font-normal text-faint">(opcional)</span></label>
          <textarea
            id="reel-caption"
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            placeholder="Deixe em branco para gerar uma legenda com IA"
            rows={3}
            className="textarea"
            disabled={submitting}
          />
        </div>
        {error && <div id="add-reel-error" className="alert alert-err" role="alert"><AlertCircle aria-hidden="true" /><span>{error}</span></div>}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-5">
          <button type="button" className="btn btn-ghost" onClick={close}>Cancelar</button>
          <button type="submit" disabled={!url.trim() || submitting} className="btn btn-primary">
            {submitting ? <Loader2 className="motion-safe:animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {submitting ? "Adicionando…" : "Adicionar à fila"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function AddReelModal({ isOpen, onClose, onAdded }: AddReelModalProps) {
  return isOpen ? <AddReelForm onClose={onClose} onAdded={onAdded} /> : null;
}
