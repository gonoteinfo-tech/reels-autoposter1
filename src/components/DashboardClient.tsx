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
} from "lucide-react";
import { Instagram, Facebook } from "@/components/icons";

import Sidebar from "@/components/Sidebar";
import StatCard from "@/components/StatCard";
import ReelCard from "@/components/ReelCard";
import AddReelModal from "@/components/AddReelModal";
import type { Reel, DashboardStats, SchedulerStatus, ReelStage, User } from "@/types";

const STAGE_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "discovered", label: "Descobertos" },
  { value: "downloading", label: "Baixando" },
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
      {/* Ambient background */}
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
            <h2 className="text-lg font-bold text-heading">Dashboard</h2>
            {schedulerStatus && (
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    schedulerStatus.scheduler_active ? "animate-pulse" : ""
                  }`}
                  style={{
                    background: schedulerStatus.scheduler_active
                      ? "var(--success)"
                      : "var(--text-muted)",
                  }}
                />
                <span
                  className="text-xs font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  Scheduler {schedulerStatus.scheduler_active ? "ativo" : "inativo"}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRunNow}
              disabled={triggeringRun}
              className="btn btn-secondary btn-sm"
            >
              {triggeringRun ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Rodar Agora
            </button>
            <button
              onClick={handleReprocessAllFailed}
              disabled={reprocessingAll}
              className="btn btn-secondary btn-sm"
              title="Reprocessa todos os reels que falharam"
            >
              {reprocessingAll ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Reprocessar Falhas
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="btn btn-primary btn-sm"
            >
              <Plus className="w-4 h-4" />
              Adicionar Reel
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Upgrade Banner */}
          {user.plan === "free" && stats && stats.published_total >= 1 && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-5 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 relative overflow-hidden"
              style={{
                background: "linear-gradient(135deg, var(--brand-purple), var(--brand-orange))",
                border: "1px solid rgba(124, 58, 237, 0.35)",
                boxShadow: "0 10px 30px rgba(124, 58, 237, 0.25)",
              }}
            >
              <div className="flex items-start gap-4 z-10">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    background: "linear-gradient(135deg, var(--brand-pink), var(--brand-purple))",
                    boxShadow: "0 0 15px rgba(232, 65, 127, 0.25)",
                  }}
                >
                  <Zap className="w-5 h-5 text-white animate-pulse" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-extrabold text-white text-sm md:text-base flex items-center gap-2">
                    Limite do Plano Gratuito Atingido
                    <span className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30">
                      Limite: 1 Reel
                    </span>
                  </h4>
                  <p className="text-xs text-white/90 max-w-2xl leading-relaxed">
                    Você já atingiu o limite do seu plano gratuito de **1 publicação**.
                    As próximas postagens automáticas e manuais estão suspensas até que você atualize seu plano.
                  </p>
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-3 z-10 w-full md:w-auto justify-end">
                <a
                  href="/#pricing"
                  className="btn btn-primary btn-sm whitespace-nowrap text-xs font-bold px-4 py-2 rounded-lg transition-all flex items-center gap-1.5 text-white"
                  style={{
                    background: "linear-gradient(135deg, var(--brand-purple), var(--brand-pink))",
                    border: "none",
                  }}
                >
                  <Zap className="w-3.5 h-3.5" />
                  Upgrade para PRO
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
              color="var(--instagram)"
              gradient="linear-gradient(90deg, var(--instagram), var(--brand-orange))"
            />
            <StatCard
              label="Total Publicados"
              value={stats?.published_total || 0}
              icon={<CheckCircle2 className="w-5 h-5" />}
              color="var(--success)"
              gradient="linear-gradient(90deg, var(--success), #10b981)"
            />
            <StatCard
              label="Na Fila"
              value={stats?.pipeline_queue || 0}
              icon={<Clock className="w-5 h-5" />}
              color="var(--warning)"
              gradient="linear-gradient(90deg, var(--warning), var(--brand-orange))"
            />
            <StatCard
              label="Erros Hoje"
              value={stats?.errors_today || 0}
              icon={<AlertTriangle className="w-5 h-5" />}
              color="var(--danger)"
              gradient="linear-gradient(90deg, var(--danger), #dc2626)"
            />
          </div>

          {/* Filter Bar */}
          <div
            className="flex flex-wrap items-center gap-3 p-4 rounded-xl"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--surface-border)",
            }}
          >
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                style={{ color: "var(--text-muted)" }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por legenda ou username..."
                className="input input-with-icon"
                style={{ background: "var(--surface-2)" }}
              />
            </div>

            {/* Stage filters */}
            <div className="flex items-center gap-1">
              <Filter className="w-4 h-4 mr-1" style={{ color: "var(--text-muted)" }} />
              {STAGE_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setStageFilter(f.value)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background:
                      stageFilter === f.value
                        ? "var(--brand-gradient-subtle)"
                        : "transparent",
                    color:
                      stageFilter === f.value
                        ? "var(--text-primary)"
                        : "var(--text-muted)",
                    border:
                      stageFilter === f.value
                        ? "1px solid rgba(124,58,237,0.3)"
                        : "1px solid transparent",
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Refresh */}
            <button
              onClick={fetchData}
              className="btn btn-secondary btn-sm"
              title="Atualizar"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Reels Grid */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2
                className="w-8 h-8 animate-spin mb-3"
                style={{ color: "var(--brand-purple)" }}
              />
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Carregando...
              </p>
            </div>
          ) : filteredReels.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-20 text-center"
            >
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
              >
                <div
                  className="w-20 h-20 rounded-2xl flex items-center justify-center mb-5"
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--surface-border)",
                  }}
                >
                  <Zap
                    className="w-10 h-10"
                    style={{ color: "var(--text-muted)" }}
                  />
                </div>
              </motion.div>
              <h3 className="text-lg font-bold text-heading mb-2">
                Nenhum Reel encontrado
              </h3>
              <p
                className="text-sm max-w-sm mb-4"
                style={{ color: "var(--text-muted)" }}
              >
                Adicione perfis de origem na aba{" "}
                <strong>Fontes</strong> ou adicione Reels manualmente.
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="btn btn-primary"
              >
                <Plus className="w-4 h-4" />
                Adicionar Reel
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

          {/* Footer stats */}
          <div
            className="flex items-center justify-between text-xs p-3 rounded-lg"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--surface-border)",
              color: "var(--text-muted)",
            }}
          >
            <span>
              {filteredReels.length} reel{filteredReels.length !== 1 ? "s" : ""} exibido{filteredReels.length !== 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--success)" }} />
                {stats?.active_sources || 0} fontes ativas
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Atualização a cada 30 min
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
