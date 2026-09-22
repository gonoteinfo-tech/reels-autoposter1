"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Trash2, Loader2, AlertCircle, CheckCircle2, X, AtSign, RefreshCw } from "lucide-react";

import AppShell, { PageHeader } from "@/components/AppShell";
import { timeAgo } from "@/components/time";
import type { SourceProfile, User } from "@/types";

type Platform = "instagram" | "tiktok" | "youtube" | "facebook";

const PLATFORMS: { id: Platform; label: string; placeholder: string }[] = [
  { id: "instagram", label: "Instagram", placeholder: "perfil_do_instagram" },
  { id: "tiktok", label: "TikTok", placeholder: "perfil_do_tiktok" },
  { id: "youtube", label: "YouTube", placeholder: "canal_do_youtube" },
  { id: "facebook", label: "Facebook", placeholder: "pagina.do.facebook" },
];

const platformLabel = (p?: string) => PLATFORMS.find((x) => x.id === (p || "instagram"))?.label || "Instagram";

/** Estado atual da coleta de uma fonte, a partir dos dados reais do banco */
function sourceStatus(source: SourceProfile): { label: string; note: string; dot: string } {
  if (source.username === "manual") return { label: "Links adicionados à mão", note: "", dot: "bg-faint" };
  if (source.pending_snapshot_id) return { label: "Coletando", note: "resultado em alguns minutos", dot: "bg-info" };
  if (!source.is_active) return { label: "Pausada", note: "", dot: "bg-faint" };
  if (source.last_checked_at) return { label: "Verificada", note: timeAgo(source.last_checked_at), dot: "bg-ok" };
  return { label: "Ainda não verificada", note: "", dot: "bg-faint" };
}

