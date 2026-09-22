"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Check, Upload, Loader2, AlertCircle, Link2, X, Sparkles, Play } from "lucide-react";
import { Instagram, Facebook } from "@/components/icons";

import AppShell, { PageHeader, Switch } from "@/components/AppShell";
import type { AppSettings, User } from "@/types";

type LogoPosition = AppSettings["logo_position"];

const POSITION_LABELS: Record<LogoPosition, string> = {
  "top-left": "Superior esquerdo",
  "top-right": "Superior direito",
  center: "Centro",
  "bottom-left": "Inferior esquerdo",
  "bottom-right": "Inferior direito",
};

/** Grade 3x3 do seletor de posição (null = célula vazia) */
const POSITION_GRID: (LogoPosition | null)[] = [
  "top-left", null, "top-right",
  null, "center", null,
  "bottom-left", null, "bottom-right",
];

const CRON_PRESETS = [
  { value: "*/15 * * * *", label: "A cada 15 minutos" },
  { value: "*/30 * * * *", label: "A cada 30 minutos (recomendado)" },
  { value: "0 * * * *", label: "A cada hora" },
  { value: "0 */3 * * *", label: "A cada 3 horas" },
  { value: "0 */6 * * *", label: "A cada 6 horas" },
  { value: "0 0 * * *", label: "Uma vez por dia (00:00)" },
];

const DEFAULT_SETTINGS: AppSettings = {
  logo_position: "bottom-right",
  logo_scale: 80,
  cron_schedule: "*/30 * * * *",
  max_reels_per_run: 5,
  discovery_limit: 10,
  discovery_interval_minutes: 360,
  publish_interval_minutes: 30,
  auto_publish: true,
  custom_caption_template: "",
  instagram_enabled: true,
  facebook_enabled: true,
  facebook_page_access_token: "",
  facebook_page_id: "",
  instagram_business_account_id: "",
  facebook_page_name: "",
  instagram_username: "",
};

/** Largura da prévia 9:16 em px — a logo é escalada na mesma proporção do vídeo de 1080 px */
const PREVIEW_WIDTH = 234;

interface FbPage {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string; username: string };
}

const SECTIONS = [
  { id: "meta", label: "Conta Meta" },
  { id: "marca", label: "Marca d'água" },
  { id: "automacao", label: "Automação" },
  { id: "legendas", label: "Legendas" },
];

