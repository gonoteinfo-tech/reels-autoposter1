import Link from "next/link";
import { AlertCircle, Check, Clock, Plus, Sparkles, Stamp } from "lucide-react";
import { getLoggedInUser } from "@/services/auth";
import { Facebook } from "@/components/icons";
import { BrandMark } from "@/components/Sidebar";

interface PageProps {
  searchParams: Promise<{ error?: string; details?: string }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  callback_error: "Erro ao processar o retorno do Google. Tente novamente.",
  oauth_failed: "O Google retornou um erro durante a autorização.",
  facebook_error: "Não foi possível entrar com o Facebook. Tente novamente.",
  server_configuration: "Erro de configuração do login (chaves ausentes no servidor).",
  not_authenticated: "Sua sessão expirou. Entre novamente para continuar.",
  invalid_state: "O link de login expirou. Tente entrar novamente.",
};

const STEPS = [
  { n: "01", title: "Cadastre as fontes", text: "Perfis do Instagram, TikTok, YouTube ou páginas do Facebook que você quer acompanhar." },
  { n: "02", title: "Coleta automática", text: "Os vídeos novos de cada fonte entram na fila no intervalo que você definir." },
  { n: "03", title: "Sua marca e sua legenda", text: "A sua logo vai no vídeo e a IA reescreve a legenda com hashtags do assunto." },
  { n: "04", title: "Publicação no ritmo certo", text: "Um reel por vez no Instagram e no Facebook, sem inundar os seus seguidores." },
];

const FEATURES = [
  { icon: Stamp, title: "Marca d'água por conta", text: "Cada conta envia a própria logo e escolhe a posição e o tamanho no vídeo." },
  { icon: Sparkles, title: "Legendas reescritas com IA", text: "Tom jornalístico, fatos preservados e hashtags sobre pessoas, lugares e o tema do vídeo." },
  { icon: Clock, title: "Controle de ritmo", text: "Defina o intervalo mínimo entre publicações e a frequência de coleta de cada fonte." },
];

const PLANS = [
  {
    name: "Iniciante",
    price: "R$ 49",
    description: "Para quem está começando e quer testar a consistência diária.",
    items: ["Até 3 fontes monitoradas", "Publicação no Instagram Reels", "Marca d'água personalizada"],
    cta: "Começar agora",
    featured: false,
  },
  {
    name: "PRO Automação",
    price: "R$ 89",
    description: "Para criadores e páginas que querem escala orgânica em várias redes.",
    items: [
      "Até 10 fontes de vídeo simultâneas",
      "Instagram Reels + páginas do Facebook",
      "Legendas reescritas com IA",
      "Agendamento e trava de ritmo",
      "Suporte prioritário",
    ],
    cta: "Assinar o PRO",
    featured: true,
  },
  {
    name: "Agência",
    price: "R$ 179",
    description: "Para quem gerencia vários perfis e precisa de capacidade máxima.",
    items: ["Fontes ilimitadas", "Até 5 contas Meta conectadas", "IA ilimitada para legendas", "Acesso antecipado a novidades"],
    cta: "Começar com Agência",
    featured: false,
  },
];

const FAQ = [
  {
    q: "Preciso manter o computador ligado para as publicações acontecerem?",
    a: "Não. O GO POST roda no servidor. Depois de conectar a sua página e cadastrar as fontes, os vídeos são coletados, editados e publicados na frequência configurada, mesmo com o seu computador desligado.",
  },
  {
    q: "A conexão com o Facebook e o Instagram é segura?",
    a: "Sim. O login usa o fluxo oficial da Meta. O GO POST nunca vê a sua senha e guarda apenas o acesso de publicação que o próprio Facebook emite.",
  },
  {
    q: "Como a marca d'água é inserida nos vídeos?",
    a: "Você envia a sua logo (PNG transparente fica melhor) e escolhe a posição e o tamanho. Ela é aplicada direto nos quadros do vídeo antes da publicação.",
  },
  {
    q: "Existe risco de bloqueio da conta?",
    a: "As publicações usam a API oficial da Meta, a mesma de grandes plataformas de mídia, e a trava de ritmo impede publicações em excesso.",
  },
];

