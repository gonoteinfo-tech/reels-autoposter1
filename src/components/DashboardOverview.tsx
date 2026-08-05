"use client";

import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Eye,
  Radio,
  Sparkles,
  Trophy,
} from "lucide-react";
import type { DashboardStats, PublicReel, SchedulerStatus } from "@/types";

const numberFormatter = new Intl.NumberFormat("pt-BR");
const compactFormatter = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatNumber(value: number, compact = false) {
  return (compact ? compactFormatter : numberFormatter).format(value || 0);
}

function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  helper: string;
  icon: typeof Eye;
  color: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-4 min-h-36 flex flex-col justify-between"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--surface-border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
        <span
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: `${color}16`, color }}
        >
          <Icon className="w-4 h-4" />
        </span>
      </div>
      <div>
        <p className="text-2xl font-extrabold text-heading tabular-nums">{value}</p>
        <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
          {helper}
        </p>
      </div>
    </motion.div>
  );
}

export default function DashboardOverview({
  stats,
  reels,
  schedulerStatus,
}: {
  stats: DashboardStats | null;
  reels: PublicReel[];
  schedulerStatus: SchedulerStatus | null;
}) {
  const totalViews = stats?.total_views || 0;
  const totalReels = stats?.total_reels || 0;
  const publishedTotal = stats?.published_total || 0;
  const coverage = totalReels > 0
    ? Math.round(((stats?.reels_with_view_data || 0) / totalReels) * 100)
    : 0;
  const publishedRate = totalReels > 0
    ? Math.round((publishedTotal / totalReels) * 100)
    : 0;

  const reelsWithViews = [...reels]
    .filter((reel) => reel.views_count > 0)
    .sort((a, b) => b.views_count - a.views_count);
  const topReels = reelsWithViews.slice(0, 3);
  const chartReels = reelsWithViews.slice(0, 10).reverse();
  const chartMax = Math.max(...chartReels.map((reel) => reel.views_count), 1);

  return (
    <section aria-labelledby="performance-title" className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] font-bold" style={{ color: "var(--brand-purple)" }}>
            Desempenho
          </p>
          <h2 id="performance-title" className="text-xl md:text-2xl font-extrabold text-heading mt-1">
            Visão geral do conteúdo
          </h2>
        </div>
        <span className="hidden sm:flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
          <Radio className="w-3.5 h-3.5" />
          Dados atualizados na sincronização
        </span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.55fr_1fr] gap-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl p-6 md:p-7 text-white min-h-[304px]"
          style={{
            background: "linear-gradient(135deg, #241348 0%, #5b21b6 58%, #c2410c 145%)",
            boxShadow: "0 22px 60px rgba(91, 33, 182, 0.22)",
          }}
        >
          <div className="absolute -right-16 -top-20 w-64 h-64 rounded-full bg-orange-400/20 blur-3xl" />
          <div className="absolute -left-16 -bottom-24 w-72 h-72 rounded-full bg-fuchsia-500/20 blur-3xl" />

          <div className="relative h-full flex flex-col">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-white/70 text-xs font-semibold">
                  <Eye className="w-4 h-4" />
                  Visualizações na origem
                </div>
                <p className="text-4xl md:text-5xl font-black mt-4 tracking-tight tabular-nums">
                  {formatNumber(totalViews, true)}
                </p>
                <p className="text-xs text-white/60 mt-2">
                  Soma registrada pela Apify quando os reels foram coletados.
                </p>
              </div>
              <span className="px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-[11px] font-bold backdrop-blur-sm">
                {coverage}% com dados
              </span>
            </div>

            <div className="mt-auto pt-8">
              <div className="h-24 flex items-end gap-2" aria-label="Distribuição de visualizações dos reels recentes">
                {chartReels.length > 0 ? chartReels.map((reel, index) => (
                  <motion.div
                    key={reel.id}
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max(12, (reel.views_count / chartMax) * 100)}%` }}
                    transition={{ delay: index * 0.04, duration: 0.45 }}
                    className="flex-1 min-w-2 rounded-t-lg bg-gradient-to-t from-orange-400/75 to-white/90"
                    title={`@${reel.source_username}: ${formatNumber(reel.views_count)} visualizações`}
                  />
                )) : (
                  <div className="w-full h-full rounded-2xl border border-dashed border-white/20 flex items-center justify-center text-xs text-white/55">
                    As visualizações aparecerão após a próxima sincronização.
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between mt-3 text-[10px] uppercase tracking-wider text-white/45">
                <span>Amostra recente</span>
                <span>{formatNumber(stats?.reels_with_view_data || 0)} reels medidos</span>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-2 gap-4">
          <MetricCard
            label="Publicados hoje"
            value={formatNumber(stats?.published_today || 0)}
            helper={`${formatNumber(publishedTotal)} no total`}
            icon={CheckCircle2}
            color="var(--success)"
          />
          <MetricCard
            label="Média por reel"
            value={formatNumber(stats?.average_views_per_reel || 0, true)}
            helper={`Pico de ${formatNumber(stats?.top_reel_views || 0, true)}`}
            icon={ArrowUpRight}
            color="var(--brand-purple)"
          />
          <MetricCard
            label="Fila de produção"
            value={formatNumber(stats?.pipeline_queue || 0)}
            helper="Aguardando conclusão"
            icon={Clock3}
            color="var(--warning)"
          />
          <MetricCard
            label="Erros hoje"
            value={formatNumber(stats?.errors_today || 0)}
            helper={(stats?.errors_today || 0) === 0 ? "Operação saudável" : "Requer sua atenção"}
            icon={AlertTriangle}
            color="var(--danger)"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-4">
        <div
          className="rounded-2xl p-5 md:p-6"
          style={{ background: "var(--surface)", border: "1px solid var(--surface-border)" }}
        >
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-sm font-bold text-heading">Conteúdos em destaque</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                Maiores números entre os reels recentes
              </p>
            </div>
            <Trophy className="w-5 h-5" style={{ color: "var(--brand-orange)" }} />
          </div>

          <div className="space-y-2">
            {topReels.length > 0 ? topReels.map((reel, index) => (
              <a
                key={reel.id}
                href={reel.instagram_url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 p-3 rounded-xl transition-colors hover:bg-[var(--surface-2)]"
              >
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0"
                  style={{
                    background: index === 0 ? "var(--brand-gradient)" : "var(--surface-2)",
                    color: index === 0 ? "white" : "var(--text-muted)",
                  }}
                >
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-heading truncate">@{reel.source_username}</p>
                  <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {reel.caption || reel.original_caption || "Sem legenda"}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-extrabold text-heading tabular-nums">{formatNumber(reel.views_count, true)}</p>
                  <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>visualizações</p>
                </div>
              </a>
            )) : (
              <div className="py-8 text-center">
                <Sparkles className="w-6 h-6 mx-auto mb-2" style={{ color: "var(--text-muted)" }} />
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Sincronize uma fonte para montar o ranking.
                </p>
              </div>
            )}
          </div>
        </div>

        <div
          className="rounded-2xl p-5 md:p-6 flex flex-col"
          style={{ background: "var(--surface)", border: "1px solid var(--surface-border)" }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-heading">Saúde do pipeline</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Progresso geral da biblioteca</p>
            </div>
            <Activity className="w-5 h-5" style={{ color: "var(--brand-purple)" }} />
          </div>

          <div className="my-6">
            <div className="flex items-end justify-between mb-2">
              <p className="text-3xl font-black text-heading tabular-nums">{publishedRate}%</p>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>taxa publicada</p>
            </div>
            <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${publishedRate}%` }}
                className="h-full rounded-full"
                style={{ background: "var(--accent-gradient)" }}
              />
            </div>
          </div>

          <div className="mt-auto grid grid-cols-3 gap-2">
            <div className="rounded-xl p-3 text-center" style={{ background: "var(--surface-2)" }}>
              <p className="text-lg font-extrabold text-heading">{formatNumber(totalReels)}</p>
              <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>coletados</p>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ background: "var(--success-bg)" }}>
              <p className="text-lg font-extrabold" style={{ color: "var(--success)" }}>{formatNumber(publishedTotal)}</p>
              <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>publicados</p>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ background: "var(--warning-bg)" }}>
              <p className="text-lg font-extrabold" style={{ color: "var(--warning)" }}>{formatNumber(stats?.pipeline_queue || 0)}</p>
              <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>na fila</p>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4 text-[11px]" style={{ color: "var(--text-muted)" }}>
            <span
              className={`w-2 h-2 rounded-full ${schedulerStatus?.scheduler_active ? "animate-pulse" : ""}`}
              style={{ background: schedulerStatus?.scheduler_active ? "var(--success)" : "var(--text-muted)" }}
            />
            Automação {schedulerStatus?.scheduler_active ? "ativa" : "pausada"}
          </div>
        </div>
      </div>
    </section>
  );
}