export default function SettingsClient({ user }: { user: User }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [availablePages, setAvailablePages] = useState<FbPage[]>([]);
  const [showPageSelector, setShowPageSelector] = useState(false);
  const [loadingPages, setLoadingPages] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.success && data.data) setSettings({ ...DEFAULT_SETTINGS, ...data.data });
    } catch {
      // usa os padrões
    }
  }, []);

  const fetchPages = useCallback(async () => {
    setLoadingPages(true);
    try {
      const res = await fetch("/api/auth/facebook/pages");
      const data = await res.json();
      if (data.success && data.data?.pages?.length > 0) {
        setAvailablePages(data.data.pages);
        setShowPageSelector(true);
      } else {
        setError("Nenhuma página encontrada. Confira se você autorizou o acesso às páginas no Facebook.");
      }
    } catch {
      setError("Erro ao carregar a lista de páginas do Facebook.");
    } finally {
      setLoadingPages(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();

    // Retorno do login/conexão com o Facebook
    const urlParams = new URLSearchParams(window.location.search);
    const authStatus = urlParams.get("auth");
    if (authStatus === "success") {
      fetchPages();
      window.history.replaceState({}, document.title, "/dashboard/settings");
    } else if (authStatus === "error") {
      setError(`Falha ao conectar com o Facebook: ${urlParams.get("message") || "erro na autenticação"}`);
      window.history.replaceState({}, document.title, "/dashboard/settings");
    }

    // Marca d'água atual da conta (a mesma que vai nos vídeos); 404 = sem marca d'água
    fetch("/api/logo", { method: "HEAD", cache: "no-store" })
      .then((res) => {
        if (res.ok) setLogoPreview(`/api/logo?t=${Date.now()}`);
      })
      .catch(() => {});
  }, [fetchSettings, fetchPages]);

  // Fechar o seletor de página com Esc
  useEffect(() => {
    if (!showPageSelector) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowPageSelector(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showPageSelector]);

  const handleSave = async (customSettings?: AppSettings) => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customSettings || settings),
      });
      const data = await res.json();
      if (data.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
        if (data.data) setSettings({ ...DEFAULT_SETTINGS, ...data.data });
      } else {
        setError(data.error || "Erro ao salvar as configurações");
      }
    } catch (err) {
      setError(`Erro de conexão: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleConnectFacebook = async () => {
    try {
      const res = await fetch(`/api/auth/facebook?origin=${encodeURIComponent(window.location.origin)}`);
      const data = await res.json();
      if (data.success && data.data?.authUrl) {
        window.location.href = data.data.authUrl;
      } else {
        setError(data.error || "Falha ao iniciar a conexão com o Facebook");
      }
    } catch {
      setError("Erro de rede ao conectar com o Facebook");
    }
  };

  const handleDisconnectFacebook = () => {
    if (!confirm("Desconectar a página? Os reels deixam de ser publicados até você conectar de novo.")) return;
    const updated = {
      ...settings,
      facebook_page_id: "",
      facebook_page_access_token: "",
      facebook_page_name: "",
      instagram_business_account_id: "",
      instagram_username: "",
    };
    setSettings(updated);
    handleSave(updated);
  };

  const handleSelectPage = (pageId: string) => {
    const page = availablePages.find((p) => p.id === pageId);
    if (!page) return;
    const updated = {
      ...settings,
      facebook_page_id: page.id,
      facebook_page_access_token: page.access_token,
      facebook_page_name: page.name,
      instagram_business_account_id: page.instagram_business_account?.id || "",
      instagram_username: page.instagram_business_account?.username || "",
    };
    setSettings(updated);
    setShowPageSelector(false);
    handleSave(updated);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    const formData = new FormData();
    formData.append("logo", file);
    try {
      const res = await fetch("/api/upload-logo", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) {
        setLogoPreview(data.data.path);
      } else {
        setError(data.error || "Erro ao enviar a imagem da logo");
      }
    } catch {
      setError("Erro ao enviar a imagem da logo");
    } finally {
      setUploadingLogo(false);
      e.target.value = ""; // permite escolher o mesmo arquivo de novo
    }
  };

  const handleLogoRemove = async () => {
    if (!confirm("Remover a marca d'água? Os próximos vídeos serão publicados sem logo.")) return;
    try {
      const res = await fetch("/api/logo", { method: "DELETE" });
      const data = await res.json();
      if (data.success) setLogoPreview(null);
      else setError(data.error || "Erro ao remover a marca d'água");
    } catch {
      setError("Erro ao remover a marca d'água");
    }
  };

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const appendTagToTemplate = (tag: string) => {
    const current = settings.custom_caption_template || "";
    updateSetting("custom_caption_template", current ? `${current} ${tag}` : tag);
  };

  const connected = !!settings.facebook_page_id;
  const pageWithoutInstagram = connected && !settings.instagram_business_account_id;
  const logoWidth = Math.max(12, Math.round((settings.logo_scale * PREVIEW_WIDTH) / 1080));
  const logoPlacement: Record<LogoPosition, string> = {
    "top-left": "top-3 left-3",
    "top-right": "top-3 right-3",
    center: "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
    "bottom-left": "bottom-3 left-3",
    "bottom-right": "bottom-3 right-3",
  };

  return (
    <AppShell user={user}>
      <PageHeader
        title="Configurações"
        subtitle="Onde publicar, marca d'água, ritmo da automação e legendas"
        actions={
          <button type="button" onClick={() => handleSave()} disabled={saving} className="btn btn-primary">
            {saving ? <Loader2 className="animate-spin" /> : <Check />}
            {saved ? "Alterações salvas" : "Salvar alterações"}
          </button>
        }
      />

      {error && (
        <div className="alert alert-err" role="alert">
          <AlertCircle />
          <span className="flex-1">{error}</span>
          <button type="button" className="btn btn-icon w-7 h-7 -my-1 -mr-1" aria-label="Fechar aviso" onClick={() => setError("")}>
            <X />
          </button>
        </div>
      )}

      <div className="flex gap-8 items-start">
        <nav aria-label="Seções" className="hidden lg:flex w-[200px] shrink-0 flex-col gap-0.5 sticky top-8">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="nav-link h-[38px]">
              {s.label}
            </a>
          ))}
        </nav>

        <div className="flex-1 min-w-0 flex flex-col gap-6">
          {/* ── Conta Meta ───────────────────────────────────────── */}
          <section id="meta" aria-labelledby="meta-title" className="card p-6 flex flex-col gap-[18px] scroll-mt-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h2 id="meta-title" className="m-0 text-[17px] font-semibold">Conta Meta</h2>
                <p className="m-0 text-muted">Página do Facebook e Instagram Business onde os reels são publicados</p>
              </div>
              <span className={connected ? "chip chip-ok" : "chip"}>{connected ? "Conectada" : "Não conectada"}</span>
            </div>

            {connected ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="inset px-4 py-3.5 flex items-center gap-3 min-w-0">
                  <Facebook className="w-5 h-5 text-info-ink shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs text-faint">Página</span>
                    <span className="font-semibold truncate">{settings.facebook_page_name || "Página conectada"}</span>
                  </div>
                </div>
                <div className="inset px-4 py-3.5 flex items-center gap-3 min-w-0">
                  <Instagram className="w-5 h-5 text-[#f08bc0] shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs text-faint">Instagram Business</span>
                    <span className={`font-semibold truncate ${pageWithoutInstagram ? "text-warn-ink" : ""}`}>
                      {settings.instagram_username ? `@${settings.instagram_username}` : "Não vinculado à página"}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="inset p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <p className="m-0 text-ink-2 max-w-md">
                  Conecte a sua página do Facebook para publicar os reels nela e no Instagram Business vinculado.
                </p>
                <button type="button" onClick={handleConnectFacebook} disabled={loadingPages} className="btn btn-primary shrink-0">
                  {loadingPages ? <Loader2 className="animate-spin" /> : <Link2 />}
                  Conectar página
                </button>
              </div>
            )}

            <div className="flex flex-col border-t border-line">
              <div className="flex items-center justify-between gap-4 py-3 border-b border-line">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">Publicar no Instagram</span>
                  <span className={`text-[13px] ${pageWithoutInstagram && settings.instagram_enabled ? "text-warn-ink" : "text-muted"}`}>
                    {pageWithoutInstagram
                      ? "A página conectada não tem conta do Instagram Business vinculada"
                      : "Reels no Instagram Business vinculado à página"}
                  </span>
                </div>
                <Switch
                  label="Publicar no Instagram"
                  checked={settings.instagram_enabled}
                  onChange={(v) => updateSetting("instagram_enabled", v)}
                />
              </div>
              <div className="flex items-center justify-between gap-4 py-3 border-b border-line">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">Publicar no Facebook</span>
                  <span className="text-[13px] text-muted">Reels na página do Facebook conectada</span>
                </div>
                <Switch
                  label="Publicar no Facebook"
                  checked={settings.facebook_enabled}
                  onChange={(v) => updateSetting("facebook_enabled", v)}
                />
              </div>
            </div>

            {!settings.instagram_enabled && !settings.facebook_enabled && (
              <div className="alert alert-warn">
                <AlertCircle />
                <span>Com as duas opções desligadas, nenhum vídeo será publicado.</span>
              </div>
            )}

            {connected && (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={handleConnectFacebook} disabled={loadingPages} className="btn btn-secondary btn-sm">
                  {loadingPages && <Loader2 className="animate-spin" />}
                  Trocar página
                </button>
                <button type="button" onClick={handleDisconnectFacebook} className="btn btn-danger btn-sm">
                  Desconectar
                </button>
              </div>
            )}
          </section>

          {/* ── Marca d'água ─────────────────────────────────────── */}
          <section id="marca" aria-labelledby="marca-title" className="card p-6 flex flex-col gap-[18px] scroll-mt-6">
            <div className="flex flex-col gap-1">
              <h2 id="marca-title" className="m-0 text-[17px] font-semibold">Marca d&apos;água</h2>
              <p className="m-0 text-muted">A sua logo, aplicada em todos os vídeos desta conta</p>
            </div>

            <div className="flex flex-col md:flex-row gap-7 items-center md:items-start">
              <div
                className="relative shrink-0 rounded-2xl bg-[#1d2024] border border-line-strong overflow-hidden"
                style={{ width: PREVIEW_WIDTH, height: Math.round((PREVIEW_WIDTH * 16) / 9) }}
                aria-label="Prévia da posição da marca d'água num vídeo 9:16"
                role="img"
              >
                <div className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
                  <Play className="w-7 h-7 text-[#3a3e45]" fill="currentColor" aria-hidden="true" />
                  <span className="text-xs text-faint">Prévia 9:16</span>
                </div>
                <div className="absolute left-3.5 right-14 bottom-14 flex flex-col gap-1.5" aria-hidden="true">
                  <div className="h-2 rounded bg-line-strong" />
                  <div className="h-2 w-[70%] rounded bg-line-strong" />
                </div>
                <div className={`absolute ${logoPlacement[settings.logo_position]} transition-all duration-200`} style={{ width: logoWidth }}>
                  {logoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoPreview} alt="" className="w-full h-auto object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]" />
                  ) : (
                    <div className="rounded bg-accent text-on-accent font-display font-bold text-center leading-none py-1 overflow-hidden whitespace-nowrap" style={{ fontSize: Math.max(7, Math.round(logoWidth / 7)) }}>
                      SUA LOGO
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 min-w-0 w-full flex flex-col gap-[22px]">
                <div className="inset p-3.5 flex flex-wrap items-center gap-3.5">
                  <div className="w-16 h-10 rounded-lg bg-canvas flex items-center justify-center overflow-hidden p-1.5 shrink-0">
                    {logoPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoPreview} alt="Logo atual" className="max-w-full max-h-full object-contain" />
                    ) : (
                      <Upload className="w-4 h-4 text-faint" aria-hidden="true" />
                    )}
                  </div>
                  <div className="flex-1 min-w-[160px] flex flex-col gap-0.5">
                    <span className="font-medium">{logoPreview ? "Logo enviada" : "Sem marca d'água"}</span>
                    <span className="text-xs text-muted">
                      {logoPreview ? "PNG, JPEG ou WebP · PNG transparente fica melhor" : "Os vídeos saem sem logo até você enviar uma"}
                    </span>
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleLogoUpload} />
                  <div className="flex gap-2">
                    {logoPreview && (
                      <button type="button" onClick={handleLogoRemove} disabled={uploadingLogo} className="btn btn-ghost btn-sm">
                        Remover
                      </button>
                    )}
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingLogo} className="btn btn-secondary btn-sm">
                      {uploadingLogo ? <Loader2 className="animate-spin" /> : <Upload />}
                      {logoPreview ? "Trocar imagem" : "Enviar logo"}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-2.5">
                  <span className="font-medium">Posição no vídeo</span>
                  <div role="group" aria-label="Posição da marca d'água" className="grid grid-cols-3 gap-2 w-60">
                    {POSITION_GRID.map((pos, i) =>
                      pos ? (
                        <button
                          key={pos}
                          type="button"
                          aria-label={POSITION_LABELS[pos]}
                          aria-pressed={settings.logo_position === pos}
                          onClick={() => updateSetting("logo_position", pos)}
                          className={`h-12 rounded-[9px] border flex items-center justify-center cursor-pointer transition-colors ${
                            settings.logo_position === pos ? "border-accent bg-accent/10" : "border-line-strong bg-inset hover:bg-raised"
                          }`}
                        >
                          <span className={`w-2.5 h-2.5 rounded-[3px] ${settings.logo_position === pos ? "bg-accent" : "bg-[#4a4f57]"}`} />
                        </button>
                      ) : (
                        <div key={`vazio-${i}`} className="h-12" aria-hidden="true" />
                      )
                    )}
                  </div>
                  <span className="text-[13px] text-muted">{POSITION_LABELS[settings.logo_position]}</span>
                </div>

                <label className="flex flex-col gap-2.5">
                  <span className="flex justify-between">
                    <span className="font-medium">Tamanho da logo</span>
                    <span className="font-mono text-ink-2">{settings.logo_scale} px</span>
                  </span>
                  <input
                    type="range"
                    min={40}
                    max={400}
                    step={10}
                    value={settings.logo_scale}
                    onChange={(e) => updateSetting("logo_scale", Number(e.target.value))}
                    className="w-full h-11 cursor-pointer"
                  />
                  <span className="text-xs text-faint">Largura da logo num vídeo de 1080 px</span>
                </label>
              </div>
            </div>
          </section>

          {/* ── Automação ────────────────────────────────────────── */}
          <section id="automacao" aria-labelledby="auto-title" className="card p-6 flex flex-col gap-[18px] scroll-mt-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h2 id="auto-title" className="m-0 text-[17px] font-semibold">Automação</h2>
                <p className="m-0 text-muted">Frequência das coletas e ritmo das publicações</p>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[13px] text-ink-2">Publicação automática</span>
                <Switch label="Publicação automática" checked={settings.auto_publish} onChange={(v) => updateSetting("auto_publish", v)} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="cron">Frequência da automação</label>
                <select id="cron" value={settings.cron_schedule} onChange={(e) => updateSetting("cron_schedule", e.target.value)} className="select">
                  {CRON_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="discovery-limit">Vídeos por coleta</label>
                <input id="discovery-limit" type="number" min={1} max={50} value={settings.discovery_limit} onChange={(e) => updateSetting("discovery_limit", Number(e.target.value))} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="publish-interval">Intervalo entre publicações (min)</label>
                <input id="publish-interval" type="number" min={0} max={1440} value={settings.publish_interval_minutes} onChange={(e) => updateSetting("publish_interval_minutes", Number(e.target.value))} className="input" />
                <p className="hint">No máximo 1 reel publicado a cada intervalo</p>
              </div>
              <div>
                <label className="label" htmlFor="discovery-interval">Intervalo de coleta por fonte (min)</label>
                <input id="discovery-interval" type="number" min={5} max={1440} value={settings.discovery_interval_minutes} onChange={(e) => updateSetting("discovery_interval_minutes", Number(e.target.value))} className="input" />
                <p className="hint">Economiza créditos da Bright Data</p>
              </div>
            </div>
          </section>

          {/* ── Legendas ─────────────────────────────────────────── */}
          <section id="legendas" aria-labelledby="leg-title" className="card p-6 flex flex-col gap-[18px] scroll-mt-6">
            <div className="flex flex-col gap-1">
              <h2 id="leg-title" className="m-0 text-[17px] font-semibold">Legendas</h2>
              <p className="m-0 text-muted">Reescrita em tom jornalístico e hashtags sobre o assunto</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="chip chip-accent">
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                Reescrita automática com IA
              </span>
              <span className="chip">Principal: Gemini</span>
              <span className="chip">Reserva: OpenAI</span>
            </div>
            <div>
              <label className="label" htmlFor="template">Modelo da legenda (opcional)</label>
              <textarea
                id="template"
                value={settings.custom_caption_template}
                onChange={(e) => updateSetting("custom_caption_template", e.target.value)}
                placeholder={"Em branco: legenda reescrita + hashtags.\nExemplo:\n{caption}\n\nSiga a página para mais notícias!\n\n{hashtags}"}
                rows={5}
                className="textarea font-mono text-[13px]"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-faint">Inserir:</span>
              <button type="button" onClick={() => appendTagToTemplate("{caption}")} className="btn btn-ghost btn-sm font-mono text-xs h-8">
                {"{caption}"}
              </button>
              <button type="button" onClick={() => appendTagToTemplate("{hashtags}")} className="btn btn-ghost btn-sm font-mono text-xs h-8">
                {"{hashtags}"}
              </button>
            </div>
          </section>
        </div>
      </div>

      {showPageSelector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowPageSelector(false)} aria-hidden="true" />
          <div role="dialog" aria-modal="true" aria-labelledby="page-picker-title" className="relative w-full max-w-lg card p-6 flex flex-col gap-4 shadow-[0_24px_60px_rgba(0,0,0,0.6)]">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h2 id="page-picker-title" className="m-0 text-[17px] font-semibold">Escolha a página</h2>
                <p className="m-0 text-[13px] text-muted">Os reels desta conta serão publicados nela.</p>
              </div>
              <button type="button" className="btn btn-icon -mr-2 -mt-2" aria-label="Fechar" onClick={() => setShowPageSelector(false)}>
                <X />
              </button>
            </div>
            <ul className="m-0 p-0 list-none flex flex-col gap-2 max-h-80 overflow-y-auto">
              {availablePages.map((page) => (
                <li key={page.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectPage(page.id)}
                    className="w-full text-left inset p-3.5 flex items-center justify-between gap-3 border border-line hover:border-line-strong cursor-pointer"
                  >
                    <span className="flex flex-col gap-0.5 min-w-0">
                      <span className="font-semibold truncate">{page.name}</span>
                      {page.instagram_business_account ? (
                        <span className="text-xs text-muted">Instagram: @{page.instagram_business_account.username}</span>
                      ) : (
                        <span className="text-xs text-warn-ink">Sem Instagram Business vinculado</span>
                      )}
                    </span>
                    <span className="chip shrink-0">Escolher</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </AppShell>
  );
}
