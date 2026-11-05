"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Activity, ArrowDownToLine, ArrowRight, ArrowUpRight, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Film, Layers3, Loader2, Plus, RefreshCw, Search, Send, ShieldCheck, Sparkles, TriangleAlert, Users, X } from "lucide-react";
import AppShell from "@/components/AppShell";
import StatCard from "@/components/StatCard";
import ReelCard from "@/components/ReelCard";
import AddReelModal from "@/components/AddReelModal";
import Modal from "@/components/Modal";
import { clockTime, timeAgo } from "@/components/time";
import type { AppSettings, DashboardStats, Reel, ReelStage, SchedulerStatus, User } from "@/types";

type Target = "instagram" | "facebook";
type Job = NonNullable<SchedulerStatus["jobs"]>[number];
type Action = { kind: "publish" | "process" | "delete"; reel: Reel } | { kind: "run" | "retry-all" } | { kind: "review-published" | "review-retry"; job: Job };
type Listing = { reels: Reel[]; total: number; page: number; totalPages: number };
const FILTERS = [
  { value: "all", label: "Todos", stages: [] },
  { value: "discovered", label: "Na fila", stages: ["discovered"] },
  { value: "processing", label: "Em produção", stages: ["downloading", "downloaded", "processing", "processed", "uploading", "publishing"] },
  { value: "uploaded", label: "Prontos", stages: ["uploaded"] },
  { value: "published", label: "Publicados", stages: ["published"] },
  { value: "error", label: "Com erro", stages: ["error"] },
];
const PIPELINE = [
  { label: "Descoberta", icon: Search, stages: ["discovered"] },
  { label: "Download", icon: ArrowDownToLine, stages: ["downloading", "downloaded"] },
  { label: "Preparação", icon: Sparkles, stages: ["processing", "processed"] },
  { label: "Upload", icon: Layers3, stages: ["uploading", "uploaded"] },
  { label: "Publicação", icon: Send, stages: ["publishing"] },
];
const JOB_LABELS: Record<string, string> = { discover: "Coleta", collect: "Resultado da coleta", prepare: "Preparação", publish: "Publicação" };
const JOB_STATUSES: Record<string, string> = { queued: "Na fila", running: "Em execução", blocked: "Ação necessária", needs_review: "Revisão necessária", failed: "Falhou", retry_wait: "Nova tentativa agendada" };
const TARGET_LABELS: Record<Target, string> = { instagram: "Instagram", facebook: "Facebook" };

async function readApi<T>(url: string, init?: RequestInit): Promise<{ data: T; message?: string }> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (res.status === 401) throw new Error("Sua sessão expirou. Entre novamente para continuar.");
  const result = await res.json().catch(() => null);
  if (!res.ok || !result?.success) throw new Error(result?.error || "Não foi possível conectar ao servidor. Tente novamente.");
  return result;
}

