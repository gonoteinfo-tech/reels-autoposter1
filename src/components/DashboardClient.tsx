"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus, RefreshCw, Loader2, Search, Clock } from "lucide-react";

import AppShell, { PageHeader } from "@/components/AppShell";
import StatCard from "@/components/StatCard";
import ReelCard from "@/components/ReelCard";
import AddReelModal from "@/components/AddReelModal";
import { clockTime, timeAgo, timeUntil } from "@/components/time";
import type { Reel, DashboardStats, SchedulerStatus, User } from "@/types";

const STAGE_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "discovered", label: "Na fila" },
  { value: "processing", label: "Processando" },
  { value: "uploaded", label: "Prontos" },
  { value: "published", label: "Publicados" },
  { value: "error", label: "Erros" },
];

/** Etapas mostradas na faixa do pipeline e os estágios que cada uma agrupa */
const PIPELINE_STEPS: {
  label: string;
  stages: Reel["stage"][];
  final?: boolean;
}[] = [
  { label: "Descoberta", stages: ["discovered"] },
  { label: "Download", stages: ["downloading", "downloaded"] },
  { label: "Marca d'água", stages: ["processing", "processed"] },
  { label: "Upload", stages: ["uploading", "uploaded"] },
  { label: "Publicação", stages: ["publishing"], final: true },
];

