"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  RefreshCw,
  Zap,
  AlertTriangle,
  Play,
  Clock,
  Loader2,
  CheckCircle2,
  Filter,
  Search,
  Menu,
  Layers,
  Sparkles,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import { Instagram, Facebook } from "@/components/icons";

import Sidebar from "@/components/Sidebar";
import StatCard from "@/components/StatCard";
import ReelCard from "@/components/ReelCard";
import AddReelModal from "@/components/AddReelModal";
import type { Reel, DashboardStats, SchedulerStatus, User } from "@/types";

const STAGE_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "discovered", label: "Descobertos" },
  { value: "processing", label: "Processando" },
  { value: "uploaded", label: "Prontos" },
  { value: "published", label: "Publicados" },
  { value: "error", label: "Erros" },
];

export default function DashboardClient({ user }: { user: User }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [reels, setReels] = useState<Reel[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [stageFilter, setStageFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [triggeringRun, setTriggeringRun] = useState(false);
  const [reprocessingAll, setReprocessingAll] = useState(false);

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const [reelsRes, statsRes, schedulerRes] = await Promise.allSettled([
        fetch(`/api/reels?limit=50${stageFilter !== "all" ? `&stage=${stageFilter}` : ""}`),
        fetch("/api/stats"),
        fetch("/api/scheduler"),
      ]);

      if (reelsRes.status === "fulfilled" && reelsRes.value.ok) {
        const data = await reelsRes.value.json();
        if (data.success) setReels(data.data?.reels || []);
      }

      if (statsRes.status === "fulfilled" && statsRes.value.ok) {
        const data = await statsRes.value.json();
        if (data.success) setStats(data.data);
      }

      if (schedulerRes.status === "fulfilled" && schedulerRes.value.ok) {
        const data = await schedulerRes.value.json();
        if (data.success) setSchedulerStatus(data.data);
      }
    } catch {
      // ignore network errors
    } finally {
      setLoading(false);
    }
  }, [stageFilter]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Actions
  const handleRunNow = async () => {
    setTriggeringRun(true);
    try {
      await fetch("/api/scheduler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run-now" }),
      });
      setTimeout(fetchData, 2000);
    } catch {
      // ignore
    } finally {
      setTriggeringRun(false);
    }
  };

  const handlePublish = async (reelId: number) => {
    try {
      await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reelId, targets: ["instagram", "facebook"] }),
      });
      setTimeout(fetchData, 2000);
    } catch {
      // ignore
    }
  };

  const handleReprocess = async (reelId: number) => {
    try {
      setReels((prev) =>
        prev.map((r) =>
          r.id === reelId ? { ...r, stage: "discovered" as const, error_message: null } : r
        )
      );

      await fetch("/api/reels/reprocess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reelId }),
      });
      setTimeout(fetchData, 1000);
    } catch (error) {
      console.error("Erro ao reprocessar:", error);
    }
  };

  const handleReprocessAllFailed = async () => {
    setReprocessingAll(true);
    try {
      setReels((prev) =>
        prev.map((r) =>
          r.stage === "error" ? { ...r, stage: "discovered" as const, error_message: null } : r
        )
      );

      await fetch("/api/reels/reprocess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allFailed: true }),
      });
      setTimeout(fetchData, 1500);
    } catch (error) {
      console.error("Erro ao reprocessar todos:", error);
    } finally {
      setReprocessingAll(false);
    }
  };

  const handleDelete = async (reelId: number) => {
    try {
      setReels((prev) => prev.filter((r) => r.id !== reelId));

      await fetch(`/api/reels?id=${reelId}`, {
        method: "DELETE",
      });
      fetchData();
    } catch (error) {
      console.error("Erro ao excluir reel:", error);
    }
  };

  // Filter reels
  const filteredReels = reels.filter((r) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        r.caption?.toLowerCase().includes(q) ||
        r.source_username?.toLowerCase().includes(q) ||
        r.original_caption?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="app-layout">
      {/* Ambient background glow */}
      <div className="ambient-bg" />

      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        user={user}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Main Area */}
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
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-white tracking-tight">Painel de Controle</h2>
                {schedulerStatus && (
                  <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Ativo
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Gerencie pipeline de coleta, edição e publicação automática
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRunNow}
              disabled={triggeringRun}
              className="btn btn-secondary btn-sm"
              title="Disparar ciclo de descoberta e postagem agora"
            >
              {triggeringRun ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
              ) : (
                <Play className="w-3.5 h-3.5 text-purple-400" />
              )}
              <span className="hidden sm:inline">Executar Agora</span>
            </button>
            <button
              onClick={handleReprocessAllFailed}
              disabled={reprocessingAll}
              className="btn btn-secondary btn-sm"
              title="Reprocessa todos os reels com falha"
            >
              {reprocessingAll ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span className="hidden md:inline">Reprocessar Falhas</span>
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="btn btn-primary btn-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar Reel</span>
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="p-5 lg:p-7 space-y-6 max-w-7xl mx-auto w-full">
          {/* Upgrade Banner for Free Plan */}
          {user.plan === "free" && stats && stats.published_total >= 1 && (
            <motion.div
              initial={{ opacity: 0, y: -15 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-5 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 relative overflow-hidden bg-gradient-to-r from-purple-900/60 via-pink-900/50 to-orange-900/60 border border-purple-500/30 shadow-[0_10px_35px_rgba(139,92,246,0.2)]"
            >
              <div className="flex items-start gap-4 z-10">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br from-purple-500 to-pink-500 shadow-md shadow-purple-500/30">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-extrabold text-white text-sm md:text-base flex items-center gap-2">
                    Limite do Plano Gratuito Atingido
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30">
                      1 / 1 Publicação
                    </span>
                  </h4>
                  <p className="text-xs text-slate-200 max-w-2xl leading-relaxed">
                    Você utilizou a postagem gratuita de teste. Para continuar postando automaticamente sem limites, ter múltiplas fontes e suporte prioritário, faça o upgrade para o plano PRO.
                  </p>
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-3 z-10 w-full md:w-auto justify-end">
                <a
                  href="/#pricing"
                  className="btn btn-primary btn-sm whitespace-nowrap text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-1.5"
                >
                  <Zap className="w-3.5 h-3.5 fill-white" />
                  Fazer Upgrade para PRO
                </a>
              </div>
            </motion.div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Reels Hoje"
              value={stats?.published_today || 0}
              icon={<Instagram className="w-5 h-5" />}
              color="#e1306c"
              gradient="linear-gradient(90deg, #e1306c, #f97316)"
              trend={{ value: 12, label: "vs ontem" }}
            />
            <StatCard
              label="Total Publicados"
              value={stats?.published_total || 0}
              icon={<CheckCircle2 className="w-5 h-5" />}
              color="#10b981"
              gradient="linear-gradient(90deg, #10b981, #06b6d4)"
              trend={{ value: 24, label: "este mês" }}
            />
            <StatCard
              label="Na Fila"
              value={stats?.pipeline_queue || 0}
              icon={<Clock className="w-5 h-5" />}
              color="#f59e0b"
              gradient="linear-gradient(90deg, #f59e0b, #ec4899)"
            />
            <StatCard
              label="Erros Hoje"
              value={stats?.errors_today || 0}
              icon={<AlertTriangle className="w-5 h-5" />}
              color="#ef4444"
              gradient="linear-gradient(90deg, #ef4444, #dc2626)"
            />
          </div>

          {/* Pipeline Stage Quick Overview Bar */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.07] flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">Status do Pipeline</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-4 text-xs font-medium text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                Descobertos: <strong className="text-white">{reels.filter(r => r.stage === 'discovered').length}</strong>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                Processando: <strong className="text-white">{reels.filter(r => ['downloading', 'processing', 'uploading'].includes(r.stage)).length}</strong>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Prontos: <strong className="text-white">{reels.filter(r => r.stage === 'uploaded').length}</strong>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-pink-500" />
                Publicados: <strong className="text-white">{reels.filter(r => r.stage === 'published').length}</strong>
              </span>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.07]">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por legenda, @perfil ou hashtags..."
                className="input input-with-icon py-2 text-sm bg-black/40 border-white/[0.08] text-white placeholder-slate-500"
              />
            </div>

            {/* Stage filter pills */}
            <div className="flex items-center gap-1 overflow-x-auto py-1 max-w-full">
              <Filter className="w-3.5 h-3.5 text-slate-500 mr-1 hidden sm:block shrink-0" />
              {STAGE_FILTERS.map((f) => {
                const count = f.value === 'all' 
                  ? reels.length 
                  : reels.filter(r => f.value === 'processing' ? ['downloading', 'processing', 'uploading'].includes(r.stage) : r.stage === f.value).length;
                const isSelected = stageFilter === f.value;

                return (
                  <button
                    key={f.value}
                    onClick={() => setStageFilter(f.value)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                      isSelected
                        ? "bg-purple-600/20 text-purple-200 border border-purple-500/40 shadow-sm"
                        : "text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent"
                    }`}
                  >
                    <span>{f.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      isSelected ? "bg-purple-500/30 text-white" : "bg-white/[0.06] text-slate-400"
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Refresh Button */}
            <button
              onClick={fetchData}
              className="btn btn-secondary btn-sm px-2.5"
              title="Atualizar lista"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-400 hover:text-white" />
            </button>
          </div>

          {/* Reels Content Grid */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4">
                <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
              </div>
              <p className="text-sm font-medium text-slate-400">
                Sincronizando pipeline de Reels...
              </p>
            </div>
          ) : filteredReels.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.01] p-8"
            >
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
              >
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/10 to-orange-500/10 border border-purple-500/20 flex items-center justify-center mb-4 shadow-inner">
                  <Sparkles className="w-8 h-8 text-purple-400" />
                </div>
              </motion.div>
              <h3 className="text-base font-bold text-white mb-1.5">
                Nenhum Reel encontrado
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mb-5 leading-relaxed">
                Adicione perfis na aba <strong>Fontes</strong> para coletar automaticamente ou adicione links de vídeos manualmente.
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="btn btn-primary text-xs py-2 px-4 rounded-xl"
              >
                <Plus className="w-4 h-4" />
                Adicionar Primeiro Reel
              </button>
            </motion.div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              <AnimatePresence>
                {filteredReels.map((reel) => (
                  <ReelCard
                    key={reel.id}
                    reel={reel}
                    onPublish={handlePublish}
                    onReprocess={handleReprocess}
                    onDelete={handleDelete}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* Footer Bar */}
          <div className="flex items-center justify-between text-xs px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-slate-400">
            <span>
              Mostrando <strong className="text-white">{filteredReels.length}</strong> de <strong className="text-white">{reels.length}</strong> reels
            </span>
            <div className="flex items-center gap-4 text-[11px]">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                {stats?.active_sources || 0} fontes ativas
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-slate-500" />
                Varredura periódica ativa
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* Add Reel Modal */}
      <AddReelModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdded={fetchData}
      />
    </div>
  );
}
