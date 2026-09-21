import { getLoggedInUser } from "@/services/auth";
import Link from "next/link";
import { 
  Zap, 
  Shield, 
  Play, 
  Clock, 
  Sparkles, 
  Layers, 
  ArrowRight, 
  CheckCircle2, 
  HelpCircle, 
  Flame, 
  TrendingUp, 
  Scissors,
  Check,
  Plus,
  AlertCircle,
  Smartphone,
  Video,
  ChevronRight,
  ShieldCheck,
  Globe,
} from "lucide-react";
import { Instagram, Facebook, TikTok, YouTube } from "@/components/icons";

interface PageProps {
  searchParams: Promise<{ error?: string; details?: string }>;
}

export default async function LandingPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const error = searchParams.error;
  const details = searchParams.details;
  const user = await getLoggedInUser();
  const ctaLink = user ? "/dashboard" : "/api/auth/facebook/login";
  const ctaText = user ? "Acessar Painel" : "Criar Conta Grátis";

  return (
    <div className="landing-page min-h-screen text-white relative overflow-hidden bg-[#09090d] selection:bg-purple-500 selection:text-white">
      {/* Dynamic Ambient Background Glows */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-15%] left-[10%] w-[500px] h-[500px] rounded-full bg-purple-600/15 blur-[120px]" />
        <div className="absolute top-[30%] right-[5%] w-[600px] h-[600px] rounded-full bg-pink-600/10 blur-[140px]" />
        <div className="absolute bottom-[10%] left-[20%] w-[500px] h-[500px] rounded-full bg-orange-600/10 blur-[130px]" />
      </div>

      {/* Floating Header */}
      <header className="sticky top-0 z-50 bg-[#09090d]/80 backdrop-blur-xl border-b border-white/[0.08] transition-all">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500 flex items-center justify-center shadow-[0_0_20px_rgba(139,92,246,0.35)]">
              <Zap className="w-5 h-5 text-white fill-white" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-black tracking-tight text-white">GO POST</span>
              <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                2.0
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-xs font-semibold tracking-wide text-slate-400">
            <a href="#features" className="hover:text-white transition-colors">Recursos</a>
            <a href="#how-it-works" className="hover:text-white transition-colors">Como Funciona</a>
            <a href="#pricing" className="hover:text-white transition-colors">Planos</a>
            <a href="#faq" className="hover:text-white transition-colors">Dúvidas</a>
          </nav>

          <div className="flex items-center gap-3">
            {user ? (
              <Link 
                href="/dashboard" 
                className="px-4 py-2 rounded-xl text-xs font-bold bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-white transition-all flex items-center gap-1.5"
              >
                <span>Painel</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <Link 
                href="/api/auth/facebook/login" 
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white transition-colors"
              >
                Entrar
              </Link>
            )}
            <Link 
              href={ctaLink} 
              className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 hover:brightness-110 text-white shadow-[0_0_25px_rgba(139,92,246,0.4)] transition-all flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5 fill-white" />
              <span>{ctaText}</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 pt-20 pb-20 px-6 max-w-7xl mx-auto text-center flex flex-col items-center">
        {/* Error Notification if any */}
        {error && (
          <div className="mb-8 p-4 rounded-2xl border border-red-500/30 bg-red-500/10 text-red-200 text-xs max-w-2xl text-left flex items-start gap-3 backdrop-blur-md">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-white mb-0.5">Falha na Autenticação</h4>
              <p className="text-red-300">
                {error === 'callback_error' && 'Erro ao processar o retorno do Google. Verifique o cadastro ou tente novamente.'}
                {error === 'oauth_failed' && 'O Google retornou um erro durante a autorização.'}
                {error === 'facebook_error' && 'Não foi possível entrar com o Facebook. Tente novamente.'}
                {error === 'server_configuration' && 'Erro de configuração do login (chaves ausentes no servidor).'}
                {error === 'not_authenticated' && 'Sua sessão expirou. Conecte-se novamente para continuar.'}
                {!['callback_error', 'oauth_failed', 'facebook_error', 'server_configuration', 'not_authenticated'].includes(error) && `Erro: ${error}`}
              </p>
              {details && (
                <pre className="mt-2 p-2 rounded bg-black/50 border border-white/5 text-[10px] text-slate-400 overflow-x-auto whitespace-pre-wrap font-mono">
                  {details}
                </pre>
              )}
            </div>
          </div>
        )}

        {/* Shiny Badge Pill */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 text-xs font-semibold mb-8 backdrop-blur-md shadow-[0_0_20px_rgba(139,92,246,0.15)]">
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          <span>Automação Inteligente de Reels & Shorts 2.0</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        </div>
        
        {/* Main Headline */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight text-white max-w-4xl leading-[1.08]">
          Publique Vídeos Virais <br />
          <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400 bg-clip-text text-fill-transparent">
            100% no Piloto Automático
          </span>
        </h1>
        
        {/* Subtitle */}
        <p className="mt-6 text-base sm:text-lg text-slate-400 max-w-2xl leading-relaxed">
          Monitore perfis de referência, baixe vídeos automaticamente, aplique sua marca d&apos;água com FFmpeg, reescreva legendas com Inteligência Artificial e publique no Instagram e Facebook sem esforço manual.
        </p>

        {/* CTA Group */}
        <div className="mt-10 flex flex-col sm:flex-row gap-3.5 items-center justify-center w-full sm:w-auto">
          <Link 
            href={ctaLink} 
            className="w-full sm:w-auto px-8 py-4 rounded-2xl text-sm font-extrabold bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 hover:brightness-110 text-white shadow-[0_0_35px_rgba(139,92,246,0.4)] transition-all flex items-center justify-center gap-2 group"
          >
            {!user && <Facebook className="w-4 h-4" />}
            <span>{user ? ctaText : "Entrar com Facebook"}</span>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <a 
            href="#how-it-works" 
            className="w-full sm:w-auto px-7 py-4 rounded-2xl text-sm font-bold bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-300 hover:text-white transition-all flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4 text-purple-400" />
            <span>Ver Como Funciona</span>
          </a>
        </div>
        {!user && (
          <p className="mt-4 text-xs text-slate-500">
            Prefere outra forma?{" "}
            <Link href="/api/auth/google" className="font-semibold text-slate-300 hover:text-white underline underline-offset-2">
              Entrar com Google
            </Link>
          </p>
        )}

        {/* Interactive Dashboard Mockup Preview */}
        <div className="mt-16 w-full max-w-5xl rounded-3xl border border-white/[0.12] bg-white/[0.02] p-2.5 shadow-[0_25px_80px_rgba(0,0,0,0.8)] backdrop-blur-md relative overflow-hidden group">
          {/* Top subtle glow */}
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-32 bg-purple-500/20 blur-3xl pointer-events-none" />

          <div className="w-full rounded-2xl bg-[#0c0c13] border border-white/[0.06] p-6 lg:p-8 flex flex-col gap-6">
            {/* Mock Header */}
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-red-500/70" />
                  <span className="w-3 h-3 rounded-full bg-yellow-500/70" />
                  <span className="w-3 h-3 rounded-full bg-green-500/70" />
                </div>
                <span className="text-xs font-mono text-slate-500 ml-2">app.gopost.com/dashboard</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Scheduler Ativo (a cada 30 min)
                </span>
              </div>
            </div>

            {/* Mock Pipeline Steps */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-left">
                <p className="text-[10px] uppercase font-bold text-slate-500">1. Descoberta</p>
                <p className="text-lg font-black text-white mt-1">12 Vídeos</p>
                <p className="text-[10px] text-blue-400 mt-0.5">Scraping em 4 fontes</p>
              </div>
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-left">
                <p className="text-[10px] uppercase font-bold text-slate-500">2. FFmpeg & Logo</p>
                <p className="text-lg font-black text-white mt-1">1080x1920</p>
                <p className="text-[10px] text-purple-400 mt-0.5">Watermark aplicada</p>
              </div>
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-left">
                <p className="text-[10px] uppercase font-bold text-slate-500">3. Legendas IA</p>
                <p className="text-lg font-black text-white mt-1">Virais</p>
                <p className="text-[10px] text-pink-400 mt-0.5">Hashtags automáticas</p>
              </div>
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-left">
                <p className="text-[10px] uppercase font-bold text-slate-500">4. Publicado</p>
                <p className="text-lg font-black text-emerald-400 mt-1">Instagram + FB</p>
                <p className="text-[10px] text-slate-400 mt-0.5">API Graph Oficial</p>
              </div>
            </div>

            {/* Visual Pipeline Bar */}
            <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-500/20 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-600/30 flex items-center justify-center text-purple-400">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-bold text-white">Autopilot 100% em Nuvem</p>
                  <p className="text-[11px] text-slate-400">Seu canal rodando 24 horas por dia sem precisar de computador ligado</p>
                </div>
              </div>
              <span className="text-xs font-bold text-purple-300 bg-purple-500/20 px-3 py-1.5 rounded-lg border border-purple-500/30">
                Postagem Automática Habilitada
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Counter Ribbon */}
      <section className="border-y border-white/[0.08] bg-white/[0.01] backdrop-blur-md py-10 px-6 relative z-10">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          <div>
            <h4 className="text-3xl sm:text-4xl font-black text-white tracking-tight">100%</h4>
            <p className="mt-1 text-xs sm:text-sm text-slate-400 font-medium">Automatizado em Nuvem</p>
          </div>
          <div>
            <h4 className="text-3xl sm:text-4xl font-black text-purple-400 tracking-tight">10x</h4>
            <p className="mt-1 text-xs sm:text-sm text-slate-400 font-medium">Mais Rápido que Manual</p>
          </div>
          <div>
            <h4 className="text-3xl sm:text-4xl font-black text-pink-400 tracking-tight">&lt; 3 Min</h4>
            <p className="mt-1 text-xs sm:text-sm text-slate-400 font-medium">Configuração Completa</p>
          </div>
          <div>
            <h4 className="text-3xl sm:text-4xl font-black text-orange-400 tracking-tight">4+ Redes</h4>
            <p className="mt-1 text-xs sm:text-sm text-slate-400 font-medium">Monitoramento de Vídeos</p>
          </div>
        </div>
      </section>

      {/* Bento Grid Features */}
      <section id="features" className="py-24 px-6 max-w-7xl mx-auto space-y-16 relative z-10">
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Recursos Avançados</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            Tudo para escalar sua audiência <br />
            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-fill-transparent">
              sem esforço manual
            </span>
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            Elimine horas diárias caçando conteúdo, renderizando no celular e subindo manualmente. O GO POST resolve tudo no servidor.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1 */}
          <div className="p-7 rounded-3xl bg-white/[0.02] border border-white/[0.08] hover:border-purple-500/40 transition-all hover:-translate-y-1 duration-300 space-y-4 relative overflow-hidden group">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Globe className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-extrabold text-white">Fontes Multiplataforma</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Monitore perfis de criadores de conteúdo do <strong>Instagram</strong>, <strong>TikTok</strong>, <strong>YouTube Shorts</strong> ou <strong>Facebook</strong>. O robô faz a varredura contínua e puxa os virais.
            </p>
          </div>

          {/* Card 2 */}
          <div className="p-7 rounded-3xl bg-white/[0.02] border border-white/[0.08] hover:border-pink-500/40 transition-all hover:-translate-y-1 duration-300 space-y-4 relative overflow-hidden group">
            <div className="w-12 h-12 rounded-2xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400">
              <Scissors className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-extrabold text-white">Marca d&apos;água com FFmpeg</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Envie sua logo transparente em PNG e configure o posicionamento (superior, inferior ou centro). O motor FFmpeg aplica sua marca com qualidade cristalina em 1080p.
            </p>
          </div>

          {/* Card 3 */}
          <div className="p-7 rounded-3xl bg-white/[0.02] border border-white/[0.08] hover:border-orange-500/40 transition-all hover:-translate-y-1 duration-300 space-y-4 relative overflow-hidden group">
            <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-extrabold text-white">Legendas Inteligentes com IA</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Nosso motor reescreve automaticamente as legendas originais dos vídeos, elimina menções a outros criadores e insere hashtags e chamadas para ação personalizadas.
            </p>
          </div>

          {/* Card 4 */}
          <div className="p-7 rounded-3xl bg-white/[0.02] border border-white/[0.08] hover:border-emerald-500/40 transition-all hover:-translate-y-1 duration-300 space-y-4 relative overflow-hidden group">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Clock className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-extrabold text-white">Trava de Ritmo & Fila</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Controle o intervalo exato entre as postagens (ex: 30 minutos ou 1 hora). O sistema respeita o algoritmo das redes sociais, prevenindo penalizações por excesso de frequência.
            </p>
          </div>

          {/* Card 5 */}
          <div className="p-7 rounded-3xl bg-white/[0.02] border border-white/[0.08] hover:border-blue-500/40 transition-all hover:-translate-y-1 duration-300 space-y-4 relative overflow-hidden group">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Facebook className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-extrabold text-white">Postagem Cruzada Meta API</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Integração oficial via Meta Graph API. Publique no seu perfil comercial do Instagram e na sua página do Facebook ao mesmo tempo, duplicando seu alcance orgânico.
            </p>
          </div>

          {/* Card 6 */}
          <div className="p-7 rounded-3xl bg-white/[0.02] border border-white/[0.08] hover:border-amber-500/40 transition-all hover:-translate-y-1 duration-300 space-y-4 relative overflow-hidden group">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-extrabold text-white">Segurança & Isolamento</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Cada usuário possui seu próprio ecossistema isolado de fontes, histórico de reels e tokens de autenticação protegidos pelo login oficial do Facebook ou do Google.
            </p>
          </div>
        </div>
      </section>

      {/* How it Works / 4-Step Timeline */}
      <section id="how-it-works" className="py-24 px-6 max-w-7xl mx-auto space-y-16 relative z-10">
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-pink-500/10 text-pink-400 border border-pink-500/20">
            <Layers className="w-3.5 h-3.5" />
            <span>Fluxo Completo</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            Como Funciona o Pipeline
          </h2>
          <p className="text-sm text-slate-400">
            Da descoberta do conteúdo até a postagem concluída nas suas redes sociais
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { step: "01", title: "Descoberta", desc: "O robô monitora as fontes cadastradas e identifica Reels recém-postados de alto engajamento.", color: "text-purple-400", border: "border-purple-500/30" },
            { step: "02", title: "Download & Logo", desc: "O vídeo é transferido para a nuvem e o FFmpeg adiciona a sua marca d'água profissional com precisão.", color: "text-pink-400", border: "border-pink-500/30" },
            { step: "03", title: "Reescrita com IA", desc: "A IA formula uma legenda inédita em português com hashtags virais e formatação atraente.", color: "text-orange-400", border: "border-orange-500/30" },
            { step: "04", title: "Publicação Oficial", desc: "A Meta Graph API publica o Reel pronto diretamente no seu Instagram e página do Facebook.", color: "text-emerald-400", border: "border-emerald-500/30" },
          ].map((item) => (
            <div key={item.step} className="p-6 rounded-3xl bg-white/[0.02] border border-white/[0.08] space-y-3 relative group hover:border-white/20 transition-all">
              <span className={`text-2xl font-black ${item.color}`}>{item.step}</span>
              <h4 className="text-base font-bold text-white">{item.title}</h4>
              <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 px-6 max-w-7xl mx-auto space-y-16 relative z-10">
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/20">
            <Zap className="w-3.5 h-3.5" />
            <span>Planos & Preços</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            Escolha o Plano Ideal para seu Negócio
          </h2>
          <p className="text-sm text-slate-400">
            Comece grátis para testar e escale quando estiver pronto. Cancele quando quiser.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto items-stretch">
          {/* Plan 1: Starter */}
          <div className="p-8 rounded-3xl bg-white/[0.02] border border-white/[0.08] flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">Starter</span>
              <h3 className="text-2xl font-extrabold text-white">Iniciante</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-black text-white">R$ 49</span>
                <span className="text-xs text-slate-400">/mês</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Para quem está começando e quer testar a consistência diária.
              </p>
              <div className="border-t border-white/[0.06] my-4" />
              <ul className="space-y-3 text-xs text-slate-300">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-purple-400" /> Até 3 fontes monitoradas</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-purple-400" /> Publicação no Instagram Reels</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-purple-400" /> Marca d&apos;água FFmpeg personalizada</li>
                <li className="flex items-center gap-2 text-slate-500"><Check className="w-4 h-4 text-slate-700" /> Sem postagem em Facebook Pages</li>
              </ul>
            </div>
            <Link 
              href={ctaLink} 
              className="w-full py-3.5 rounded-xl text-center text-xs font-bold bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-white transition-all"
            >
              Começar Agora
            </Link>
          </div>

          {/* Plan 2: Pro Autopilot (Popular Highlight) */}
          <div className="p-8 rounded-3xl bg-gradient-to-b from-purple-950/40 via-white/[0.03] to-pink-950/20 border-2 border-purple-500/60 shadow-[0_0_50px_rgba(139,92,246,0.25)] flex flex-col justify-between space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-gradient-to-l from-purple-600 to-pink-600 text-white text-[10px] font-extrabold px-3 py-1 rounded-bl-xl uppercase tracking-wider shadow-md">
              Mais Popular
            </div>
            <div className="space-y-4">
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-purple-400">Autopilot</span>
              <h3 className="text-2xl font-extrabold text-white">PRO Automação</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-black text-white">R$ 89</span>
                <span className="text-xs text-slate-400">/mês</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Ideal para criadores e negócios que querem escala orgânica em múltiplas redes.
              </p>
              <div className="border-t border-purple-500/20 my-4" />
              <ul className="space-y-3 text-xs text-slate-200 font-medium">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-purple-400" /> Até 10 fontes de vídeo simultâneas</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-purple-400" /> Instagram Reels + Páginas do Facebook</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-purple-400" /> Geração de Legendas com IA</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-purple-400" /> Agendamento e trava de ritmo inteligente</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-purple-400" /> Suporte prioritário</li>
              </ul>
            </div>
            <Link 
              href={ctaLink} 
              className="w-full py-3.5 rounded-xl text-center text-xs font-extrabold bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 hover:brightness-110 text-white shadow-[0_0_25px_rgba(139,92,246,0.4)] transition-all flex items-center justify-center gap-2"
            >
              <Zap className="w-3.5 h-3.5 fill-white" />
              <span>Assinar Plano PRO</span>
            </Link>
          </div>

          {/* Plan 3: Agency Scale */}
          <div className="p-8 rounded-3xl bg-white/[0.02] border border-white/[0.08] flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">Scale</span>
              <h3 className="text-2xl font-extrabold text-white">Agência</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-black text-white">R$ 179</span>
                <span className="text-xs text-slate-400">/mês</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Para quem gerencia múltiplos perfis e precisa de capacidade máxima.
              </p>
              <div className="border-t border-white/[0.06] my-4" />
              <ul className="space-y-3 text-xs text-slate-300">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-purple-400" /> Fontes de origem Ilimitadas</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-purple-400" /> Até 5 contas Meta conectadas</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-purple-400" /> IA ilimitada para legendas virais</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-purple-400" /> Acesso prioritário a novas funcionalidades</li>
              </ul>
            </div>
            <Link 
              href={ctaLink} 
              className="w-full py-3.5 rounded-xl text-center text-xs font-bold bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-white transition-all"
            >
              Começar com Agência
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ Accordion Section */}
      <section id="faq" className="py-24 px-6 max-w-4xl mx-auto space-y-12 relative z-10">
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Tire Suas Dúvidas</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            Perguntas Frequentes
          </h2>
        </div>

        <div className="space-y-3.5">
          {[
            {
              q: "Preciso manter meu computador ligado para as postagens acontecerem?",
              a: "Não. O GO POST roda 100% na nuvem. Depois de conectar suas contas e cadastrar seus perfis de referência, os vídeos são capturados, editados e publicados automaticamente na frequência configurada, mesmo que seu computador esteja desligado."
            },
            {
              q: "A conexão com o Facebook e Instagram é segura?",
              a: "Sim, absolutamente. Utilizamos o fluxo oficial da Meta Graph API (Facebook Login oficial). Nós nunca temos acesso à sua senha pessoal da Meta; apenas armazenamos os tokens de publicação oficiais emitidos pelo próprio Facebook."
            },
            {
              q: "Como a marca d'água é inserida nos vídeos?",
              a: "Você envia sua logo em formato PNG com fundo transparente. Nosso motor FFmpeg adiciona a logo diretamente aos quadros do vídeo na posição escolhida (superior, inferior ou centro) com nitidez e escala perfeita."
            },
            {
              q: "Existe risco de bloqueio ou banimento da conta?",
              a: "Como usamos a API Oficial da Meta para realizar as publicações (a mesma utilizada por grandes plataformas de mídia), não há risco de bloqueio por detecção de bots de emulador ou cliques na tela. Além disso, a trava de ritmo impede postagens em excesso."
            },
          ].map((item, index) => (
            <details 
              key={index}
              className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.08] group cursor-pointer transition-all hover:border-purple-500/30"
            >
              <summary className="flex items-center justify-between font-bold text-white text-sm list-none">
                <span>{item.q}</span>
                <span className="p-1 rounded-lg bg-white/[0.04] text-purple-400 group-open:rotate-45 transition-transform duration-200">
                  <Plus className="w-4 h-4" />
                </span>
              </summary>
              <p className="mt-3 text-xs text-slate-400 leading-relaxed pt-2 border-t border-white/[0.04]">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.08] py-12 px-6 max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white fill-white" />
          </div>
          <span className="font-extrabold text-white text-sm">GO POST</span>
          <span className="text-[10px] text-slate-500">v2.0</span>
        </div>

        <p className="text-xs text-slate-500">
          &copy; {new Date().getFullYear()} GO POST AutoPoster. Todos os direitos reservados.
        </p>

        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-1.5 text-emerald-400 text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Serviços Operacionais
          </span>
        </div>
      </footer>
    </div>
  );
}