export default function SourcesClient({ user }: { user: User }) {
  const [sources, setSources] = useState<SourceProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [selectedFilter, setSelectedFilter] = useState<string>("all");
  const [newUsername, setNewUsername] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [syncNotice, setSyncNotice] = useState<{ type: "info" | "error"; text: string } | null>(null);
  const refreshTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Cancelar as atualizações agendadas ao sair da página
  useEffect(() => () => refreshTimers.current.forEach(clearTimeout), []);

  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch("/api/sources");
      const data = await res.json();
      if (data.success) setSources(data.data?.sources || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const handleSync = async (id: number) => {
    setSyncingId(id);
    try {
      const res = await fetch("/api/sources/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: id }),
      });
      const data = await res.json().catch(() => null);
      if (data?.success) {
        setSyncNotice({ type: "info", text: data.message || "Sincronização iniciada." });
        fetchSources();
        // A coleta roda em segundo plano: atualizar a lista algumas vezes enquanto os vídeos chegam
        if (data.data?.pending) {
          refreshTimers.current.forEach(clearTimeout);
          refreshTimers.current = [30, 60, 120, 180].map((sec) => setTimeout(fetchSources, sec * 1000));
        }
      } else {
        setSyncNotice({
          type: "error",
          text: data?.error || `Não foi possível sincronizar (resposta ${res.status} do servidor). Tente novamente.`,
        });
      }
    } catch {
      setSyncNotice({ type: "error", text: "Sem conexão com o servidor. Verifique sua internet e tente novamente." });
    } finally {
      setSyncingId(null);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || adding) return;

    setAdding(true);
    setAddError("");

    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newUsername.trim().replace("@", ""),
          platform,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNewUsername("");
        fetchSources();
      } else {
        setAddError(data.error || "Erro ao adicionar a fonte");
      }
    } catch {
      setAddError("Sem conexão com o servidor. Tente novamente.");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await fetch("/api/sources", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      fetchSources();
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  };

  const tabs = [
    { id: "all", label: "Todas", count: sources.length },
    ...PLATFORMS.map((p) => ({
      id: p.id,
      label: p.label,
      count: sources.filter((s) => (s.platform || "instagram") === p.id).length,
    })),
  ].filter((t) => t.id === "all" || t.count > 0);

  const filteredSources = sources.filter(
    (s) => selectedFilter === "all" || (s.platform || "instagram") === selectedFilter
  );

  return (
    <AppShell user={user}>
      <PageHeader
        title="Fontes"
        subtitle="Perfis monitorados de onde os vídeos são coletados"
        actions={
          <button type="button" onClick={fetchSources} className="btn btn-ghost">
            <RefreshCw />
            Atualizar
          </button>
        }
      />

      <form onSubmit={handleAdd} aria-label="Adicionar fonte" className="card p-4 flex flex-col lg:flex-row lg:items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted">Plataforma</span>
          <div className="segmented overflow-x-auto max-w-full" role="group" aria-label="Plataforma da fonte">
            {PLATFORMS.map((p) => (
              <button key={p.id} type="button" aria-pressed={platform === p.id} onClick={() => setPlatform(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <label className="flex-1 flex flex-col gap-1.5">
          <span className="text-xs text-muted">Usuário do perfil</span>
          <span className="relative">
            <AtSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" aria-hidden="true" />
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder={PLATFORMS.find((p) => p.id === platform)?.placeholder}
              className="input pl-10"
            />
          </span>
        </label>
        <button type="submit" disabled={!newUsername.trim() || adding} className="btn btn-primary">
          {adding ? <Loader2 className="animate-spin" /> : <Plus />}
          Adicionar fonte
        </button>
      </form>
      {addError && (
        <div className="alert alert-err -mt-2" role="alert">
          <AlertCircle />
          <span>{addError}</span>
        </div>
      )}

      {tabs.length > 1 && (
        <div role="tablist" aria-label="Filtrar por plataforma" className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              className="pill"
              aria-selected={selectedFilter === tab.id}
              onClick={() => setSelectedFilter(tab.id)}
            >
              {tab.label}
              <span className="font-mono text-xs opacity-80">{tab.count}</span>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-16 text-muted">
          <Loader2 className="w-5 h-5 animate-spin" />
          Carregando as fontes...
        </div>
      ) : filteredSources.length === 0 ? (
        <div className="card flex flex-col items-center text-center gap-2 px-6 py-16">
          <span className="font-semibold">Nenhuma fonte cadastrada</span>
          <span className="text-[13px] text-muted max-w-sm">
            Adicione perfis do Instagram, TikTok, YouTube ou páginas do Facebook para o sistema coletar os vídeos novos.
          </span>
        </div>
      ) : (
        <section aria-label="Lista de fontes" className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
          {filteredSources.map((source) => {
            const status = sourceStatus(source);
            const isManual = source.username === "manual";
            return (
              <article key={source.id} className="card p-[18px] flex flex-col gap-3.5">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-full bg-[#26292e] flex items-center justify-center font-semibold uppercase shrink-0">
                    {source.username.replace(/[^a-z0-9]/gi, "").charAt(0) || "?"}
                  </span>
                  <div className="flex-1 min-w-0 flex flex-col">
                    <span className="font-semibold truncate">{isManual ? "Adicionados manualmente" : `@${source.username}`}</span>
                    <span className="text-xs text-muted">{platformLabel(source.platform)}</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-icon"
                    aria-label={`Remover @${source.username}`}
                    title="Remover fonte"
                    disabled={deletingId === source.id || syncingId !== null}
                    onClick={() => {
                      if (confirm(`Remover a fonte @${source.username}?`)) handleDelete(source.id);
                    }}
                  >
                    {deletingId === source.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  </button>
                </div>

                <div className="flex items-center gap-2 text-[13px] min-w-0">
                  <span className={`dot ${status.dot}`} />
                  <span className="text-ink-2">{status.label}</span>
                  {status.note && (
                    <span className="text-faint truncate" suppressHydrationWarning>
                      {status.note}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="inset px-3 py-2.5 flex flex-col gap-0.5">
                    <span className="text-xs text-faint">Coletados</span>
                    <span className="font-mono text-base tabular">{source.reels_count || 0}</span>
                  </div>
                  <div className="inset px-3 py-2.5 flex flex-col gap-0.5">
                    <span className="text-xs text-faint">Última coleta</span>
                    <span className="font-mono text-base" suppressHydrationWarning>
                      {source.last_checked_at ? timeAgo(source.last_checked_at).replace("há ", "") : "—"}
                    </span>
                  </div>
                </div>

                {!isManual && (
                  <button
                    type="button"
                    onClick={() => handleSync(source.id)}
                    disabled={syncingId !== null || deletingId !== null}
                    className="btn btn-secondary w-full"
                  >
                    {syncingId === source.id ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                    {source.pending_snapshot_id ? "Coletando..." : "Sincronizar"}
                  </button>
                )}
              </article>
            );
          })}
        </section>
      )}

      {syncNotice && (
        <div
          role="status"
          className={`alert fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-lg shadow-[0_16px_40px_rgba(0,0,0,0.5)] ${
            syncNotice.type === "error" ? "alert-err bg-[#2a1719] border border-[#5a2a2a]" : "alert-ok"
          }`}
        >
          {syncNotice.type === "error" ? <AlertCircle /> : <CheckCircle2 className="text-ok" />}
          <p className="m-0 flex-1">{syncNotice.text}</p>
          <button type="button" aria-label="Fechar aviso" onClick={() => setSyncNotice(null)} className="btn btn-icon w-7 h-7 -my-1 -mr-1">
            <X />
          </button>
        </div>
      )}
    </AppShell>
  );
}
