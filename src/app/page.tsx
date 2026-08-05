import { getLoggedInUser } from "@/services/auth";
import Link from "next/link";
import { 
  Zap, 
  Shield, 
  Play, 
  Sparkles, 
  Layers, 
  ArrowRight, 
  CheckCircle2, 
  TrendingUp, 
  Scissors,
  Check,
  Plus,
  AlertCircle
} from "lucide-react";
import { Instagram, Facebook } from "@/components/icons";

interface PageProps {
  searchParams: Promise<{ error?: string; details?: string }>;
}

export default async function LandingPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const error = searchParams.error;
  const details = searchParams.details;
  const user = await getLoggedInUser();
  const ctaLink = user ? "/dashboard" : "/api/auth/google";
  const ctaText = user ? "Acessar Painel" : "Criar Conta Grátis";

  return (
    <div className="landing-page min-h-screen text-white relative overflow-hidden bg-[#09090b]">
      {/* CSS adicional embutido para efeitos premium do site de vendas */}
      <style>{`
        .glass-card {
          background: rgba(20, 20, 23, 0.6);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.05);
          transition: all 0.3s ease;
        }
        .glass-card:hover {
          border-color: rgba(124, 58, 237, 0.3);
          transform: translateY(-4px);
          box-shadow: 0 12px 30px rgba(124, 58, 237, 0.08);
        }
        .brand-gradient-text {
          background: linear-gradient(135deg, #a78bfa, #f472b6, #fb923c);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .glow-effect {
          position: absolute;
          width: 400px;
          height: 400px;
          background: radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%);
          filter: blur(40px);
          pointer-events: none;
        }
        .pricing-card-active {
          border: 2px solid #7c3aed;
          box-shadow: 0 0 30px rgba(124,58,237,0.15);
        }
        details summary::-webkit-details-marker {
          display: none;
        }
        details[open] summary svg {
          transform: rotate(180deg);
        }
      `}</style>

      {/* Decorative Glows */}
      <div className="glow-effect top-[-100px] left-[-100px]" />
      <div className="glow-effect bottom-[-100px] right-[-100px]" style={{ background: 'radial-gradient(circle, rgba(232,65,127,0.1) 0%, transparent 70%)' }} />

      {/* Header / Navigation */}
      <header className="sticky top-0 z-50 bg-[#09090b]/80 backdrop-blur-md border-b border-white/5 px-6 py-4 max-w-7xl mx-auto w-full flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#7c3aed] to-[#e8417f] flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-black tracking-tight text-white">GO POST</span>
        </div>
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-400">
          <a href="#features" className="hover:text-white transition-colors">Recursos</a>
          <a href="#how-it-works" className="hover:text-white transition-colors">Como Funciona</a>
          <a href="#pricing" className="hover:text-white transition-colors">Planos</a>
          <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
        </nav>
        <div className="flex items-center gap-4">
          {user ? (
            <Link href="/dashboard" className="px-4 py-2 rounded-lg text-sm font-semibold border border-white/10 hover:border-white/20 transition-colors">
              Acessar Painel
            </Link>
          ) : (
            <Link href="/api/auth/google" className="px-4 py-2 rounded-lg text-sm font-semibold hover:text-white text-gray-300 transition-colors">
              Entrar
            </Link>
          )}
          <Link href={ctaLink} className="px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#7c3aed] to-[#e8417f] hover:opacity-90 transition-opacity">
            {ctaText}
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-20 pb-24 px-6 max-w-7xl mx-auto text-center flex flex-col items-center">
        {error && (
          <div className="mb-8 p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-red-200 text-sm max-w-2xl text-left flex items-start gap-3 glass-card">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-white mb-1">Falha na Autenticação</h4>
              <p className="text-red-300 text-xs">
                {error === 'callback_error' && 'Erro ao processar o retorno do Google. Verifique se o e-mail está cadastrado ou se há problemas de conexão.'}
                {error === 'oauth_failed' && 'O Google retornou um erro durante a autorização.'}
                {error === 'server_configuration' && 'Erro de configuração do Google OAuth no servidor (Client ID ou Client Secret ausente).'}
                {error === 'not_authenticated' && 'Sua sessão expirou ou o cookie de autenticação não pôde ser gravado. Se estiver acessando via HTTP (sem SSL), certifique-se de configurar o APP_URL corretamente.'}
                {error !== 'callback_error' && error !== 'oauth_failed' && error !== 'server_configuration' && error !== 'not_authenticated' && `Erro: ${error}`}
              </p>
              {details && (
                <pre className="mt-2 p-2 rounded bg-black/40 border border-white/5 text-[10px] text-gray-400 overflow-x-auto whitespace-pre-wrap font-mono max-w-full">
                  {details}
                </pre>
              )}
            </div>
          </div>
        )}

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-violet-500/20 bg-violet-500/5 text-violet-400 text-xs font-semibold mb-6 animate-pulse">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Automação 100% em Nuvem (SaaS)</span>
        </div>
        
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white max-w-3xl leading-tight">
          Publique Reels de Sucesso <br />
          <span className="brand-gradient-text">Totalmente no Automático</span>
        </h1>
        
        <p className="mt-6 text-lg sm:text-xl text-gray-400 max-w-2xl leading-relaxed">
          Monitore perfis de referência, baixe novos conteúdos automaticamente, aplique sua marca d&apos;água profissional com FFmpeg, reescreva legendas com IA e agende publicações para o Instagram e Facebook.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-4 items-center justify-center">
          <Link href={ctaLink} className="w-full sm:w-auto px-8 py-4 rounded-xl text-base font-bold bg-gradient-to-r from-[#7c3aed] to-[#e8417f] hover:shadow-[0_0_30px_rgba(124,58,237,0.3)] transition-all flex items-center justify-center gap-2">
            <span>{ctaText}</span>
            <ArrowRight className="w-5 h-5" />
          </Link>
          <a href="#how-it-works" className="w-full sm:w-auto px-8 py-4 rounded-xl text-base font-bold border border-white/10 hover:bg-white/5 transition-colors flex items-center justify-center gap-2">
            <Play className="w-5 h-5 text-gray-400" />
            <span>Ver Como Funciona</span>
          </a>
        </div>

        {/* Mockup Preview */}
        <div className="mt-16 w-full max-w-5xl rounded-2xl border border-white/10 bg-white/[0.02] p-2 aspect-[16/9] overflow-hidden shadow-2xl relative">
          <div className="w-full h-full rounded-xl bg-gradient-to-br from-[#111114] to-[#18181b] border border-white/5 flex flex-col items-center justify-center p-8">
            <div className="flex items-center gap-1.5 absolute top-5 left-5">
              <span className="w-3 h-3 rounded-full bg-red-500/60" />
              <span className="w-3 h-3 rounded-full bg-yellow-500/60" />
              <span className="w-3 h-3 rounded-full bg-green-500/60" />
            </div>
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#7c3aed] to-[#fb923c] flex items-center justify-center mx-auto shadow-lg shadow-violet-500/20">
                <TrendingUp className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-white">Painel GO POST — Autopilot Ativado</h3>
              <p className="text-sm text-gray-400 max-w-md mx-auto">
                Conecte seu Google OAuth, configure suas contas do Facebook e assista o sistema coletar e postar Reels de qualidade diariamente.
              </p>
              <div className="inline-flex items-center gap-3 px-4 py-2 rounded-lg bg-[#09090b] border border-white/5 text-xs text-emerald-400 font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                <span>Scheduler: Executando a cada 30 min</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="border-y border-white/5 bg-[#111114]/40 py-12 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          <div>
            <h4 className="text-3xl sm:text-4xl font-extrabold text-white">100%</h4>
            <p className="mt-1 text-xs sm:text-sm text-gray-400">Automatizado em Nuvem</p>
          </div>
          <div>
            <h4 className="text-3xl sm:text-4xl font-extrabold text-white">90%</h4>
            <p className="mt-1 text-xs sm:text-sm text-gray-400">Economia de Tempo Diário</p>
          </div>
          <div>
            <h4 className="text-3xl sm:text-4xl font-extrabold text-white">3 Minutos</h4>
            <p className="mt-1 text-xs sm:text-sm text-gray-400">Configuração Inicial</p>
          </div>
          <div>
            <h4 className="text-3xl sm:text-4xl font-extrabold text-white">Multi</h4>
            <p className="mt-1 text-xs sm:text-sm text-gray-400">Usuários & Contas Conectadas</p>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 px-6 max-w-7xl mx-auto space-y-16">
        <div className="text-center max-w-2xl mx-auto space-y-4">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
            Tudo o que você precisa para <span className="brand-gradient-text">escalar suas páginas</span>
          </h2>
          <p className="text-sm sm:text-base text-gray-400">
            Chega de passar horas baixando vídeos, editando no celular e postando manualmente. Nós fazemos tudo por você em segundo plano.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass-card rounded-2xl p-6 space-y-4">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-400">
              <Instagram className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-white">Monitoramento de Origens</h3>
            <p className="text-sm text-gray-400">
              Cadastre usernames do Instagram que postam conteúdos relevantes na sua área e o sistema monitorará novas publicações de forma contínua.
            </p>
          </div>

          <div className="glass-card rounded-2xl p-6 space-y-4">
            <div className="w-10 h-10 rounded-xl bg-pink-500/10 flex items-center justify-center text-pink-400">
              <Scissors className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-white">Marca d&apos;água FFmpeg</h3>
            <p className="text-sm text-gray-400">
              Faça upload do seu logo pessoal, escolha a escala e posição. O sistema processa o vídeo usando FFmpeg nativo aplicando sua marca de forma profissional.
            </p>
          </div>

          <div className="glass-card rounded-2xl p-6 space-y-4">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-white">Legendas Otimizadas por IA</h3>
            <p className="text-sm text-gray-400">
              Utilize o motor de inteligência artificial integrado para reescrever a legenda original dos vídeos, remover marcações de terceiros e adicionar hashtags virais.
            </p>
          </div>

          <div className="glass-card rounded-2xl p-6 space-y-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <Layers className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-white">Agendamento & Fila</h3>
            <p className="text-sm text-gray-400">
              Fila inteligente de publicação. Novos vídeos entram na fila como &quot;Descobertos&quot; e são processados um a um a cada ciclo de scheduler.
            </p>
          </div>

          <div className="glass-card rounded-2xl p-6 space-y-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
              <Facebook className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-white">Multiplataforma Simultâneo</h3>
            <p className="text-sm text-gray-400">
              Conecte suas páginas do Facebook e perfis comerciais do Instagram. Publique o mesmo Reel em ambas as redes ao mesmo tempo para maximizar o alcance.
            </p>
          </div>

          <div className="glass-card rounded-2xl p-6 space-y-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400">
              <Shield className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-white">Multi-Usuário Completo</h3>
            <p className="text-sm text-gray-400">
              Segurança e isolamento completo de dados via login do Google OAuth. Cada usuário gerencia de forma privada seus reels, configurações e tokens de página.
            </p>
          </div>
        </div>
      </section>

      {/* How it Works / Workflow */}
      <section id="how-it-works" className="py-24 px-6 max-w-7xl mx-auto space-y-16 bg-[#111114]/20 rounded-3xl border border-white/5">
        <div className="text-center max-w-2xl mx-auto space-y-4">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white">Como Funciona o Fluxo</h2>
          <p className="text-sm text-gray-400">De ponta a ponta, o seu Reels AutoPoster faz o trabalho pesado de forma sequencial</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative">
          <div className="space-y-3 relative text-center md:text-left">
            <div className="w-10 h-10 rounded-full bg-violet-600/20 text-violet-400 border border-violet-500/30 flex items-center justify-center text-sm font-bold mx-auto md:mx-0">1</div>
            <h4 className="font-bold text-white text-base">Descoberta</h4>
            <p className="text-xs text-gray-400">O robô verifica os perfis-fonte cadastrados a procura de vídeos novos lançados no Instagram.</p>
          </div>
          <div className="space-y-3 relative text-center md:text-left">
            <div className="w-10 h-10 rounded-full bg-pink-600/20 text-pink-400 border border-pink-500/30 flex items-center justify-center text-sm font-bold mx-auto md:mx-0">2</div>
            <h4 className="font-bold text-white text-base">Download & Logo</h4>
            <p className="text-xs text-gray-400">O vídeo original é baixado na VPS, e o FFmpeg adiciona a sua marca d&apos;água na posição configurada.</p>
          </div>
          <div className="space-y-3 relative text-center md:text-left">
            <div className="w-10 h-10 rounded-full bg-orange-600/20 text-orange-400 border border-orange-500/30 flex items-center justify-center text-sm font-bold mx-auto md:mx-0">3</div>
            <h4 className="font-bold text-white text-base">R2 Cloud & IA</h4>
            <p className="text-xs text-gray-400">O vídeo processado é enviado para armazenamento seguro e a legenda original é reescrita via OpenAI.</p>
          </div>
          <div className="space-y-3 relative text-center md:text-left">
            <div className="w-10 h-10 rounded-full bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-sm font-bold mx-auto md:mx-0">4</div>
            <h4 className="font-bold text-white text-base">Postagem</h4>
            <p className="text-xs text-gray-400">A API Oficial do Facebook Graph publica o Reel no Instagram Business e na página do Facebook simultaneamente.</p>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 px-6 max-w-7xl mx-auto space-y-16">
        <div className="text-center max-w-2xl mx-auto space-y-4">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white">Escolha o plano ideal</h2>
          <p className="text-sm text-gray-400">Preços simples e sem pegadinhas. Cancele quando quiser.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {/* Plan 1 */}
          <div className="glass-card rounded-3xl p-8 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <span className="text-xs font-bold text-gray-400 tracking-wider uppercase">Bronze</span>
              <h3 className="text-2xl font-bold text-white">Starter</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-black text-white">R$ 49</span>
                <span className="text-xs text-gray-400">/mês</span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">Perfeito para quem está começando a automatizar suas postagens.</p>
              <div className="border-t border-white/5 my-4" />
              <ul className="space-y-2.5 text-xs text-gray-300">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-violet-400" /> Monitoramento de até 3 fontes</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-violet-400" /> Autopostagem Instagram</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-violet-400" /> Marca d&apos;água FFmpeg customizada</li>
                <li className="flex items-center gap-2 text-gray-500"><Check className="w-4 h-4 text-gray-700" /> Sem postagem Facebook Page</li>
              </ul>
            </div>
            <Link href={ctaLink} className="w-full py-3 rounded-xl text-center text-xs font-bold border border-white/10 hover:bg-white/5 transition-colors">
              Começar Agora
            </Link>
          </div>

          {/* Plan 2 */}
          <div className="glass-card pricing-card-active rounded-3xl p-8 flex flex-col justify-between space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-violet-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">
              Popular
            </div>
            <div className="space-y-4">
              <span className="text-xs font-bold text-violet-400 tracking-wider uppercase">Ouro</span>
              <h3 className="text-2xl font-bold text-white">Pro Autopilot</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-black text-white">R$ 89</span>
                <span className="text-xs text-gray-400">/mês</span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">Ideal para criadores e marcas que querem escala e postagem cruzada.</p>
              <div className="border-t border-white/5 my-4" />
              <ul className="space-y-2.5 text-xs text-gray-300">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-violet-400" /> Monitoramento de até 10 fontes</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-violet-400" /> Instagram Reels + Facebook Pages</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-violet-400" /> Legendas Inteligentes com IA</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-violet-400" /> Suporte prioritário via WhatsApp</li>
              </ul>
            </div>
            <Link href={ctaLink} className="w-full py-3 rounded-xl text-center text-xs font-bold bg-gradient-to-r from-[#7c3aed] to-[#e8417f] hover:opacity-95 transition-opacity">
              Começar com Pro
            </Link>
          </div>

          {/* Plan 3 */}
          <div className="glass-card rounded-3xl p-8 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <span className="text-xs font-bold text-gray-400 tracking-wider uppercase">Diamante</span>
              <h3 className="text-2xl font-bold text-white">Agency Scale</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-black text-white">R$ 179</span>
                <span className="text-xs text-gray-400">/mês</span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">Ideal para agências de marketing que gerenciam múltiplas marcas.</p>
              <div className="border-t border-white/5 my-4" />
              <ul className="space-y-2.5 text-xs text-gray-300">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-violet-400" /> Fontes de origem ilimitadas</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-violet-400" /> Até 5 contas Meta conectadas</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-violet-400" /> IA ilimitada para legendas</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-violet-400" /> Acesso à API para integrações externas</li>
              </ul>
            </div>
            <Link href={ctaLink} className="w-full py-3 rounded-xl text-center text-xs font-bold border border-white/10 hover:bg-white/5 transition-colors">
              Falar com Vendas
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-24 px-6 max-w-4xl mx-auto space-y-16">
        <div className="text-center max-w-2xl mx-auto space-y-4">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white">Perguntas Frequentes</h2>
          <p className="text-sm text-gray-400">Esclareça suas dúvidas rápidas sobre o funcionamento do GO POST.</p>
        </div>

        <div className="space-y-4">
          <details className="glass-card rounded-2xl p-6 group cursor-pointer">
            <summary className="flex items-center justify-between font-bold text-white text-base">
              <span>Preciso manter meu computador ligado para as postagens acontecerem?</span>
              <Plus className="w-5 h-5 text-gray-400 group-open:hidden" />
              <span className="hidden group-open:block text-violet-400 font-bold" style={{ transform: 'rotate(45deg)' }}>+</span>
            </summary>
            <p className="mt-4 text-sm text-gray-400 leading-relaxed">
              Não. O sistema roda 100% na nossa infraestrutura em nuvem (SaaS). Depois que você conecta suas contas e configura seus perfis-fonte, as postagens acontecem de forma automática no horário programado, mesmo que você esteja dormindo com o PC desligado.
            </p>
          </details>

          <details className="glass-card rounded-2xl p-6 group cursor-pointer">
            <summary className="flex items-center justify-between font-bold text-white text-base">
              <span>Como funciona o login do Google OAuth e do Facebook?</span>
              <Plus className="w-5 h-5 text-gray-400 group-open:hidden" />
              <span className="hidden group-open:block text-violet-400 font-bold" style={{ transform: 'rotate(45deg)' }}>+</span>
            </summary>
            <p className="mt-4 text-sm text-gray-400 leading-relaxed">
              Para maior segurança, nós usamos o fluxo oficial do Google OAuth para autenticar você no nosso painel. A conexão com suas páginas de redes sociais é feita via fluxo oficial da Meta (Facebook Login dialog). Nós nunca temos acesso à sua senha pessoal da Meta; apenas salvamos os tokens de publicação que você autoriza no diálogo.
            </p>
          </details>

          <details className="glass-card rounded-2xl p-6 group group-open:border-violet-500 cursor-pointer">
            <summary className="flex items-center justify-between font-bold text-white text-base">
              <span>Posso aplicar marcas d&apos;água em diferentes partes do vídeo?</span>
              <Plus className="w-5 h-5 text-gray-400 group-open:hidden" />
              <span className="hidden group-open:block text-violet-400 font-bold" style={{ transform: 'rotate(45deg)' }}>+</span>
            </summary>
            <p className="mt-4 text-sm text-gray-400 leading-relaxed">
              Sim! Nas configurações do painel, você pode carregar uma imagem em formato PNG e escolher entre as posições predefinidas: Superior Esquerdo, Superior Direito, Centro, Inferior Esquerdo ou Inferior Direito. A logo será escalada para o tamanho em pixels definido e aplicada pelo motor de vídeo FFmpeg.
            </p>
          </details>

          <details className="glass-card rounded-2xl p-6 group cursor-pointer">
            <summary className="flex items-center justify-between font-bold text-white text-base">
              <span>Existe risco de bloqueio da minha conta do Instagram?</span>
              <Plus className="w-5 h-5 text-gray-400 group-open:hidden" />
              <span className="hidden group-open:block text-violet-400 font-bold" style={{ transform: 'rotate(45deg)' }}>+</span>
            </summary>
            <p className="mt-4 text-sm text-gray-400 leading-relaxed">
              O sistema utiliza a API Oficial do Facebook Graph para publicar os Reels. Por utilizarmos a integração oficial da Meta (que é a forma recomendada e aprovada pelo Instagram), o risco de suspensão por atividades suspeitas de automações externas (como bots de clique na tela) é eliminado. Porém, recomendamos sempre postar conteúdos alinhados às diretrizes da comunidade.
            </p>
          </details>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12 px-6 max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#7c3aed] to-[#e8417f] flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white text-sm">GO POST</span>
        </div>
        <p className="text-xs text-gray-500">
          &copy; {new Date().getFullYear()} GO POST AutoPoster. Todos os direitos reservados.
        </p>
        <div className="flex gap-4 text-xs text-gray-400">
          <a href="#" className="hover:text-white transition-colors">Termos de Uso</a>
          <a href="#" className="hover:text-white transition-colors">Privacidade</a>
        </div>
      </footer>
    </div>
  );
}
