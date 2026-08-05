"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  Settings,
  Save,
  Upload,
  Clock,
  Image as ImageIcon,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Zap,
  Monitor,
  Link2,
  Unlink,
  Menu,
} from "lucide-react";
import { Instagram, Facebook } from "@/components/icons";

import Sidebar from "@/components/Sidebar";
import type { AppSettings, FacebookPageOption, PublicAppSettings, User } from "@/types";

const POSITIONS = [
  { value: "top-left", label: "Superior Esquerdo" },
  { value: "top-right", label: "Superior Direito" },
  { value: "bottom-left", label: "Inferior Esquerdo" },
  { value: "bottom-right", label: "Inferior Direito" },
  { value: "center", label: "Centro" },
];

const CRON_PRESETS = [
  { value: "*/15 * * * *", label: "A cada 15 minutos" },
  { value: "*/30 * * * *", label: "A cada 30 minutos" },
  { value: "0 * * * *", label: "A cada 1 hora" },
  { value: "0 */3 * * *", label: "A cada 3 horas" },
  { value: "0 */6 * * *", label: "A cada 6 horas" },
  { value: "0 0 * * *", label: "Uma vez por dia (meia-noite)" },
];

const DEFAULT_SETTINGS: PublicAppSettings = {
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
  facebook_page_access_token_configured: false,
  facebook_page_id: "",
  instagram_business_account_id: "",
  facebook_page_name: "",
  instagram_username: "",
};