export default function DashboardClient({ user }: { user: User }) {
  const [listing, setListing] = useState<Listing>({ reels: [], total: 0, page: 1, totalPages: 0 });
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [scheduler, setScheduler] = useState<SchedulerStatus | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [adding, setAdding] = useState(false);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [actionError, setActionError] = useState("");
  const [targets, setTargets] = useState<Target[]>([]);
  const [postId, setPostId] = useState("");

  useEffect(() => {
    if (search.trim() === query) return;
    const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search, query]);

  useEffect(() => {
    const controller = new AbortController();
    let first = true;
    let fetching = false;
    const load = async () => {
      if (fetching) return;
      fetching = true;
      if (first) setLoading(true);
      setRefreshing(true);
      const params = new URLSearchParams({ limit: "12", page: String(page) });
      if (filter !== "all") params.set("stage_group", filter);
      if (query) params.set("q", query);
      try {
        const options = { signal: controller.signal };
        const [videos, summary, status, config] = await Promise.all([
          readApi<Listing>(`/api/reels?${params}`, options), readApi<DashboardStats>("/api/stats", options),
          readApi<SchedulerStatus>("/api/scheduler", options), readApi<AppSettings>("/api/settings", options),
        ]);
        if (controller.signal.aborted) return;
        if (videos.data.totalPages > 0 && page > videos.data.totalPages) { setPage(videos.data.totalPages); return; }
        setListing(videos.data); setStats(summary.data); setScheduler(status.data); setSettings(config.data);
        setLoadError(""); setUpdatedAt(new Date().toISOString());
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Falha ao carregar o painel.");
      } finally {
        fetching = false; first = false;
        if (!controller.signal.aborted) { setLoading(false); setRefreshing(false); }
      }
    };
    queueMicrotask(load);
    const interval = setInterval(load, 5000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [page, filter, query, refresh]);

  const counts = stats?.stage_counts;
  const countStages = (stages: string[]) => stages.reduce((sum, stage) => sum + (counts?.[stage as ReelStage] || 0), 0);
  const availableTargets = (reel: Reel): Target[] => (['instagram', 'facebook'] as Target[]).filter(target =>
    settings?.[`${target}_enabled`] && !(target === 'instagram' ? reel.ig_post_id : reel.fb_post_id));
  const openAction = (next: Action) => {
    if (pendingRef.current) return;
    setActionError(""); setPostId("");
    if (next.kind === "publish") setTargets(availableTargets(next.reel));
    setAction(next);
  };
  const closeAction = () => { if (!pendingRef.current) setAction(null); };
  const submitAction = async () => {
    if (!action || pendingRef.current) return;
    if (action.kind === 'publish' && !targets.length) return;
    if (action.kind === 'review-published' && !postId.trim()) return;
    pendingRef.current = true; setPending(true); setActionError("");
    try {
      let url = "", body: object = {}, method = "POST";
      switch (action.kind) {
        case "publish": url = "/api/publish"; body = { reelId: action.reel.id, targets: targets.filter(t => availableTargets(action.reel).includes(t)) }; break;
        case "process": url = "/api/reels/reprocess"; body = { reelId: action.reel.id }; break;
        case "delete": url = `/api/reels?id=${action.reel.id}`; method = "DELETE"; break;
        case "run": url = "/api/scheduler"; body = { action: "run-now" }; break;
        case "retry-all": url = "/api/reels/reprocess"; body = { allFailed: true }; break;
        case "review-published": case "review-retry": url = "/api/pipeline/jobs"; body = { jobId: action.job.id, action: action.kind === "review-published" ? "confirm-published" : "confirm-not-published", postId: postId.trim() || undefined }; break;
      }
      const result = await readApi<unknown>(url, { method, headers: { "Content-Type": "application/json" }, ...(method === "DELETE" ? {} : { body: JSON.stringify(body) }) });
      const queued = action.kind !== 'delete' && action.kind !== 'review-published';
      const waiting = queued && (scheduler?.paused || !scheduler?.worker_online);
      setNotice({ text: `${result.message || (action.kind === 'delete' ? 'Vídeo excluído.' : 'Solicitação registrada na fila.')}${waiting ? ' A fila está pausada ou o worker está offline; a tarefa ficará salva até a automação ser retomada.' : ''}` });
      setAction(null); setRefresh(v => v + 1);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Não foi possível concluir a ação.");
    } finally { pendingRef.current = false; setPending(false); }
  };

  const firstName = user.name.split(' ')[0];
  const activeJobs = scheduler?.jobs?.filter(job => JOB_STATUSES[job.status]) || [];
  const actionTitles = { publish: "Publicar vídeo", process: "Processar vídeo", delete: "Excluir vídeo", run: "Executar ciclo agora", "retry-all": "Reprocessar falhas", "review-published": "Confirmar post existente", "review-retry": "Autorizar nova tentativa" };
  const statusLabel = !scheduler ? "Verificando automação" : !scheduler.worker_online ? "Worker offline" : scheduler.paused ? "Automação pausada" : scheduler.is_running ? "Automação em execução" : "Automação ativa";
  const clearFilters = () => { setSearch(""); setQuery(""); setFilter("all"); setPage(1); };

  return (
    <AppShell user={user}>
      <div className="dashboard-topline"><span><span className="text-accent font-semibold">Workspace</span><span className="mx-2 text-faint">/</span>Visão geral</span><span className="hidden sm:inline-flex items-center gap-2"><ShieldCheck size={14} />Seu espaço de criação</span></div>
      <header className="dashboard-heading">
        <div><p className="dashboard-eyebrow">BOM TER VOCÊ AQUI, {firstName.toLocaleUpperCase('pt-BR')}</p><h1>Seu conteúdo, em movimento<span className="text-accent">.</span></h1><p>Organize seus vídeos. Acompanhe cada etapa. Publique com a sua marca.</p></div>
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}><Plus />Adicionar vídeo</button>
      </header>

      {notice && <div className={`alert ${notice.error ? 'alert-err' : 'alert-ok'} dashboard-notice`} role={notice.error ? 'alert' : 'status'}><CheckCircle2 /><span>{notice.text}</span><button type="button" onClick={() => setNotice(null)} aria-label="Fechar aviso" className="btn btn-icon ml-auto"><X /></button></div>}
      {loadError && <div className="alert alert-err flex-wrap" role="alert"><TriangleAlert /><span className="flex-1">{loadError} {updatedAt && 'Os dados exibidos são da última atualização.'}</span>{loadError.includes('sessão') ? <Link href="/" className="btn btn-secondary btn-sm">Entrar novamente</Link> : <button className="btn btn-secondary btn-sm" onClick={() => setRefresh(v=>v+1)} disabled={refreshing}>Tentar novamente</button>}</div>}

      <section className="dashboard-stats" aria-label="Resumo do dia">
        <StatCard label="Publicados hoje" value={stats?.published_today ?? '—'} caption={`${stats?.published_total ?? '—'} vídeos publicados no total`} icon={Send} />
        <StatCard label="Na fila" value={stats?.pipeline_queue ?? '—'} caption="Do primeiro passo ao próximo post" icon={Layers3} />
        <StatCard label="Fontes ativas" value={stats?.active_sources ?? '—'} caption={`${stats?.total_sources ?? '—'} perfis na sua curadoria`} icon={Users} />
        <StatCard label="Erros hoje" value={stats?.errors_today ?? '—'} tone="error" caption={stats?.errors_today ? <button type="button" className="text-err-ink underline underline-offset-4" onClick={()=>{setFilter('error');setPage(1);}}>Conferir vídeos com erro</button> : stats ? 'Tudo certo por aqui' : 'Carregando resumo'} icon={TriangleAlert} />
      </section>

      <section className="automation-bar" aria-label="Status da automação">
        <div className="automation-identity"><span className="automation-symbol"><Activity size={20} /></span><div><span className="font-semibold flex items-center gap-2"><span className={`dot ${scheduler?.scheduler_active ? 'bg-ok' : 'bg-warn'}`} />{statusLabel}</span><p>{scheduler?.current_task || (scheduler?.paused ? 'Suas tarefas ficam salvas até a automação ser retomada.' : !scheduler?.worker_online ? 'As tarefas aguardam a conexão com o worker.' : 'Seu conteúdo segue o ritmo que você configurou.')}</p></div></div>
        <div className="automation-next"><Clock3 size={17} /><span>Próximo ciclo <strong>{scheduler?.next_run_at ? clockTime(scheduler.next_run_at) : '—'}</strong></span></div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={()=>openAction({kind:'run'})} disabled={pending || !scheduler}><PlayIcon />Rodar agora</button>
        <Link href="/dashboard/settings#automacao" className="automation-settings" aria-label="Configurar automação"><ArrowUpRight size={19} /></Link>
      </section>
      {scheduler?.schedule_error && <div role="alert" className="alert alert-warn"><TriangleAlert /><span>{scheduler.schedule_error} <Link href="/dashboard/settings#automacao" className="underline">Revisar configurações</Link></span></div>}

      <section className="video-library" aria-labelledby="library-title">
        <div className="library-heading"><div><div className="flex items-center gap-2.5"><h2 id="library-title">Biblioteca de vídeos</h2><span className="library-count">{stats?.total_reels ?? '—'}</span></div><p>Da inspiração à publicação, tudo em um só lugar.</p></div><div className="flex items-center gap-2">{countStages(['error']) > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={()=>openAction({kind:'retry-all'})} disabled={pending}><RefreshCw />Reprocessar falhas</button>}<button type="button" className="btn btn-secondary btn-icon" disabled={refreshing} onClick={()=>setRefresh(v=>v+1)} aria-label="Atualizar lista"><RefreshCw className={refreshing ? 'animate-spin' : ''} /></button></div></div>
        <div className="library-toolbar">
          <div className="library-tabs" role="group" aria-label="Filtrar por etapa">{FILTERS.map(item=><button key={item.value} type="button" aria-pressed={filter===item.value} onClick={()=>{setFilter(item.value);setPage(1);}}>{item.label}<span>{stats ? item.value==='all' ? stats.total_reels : countStages(item.stages) : '—'}</span></button>)}</div>
          <div className="library-search"><Search size={17} aria-hidden="true" /><input type="search" placeholder="Buscar vídeos ou @perfil" aria-label="Buscar vídeos" value={search} onChange={e=>setSearch(e.target.value)} /></div>
        </div>
        <div aria-busy={loading}>
          {loading ? <div className="video-grid" aria-label="Carregando vídeos">{Array.from({length:4},(_,i)=><div key={i} className="video-skeleton"><div /><span /><span /></div>)}<span className="sr-only" role="status">Carregando vídeos...</span></div> : loadError && !updatedAt ? <div className="library-empty"><TriangleAlert /><h3>Não foi possível carregar seus vídeos</h3><p>Confira sua conexão e tente novamente.</p></div> : listing.reels.length === 0 ? <div className="library-empty"><span className="empty-symbol"><Film size={30} /></span><h3>{query || filter!=='all' ? 'Nenhum vídeo encontrado' : 'Seu próximo vídeo começa aqui'}</h3><p>{query || filter!=='all' ? 'Tente outra busca ou escolha uma etapa diferente.' : 'Adicione um link ou conecte suas fontes para dar vida à sua biblioteca.'}</p><div className="flex gap-3">{query || filter!=='all' ? <button type="button" className="btn btn-secondary" onClick={clearFilters}>Limpar filtros</button> : <><button type="button" className="btn btn-primary" onClick={()=>setAdding(true)}><Plus />Adicionar vídeo</button><Link href="/dashboard/sources" className="btn btn-secondary">Conectar fontes<ArrowRight /></Link></>}</div></div> : <ul className="video-grid" aria-label="Vídeos">{listing.reels.map(reel=><ReelCard key={reel.id} reel={reel} busy={pending} working={!!stats?.reel_activity?.[reel.id]?.running} canPublish={!stats?.reel_activity?.[reel.id]?.needs_review && !stats?.reel_activity?.[reel.id]?.running && (reel.stage==='uploaded' || ((reel.stage==='publishing' || reel.stage==='error') && !!reel.r2_url && !!(reel.ig_post_id || reel.fb_post_id) && availableTargets(reel).length>0))} onPublish={()=>openAction({kind:'publish',reel})} onReprocess={()=>openAction({kind:'process',reel})} onDelete={()=>openAction({kind:'delete',reel})} />)}</ul>}
        </div>
        <footer className="library-footer"><span>{listing.total ? `${(listing.page-1)*12+1}–${Math.min(listing.page*12,listing.total)} de ${listing.total} vídeos` : '0 vídeos'}<span className="hidden md:inline">{updatedAt ? ` · Atualizado às ${clockTime(updatedAt)}` : ''}</span></span><div className="flex items-center gap-3"><span>Página {listing.page} de {Math.max(1,listing.totalPages)}</span><button type="button" className="btn btn-secondary btn-icon" aria-label="Página anterior" disabled={page<=1 || loading} onClick={()=>setPage(v=>v-1)}><ChevronLeft /></button><button type="button" className="btn btn-secondary btn-icon" aria-label="Próxima página" disabled={page>=listing.totalPages || loading} onClick={()=>setPage(v=>v+1)}><ChevronRight /></button></div></footer>
      </section>

      <section className="pipeline-strip" aria-label="Etapas do pipeline"><div className="pipeline-strip-title"><Layers3 size={17} /><span>Seu fluxo<br/><strong>em tempo real</strong></span></div>{PIPELINE.map(({label,icon:Icon,stages})=><div key={label} className="pipeline-step"><Icon size={17}/><span>{label}</span><strong>{stats ? countStages(stages) : '—'}</strong></div>)}</section>
      <div className="dashboard-bottom">
        <section className="card activity-panel" aria-label="Atividade da automação"><div className="section-heading"><h2><Activity size={18}/>Atividade da automação</h2><span className="chip">{activeJobs.length} tarefas recentes</span></div>{!activeJobs.length ? <div className="quiet-state"><CheckCircle2 /><div><strong>Espaço para novas ideias</strong><p>As tarefas em andamento e os avisos da fila aparecem aqui.</p></div></div> : <ul className="activity-list">{activeJobs.slice(0,showAllActivity ? activeJobs.length : 6).map(job=><li key={job.id}><div className={`activity-dot ${job.status==='running' ? 'is-running' : ''}`} /><div className="min-w-0 flex-1"><div className="flex justify-between gap-2 flex-wrap"><strong>{JOB_LABELS[job.kind] || job.kind} #{job.ref_id}{job.target ? ` · ${job.target==='instagram' ? 'Instagram' : 'Facebook'}` : ''}</strong><span className="text-xs text-muted">{JOB_STATUSES[job.status]}</span></div>{job.error_message && <p>{job.error_message}</p>}<span className="text-xs text-faint">{job.attempts} tentativa(s)</span>{job.status==='blocked' && <Link className="inline-flex items-center gap-1 text-accent text-xs ml-3" href="/dashboard/settings">Revisar configurações<ArrowUpRight size={12}/></Link>}{job.status==='needs_review' && <div className="flex flex-wrap gap-2 mt-3">{job.kind==='publish' && <button type="button" className="btn btn-secondary btn-sm" onClick={()=>openAction({kind:'review-published',job})} disabled={pending}>Confirmar post existente</button>}<button type="button" className="btn btn-secondary btn-sm" onClick={()=>openAction({kind:'review-retry',job})} disabled={pending}>Confirmei que não houve envio</button></div>}</div></li>)}</ul>}{activeJobs.length>6 && <button type="button" className="btn btn-ghost btn-sm mt-4 w-full" onClick={()=>setShowAllActivity(v=>!v)} aria-expanded={showAllActivity}>{showAllActivity ? "Recolher atividades" : `Ver todas as atividades (${activeJobs.length})`}</button>}</section>
        <section className="card recent-panel" aria-label="Últimas publicações"><div className="section-heading"><h2><CheckCircle2 size={18}/>Últimas publicações</h2><span className="recent-live">Histórico</span></div>{!stats?.recent_published?.length ? <div className="quiet-state"><Film /><div><strong>A primeira de muitas</strong><p>Seus vídeos publicados aparecem aqui.</p></div></div> : <ul className="recent-list">{stats.recent_published.map(reel=><li key={reel.id}><span className="recent-icon"><Check size={16}/></span><a href={reel.instagram_url} target="_blank" rel="noopener noreferrer"><strong>{reel.caption || reel.original_caption || `Vídeo de @${reel.source_username}`}</strong><span>@{reel.source_username} · {timeAgo(reel.published_at)}</span></a><ArrowUpRight size={15} className="text-faint shrink-0"/></li>)}</ul>}{stats?.next_reel && <div className="next-reel"><Clock3 size={17}/><div><span>Próximo da fila</span><p>{stats.next_reel.caption || stats.next_reel.original_caption || `@${stats.next_reel.source_username}`}</p></div></div>}</section>
      </div>
      <div className="dashboard-footnote"><BrandTiny />Criado para histórias que merecem ir mais longe.<span className="ml-auto hidden sm:inline">GO POST · Seu estúdio de conteúdo</span></div>
      {user.plan==='free' && (stats?.published_total || 0)>=1 && <div className="card p-5 flex flex-wrap justify-between gap-3"><div><strong>Continue criando com o Pro</strong><p className="text-muted text-sm">Você já usou a publicação do plano grátis.</p></div><Link href="/#planos" className="btn btn-primary">Conhecer o Pro<ArrowUpRight /></Link></div>}

      <AddReelModal isOpen={adding} onClose={()=>setAdding(false)} onAdded={()=>{setNotice({text:'Vídeo adicionado à biblioteca. Acompanhe o processamento pela fila.'});setRefresh(v=>v+1);}} />
      {action && <Modal title={actionTitles[action.kind]} onClose={closeAction} disabled={pending}>
        <div className="flex flex-col gap-5">
          {'reel' in action && <div className="inset p-4 text-sm"><span className="text-xs text-muted">@{action.reel.source_username}</span><p className="mt-1 font-medium line-clamp-3">{action.reel.caption || action.reel.original_caption || 'Vídeo sem legenda'}</p></div>}
          {action.kind==='publish' && <><p className="text-muted text-sm">Escolha os destinos habilitados. A publicação será registrada na fila; o resultado de cada rede aparece no painel.</p><div className="flex flex-col gap-3">{availableTargets(action.reel).map(target=><label key={target} className="target-option"><input type="checkbox" checked={targets.includes(target)} onChange={e=>setTargets(prev=>e.target.checked ? [...prev,target] : prev.filter(t=>t!==target))} disabled={pending}/><span>{TARGET_LABELS[target]}</span><span className="ml-auto text-xs text-muted">Habilitado</span></label>)}</div>{!availableTargets(action.reel).length && <div className="alert alert-warn">Nenhum destino pendente habilitado. <Link href="/dashboard/settings" className="underline">Conferir configurações</Link></div>}</>}
          {(action.kind==='process' || action.kind==='retry-all' || action.kind==='run') && <div className="alert alert-warn"><TriangleAlert /><p>{action.kind==='run' ? 'Este ciclo pode coletar novos vídeos e processar os pendentes.' : 'O processamento pode baixar o vídeo, gerar uma legenda e preparar os arquivos.'} Esta ação também pode publicar nos destinos habilitados, mesmo com a publicação automática desligada, e consumir créditos dos provedores.</p></div>}
          {action.kind==='delete' && <p className="text-muted text-sm">O vídeo e os arquivos locais que não estiverem em uso serão excluídos. Esta ação não remove posts já publicados nas redes sociais.</p>}
          {action.kind==='review-published' && <><p className="text-muted text-sm">Confira o post na plataforma e informe o ID. Isso confirma o resultado sem reenviar o vídeo.</p><label className="label">ID do post<input className="input mt-2" value={postId} onChange={e=>setPostId(e.target.value)} disabled={pending} /></label></>}
          {action.kind==='review-retry' && <div className="alert alert-warn"><TriangleAlert /><p>Confirme no provedor que não houve publicação nem coleta em andamento. Autorizar outra tentativa pode consumir créditos ou criar um novo post.</p></div>}
          {(scheduler?.paused || !scheduler?.worker_online) && action.kind!=='delete' && <p className="text-sm text-muted"><Clock3 size={14} className="inline mr-1"/>A tarefa aguardará na fila até a automação ser retomada.</p>}
          {actionError && <div role="alert" className="alert alert-err"><TriangleAlert /><span>{actionError}</span></div>}
          <div className="flex justify-end gap-3 pt-2"><button type="button" className="btn btn-secondary" onClick={closeAction} disabled={pending}>Cancelar</button><button type="button" className={`btn ${action.kind==='delete'?'btn-danger':'btn-primary'}`} disabled={pending || (action.kind==='publish' && !targets.some(t=>availableTargets(action.reel).includes(t))) || (action.kind==='review-published' && !postId.trim())} onClick={submitAction}>{pending ? <Loader2 className="animate-spin"/> : action.kind==='publish' ? <Send/> : null}{pending ? 'Registrando...' : actionTitles[action.kind]}</button></div>
        </div>
      </Modal>}
    </AppShell>
  );
}
function PlayIcon() { return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l12-7z"/></svg>; }
function BrandTiny() { return <span className="w-4 h-4 rounded bg-accent/15 text-accent flex items-center justify-center"><PlayIcon/></span>; }
