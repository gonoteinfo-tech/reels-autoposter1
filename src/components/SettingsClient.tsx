"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  Sparkles,
  Smartphone,
  Tag,
} from "lucide-react";
import { Instagram, Facebook } from "@/components/icons";

import Sidebar from "@/components/Sidebar";
import type { AppSettings, User } from "@/types";

const POSITIONS = [
  { value: "top-left", label: "Superior Esquerdo" },
  { value: "top-right", label: "Superior Direito" },
  { value: "center", label: "Centro" },
  { value: "bottom-left", label: "Inferior Esquerdo" },
  { value: "bottom-right", label: "Inferior Direito" },
];

const CRON_PRESETS = [
  { value: "*/15 * * * *", label: "A cada 15 minutos" },
  { value: "*/30 * * * *", label: "A cada 30 minutos (Recomendado)" },
  { value: "0 * * * *", label: "A cada 1 hora" },
  { value: "0 */3 * * *", label: "A cada 3 horas" },
  { value: "0 */6 * * *", label: "A cada 6 horas" },
  { value: "0 0 * * *", label: "Uma vez ao dia (00:00)" },
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

export default function SettingsClient({ user }: { user: User }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estados para OAuth e Seleção de Páginas
  const [availablePages, setAvailablePages] = useState<any[]>([]);
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
        setError("Nenhuma página detectada. Certifique-se de que autorizou as permissões do Facebook.");
      }
    } catch {
      setError("Erro ao carregar lista de páginas do Facebook.");
    } finally {
      setLoadingPages(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    
    // Check if redirect returned from OAuth login
    const urlParams = new URLSearchParams(window.location.search);
    const authStatus = urlParams.get("auth");
    if (authStatus === "success") {
      fetchPages();
      window.history.replaceState({}, document.title, "/dashboard/settings");
    } else if (authStatus === "error") {
      const msg = urlParams.get("message") || "Erro na autenticação";
      setError(`Falha ao conectar com o Facebook: ${msg}`);
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
  }, [fetchSettings, fetchPages, user.id]);

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
        if (data.data) {
          setSettings({ ...DEFAULT_SETTINGS, ...data.data });
        }
      } else {
        setError(data.error || "Erro ao salvar configurações");
      }
    } catch (err) {
      setError(`Erro de conexão: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleConnectFacebook = async () => {
    try {
      const origin = window.location.origin;
      const res = await fetch(`/api/auth/facebook?origin=${encodeURIComponent(origin)}`);
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

  const handleDisconnectFacebook = () => {
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
      const res = await fetch("/api/upload-logo", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setLogoPreview(data.data.path + "?t=" + Date.now());
      }
    } catch {
      setError("Erro ao enviar imagem da logo");
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

  const appendTagToTemplate = (tag: string) => {
    const current = settings.custom_caption_template || "";
    updateSetting("custom_caption_template", current ? `${current} ${tag}` : tag);
  };

  // Helper for watermark preview positioning style
  const getWatermarkPositionClasses = () => {
    switch (settings.logo_position) {
      case "top-left": return "top-4 left-4";
      case "top-right": return "top-4 right-4";
      case "bottom-left": return "bottom-4 left-4";
      case "center": return "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2";
      case "bottom-right":
      default: return "bottom-4 right-4";
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
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
              <Settings className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white tracking-tight">Configurações</h2>
              <p className="text-[11px] text-slate-400 hidden sm:block">Parâmetros de postagem, agendamento e marca d&apos;água</p>
            </div>
          </div>
          <button
            onClick={() => handleSave()}
            disabled={saving}
            className="btn btn-primary btn-sm px-4"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : saved ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>{saved ? "Alterações Salvas!" : "Salvar Alterações"}</span>
          </button>
        </div>

        <div className="p-5 lg:p-7 max-w-5xl mx-auto w-full space-y-6">
          {/* Error Alert */}
          {error && (
            <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* ── Section 1: Marca d'Água Interativa ────────────────────── */}
          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.08] backdrop-blur-md space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                <ImageIcon className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h3 className="font-extrabold text-white text-sm sm:text-base">Logo & Marca d&apos;água Dinâmica</h3>
                <p className="text-xs text-slate-400">
                  Defina o posicionamento e o tamanho da sua logo em vídeo 9:16
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              {/* Phone Mockup Preview */}
              <div className="lg:col-span-5 flex justify-center">
                <div className="relative w-56 aspect-[9/16] rounded-3xl bg-zinc-950 border-4 border-zinc-800 shadow-[0_20px_50px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col items-center justify-between p-3">
                  {/* Top Notch / Speaker */}
                  <div className="w-16 h-3 rounded-full bg-zinc-800/80 mb-2" />

                  {/* Video Mock Background */}
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/60 via-purple-950/30 to-zinc-950 flex flex-col items-center justify-center p-4 text-center">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-slate-600">
                      Prévia do Reel (9:16)
                    </span>
                  </div>

                  {/* Watermark Logo Element */}
                  <div className={`absolute z-10 ${getWatermarkPositionClasses()} transition-all duration-300 pointer-events-none`}>
                    {logoPreview ? (
                      <img
                        src={logoPreview}
                        alt="Watermark"
                        style={{ width: `${Math.max(24, Math.round(settings.logo_scale * 0.4))}px` }}
                        className="object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]"
                      />
                    ) : (
                      <div
                        style={{ width: `${Math.max(28, Math.round(settings.logo_scale * 0.4))}px` }}
                        className="p-1 rounded bg-purple-600 text-white font-black text-[8px] text-center shadow-md"
                      >
                        LOGO
                      </div>
                    )}
                  </div>

                  {/* Bottom Home Indicator */}
                  <div className="w-20 h-1 rounded-full bg-zinc-700/60 mt-auto" />
                </div>
              </div>

              {/* Controls */}
              <div className="lg:col-span-7 space-y-5">
                {/* Upload Section */}
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center overflow-hidden p-2">
                      {logoPreview ? (
                        <img src={logoPreview} alt="Logo" className="max-w-full max-h-full object-contain" />
                      ) : (
                        <Upload className="w-5 h-5 text-slate-500" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">Arquivo da Marca (PNG)</p>
                      <p className="text-[11px] text-slate-400">Recomendado formato PNG transparente</p>
                    </div>
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
                    className="btn btn-secondary btn-sm"
                  >
                    {uploadingLogo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    <span>{logoPreview ? "Trocar Imagem" : "Enviar PNG"}</span>
                  </button>
                </div>

                {/* Interactive Position Buttons */}
                <div>
                  <label className="label mb-2">Posição na Tela do Reel</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {POSITIONS.map((p) => {
                      const isSelected = settings.logo_position === p.value;
                      return (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => updateSetting("logo_position", p.value as any)}
                          className={`p-2.5 rounded-xl border text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                            isSelected
                              ? "bg-purple-600/20 border-purple-500 text-purple-200 shadow-sm"
                              : "bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-white hover:bg-white/[0.04]"
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${isSelected ? "bg-purple-400" : "bg-zinc-600"}`} />
                          <span>{p.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Scale Slider */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="label mb-0">Escala da Logo</label>
                    <span className="text-xs font-bold text-purple-400">{settings.logo_scale}px de largura</span>
                  </div>
                  <input
                    type="range"
                    min={30}
                    max={200}
                    value={settings.logo_scale}
                    onChange={(e) => updateSetting("logo_scale", Number(e.target.value))}
                    className="w-full accent-purple-500 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── Section 2: Conexão com a Meta (Facebook & Instagram) ───── */}
          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.08] backdrop-blur-md space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <Link2 className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="font-extrabold text-white text-sm sm:text-base">Conexão Meta (Instagram & Facebook)</h3>
                <p className="text-xs text-slate-400">
                  Integração oficial via API do Instagram Graph para publicação automática
                </p>
              </div>
            </div>

            {settings.facebook_page_id ? (
              <div className="p-4 rounded-xl border border-emerald-500/25 bg-emerald-500/5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Conta Conectada</span>
                  </div>
                  <button
                    onClick={handleDisconnectFacebook}
                    className="btn btn-danger btn-sm text-xs py-1"
                  >
                    <Unlink className="w-3 h-3" />
                    <span>Desconectar</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl bg-black/40 border border-white/[0.06]">
                    <div className="flex items-center gap-2 mb-1">
                      <Facebook className="w-4 h-4 text-[#1877f2]" />
                      <p className="text-xs font-semibold text-slate-400">Página do Facebook</p>
                    </div>
                    <p className="font-extrabold text-white text-sm">{settings.facebook_page_name || "Vinculada"}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">ID: {settings.facebook_page_id}</p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-black/40 border border-white/[0.06]">
                    <div className="flex items-center gap-2 mb-1">
                      <Instagram className="w-4 h-4 text-[#e1306c]" />
                      <p className="text-xs font-semibold text-slate-400">Instagram Business</p>
                    </div>
                    <p className="font-extrabold text-white text-sm">@{settings.instagram_username || "Vinculado"}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">ID: {settings.instagram_business_account_id}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center space-y-3">
                <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
                  Conecte seu perfil corporativo para habilitar postagens automáticas no Instagram Reels e página do Facebook simultaneamente.
                </p>
                <button
                  onClick={handleConnectFacebook}
                  disabled={loadingPages}
                  className="btn btn-primary text-xs py-2 px-5 rounded-xl shadow-lg"
                >
                  {loadingPages ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                  <span>Conectar Conta Meta</span>
                </button>
              </div>
            )}
          </div>

          {/* ── Section 3: Agendamento & Frequência ─────────────────────── */}
          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.08] backdrop-blur-md space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="font-extrabold text-white text-sm sm:text-base">Ciclos de Automação & Limites</h3>
                <p className="text-xs text-slate-400">
                  Ajuste a frequência de varredura das fontes e intervalo de publicação
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Frequência da Automação (Cron)</label>
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
                <label className="label">Vídeos Descobertos por Ciclo</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={settings.discovery_limit}
                  onChange={(e) => updateSetting("discovery_limit", Number(e.target.value))}
                  className="input"
                />
              </div>

              <div>
                <label className="label">Intervalo Mínimo entre Postagens (minutos)</label>
                <input
                  type="number"
                  min={0}
                  max={1440}
                  value={settings.publish_interval_minutes}
                  onChange={(e) => updateSetting("publish_interval_minutes", Number(e.target.value))}
                  className="input"
                />
                <p className="text-[11px] text-slate-500 mt-1">Evita múltiplos posts em sequência (ex: 30 min).</p>
              </div>

              <div>
                <label className="label">Intervalo de Varredura por Perfil (minutos)</label>
                <input
                  type="number"
                  min={5}
                  max={1440}
                  value={settings.discovery_interval_minutes}
                  onChange={(e) => updateSetting("discovery_interval_minutes", Number(e.target.value))}
                  className="input"
                />
                <p className="text-[11px] text-slate-500 mt-1">Economiza cotas de scraping da Apify.</p>
              </div>
            </div>

            {/* Auto Publish Switch */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="flex items-center gap-3">
                <Zap className="w-4 h-4 text-purple-400" />
                <div>
                  <p className="text-xs font-bold text-white">Publicação Totalmente Automática</p>
                  <p className="text-[11px] text-slate-400">
                    Publica os vídeos processados no Instagram/Facebook assim que ficarem prontos
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => updateSetting("auto_publish", !settings.auto_publish)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  settings.auto_publish ? "bg-purple-600 shadow-[0_0_12px_rgba(147,51,234,0.5)]" : "bg-zinc-800"
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    settings.auto_publish ? "left-7" : "left-1"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* ── Section 4: Template de Legenda ─────────────────────────── */}
          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.08] backdrop-blur-md space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center">
                <Tag className="w-5 h-5 text-pink-400" />
              </div>
              <div>
                <h3 className="font-extrabold text-white text-sm sm:text-base">Template e Prefixo de Legendas</h3>
                <p className="text-xs text-slate-400">
                  Personalize o texto que acompanha cada vídeo postado
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400">Inserir tags rápidas:</span>
                <button
                  type="button"
                  onClick={() => appendTagToTemplate("{caption}")}
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 transition-colors"
                >
                  + {"{caption}"}
                </button>
                <button
                  type="button"
                  onClick={() => appendTagToTemplate("{hashtags}")}
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30 hover:bg-pink-500/30 transition-colors"
                >
                  + {"{hashtags}"}
                </button>
              </div>

              <textarea
                value={settings.custom_caption_template}
                onChange={(e) => updateSetting("custom_caption_template", e.target.value)}
                placeholder="Ex: Assista até o final! 🔥&#10;&#10;{caption}&#10;&#10;Siga nossa página para mais vídeos como este!&#10;&#10;{hashtags}"
                rows={4}
                className="input resize-none text-white placeholder-slate-500"
              />
            </div>
          </div>

          {/* Page Selection Modal */}
          {showPageSelector && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-full max-w-lg p-6 rounded-2xl bg-[#12121c] border border-white/10 shadow-[0_25px_60px_rgba(0,0,0,0.8)] space-y-4"
              >
                <h3 className="text-base font-extrabold text-white">Selecione a Página do Facebook</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Selecione qual página deseja vincular para o envio automático de vídeos.
                </p>
                
                <div className="space-y-2.5 max-h-72 overflow-y-auto">
                  {availablePages.map((page) => (
                    <div
                      key={page.id}
                      onClick={() => handleSelectPage(page.id)}
                      className="p-3.5 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] transition-colors cursor-pointer flex items-center justify-between"
                    >
                      <div>
                        <p className="font-bold text-white text-sm">{page.name}</p>
                        <p className="text-[11px] text-slate-500">Facebook ID: {page.id}</p>
                        {page.instagram_business_account ? (
                          <p className="text-xs text-purple-400 mt-0.5">Instagram: @{page.instagram_business_account.username}</p>
                        ) : (
                          <p className="text-xs text-amber-400 mt-0.5">⚠️ Sem Instagram Business vinculado</p>
                        )}
                      </div>
                      <span className="btn btn-secondary btn-sm text-xs">Conectar</span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setShowPageSelector(false)} className="btn btn-secondary btn-sm">
                    Fechar
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
