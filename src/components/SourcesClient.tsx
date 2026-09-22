"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  CheckCircle2,
  Sparkles,
  ExternalLink,
  ShieldCheck,
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
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
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

  const filteredSources = sources.filter((s) => {
    if (selectedFilter === 'all') return true;
    return (s.platform || 'instagram') === selectedFilter;
  });

  const totalReelsCollected = sources.reduce((acc, s) => acc + (s.reels_count || 0), 0);

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
        {syncNotice && (
          <div
            role="status"
            className={`fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-lg p-3.5 rounded-xl border backdrop-blur-md flex items-start gap-2.5 text-xs shadow-2xl ${
              syncNotice.type === "error"
                ? "bg-red-500/15 border-red-500/30 text-red-200"
                : "bg-emerald-500/15 border-emerald-500/30 text-emerald-100"
            }`}
          >
            {syncNotice.type === "error" ? (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
            )}
            <p className="flex-1 leading-relaxed">{syncNotice.text}</p>
            <button type="button" aria-label="Fechar aviso" onClick={() => setSyncNotice(null)} className="opacity-70 hover:opacity-100">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
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
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
              <Users className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white tracking-tight">Fontes de Vídeo</h2>
              <p className="text-[11px] text-slate-400 hidden sm:block">Perfis monitorados para scraping automático de conteúdo</p>
            </div>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="btn btn-primary btn-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar Fonte</span>
          </button>
        </div>

        <div className="p-5 lg:p-7 max-w-6xl mx-auto w-full space-y-6">
          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] backdrop-blur-md">
              <p className="text-xs text-slate-400 font-medium mb-1">Perfis Monitorados</p>
              <p className="text-2xl font-extrabold text-white">{sources.length}</p>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] backdrop-blur-md">
              <p className="text-xs text-slate-400 font-medium mb-1">Fontes Ativas</p>
              <p className="text-2xl font-extrabold text-emerald-400">
                {sources.filter(s => s.is_active).length}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] backdrop-blur-md">
              <p className="text-xs text-slate-400 font-medium mb-1">Total Coletados</p>
              <p className="text-2xl font-extrabold text-purple-400">{totalReelsCollected}</p>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] backdrop-blur-md">
              <p className="text-xs text-slate-400 font-medium mb-1">Redes Suportadas</p>
              <div className="flex items-center gap-2 mt-1">
                <Instagram className="w-4 h-4 text-[#e1306c]" />
                <TikTok className="w-4 h-4 text-[#00f2fe]" />
                <YouTube className="w-4 h-4 text-[#ff0000]" />
                <Facebook className="w-4 h-4 text-[#1877f2]" />
              </div>
            </div>
          </div>

          {/* Add Source Drawer / Form */}
          <AnimatePresence>
            {showAdd && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="p-5 rounded-2xl bg-white/[0.03] border border-purple-500/30 shadow-[0_10px_30px_rgba(139,92,246,0.15)] relative">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                      <h3 className="text-sm font-bold text-white">Cadastrar Nova Fonte de Conteúdo</h3>
                    </div>
                    <button
                      onClick={() => {
                        setShowAdd(false);
                        setAddError("");
                      }}
                      className="p-1 rounded-lg text-slate-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <form onSubmit={handleAdd} className="space-y-4">
                    {/* Platform Selector Buttons */}
                    <div>
                      <label className="label mb-2">Selecione a Plataforma</label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                          { id: 'instagram', label: 'Instagram', icon: <Instagram className="w-4 h-4 text-[#e1306c]" />, color: '#e1306c' },
                          { id: 'tiktok', label: 'TikTok', icon: <TikTok className="w-4 h-4 text-[#00f2fe]" />, color: '#00f2fe' },
                          { id: 'youtube', label: 'YouTube Shorts', icon: <YouTube className="w-4 h-4 text-[#ff0000]" />, color: '#ff0000' },
                          { id: 'facebook', label: 'Facebook', icon: <Facebook className="w-4 h-4 text-[#1877f2]" />, color: '#1877f2' },
                        ].map((p) => {
                          const active = platform === p.id;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setPlatform(p.id as any)}
                              className={`p-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all ${
                                active
                                  ? "bg-purple-600/20 border-purple-500 text-white shadow-sm"
                                  : "bg-white/[0.02] border-white/[0.08] text-slate-400 hover:text-white hover:bg-white/[0.05]"
                              }`}
                            >
                              {p.icon}
                              <span>{p.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Username Input */}
                    <div>
                      <label className="label">
                        {platform === 'instagram' && "Username / @ do Perfil no Instagram"}
                        {platform === 'tiktok' && "Username do TikTok (sem @)"}
                        {platform === 'facebook' && "Slug / Nome de Usuário da Página do Facebook"}
                        {platform === 'youtube' && "Identificador / Canal do YouTube (sem @)"}
                      </label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                            <AtSign className="w-4 h-4 text-slate-500" />
                          </div>
                          <input
                            type="text"
                            value={newUsername}
                            onChange={(e) => setNewUsername(e.target.value)}
                            placeholder={
                              platform === 'instagram' ? "ex: criador_digital" :
                              platform === 'tiktok' ? "ex: criador.tiktok" :
                              platform === 'facebook' ? "ex: pagina.oficial" :
                              "ex: canal_shorts"
                            }
                            className="input input-with-icon text-white placeholder-slate-500"
                            autoFocus
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={!newUsername.trim() || adding}
                          className="btn btn-primary px-5"
                        >
                          {adding ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Plus className="w-4 h-4" />
                          )}
                          <span>Salvar Fonte</span>
                        </button>
                      </div>
                      {addError && (
                        <p className="text-xs mt-2 flex items-center gap-1.5 text-red-400">
                          <AlertCircle className="w-3.5 h-3.5" />
                          {addError}
                        </p>
                      )}
                    </div>
                  </form>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Filter Tabs & Header */}
          <div className="flex items-center justify-between flex-wrap gap-3 pb-1 border-b border-white/[0.06]">
            <div className="flex items-center gap-1 overflow-x-auto py-1">
              {[
                { id: 'all', label: 'Todas as Fontes', count: sources.length },
                { id: 'instagram', label: 'Instagram', count: sources.filter(s => (s.platform || 'instagram') === 'instagram').length },
                { id: 'tiktok', label: 'TikTok', count: sources.filter(s => s.platform === 'tiktok').length },
                { id: 'youtube', label: 'YouTube', count: sources.filter(s => s.platform === 'youtube').length },
                { id: 'facebook', label: 'Facebook', count: sources.filter(s => s.platform === 'facebook').length },
              ].map((tab) => {
                const active = selectedFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setSelectedFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                      active
                        ? "bg-white/[0.08] text-white border border-white/10"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/[0.06] text-slate-400">
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={fetchSources}
              className="btn btn-secondary btn-sm"
              title="Atualizar lista"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="text-xs">Atualizar</span>
            </button>
          </div>

          {/* Sources List */}
          {loading ? (
            <div className="flex flex-col items-center py-20">
              <Loader2 className="w-8 h-8 animate-spin mb-3 text-purple-400" />
              <p className="text-xs text-slate-400">Carregando fontes cadastradas...</p>
            </div>
          ) : filteredSources.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center py-20 text-center rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.01] p-8"
            >
              <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4">
                <Users className="w-8 h-8 text-purple-400" />
              </div>
              <h3 className="text-base font-bold text-white mb-1.5">Nenhuma fonte encontrada</h3>
              <p className="text-xs max-w-sm mb-5 text-slate-400 leading-relaxed">
                Adicione perfis do Instagram, TikTok, Facebook ou canais do YouTube para que o sistema monitore e publique automaticamente.
              </p>
              <button onClick={() => setShowAdd(true)} className="btn btn-primary text-xs py-2 px-4 rounded-xl">
                <Plus className="w-4 h-4" />
                Cadastrar Primeira Fonte
              </button>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <AnimatePresence>
                {filteredSources.map((source, i) => {
                  const plat = source.platform || 'instagram';
                  let icon = <Instagram className="w-4 h-4 text-[#e1306c]" />;
                  let platBorder = "rgba(225, 48, 108, 0.3)";
                  let platBg = "rgba(225, 48, 108, 0.12)";

                  if (plat === 'tiktok') {
                    icon = <TikTok className="w-4 h-4 text-[#00f2fe]" />;
                    platBorder = "rgba(0, 242, 254, 0.3)";
                    platBg = "rgba(0, 242, 254, 0.12)";
                  } else if (plat === 'youtube') {
                    icon = <YouTube className="w-4 h-4 text-[#ff0000]" />;
                    platBorder = "rgba(255, 0, 0, 0.3)";
                    platBg = "rgba(255, 0, 0, 0.12)";
                  } else if (plat === 'facebook') {
                    icon = <Facebook className="w-4 h-4 text-[#1877f2]" />;
                    platBorder = "rgba(24, 119, 242, 0.3)";
                    platBg = "rgba(24, 119, 242, 0.12)";
                  }

                  return (
                    <motion.div
                      key={source.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: i * 0.04 }}
                      className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] hover:border-purple-500/30 transition-all flex items-center justify-between gap-4 group"
                    >
                      {/* Left: Avatar and Info */}
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 border relative"
                          style={{
                            background: platBg,
                            borderColor: platBorder,
                          }}
                        >
                          {icon}
                          {source.is_active && (
                            <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-[#09090d]" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-white truncate">
                              @{source.username}
                            </p>
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full uppercase bg-white/[0.05] text-slate-400 border border-white/[0.06]">
                              {plat}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                            <span className="font-semibold text-purple-300">
                              {source.reels_count || 0} coletados
                            </span>
                            {source.last_checked_at && (
                              <span className="hidden sm:flex items-center gap-1 text-[11px] text-slate-500">
                                <Clock className="w-3 h-3" />
                                {new Date(source.last_checked_at).toLocaleDateString("pt-BR", { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {source.username !== "manual" && (
                          <button
                            onClick={() => handleSync(source.id)}
                            disabled={syncingId !== null || deletingId !== null}
                            className="btn btn-secondary btn-sm text-xs py-1.5 px-3 flex items-center gap-1.5"
                            title="Sincronizar e buscar novos vídeos deste perfil"
                          >
                            {syncingId === source.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                            ) : (
                              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                            )}
                            <span className="hidden sm:inline">Sincronizar</span>
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (confirm(`Remover fonte @${source.username}?`)) {
                              handleDelete(source.id);
                            }
                          }}
                          disabled={deletingId === source.id || syncingId !== null}
                          className="btn btn-sm bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-2.5 py-1.5"
                          title="Remover Fonte"
                        >
                          {deletingId === source.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