export default function SettingsClient({ user }: { user: User }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [settings, setSettings] = useState<PublicAppSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estados para OAuth e Seleção de Páginas
  const [availablePages, setAvailablePages] = useState<FacebookPageOption[]>([]);
  const [showPageSelector, setShowPageSelector] = useState(false);
  const [loadingPages, setLoadingPages] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.success && data.data) {
        setSettings({ ...DEFAULT_SETTINGS, ...data.data });
      }
    } catch {
      // use defaults
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
        setError("Nenhuma página detectada. Certifique-se de que selecionou as permissões corretas no login do Facebook.");
      }
    } catch {
      setError("Erro ao carregar lista de páginas do Facebook.");
    } finally {
      setLoadingPages(false);
    }
  }, []);

  useEffect(() => {
    const initialFetch = setTimeout(fetchSettings, 0);
    
    // Check if redirect returned from OAuth login
    const urlParams = new URLSearchParams(window.location.search);
    const authStatus = urlParams.get("auth");
    if (authStatus === "success") {
      setTimeout(fetchPages, 0);
      window.history.replaceState({}, document.title, "/dashboard/settings");
    } else if (authStatus === "error") {
      const msg = urlParams.get("message") || "Erro na autenticação";
      setTimeout(() => setError(`Falha ao conectar com o Facebook: ${msg}`), 0);
      window.history.replaceState({}, document.title, "/dashboard/settings");
    }

    // Check if user-specific logo exists, fallback to default logo
    const userLogoUrl = `/logos/logo_${user.id}.png`;
    fetch(userLogoUrl, { method: "HEAD" })
      .then((res) => {
        if (res.ok) {
          setLogoPreview(userLogoUrl);
        } else {
          fetch("/logos/logo.png", { method: "HEAD" })
            .then((r) => {
              if (r.ok) setLogoPreview("/logos/logo.png");
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
    return () => clearTimeout(initialFetch);
  }, [fetchSettings, fetchPages, user.id]);

  const handleSave = async (customSettings?: PublicAppSettings) => {
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const values = customSettings || settings;
      const editableSettings = {
        logo_position: values.logo_position,
        logo_scale: values.logo_scale,
        cron_schedule: values.cron_schedule,
        max_reels_per_run: values.max_reels_per_run,
        discovery_limit: values.discovery_limit,
        discovery_interval_minutes: values.discovery_interval_minutes,
        publish_interval_minutes: values.publish_interval_minutes,
        auto_publish: values.auto_publish,
        custom_caption_template: values.custom_caption_template,
        instagram_enabled: values.instagram_enabled,
        facebook_enabled: values.facebook_enabled,
      };
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editableSettings),
      });
      const data = await res.json();
      if (data.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
        if (data.data) {
          setSettings({ ...DEFAULT_SETTINGS, ...data.data });
        }
      } else {
        setError(data.error || "Erro ao salvar");
      }
    } catch (err) {
      setError(`Erro de conexão: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleConnectFacebook = async () => {
    try {
      const res = await fetch("/api/auth/facebook");
      const data = await res.json();
      if (data.success && data.data?.authUrl) {
        window.location.href = data.data.authUrl;
      } else {
        setError(data.error || "Falha ao iniciar autenticação com o Facebook");
      }
    } catch {
      setError("Erro de rede ao conectar com o Facebook");
    }
  };

  const handleDisconnectFacebook = async () => {
    setError("");
    try {
      const res = await fetch("/api/auth/facebook/pages", { method: "DELETE" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Falha ao desconectar o Facebook");
      setSettings({ ...DEFAULT_SETTINGS, ...data.data });
      setAvailablePages([]);
      setShowPageSelector(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao desconectar o Facebook");
    }
  };

  const handleSelectPage = async (pageId: string) => {
    setError("");
    try {
      const res = await fetch("/api/auth/facebook/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Falha ao selecionar a página");
      setSettings({ ...DEFAULT_SETTINGS, ...data.data });
      setShowPageSelector(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao selecionar a página");
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    const formData = new FormData();
    formData.append("logo", file);

    try {
      const res = await fetch("/api/upload-logo", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setLogoPreview(data.data.path + "?t=" + Date.now());
      }
    } catch {
      setError("Erro ao enviar logo");
    } finally {
      setUploadingLogo(false);
    }
  };

  const updateSetting = <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
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
        <div className="topbar">
          <div className="flex items-center gap-3">
            <button
              className="mobile-menu-btn"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Settings className="w-5 h-5" style={{ color: "var(--brand-purple)" }} />
            <h2 className="text-lg font-bold text-heading">Configurações</h2>
          </div>
          <button
            onClick={() => handleSave()}
            disabled={saving}
            className="btn btn-primary btn-sm"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saved ? "Salvo!" : "Salvar"}
          </button>
        </div>

        <div className="p-6 max-w-4xl space-y-6">
          {/* Error */}
          {error && (
            <div
              className="flex items-center gap-2 p-3 rounded-lg text-sm"
              style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid rgba(239,68,68,0.2)" }}
            >
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {/* ── Logo Section ────────────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "var(--brand-gradient-subtle)" }}>
                <ImageIcon className="w-5 h-5" style={{ color: "var(--brand-purple)" }} />
              </div>
              <div>
                <h3 className="font-bold text-heading">Logo / Marca d&apos;água</h3>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Será aplicada em todos os vídeos processados
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Logo preview & upload */}
              <div>
                <div
                  className="w-full aspect-video rounded-xl flex items-center justify-center mb-3 cursor-pointer overflow-hidden"
                  style={{ background: "var(--surface-2)", border: "2px dashed var(--surface-border)" }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {logoPreview ? (
                    <Image
                      src={logoPreview}
                      alt="Logo"
                      width={640}
                      height={360}
                      unoptimized
                      className="max-w-full max-h-full object-contain p-4"
                    />
                  ) : (
                    <div className="text-center">
                      <Upload className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--text-muted)" }} />
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                        Clique para enviar logo (PNG)
                      </p>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/webp"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingLogo}
                  className="btn btn-secondary btn-sm w-full"
                >
                  {uploadingLogo ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  {logoPreview ? "Trocar Logo" : "Enviar Logo"}
                </button>
              </div>

              {/* Logo settings */}
              <div className="space-y-4">
                <div>
                  <label className="label">Posição da Logo</label>
                  <select
                    value={settings.logo_position}
                    onChange={(e) => updateSetting("logo_position", e.target.value as AppSettings["logo_position"])}
                    className="select"
                  >
                    {POSITIONS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Tamanho da Logo (px largura)</label>
                  <input
                    type="range"
                    min={30}
                    max={200}
                    value={settings.logo_scale}
                    onChange={(e) => updateSetting("logo_scale", Number(e.target.value))}
                    className="w-full accent-purple-500"
                  />
                  <p className="text-xs text-right mt-1" style={{ color: "var(--text-muted)" }}>
                    {settings.logo_scale}px
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* ── Meta OAuth Connection Section ────────────────── */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="card space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "var(--brand-gradient-subtle)" }}>
                <Link2 className="w-5 h-5" style={{ color: "var(--brand-purple)" }} />
              </div>
              <div>
                <h3 className="font-bold text-heading">Conexão com a Meta (Facebook & Instagram)</h3>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Conecte sua conta para selecionar a página e perfil do Instagram para autopostagem
                </p>
              </div>
            </div>

            {settings.facebook_page_id ? (
              <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-sm font-semibold text-emerald-400">Conectado</span>
                  </div>
                  <button onClick={handleDisconnectFacebook} className="btn btn-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid rgba(239,68,68,0.2)" }}>
                    <Unlink className="w-4 h-4" /> Desconectar
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="p-3 rounded-lg bg-surface-2 border border-surface-border">
                    <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Página do Facebook</p>
                    <p className="font-bold text-heading">{settings.facebook_page_name || "Desconhecido"}</p>
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>ID: {settings.facebook_page_id}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-surface-2 border border-surface-border">
                    <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Instagram Business</p>
                    <p className="font-bold text-heading">@{settings.instagram_username || "Desconhecido"}</p>
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>ID: {settings.instagram_business_account_id}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-surface-2 border border-surface-border text-center space-y-4">
                <p className="text-sm max-w-lg mx-auto" style={{ color: "var(--text-muted)" }}>
                  Para fazer publicações automáticas, conecte o painel ao seu aplicativo do Facebook. O assistente listará suas páginas e contas do Instagram Business vinculadas automaticamente.
                </p>
                <button
                  onClick={handleConnectFacebook}
                  disabled={loadingPages}
                  className="btn btn-primary mx-auto flex items-center gap-2"
                >
                  {loadingPages ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                  Conectar ao Facebook
                </button>
              </div>
            )}
          </motion.div>

          {/* ── Schedule Section ─────────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "var(--warning-bg)" }}>
                <Clock className="w-5 h-5" style={{ color: "var(--warning)" }} />
              </div>
              <div>
                <h3 className="font-bold text-heading">Agendamento</h3>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Frequência de verificação e processamento
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Frequência de sincronização</label>
                <select
                  value={settings.cron_schedule}
                  onChange={(e) => updateSetting("cron_schedule", e.target.value)}
                  className="select"
                >
                  {CRON_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Vídeos puxados por sincronização</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={settings.discovery_limit}
                  onChange={(e) => updateSetting("discovery_limit", Number(e.target.value))}
                  className="input"
                />
                <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                  Quantos reels descobrir/baixar a cada verificação (ex: 5 a 10).
                </p>
              </div>
              <div>
                <label className="label">Intervalo de descoberta (min)</label>
                <input
                  type="number"
                  min={5}
                  max={1440}
                  value={settings.discovery_interval_minutes}
                  onChange={(e) => updateSetting("discovery_interval_minutes", Number(e.target.value))}
                  className="input"
                />
                <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                  De quanto em quanto tempo varrer cada perfil. Maior = menos crédito Apify (ex: 360 = 6h).
                </p>
              </div>
              <div>
                <label className="label">Intervalo entre publicações (min)</label>
                <input
                  type="number"
                  min={0}
                  max={1440}
                  value={settings.publish_interval_minutes}
                  onChange={(e) => updateSetting("publish_interval_minutes", Number(e.target.value))}
                  className="input"
                />
                <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                  Publica no máximo 1 reel por intervalo. Ex: 30 = 1 post a cada 30 min.
                </p>
              </div>
              <div>
                <label className="label">Máx. tentativas por execução</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={settings.max_reels_per_run}
                  onChange={(e) => updateSetting("max_reels_per_run", Number(e.target.value))}
                  className="input"
                />
                <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                  Proteção: quantos reels tentar processar até conseguir 1 publicação.
                </p>
              </div>
            </div>

            {/* Auto publish toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: "var(--surface-2)" }}>
              <div className="flex items-center gap-3">
                <Zap className="w-4 h-4" style={{ color: "var(--warning)" }} />
                <div>
                  <p className="text-sm font-semibold text-heading">Publicação automática</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Publicar automaticamente após processamento
                  </p>
                </div>
              </div>
              <button
                onClick={() => updateSetting("auto_publish", !settings.auto_publish)}
                className="relative w-12 h-6 rounded-full transition-colors"
                style={{ background: settings.auto_publish ? "var(--success)" : "var(--surface-3)" }}
              >
                <span
                  className="absolute top-1 w-4 h-4 rounded-full bg-white transition-transform"
                  style={{ left: settings.auto_publish ? "28px" : "4px" }}
                />
              </button>
            </div>
          </motion.div>

          {/* ── Publishing Section ───────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="card space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "var(--instagram-bg)" }}>
                <Monitor className="w-5 h-5" style={{ color: "var(--instagram)" }} />
              </div>
              <div>
                <h3 className="font-bold text-heading">Destinos de Publicação</h3>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Selecione onde os Reels serão publicados
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Instagram toggle */}
              <div
                className="flex items-center justify-between p-4 rounded-xl transition-all cursor-pointer"
                style={{
                  background: settings.instagram_enabled ? "var(--instagram-bg)" : "var(--surface-2)",
                  border: `1px solid ${settings.instagram_enabled ? "rgba(228,64,95,0.3)" : "var(--surface-border)"}`,
                }}
                onClick={() => updateSetting("instagram_enabled", !settings.instagram_enabled)}
              >
                <div className="flex items-center gap-3">
                  <Instagram className="w-5 h-5" style={{ color: settings.instagram_enabled ? "var(--instagram)" : "var(--text-muted)" }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: settings.instagram_enabled ? "white" : "var(--text-muted)" }}>
                      Instagram Reels
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      Publica como Reel na sua conta
                    </p>
                  </div>
                </div>
                <div
                  className="w-10 h-5 rounded-full transition-colors"
                  style={{ background: settings.instagram_enabled ? "var(--instagram)" : "var(--surface-3)" }}
                >
                  <span
                    className="block w-3.5 h-3.5 rounded-full bg-white mt-[3px] transition-transform"
                    style={{ marginLeft: settings.instagram_enabled ? "22px" : "3px" }}
                  />
                </div>
              </div>

              {/* Facebook toggle */}
              <div
                className="flex items-center justify-between p-4 rounded-xl transition-all cursor-pointer"
                style={{
                  background: settings.facebook_enabled ? "var(--facebook-bg)" : "var(--surface-2)",
                  border: `1px solid ${settings.facebook_enabled ? "rgba(24,119,242,0.3)" : "var(--surface-border)"}`,
                }}
                onClick={() => updateSetting("facebook_enabled", !settings.facebook_enabled)}
              >
                <div className="flex items-center gap-3">
                  <Facebook className="w-5 h-5" style={{ color: settings.facebook_enabled ? "var(--facebook)" : "var(--text-muted)" }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: settings.facebook_enabled ? "white" : "var(--text-muted)" }}>
                      Facebook Page
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      Publica como vídeo na sua página
                    </p>
                  </div>
                </div>
                <div
                  className="w-10 h-5 rounded-full transition-colors"
                  style={{ background: settings.facebook_enabled ? "var(--facebook)" : "var(--surface-3)" }}
                >
                  <span
                    className="block w-3.5 h-3.5 rounded-full bg-white mt-[3px] transition-transform"
                    style={{ marginLeft: settings.facebook_enabled ? "22px" : "3px" }}
                  />
                </div>
              </div>
            </div>

            {/* Caption template */}
            <div>
              <label className="label">Template de Legenda (opcional)</label>
              <textarea
                value={settings.custom_caption_template}
                onChange={(e) => updateSetting("custom_caption_template", e.target.value)}
                placeholder="Use {caption} para a legenda original e {hashtags} para hashtags..."
                rows={3}
                className="input"
                style={{ resize: "vertical", minHeight: "80px" }}
              />
              <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                Variáveis: {"{caption}"}, {"{hashtags}"}
              </p>
            </div>
          </motion.div>

          {/* ── Page Selection Modal ─────────────────────────── */}
          {showPageSelector && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="card w-full max-w-lg max-h-[80vh] overflow-y-auto space-y-4">
                <h3 className="text-lg font-bold text-heading">Selecione a Página do Facebook</h3>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Selecione qual página (e conta do Instagram vinculada) deseja utilizar para postagens automáticas. Apenas páginas com Instagram Business correspondente são listadas.
                </p>
                
                <div className="space-y-3">
                  {availablePages.map((page) => (
                    <div
                      key={page.id}
                      onClick={() => handleSelectPage(page.id)}
                      className="p-4 rounded-xl border border-surface-border bg-surface-2 hover:bg-surface-3 transition-colors cursor-pointer flex items-center justify-between"
                    >
                      <div className="space-y-1">
                        <p className="font-bold text-heading text-sm">{page.name}</p>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>Facebook ID: {page.id}</p>
                        {page.instagram_business_account ? (
                          <div className="flex items-center gap-1.5 text-xs text-purple-400 mt-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                            <span>Instagram: @{page.instagram_business_account.username}</span>
                          </div>
                        ) : (
                          <p className="text-xs text-amber-500 mt-1">⚠️ Sem Instagram Business vinculado</p>
                        )}
                      </div>
                      <span className="text-xs btn btn-secondary btn-sm">Selecionar</span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setShowPageSelector(false)} className="btn btn-secondary btn-sm">
                    Cancelar
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