export default function DashboardClient({ user }: { user: User }) {
  const [reels, setReels] = useState<Reel[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [schedulerStatus, setSchedulerStatus] =
    useState<SchedulerStatus | null>(null);
  const [stageFilter, setStageFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [triggeringRun, setTriggeringRun] = useState(false);
  const [reprocessingAll, setReprocessingAll] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const sendCommand = async (url: string, body: object) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || !data.success)
      throw new Error(data.error || "Não foi possível registrar a tarefa.");
    setNotice(data.message || "Tarefa registrada.");
  };

  const fetchData = useCallback(async () => {
    try {
      const [reelsRes, statsRes, schedulerRes] = await Promise.allSettled([
        fetch(
          `/api/reels?limit=50${stageFilter !== "all" ? `&stage=${stageFilter}` : ""}`,
        ),
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
      // erros de rede: a próxima atualização tenta de novo
    } finally {
      setLoading(false);
    }
  }, [stageFilter]);

  useEffect(() => {
    queueMicrotask(fetchData);
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleReview = async (jobId: string, published: boolean) => {
    const postId = published
      ? window.prompt("Informe o ID do post que você confirmou na plataforma:")
      : undefined;
    if (published && !postId) return;
    if (
      !published &&
      !window.confirm(
        "Confirme que não houve publicação nem coleta em andamento no provedor. Esta ação autoriza uma nova tentativa, que pode consumir créditos.",
      )
    )
      return;
    try {
      await sendCommand("/api/pipeline/jobs", {
        jobId,
        action: published ? "confirm-published" : "confirm-not-published",
        postId,
      });
      fetchData();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Não foi possível registrar a revisão.",
      );
    }
  };

  const handleRunNow = async () => {
    setTriggeringRun(true);
    try {
      await sendCommand("/api/scheduler", { action: "run-now" });
      setTimeout(fetchData, 2000);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Erro de conexão.");
    } finally {
      setTriggeringRun(false);
    }
  };

  const handlePublish = async (reelId: number) => {
    try {
      await sendCommand("/api/publish", {
        reelId,
        targets: ["instagram", "facebook"],
      });
      setTimeout(fetchData, 2000);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Erro de conexão.");
    }
  };

  const handleReprocess = async (reelId: number) => {
    try {
      await sendCommand("/api/reels/reprocess", { reelId });
      setTimeout(fetchData, 1000);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Erro ao reprocessar.",
      );
    }
  };

  const handleReprocessAllFailed = async () => {
    setReprocessingAll(true);
    try {
      await sendCommand("/api/reels/reprocess", { allFailed: true });
      setTimeout(fetchData, 1500);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Erro ao reprocessar.",
      );
    } finally {
      setReprocessingAll(false);
    }
  };

  const handleDelete = async (reelId: number) => {
    try {
      setReels((prev) => prev.filter((r) => r.id !== reelId));
      const res = await fetch(`/api/reels?id=${reelId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao excluir Reel.");
      fetchData();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Erro ao excluir Reel.",
      );
      fetchData();
    }
  };

  const filteredReels = reels.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.caption?.toLowerCase().includes(q) ||
      r.source_username?.toLowerCase().includes(q) ||
      r.original_caption?.toLowerCase().includes(q)
    );
  });

  const recentPublished = reels
    .filter((r) => r.stage === "published" && r.published_at)
    .sort((a, b) => (b.published_at || "").localeCompare(a.published_at || ""))
    .slice(0, 5);

  const nextInQueue =
    reels.find((r) => r.stage === "uploaded") ||
    reels.find((r) => r.stage === "discovered");
  const errorsToday = stats?.errors_today || 0;

  const today = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const statusPill = schedulerStatus?.is_running
    ? `Rodando agora${schedulerStatus.current_task ? ` · ${schedulerStatus.current_task}` : ""}`
    : schedulerStatus?.scheduler_active
      ? `Automação ativa${schedulerStatus.next_run_at ? ` · próximo ciclo ${timeUntil(schedulerStatus.next_run_at)}` : ""}`
      : schedulerStatus?.worker_online
        ? "Automação pausada"
        : "Worker offline";

  return (
    <AppShell user={user}>
      <PageHeader
        title="Painel"
        subtitle={
          <span
            suppressHydrationWarning
            className="first-letter:uppercase inline-block"
          >
            {today}
          </span>
        }
        actions={
          <>
            {schedulerStatus && (
              <span className="hidden xl:inline-flex h-10 items-center gap-2 px-3.5 rounded-full border border-line bg-surface text-ink-2">
                <span
                  className={`dot ${schedulerStatus.scheduler_active || schedulerStatus.is_running ? "bg-ok" : "bg-faint"}`}
                />
                <span suppressHydrationWarning>{statusPill}</span>
              </span>
            )}
            {errorsToday > 0 && (
              <button
                type="button"
                onClick={handleReprocessAllFailed}
                disabled={reprocessingAll}
                className="btn btn-secondary"
                aria-label="Reprocessar falhas"
              >
                {reprocessingAll ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <RefreshCw />
                )}
                <span className="hidden sm:inline">Reprocessar falhas</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="btn btn-secondary"
              aria-label="Adicionar reel"
            >
              <Plus />
              <span className="hidden sm:inline">Adicionar reel</span>
            </button>
            <button
              type="button"
              onClick={handleRunNow}
              disabled={triggeringRun}
              className="btn btn-primary"
            >
              {triggeringRun ? (
                <Loader2 className="animate-spin" />
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <polygon points="7 4 20 12 7 20 7 4" />
                </svg>
              )}
              Rodar agora
            </button>
          </>
        }
      />

      {notice && (
        <div role="status" className="card p-4 text-sm">
          {notice}
        </div>
      )}
      {schedulerStatus && !schedulerStatus.worker_online && (
        <div role="alert" className="card p-4 border-accent/40">
          A automação está offline. As tarefas ficam salvas até o serviço ser
          iniciado na VPS.
        </div>
      )}
      {schedulerStatus?.schedule_error && (
        <div role="alert" className="card p-4">
          {schedulerStatus.schedule_error}
        </div>
      )}
      {!!schedulerStatus?.jobs?.filter((j) =>
        ["blocked", "needs_review", "failed", "retry_wait", "running"].includes(
          j.status,
        ),
      ).length && (
        <section
          className="card p-4 space-y-3"
          aria-label="Atividade da automação"
        >
          <h2 className="font-semibold">Atividade da automação</h2>
          {schedulerStatus.jobs
            .filter((j) =>
              [
                "blocked",
                "needs_review",
                "failed",
                "retry_wait",
                "running",
              ].includes(j.status),
            )
            .slice(0, 10)
            .map((j) => (
              <div key={j.id} className="border-t border-line pt-2 text-sm">
                <span className="font-medium">
                  {{
                    discover: "Coleta",
                    collect: "Resultado da coleta",
                    prepare: "Preparação",
                    publish: "Publicação",
                  }[j.kind] || j.kind}{" "}
                  #{j.ref_id}
                  {j.target ? ` · ${j.target}` : ""}
                </span>
                <span className="text-muted">
                  {" "}
                  ·{" "}
                  {{
                    blocked: "Ação necessária",
                    needs_review: "Revisão necessária",
                    failed: "Falhou",
                    retry_wait: "Aguardando nova tentativa",
                    running: "Executando",
                  }[j.status] || j.status}{" "}
                  · {j.attempts} tentativa(s)
                </span>
                {j.error_message && (
                  <p className="mt-1 text-muted">{j.error_message}</p>
                )}
                {j.status === "needs_review" && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="text-muted w-full">
                      Confira o resultado no provedor antes de autorizar outra
                      tentativa.
                    </span>
                    {j.kind === "publish" && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleReview(j.id, true)}
                      >
                        Confirmar post existente
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleReview(j.id, false)}
                    >
                      Confirmei que não houve envio
                    </button>
                  </div>
                )}
              </div>
            ))}
        </section>
      )}

      {user.plan === "free" && stats && stats.published_total >= 1 && (
        <div className="card p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-accent/40">
          <div className="flex flex-col gap-1">
            <span className="font-semibold">
              Você usou a publicação do plano grátis
            </span>
            <span className="text-[13px] text-muted">
              Para continuar publicando no automático, com várias fontes, assine
              o plano Pro.
            </span>
          </div>
          <Link href="/#planos" className="btn btn-primary shrink-0">
            Conhecer o Pro
          </Link>
        </div>
      )}

      <section
        aria-label="Resumo do dia"
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <StatCard
          label="Publicados hoje"
          value={stats?.published_today ?? 0}
          caption={`${stats?.published_total ?? 0} no total`}
        />
        <StatCard
          label="Na fila"
          value={stats?.pipeline_queue ?? 0}
          caption="Aguardando processamento ou publicação"
        />
        <StatCard
          label="Erros hoje"
          value={errorsToday}
          tone="error"
          caption={
            errorsToday > 0 ? (
              <button
                type="button"
                className="py-2.5 -my-2.5 px-0 border-0 bg-transparent text-err-ink cursor-pointer text-xs underline-offset-2 hover:underline"
                onClick={() => setStageFilter("error")}
              >
                Ver na fila
              </button>
            ) : (
              "Nenhum erro"
            )
          }
        />
        <StatCard
          label="Fontes ativas"
          value={stats?.active_sources ?? 0}
          caption={`de ${stats?.total_sources ?? 0} cadastradas`}
        />
      </section>

      <section
        aria-label="Etapas do pipeline"
        className="card px-6 py-5 flex flex-col gap-4"
      >
        <div className="flex items-baseline justify-between">
          <h2 className="section-title">Pipeline agora</h2>
          <span className="text-xs text-faint">Reels em cada etapa</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {PIPELINE_STEPS.map((step) => {
            const count = reels.filter((r) =>
              step.stages.includes(r.stage),
            ).length;
            return (
              <div key={step.label} className="flex flex-col gap-2.5">
                <div
                  className={`h-1 rounded ${count > 0 ? (step.final ? "bg-accent" : "bg-info") : "bg-line-strong"}`}
                />
                <div className="flex justify-between gap-2">
                  <span className="text-ink-2">{step.label}</span>
                  <span
                    className={`font-mono tabular ${count > 0 ? "" : "text-faint"}`}
                  >
                    {count}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex flex-col xl:flex-row gap-4 items-start">
        <section
          id="fila"
          aria-label="Fila de reels"
          className="card w-full xl:flex-[2] min-w-0 flex flex-col"
        >
          <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-line">
            <h2 className="section-title">Fila de reels</h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar legenda ou @perfil"
                  aria-label="Buscar na fila"
                  className="input h-10 pl-9 w-60"
                />
              </div>
              <button
                type="button"
                onClick={fetchData}
                className="btn btn-icon"
                aria-label="Atualizar lista"
                title="Atualizar lista"
              >
                <RefreshCw />
              </button>
            </div>
          </div>

          <div className="px-5 py-3 border-b border-line overflow-x-auto">
            <div
              className="segmented"
              role="group"
              aria-label="Filtrar por etapa"
            >
              {STAGE_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={stageFilter === f.value}
                  onClick={() => setStageFilter(f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="hidden md:grid grid-cols-[minmax(0,1fr)_128px_84px_auto] gap-x-4 px-5 py-2.5 text-xs text-faint border-b border-line">
            <span>Reel</span>
            <span>Etapa</span>
            <span>Quando</span>
            <span className="text-right">Ações</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-3 py-16 text-muted">
              <Loader2 className="w-5 h-5 animate-spin" />
              Carregando a fila...
            </div>
          ) : filteredReels.length === 0 ? (
            <div className="flex flex-col items-center text-center gap-3 px-6 py-16">
              <span className="font-semibold">Nenhum reel por aqui</span>
              <span className="text-[13px] text-muted max-w-sm">
                Cadastre perfis em{" "}
                <strong className="text-ink-2">Fontes</strong> para a coleta
                automática ou adicione um link manualmente.
              </span>
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="btn btn-primary mt-2"
              >
                <Plus />
                Adicionar reel
              </button>
            </div>
          ) : (
            <ul className="m-0 p-0 list-none">
              {filteredReels.map((reel) => (
                <ReelCard
                  key={reel.id}
                  reel={reel}
                  onPublish={handlePublish}
                  onReprocess={handleReprocess}
                  onDelete={handleDelete}
                />
              ))}
            </ul>
          )}

          <div className="px-5 py-3 border-t border-line text-xs text-faint">
            Mostrando {filteredReels.length} de {reels.length} reels
          </div>
        </section>

        <div className="w-full xl:flex-1 min-w-0 flex flex-col gap-4">
          <section
            aria-label="Próximo ciclo"
            className="card p-5 flex flex-col gap-3.5"
          >
            <div className="flex items-center justify-between">
              <h2 className="section-title">Próximo ciclo</h2>
              <Clock
                className="w-[18px] h-[18px] text-muted"
                aria-hidden="true"
              />
            </div>
            <span
              className="font-mono text-[36px] leading-none tracking-tight"
              suppressHydrationWarning
            >
              {schedulerStatus?.is_running
                ? "Rodando"
                : schedulerStatus?.next_run_at
                  ? clockTime(schedulerStatus.next_run_at)
                  : "—"}
            </span>
            <span className="text-[13px] text-muted" suppressHydrationWarning>
              {schedulerStatus?.last_run_at
                ? `Último ciclo ${timeAgo(schedulerStatus.last_run_at)}`
                : "Nenhum ciclo rodou ainda"}
            </span>
            {nextInQueue && (
              <div className="inset p-3.5 flex flex-col gap-1">
                <span className="text-xs text-faint">Próximo da fila</span>
                <span className="text-ink-2 line-clamp-2">
                  {nextInQueue.caption ||
                    nextInQueue.original_caption ||
                    `Reel de @${nextInQueue.source_username}`}
                </span>
              </div>
            )}
          </section>

          <section
            aria-label="Últimas publicações"
            className="card p-5 flex flex-col gap-3.5"
          >
            <h2 className="section-title">Últimas publicações</h2>
            {recentPublished.length === 0 ? (
              <span className="text-[13px] text-muted">
                Nenhuma publicação entre os reels carregados.
              </span>
            ) : (
              <ul className="m-0 p-0 list-none flex flex-col gap-3.5">
                {recentPublished.map((r) => (
                  <li key={r.id} className="flex gap-3">
                    <span
                      className="font-mono text-xs text-faint pt-0.5 shrink-0"
                      suppressHydrationWarning
                    >
                      {clockTime(r.published_at)}
                    </span>
                    <span className="text-ink-2 leading-snug min-w-0">
                      <span className="line-clamp-2">
                        {r.caption || r.original_caption || "Sem legenda"}
                      </span>
                      <span className="text-xs text-faint">
                        @{r.source_username}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <AddReelModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdded={fetchData}
      />
    </AppShell>
  );
}
