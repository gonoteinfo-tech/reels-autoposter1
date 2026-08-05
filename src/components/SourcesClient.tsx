"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Trash2,
  Users,
  Loader2,
  AlertCircle,
  Clock,
  X,
  AtSign,
  RefreshCw,
  Menu,
} from "lucide-react";
import { Instagram, Facebook, TikTok, YouTube } from "@/components/icons";

import Sidebar from "@/components/Sidebar";
import type { SourceProfile, User } from "@/types";

export default function SourcesClient({ user }: { user: User }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sources, setSources] = useState<SourceProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [platform, setPlatform] = useState<'instagram' | 'tiktok' | 'facebook' | 'youtube'>('instagram');
  const [newUsername, setNewUsername] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [syncingId, setSyncingId] = useState<number | null>(null);

  const handleSync = async (id: number) => {
    setSyncingId(id);
    try {
      const res = await fetch("/api/sources/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: id }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || "Importação concluída com sucesso!");
        fetchSources();
      } else {
        alert("Erro na importação: " + data.error);
      }
    } catch {
      alert("Erro de conexão com o servidor");
    } finally {
      setSyncingId(null);
    }
  };

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
          platform: platform
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNewUsername("");
        setShowAdd(false);
        fetchSources();
      } else {
        setAddError(data.error || "Erro ao adicionar fonte");
      }
    } catch {
      setAddError("Erro de conexão");
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

  return (
    <div className="app-layout">
      <div className="ambient-bg" />
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        user={user}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <main className={`main-area relative z-10 ${sidebarCollapsed ? "collapsed" : ""}`}>
        {/* TopBar */}
        <div className="topbar">
          <div className="flex items-center gap-3">
            <button
              className="mobile-menu-btn"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Users className="w-5 h-5" style={{ color: "var(--brand-purple)" }} />
            <h2 className="text-lg font-bold text-heading">Fontes de Conteúdo</h2>
            <span className="badge badge-neutral">{sources.length}</span>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="btn btn-primary btn-sm"
          >
            <Plus className="w-4 h-4" />
            Adicionar Fonte
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Info banner */}
          <div
            className="flex items-start gap-3 p-4 rounded-xl"
            style={{
              background: "var(--info-bg)",
              border: "1px solid rgba(59,130,246,0.15)",
            }}
          >
            <RefreshCw className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "var(--info)" }} />
            <div>
              <p className="text-sm font-semibold text-heading mb-1">
                Fontes de Conteúdo Multi-Plataforma
              </p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                Monitore perfis do <strong>Instagram</strong>, <strong>TikTok</strong>, páginas do <strong>Facebook</strong> ou canais do <strong>YouTube Shorts</strong>. O sistema varre as fontes automaticamente, processa os vídeos com sua logo e publica os novos conteúdos diretamente nas suas contas conectadas!
              </p>
            </div>
          </div>

          {/* Add form (inline) */}
          <AnimatePresence>
            {showAdd && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <form
                  onSubmit={handleAdd}
                  className="card flex items-end gap-3 flex-wrap md:flex-nowrap w-full"
                >
                    <div className="w-full md:w-48">
                      <label className="label">Plataforma</label>
                      <select
                        value={platform}
                        onChange={(e) => setPlatform(e.target.value as NonNullable<SourceProfile['platform']>)}
                        className="input"
                        style={{ background: "var(--surface-2)", color: "white" }}
                      >
                        <option value="instagram">Instagram</option>
                        <option value="tiktok">TikTok</option>
                        <option value="facebook">Facebook</option>
                        <option value="youtube">YouTube (Shorts)</option>
                      </select>
                    </div>
                    <div className="flex-1 w-full">
                      <label className="label">
                        {platform === 'instagram' && "Username do Instagram"}
                        {platform === 'tiktok' && "Username do TikTok (sem @)"}
                        {platform === 'facebook' && "Slug / Nome de Usuário da Página"}
                        {platform === 'youtube' && "Nome de Usuário / Identificador do Canal (sem @)"}
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <AtSign className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
                        </div>
                        <input
                          type="text"
                          value={newUsername}
                          onChange={(e) => setNewUsername(e.target.value)}
                          placeholder={
                            platform === 'instagram' ? "username" :
                            platform === 'tiktok' ? "ex: user_tiktok" :
                            platform === 'facebook' ? "ex: minha.pagina" :
                            "ex: canal_youtube"
                          }
                          className="input input-with-icon"
                          autoFocus
                        />
                      </div>
                      {addError && (
                        <p className="text-xs mt-1 flex items-center gap-1" style={{ color: "var(--danger)" }}>
                          <AlertCircle className="w-3 h-3" />
                          {addError}
                        </p>
                      )}
                    </div>
                    <button
                      type="submit"
                      disabled={!newUsername.trim() || adding}
                      className="btn btn-primary"
                    >
                      {adding ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                      Adicionar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAdd(false);
                        setAddError("");
                      }}
                      className="btn btn-secondary"
                    >
                      <X className="w-4 h-4" />
                    </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Sources list */}
          {loading ? (
            <div className="flex flex-col items-center py-20">
              <Loader2 className="w-8 h-8 animate-spin mb-3" style={{ color: "var(--brand-purple)" }} />
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Carregando fontes...</p>
            </div>
          ) : sources.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center py-20 text-center"
            >
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center mb-5 animate-float"
                style={{ background: "var(--surface-2)", border: "1px solid var(--surface-border)" }}
              >
                <Users className="w-10 h-10" style={{ color: "var(--text-muted)" }} />
              </div>
              <h3 className="text-lg font-bold text-heading mb-2">Nenhuma fonte cadastrada</h3>
              <p className="text-sm max-w-sm mb-4" style={{ color: "var(--text-muted)" }}>
                Adicione perfis do Instagram, TikTok, Facebook ou YouTube para o sistema monitorar e coletar vídeos automaticamente.
              </p>
              <button onClick={() => setShowAdd(true)} className="btn btn-primary">
                <Plus className="w-4 h-4" />
                Adicionar Primeira Fonte
              </button>
            </motion.div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {sources.map((source, i) => (
                  <motion.div
                    key={source.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: i * 0.05 }}
                    className="card flex items-center gap-4 hover:border-[var(--surface-border-hover)] transition-all"
                  >
                    {/* Avatar */}
                    {(() => {
                      const plat = source.platform || 'instagram';
                      let icon = <Instagram className="w-5 h-5" style={{ color: "var(--instagram)" }} />;
                      let bg = "rgba(225, 48, 108, 0.15)";
                      let border = "rgba(225, 48, 108, 0.3)";

                      if (plat === 'tiktok') {
                        icon = <TikTok className="w-5 h-5" style={{ color: "#00f2fe" }} />;
                        bg = "rgba(0, 242, 254, 0.1)";
                        border = "rgba(0, 242, 254, 0.25)";
                      } else if (plat === 'youtube') {
                        icon = <YouTube className="w-5 h-5" style={{ color: "#ff0000" }} />;
                        bg = "rgba(255, 0, 0, 0.1)";
                        border = "rgba(255, 0, 0, 0.25)";
                      } else if (plat === 'facebook') {
                        icon = <Facebook className="w-5 h-5" style={{ color: "var(--facebook)" }} />;
                        bg = "rgba(24, 119, 242, 0.15)";
                        border = "rgba(24, 119, 242, 0.3)";
                      }

                      return (
                        <div
                          className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{
                            background: bg,
                            border: `2px solid ${border}`,
                          }}
                        >
                          {icon}
                        </div>
                      );
                    })()}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-heading">
                          @{source.username}
                        </p>
                        {source.is_active ? (
                          <span className="badge badge-success">Ativo</span>
                        ) : (
                          <span className="badge badge-neutral">Inativo</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {source.reels_count || 0} reels coletados
                        </span>
                        {source.last_checked_at && (
                          <span className="text-xs flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                            <Clock className="w-3 h-3" />
                            Verificado: {new Date(source.last_checked_at).toLocaleString("pt-BR")}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      {source.username !== "manual" && (
                        <button
                          onClick={() => handleSync(source.id)}
                          disabled={syncingId !== null || deletingId !== null}
                          className="btn btn-secondary btn-sm flex items-center gap-1.5"
                          title="Importar/Varrer novos Reels desta fonte agora"
                        >
                          {syncingId === source.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                          Sincronizar
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(source.id)}
                        disabled={deletingId === source.id || syncingId !== null}
                        className="btn btn-danger btn-sm"
                      >
                        {deletingId === source.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