export default async function LandingPage(props: PageProps) {
  const { error, details } = await props.searchParams;
  const user = await getLoggedInUser();
  const primaryHref = user ? "/dashboard" : "/api/auth/facebook/login";

  return (
    <div className="landing min-h-screen bg-canvas text-ink text-[15px]">
      <header className="h-[76px] px-5 lg:px-20 flex items-center justify-between border-b border-[#1e2024]">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandMark />
          <span className="font-display text-[19px] font-bold tracking-tight">GO POST</span>
        </Link>
        <nav aria-label="Seções" className="hidden lg:flex gap-8 text-sm text-muted">
          <a href="#como-funciona" className="hover:text-ink">Como funciona</a>
          <a href="#recursos" className="hover:text-ink">Recursos</a>
          <a href="#planos" className="hover:text-ink">Planos</a>
          <a href="#duvidas" className="hover:text-ink">Dúvidas</a>
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <Link href="/dashboard" className="btn btn-primary">Acessar painel</Link>
          ) : (
            <>
              <Link href="/api/auth/facebook/login" className="btn hidden sm:inline-flex text-ink-2 hover:text-ink">Entrar</Link>
              <Link href="/api/auth/facebook/login" className="btn btn-primary">
                <Facebook className="w-4 h-4" />
                <span className="hidden sm:inline">Entrar com Facebook</span>
                <span className="sm:hidden">Entrar</span>
              </Link>
            </>
          )}
        </div>
      </header>

      <main>
        <section className="px-5 lg:px-20 pt-16 lg:pt-24 pb-20 flex flex-col lg:flex-row gap-14 lg:gap-16 items-center">
          <div className="flex-1 flex flex-col gap-7 max-w-[640px]">
            {error && (
              <div className="alert alert-err" role="alert">
                <AlertCircle />
                <div className="flex flex-col gap-1.5 min-w-0">
                  <span className="font-semibold">Não foi possível entrar</span>
                  <span>{ERROR_MESSAGES[error] || `Erro: ${error}`}</span>
                  {details && <code className="font-mono text-xs text-muted break-words">{details}</code>}
                </div>
              </div>
            )}
            <span className="self-start px-3 py-1.5 rounded-full border border-line-strong text-ink-2 text-[13px]">
              Para páginas de notícias no Instagram e no Facebook
            </span>
            <h1 className="m-0 font-display text-[44px] lg:text-[68px] leading-[1.02] font-bold tracking-[-0.035em]">
              Seus Reels publicados no piloto automático.
            </h1>
            <p className="m-0 max-w-[560px] text-muted text-lg leading-relaxed">
              O GO POST acompanha os perfis que você escolher, aplica a sua marca d&apos;água, reescreve a legenda com IA e
              publica na sua página no ritmo que você definir.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href={primaryHref} className="btn btn-primary h-[52px] px-[22px] rounded-xl text-[15px]">
                {!user && <Facebook className="w-[18px] h-[18px]" />}
                {user ? "Acessar painel" : "Entrar com Facebook"}
              </Link>
              {!user && (
                <Link href="/api/auth/google" className="btn btn-ghost h-[52px] px-5 rounded-xl text-[15px] text-ink">
                  <span className="w-5 h-5 rounded-full bg-ink text-on-accent flex items-center justify-center font-bold text-xs" aria-hidden="true">
                    G
                  </span>
                  Entrar com Google
                </Link>
              )}
            </div>
            <span className="flex items-center gap-2 text-faint text-[13px]">
              <Check className="w-4 h-4 text-ok shrink-0" aria-hidden="true" />
              Publicação pela API oficial da Meta. A sua senha nunca passa por aqui.
            </span>
          </div>

          <div aria-hidden="true" className="w-full max-w-[560px] card p-5 rounded-[18px] flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Pipeline agora</span>
              <span className="flex items-center gap-1.5 text-xs text-ok-ink">
                <span className="dot bg-ok w-[7px] h-[7px]" />
                Automação ativa
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {["Descoberta", "Download", "Marca d'água", "Upload", "Publicação"].map((label, i) => (
                <div key={label} className="flex flex-col gap-1.5">
                  <div className={`h-1 rounded ${i === 4 ? "bg-accent" : "bg-info"}`} />
                  <span className="text-[11px] text-muted truncate">{label}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col">
              {[
                { title: "Chuva forte alaga avenidas da zona sul", src: "@portaldaregiao", chip: "chip chip-info", stage: "Marca d'água" },
                { title: "Nova linha de ônibus para Parnamirim", src: "@parnamirimnews", chip: "chip", stage: "Na fila" },
                { title: "Feira movimenta o centro no fim de semana", src: "@noticiasdeparnamirim", chip: "chip chip-ok", stage: "Publicado" },
              ].map((row, i) => (
                <div key={row.title} className={`flex items-center gap-3 py-3 ${i < 2 ? "border-b border-[#202327]" : ""}`}>
                  <div className="w-8 h-[46px] rounded-md bg-[#24272c] shrink-0" />
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <span className="text-[13px] font-medium truncate">{row.title}</span>
                    <span className="text-[11px] text-faint">{row.src}</span>
                  </div>
                  <span className={`${row.chip} text-[11px]`}>{row.stage}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="como-funciona" className="px-5 lg:px-20 py-20 lg:py-[88px] border-t border-[#1e2024] flex flex-col gap-10">
          <div className="flex flex-col gap-3">
            <span className="eyebrow">COMO FUNCIONA</span>
            <h2 className="m-0 font-display text-[32px] lg:text-[44px] font-bold tracking-[-0.03em]">Da fonte à sua página, sem trabalho manual</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {STEPS.map((s) => (
              <div key={s.n} className="card rounded-[14px] p-6 flex flex-col gap-3">
                <span className="font-mono text-[#ff8a6b]">{s.n}</span>
                <h3 className="m-0 text-lg font-semibold">{s.title}</h3>
                <p className="m-0 text-muted leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="recursos" className="px-5 lg:px-20 py-20 lg:py-[88px] border-t border-[#1e2024] flex flex-col gap-10">
          <div className="flex flex-col gap-3">
            <span className="eyebrow">RECURSOS</span>
            <h2 className="m-0 font-display text-[32px] lg:text-[44px] font-bold tracking-[-0.03em]">Feito para quem publica todo dia</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="card rounded-[14px] p-7 flex flex-col gap-3.5">
                <Icon className="w-6 h-6 text-accent" strokeWidth={1.8} aria-hidden="true" />
                <h3 className="m-0 text-lg font-semibold">{title}</h3>
                <p className="m-0 text-muted leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="planos" className="px-5 lg:px-20 py-20 lg:py-[88px] border-t border-[#1e2024] flex flex-col gap-10">
          <div className="flex flex-col gap-3">
            <span className="eyebrow">PLANOS</span>
            <h2 className="m-0 font-display text-[32px] lg:text-[44px] font-bold tracking-[-0.03em]">Escolha o plano da sua página</h2>
            <p className="m-0 text-muted">Comece com o plano que cabe hoje e mude quando quiser.</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {PLANS.map((plan) => (
              <div key={plan.name} className={`card rounded-2xl p-8 flex flex-col gap-5 ${plan.featured ? "border-accent" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1.5">
                    <span className="font-semibold text-lg">{plan.name}</span>
                    <span className="text-muted">{plan.description}</span>
                  </div>
                  {plan.featured && <span className="chip chip-accent shrink-0">Mais escolhido</span>}
                </div>
                <span className="font-display text-[44px] font-bold leading-none">
                  {plan.price}
                  <span className="font-sans text-base font-normal text-muted"> /mês</span>
                </span>
                <ul className="m-0 p-0 list-none flex flex-col gap-2.5 text-ink-2">
                  {plan.items.map((item) => (
                    <li key={item} className="flex gap-2.5">
                      <Check className="w-[18px] h-[18px] text-ok shrink-0" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link href={primaryHref} className={`btn mt-auto h-12 ${plan.featured ? "btn-primary" : "btn-ghost text-ink"}`}>
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section id="duvidas" className="px-5 lg:px-20 py-20 lg:py-[88px] border-t border-[#1e2024] flex flex-col lg:flex-row gap-10 lg:gap-16">
          <div className="lg:w-[360px] shrink-0 flex flex-col gap-3">
            <span className="eyebrow">DÚVIDAS</span>
            <h2 className="m-0 font-display text-[32px] lg:text-[44px] font-bold tracking-[-0.03em]">Perguntas frequentes</h2>
          </div>
          <div className="flex-1 flex flex-col border-t border-line">
            {FAQ.map((item) => (
              <details key={item.q} className="py-5 border-b border-line">
                <summary className="flex items-center justify-between gap-4 font-semibold text-[17px]">
                  <span>{item.q}</span>
                  <Plus className="faq-plus w-5 h-5 text-muted shrink-0 transition-transform" aria-hidden="true" />
                </summary>
                <p className="mt-3 mb-0 text-muted leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="px-5 lg:px-20 py-8 border-t border-[#1e2024] flex flex-col sm:flex-row justify-between items-center gap-4 text-faint text-[13px]">
        <span>GO POST</span>
        <span>Automação de Reels para Instagram e Facebook</span>
      </footer>
    </div>
  );
}
