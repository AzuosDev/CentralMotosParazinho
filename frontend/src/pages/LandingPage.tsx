import { useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarClock,
  Check,
  Coins,
  Copy,
  FileText,
  Fingerprint,
  Lock,
  Mail,
  MessageCircle,
  Plane,
  Plus,
} from "lucide-react";
import { cn } from "../lib/utils";

/*
 * Landing do MeuGasto — a "mesa verde-floresta" do painel de login em escala de página.
 * É uma superfície de marca (igual nos dois temas), por isso as cores ficam aqui e não
 * nos tokens de tema, como em AuthShowcase. Todos os valores das peças são exemplos.
 */

const CONTACT_EMAIL = "udawgs.org@gmail.com";
const SALES_WHATSAPP_NUMBER = "5588996784110";
const SALES_WHATSAPP_MESSAGE = "Olá! Tenho interesse no plano Empresarial do MeuGasto.";
const CONTACT_WHATSAPP_MESSAGE = "Olá! Tenho uma dúvida sobre o MeuGasto.";
const CONTACT_WHATSAPP_DISPLAY = "(88) 9 9678-4110";
const AZUOS_URL = "https://azuos-dev.vercel.app/";
const DISPLAY_FONT_CSS = "/fonts/bricolage-grotesque.css";

const ease = "ease-[cubic-bezier(0.16,1,0.3,1)]";
const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bef264] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e2a1e]";
const limeButton = cn(
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-pill bg-[#bef264] font-bold text-[#10231a] transition-[background-color,transform] duration-200 hover:bg-[#d9f99d] active:scale-[0.98]",
  focusRing,
);
const display = "font-display font-extrabold tracking-[-0.035em] text-balance";

// Fonte dos títulos (quando se chega por navegação interna) e barra de rolagem da página
// no tom da mesa; a barra volta ao padrão do app ao sair da landing.
function useLandingChrome() {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.scrollbarColor;
    root.style.scrollbarColor = "#2f5a45 #091f15";
    return () => {
      root.style.scrollbarColor = previous;
    };
  }, []);

  useEffect(() => {
    if (document.querySelector(`link[href="${DISPLAY_FONT_CSS}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = DISPLAY_FONT_CSS;
    document.head.appendChild(link);
  }, []);
}

function scrollToId(event: MouseEvent<HTMLAnchorElement>, id: string) {
  event.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ─── Peças da mesa ──────────────────────────────────────────────────────────
// Medidas em em: a mesa define o font-size em cqw, então tudo escala junto.

function SaldoPiece() {
  const wallets = [
    ["Conta corrente", "R$ 3.216,40"],
    ["Dinheiro", "R$ 186,10"],
    ["Poupança", "R$ 780,00"],
  ];
  return (
    <div className="w-[17em] rounded-[1.1em] bg-white p-[1.2em] text-[#10231a] shadow-[0_1.6em_3em_-1em_rgba(0,0,0,0.55)]">
      <p className="text-[0.8em] font-medium text-[#4b5f52]">Saldo agora</p>
      <p className="mt-[0.2em] font-display text-[2.3em] font-extrabold leading-none tracking-[-0.03em] tabular-nums">
        R$ 4.182,50
      </p>
      <ul className="mt-[1em] space-y-[0.55em] border-t border-[#e5ecdf] pt-[0.8em] text-[0.8em]">
        {wallets.map(([name, value]) => (
          <li key={name} className="flex justify-between gap-[1em]">
            <span className="text-[#34473b]">{name}</span>
            <span className="font-semibold tabular-nums">{value}</span>
          </li>
        ))}
      </ul>
      <p className="mt-[0.9em] rounded-[0.6em] bg-[#f1f5ec] px-[0.7em] py-[0.5em] text-[0.7em] leading-snug text-[#4b5f52]">
        Cartão de crédito fica fora: é dívida, não saldo.
      </p>
    </div>
  );
}

function CartaoPiece() {
  return (
    <div className="relative aspect-[1.586] w-[15em] rounded-[0.9em] bg-[linear-gradient(135deg,#d9f99d_0%,#a3e635_42%,#65a30d_100%)] p-[1em] text-[#132414] shadow-[0_1.4em_2.6em_-0.8em_rgba(0,0,0,0.55)]">
      <div className="flex items-start justify-between">
        <span className="text-[0.85em] font-bold tracking-tight">Cartão principal</span>
        <span className="h-[1.2em] w-[1.7em] rounded-[0.3em] bg-[linear-gradient(135deg,#fef9c3,#ca8a04)] opacity-80" />
      </div>
      <p className="absolute bottom-[1em] left-[1em] text-[0.8em] font-semibold tabular-nums tracking-[0.18em]">•••• 4821</p>
      <p className="absolute bottom-[1.1em] right-[1em] text-[0.6em] font-semibold uppercase tracking-wider opacity-70">
        Crédito
      </p>
    </div>
  );
}

function FaturaPiece() {
  const rows: [string, string, string?][] = [
    ["Mercado", "R$ 312,90"],
    ["Notebook · 3/10", "R$ 420,00"],
    ["Streaming", "R$ 39,90"],
    ["Estorno · Farmácia", "− R$ 86,40", "estorno"],
  ];
  return (
    <div className="w-[19em] rounded-[1.1em] bg-[#f6f8f3] p-[1.2em] text-[#10231a] shadow-[0_1.6em_3em_-1em_rgba(0,0,0,0.6)]">
      <div className="flex items-baseline justify-between">
        <p className="text-[0.8em] font-medium text-[#4b5f52]">Fatura de outubro</p>
        <p className="text-[0.7em] font-semibold text-[#4b5f52]">vence dia 15</p>
      </div>
      <p className="mt-[0.2em] font-display text-[2em] font-extrabold leading-none tracking-[-0.03em] tabular-nums">R$ 1.284,37</p>
      <div className="mt-[0.8em] h-[0.4em] overflow-hidden rounded-pill bg-[#dfe7da]">
        <div className="h-full w-[43%] rounded-pill bg-[#65a30d]" />
      </div>
      <p className="mt-[0.4em] text-[0.68em] tabular-nums text-[#4b5f52]">43% de R$ 3.000,00 de limite</p>
      <ul className="mt-[0.9em] space-y-[0.5em] border-t border-[#dfe7da] pt-[0.75em] text-[0.78em]">
        {rows.map(([name, value, kind]) => (
          <li key={name} className="flex justify-between gap-[1em]">
            <span className="text-[#34473b]">{name}</span>
            <span className={cn("font-semibold tabular-nums", kind === "estorno" && "text-[#3f6212]")}>{value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContasPiece() {
  const bills: { name: string; when: string; value: string; tone: "due" | "card" | "in" | "plain" }[] = [
    { name: "Aluguel", when: "vence amanhã", value: "R$ 1.450,00", tone: "due" },
    { name: "Internet", when: "todo dia 10", value: "R$ 99,90", tone: "plain" },
    { name: "Academia", when: "cobrada no cartão", value: "R$ 89,90", tone: "card" },
    { name: "Freela", when: "a receber dia 12", value: "+ R$ 800,00", tone: "in" },
  ];
  return (
    <div className="w-[19em] rounded-[1.1em] bg-white p-[1.2em] text-[#10231a] shadow-[0_1.6em_3em_-1em_rgba(0,0,0,0.55)]">
      <p className="text-[0.8em] font-medium text-[#4b5f52]">Contas desta semana</p>
      <ul className="mt-[0.7em] divide-y divide-[#edf1e8]">
        {bills.map((bill) => (
          <li key={bill.name} className="flex items-center justify-between gap-[1em] py-[0.55em]">
            <span className="min-w-0">
              <span className="block text-[0.85em] font-semibold">{bill.name}</span>
              <span
                className={cn(
                  "mt-[0.15em] inline-block rounded-pill text-[0.66em] font-medium",
                  bill.tone === "due" && "bg-[#fef3c7] px-[0.6em] py-[0.1em] text-[#854d0e]",
                  bill.tone === "card" && "bg-[#ecfccb] px-[0.6em] py-[0.1em] text-[#3f6212]",
                  (bill.tone === "plain" || bill.tone === "in") && "text-[#4b5f52]",
                )}
              >
                {bill.when}
              </span>
            </span>
            <span className={cn("text-[0.82em] font-semibold tabular-nums", bill.tone === "in" && "text-[#15803d]")}>
              {bill.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MetaPiece() {
  return (
    <div className="w-[14em] rounded-[1em] bg-white p-[1em] text-[#10231a] shadow-[0_1.4em_2.6em_-0.8em_rgba(0,0,0,0.55)]">
      <div className="flex items-center gap-[0.5em]">
        <span className="grid h-[1.8em] w-[1.8em] place-items-center rounded-[0.55em] bg-[#ecfccb] text-[#3f6212]">
          <Plane className="h-[0.9em] w-[0.9em]" />
        </span>
        <span className="text-[0.8em] font-semibold">Viagem</span>
        <span className="ml-auto text-[0.8em] font-bold tabular-nums text-[#3f6212]">68%</span>
      </div>
      <div className="mt-[0.8em] h-[0.4em] overflow-hidden rounded-pill bg-[#e5ecdf]">
        <div className="h-full w-[68%] rounded-pill bg-[#84cc16]" />
      </div>
      <div className="mt-[0.45em] flex items-center justify-between text-[0.68em] tabular-nums text-[#4b5f52]">
        <span>R$ 3.400 de R$ 5.000</span>
        <span className="font-semibold text-[#3f6212]">+ R$ 250 hoje</span>
      </div>
    </div>
  );
}

function AvisoPiece() {
  return (
    <div className="flex items-center gap-[0.65em] rounded-pill bg-[#163a2a] py-[0.5em] pl-[0.5em] pr-[1.1em] text-[#eef5ec] shadow-[0_1.2em_2.2em_-0.8em_rgba(0,0,0,0.65)] ring-1 ring-white/10">
      <span className="grid h-[2em] w-[2em] place-items-center rounded-full bg-[#bef264] text-[#132414]">
        <CalendarClock className="h-[1em] w-[1em]" />
      </span>
      <span className="whitespace-nowrap text-[0.75em] leading-tight">
        <span className="block font-semibold">Aluguel</span>
        <span className="text-[#bdd0bb]">vence amanhã</span>
      </span>
    </div>
  );
}

type PieceId = "saldo" | "cartao" | "fatura" | "contas" | "meta" | "aviso";
type Arrangement = "hero" | "saldo" | "cartao" | "contas" | "metas";

const PIECES: Record<PieceId, () => ReactNode> = {
  saldo: SaldoPiece,
  cartao: CartaoPiece,
  fatura: FaturaPiece,
  contas: ContasPiece,
  meta: MetaPiece,
  aviso: AvisoPiece,
};

// Posição de cada peça na mesa (x/y em cqw, r em graus, s escala). dim = recua; hide = some.
type Pose = { x: number; y: number; r: number; s: number; z: number; dim?: boolean; hide?: boolean };

const LAYOUTS: Record<Arrangement, Record<PieceId, Pose>> = {
  hero: {
    aviso: { x: 23, y: -1, r: -2, s: 1, z: 7 },
    saldo: { x: 0, y: 4, r: -3, s: 1, z: 3 },
    cartao: { x: 63, y: -3, r: -11, s: 1, z: 5 },
    fatura: { x: 55, y: 25, r: 3, s: 1, z: 4 },
    contas: { x: 5, y: 45, r: 2, s: 0.85, z: 5 },
    meta: { x: 58, y: 68, r: -4, s: 1, z: 6 },
  },
  saldo: {
    saldo: { x: 20, y: 12, r: 0, s: 1.3, z: 10 },
    cartao: { x: 66, y: -4, r: -18, s: 0.85, z: 2, dim: true },
    fatura: { x: 62, y: 42, r: 8, s: 0.8, z: 3, dim: true },
    contas: { x: -4, y: 54, r: -4, s: 0.8, z: 4, dim: true },
    meta: { x: 64, y: 72, r: -6, s: 0.8, z: 5, dim: true },
    aviso: { x: 30, y: 78, r: 0, s: 0.9, z: 6, hide: true },
  },
  cartao: {
    cartao: { x: 6, y: 3, r: -7, s: 1.05, z: 9 },
    fatura: { x: 28, y: 20, r: 0, s: 1.2, z: 10 },
    saldo: { x: -4, y: 40, r: -5, s: 0.8, z: 3, dim: true },
    contas: { x: 64, y: 2, r: 6, s: 0.75, z: 2, dim: true },
    meta: { x: 66, y: 70, r: -6, s: 0.8, z: 4, dim: true },
    aviso: { x: 4, y: 78, r: 0, s: 0.9, z: 5, hide: true },
  },
  contas: {
    contas: { x: 18, y: 10, r: 0, s: 1.25, z: 10 },
    aviso: { x: 44, y: 66, r: -2, s: 1.15, z: 11 },
    saldo: { x: -4, y: -3, r: -6, s: 0.75, z: 2, dim: true },
    cartao: { x: 70, y: -2, r: -16, s: 0.8, z: 3, dim: true },
    fatura: { x: 66, y: 34, r: 8, s: 0.75, z: 4, dim: true },
    meta: { x: -2, y: 68, r: 4, s: 0.8, z: 5, dim: true },
  },
  metas: {
    meta: { x: 20, y: 26, r: 0, s: 1.7, z: 10 },
    saldo: { x: -4, y: -2, r: -6, s: 0.75, z: 2, dim: true },
    cartao: { x: 66, y: -4, r: -16, s: 0.8, z: 3, dim: true },
    fatura: { x: 64, y: 46, r: 7, s: 0.75, z: 4, dim: true },
    contas: { x: -4, y: 56, r: -3, s: 0.75, z: 5, dim: true },
    aviso: { x: 40, y: 78, r: 0, s: 0.9, z: 6, hide: true },
  },
};

function Mesa({ arrangement, settled, className }: { arrangement: Arrangement; settled: boolean; className?: string }) {
  const layout = LAYOUTS[arrangement];
  return (
    <div
      aria-hidden
      className={cn("relative aspect-[7/6] select-none [container-type:inline-size]", className)}
    >
      <div className="absolute inset-0 text-[2.5cqw]">
        {(Object.keys(PIECES) as PieceId[]).map((id, index) => {
          const Piece = PIECES[id];
          const pose = layout[id];
          // Na chegada, as peças pousam na mesa: partem um pouco abaixo e mais giradas.
          const y = settled ? pose.y : pose.y + 6;
          const r = settled ? pose.r : pose.r * 1.8 + (index % 2 ? 3 : -3);
          const style: CSSProperties = {
            transform: `translate(${pose.x}cqw, ${y}cqw) rotate(${r}deg) scale(${pose.s})`,
            zIndex: pose.z,
            opacity: pose.hide ? 0 : pose.dim ? 0.32 : 1,
            filter: pose.dim ? "blur(1.5px) saturate(0.5)" : "none",
            transitionDelay: settled ? "0ms" : `${index * 70}ms`,
          };
          return (
            <div
              key={id}
              style={style}
              className={cn(
                "absolute left-0 top-0 origin-top-left transition-[transform,opacity,filter] duration-[900ms] motion-reduce:transition-none",
                ease,
              )}
            >
              <Piece />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Navegação ──────────────────────────────────────────────────────────────

const navLinks = [
  { id: "como-funciona", label: "Como funciona" },
  { id: "seguranca", label: "Segurança" },
  { id: "precos", label: "Preço" },
  { id: "duvidas", label: "Dúvidas" },
];

function Logo() {
  return (
    <span className="flex shrink-0 items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-icon bg-[#bef264] text-[#10231a]">
        <Coins className="h-5 w-5" />
      </span>
      <span className="font-display text-xl font-extrabold tracking-[-0.03em] text-white">MeuGasto</span>
    </span>
  );
}

function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b transition-[background-color,border-color] duration-300",
        scrolled ? "border-white/10 bg-[#0b2419]" : "border-transparent bg-[#0e2a1e]",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-6 px-4 sm:h-[4.5rem] sm:px-6 lg:px-10">
        <Link to="/" className={cn("rounded-icon", focusRing)} aria-label="MeuGasto, início">
          <Logo />
        </Link>

        <nav aria-label="Seções" className="hidden items-center gap-7 md:flex">
          {navLinks.map(({ id, label }) => (
            <a
              key={id}
              href={`#${id}`}
              onClick={(event) => scrollToId(event, id)}
              className={cn(
                "rounded-sm text-sm font-medium text-[#bdd0bb] transition-colors duration-200 hover:text-white",
                focusRing,
              )}
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-4">
          <Link
            to="/login"
            className={cn(
              "rounded-pill px-3 py-2 text-sm font-semibold text-[#eef5ec] transition-colors duration-200 hover:bg-white/10",
              focusRing,
            )}
          >
            Entrar
          </Link>
          <Link to="/register" className={cn(limeButton, "px-4 py-2 text-sm")}>
            Teste grátis
          </Link>
        </div>
      </div>
    </header>
  );
}

// ─── Hero + argumentos (a mesa fica fixa enquanto o texto passa) ─────────────

const steps: { id: Exclude<Arrangement, "hero">; title: ReactNode; body: string; detail: string }[] = [
  {
    id: "saldo",
    title: (
      <>
        Três contas, um número.
        <br /> Quanto você tem, agora.
      </>
    ),
    body: "Banco, dinheiro na carteira e poupança somados num saldo só, atualizado a cada lançamento. O cartão de crédito fica de fora: compra no cartão é dívida, não dinheiro que já saiu.",
    detail: "O saldo do topo é sempre a soma das suas carteiras, não uma estimativa.",
  },
  {
    id: "cartao",
    title: (
      <>
        Fatura sem surpresa.
        <br /> Parcela sem mistério.
      </>
    ),
    body: "Cada compra cai na fatura do ciclo certo, parcelamentos se espalham pelos meses e um estorno desconta sozinho. Você sabe quanto vence em cada mês antes de ele chegar.",
    detail: "Pagamento parcial e desfazer pagamento também estão lá.",
  },
  {
    id: "contas",
    title: (
      <>
        Vencimento não se esquece.
        <br /> O app lembra por você.
      </>
    ),
    body: "Aluguel, internet, assinaturas: cadastre uma vez como recorrente e cada mês aparece sozinho. No dia do vencimento, o aviso chega. Assinatura cobrada no cartão já entra na fatura.",
    detail: "Contas a receber também: o freela de dia 12 não passa batido.",
  },
  {
    id: "metas",
    title: (
      <>
        Meta que anda sozinha.
        <br /> Sem conta de cabeça.
      </>
    ),
    body: "Defina valor e prazo e vincule a uma categoria. Cada lançamento nela atualiza o progresso da meta, sem planilha paralela.",
    detail: "Viagem, reserva, carro novo: cada meta com a sua categoria.",
  },
];

function StepPiece({ id }: { id: Exclude<Arrangement, "hero"> }) {
  // Versão em linha (mobile) da peça em foco de cada argumento.
  if (id === "saldo") return <SaldoPiece />;
  if (id === "cartao") return <FaturaPiece />;
  if (id === "contas") return <ContasPiece />;
  return <MetaPiece />;
}

function HeroAndMesa() {
  const [arrangement, setArrangement] = useState<Arrangement>("hero");
  const [settled, setSettled] = useState(false);
  const blockRefs = useRef<Map<Arrangement, HTMLElement>>(new Map());

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setSettled(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    // O bloco de texto que cruza o meio da tela decide o arranjo da mesa.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const key = (entry.target as HTMLElement).dataset.arrangement as Arrangement | undefined;
          if (key) setArrangement(key);
        }
      },
      { rootMargin: "-48% 0px -48% 0px" },
    );
    blockRefs.current.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  const register = (key: Arrangement) => (node: HTMLElement | null) => {
    if (node) blockRefs.current.set(key, node);
    else blockRefs.current.delete(key);
  };

  return (
    <div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 px-4 sm:px-6 lg:grid-cols-12 lg:gap-10 lg:px-10">
      <div className="lg:col-span-5">
        {/* hero */}
        <section
          ref={register("hero")}
          data-arrangement="hero"
          aria-labelledby="hero-title"
          className="flex flex-col justify-center pb-6 pt-12 sm:pt-16 lg:min-h-[calc(100svh-4.5rem)] lg:py-16"
        >
          <h1 id="hero-title" className={cn(display, "text-[2.6rem] leading-[0.98] text-white sm:text-6xl lg:text-[4.1rem]")}>
            Controle seus gastos{" "}
            <span className="block text-[#bef264]">e sua vida financeira em um só lugar.</span>
          </h1>
          <p className="mt-6 max-w-[34rem] text-pretty text-xl font-semibold leading-snug text-white sm:text-2xl">
            Saiba quanto você tem. Sem conectar o banco.
          </p>
          <p className="mt-4 max-w-[34rem] text-pretty text-lg leading-relaxed text-[#bdd0bb]">
            O MeuGasto é um aplicativo de controle financeiro pessoal: carteiras, cartão, contas a pagar e metas num só
            lugar. Você lança ou importa o extrato; o MeuGasto faz as contas.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link to="/register" className={cn(limeButton, "px-7 py-3.5 text-base")}>
              Começar teste grátis
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/login"
              className={cn(
                "inline-flex items-center justify-center rounded-pill px-6 py-3.5 text-base font-semibold text-[#eef5ec] ring-1 ring-white/20 transition-colors duration-200 hover:bg-white/10",
                focusRing,
              )}
            >
              Já tenho conta
            </Link>
          </div>
          <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#bdd0bb]">
            {["15 dias grátis", "Sem cartão de crédito", "Cancele quando quiser"].map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-[#bef264]" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        {/* mesa no mobile: uma vez, logo abaixo do hero, sangrando para a direita */}
        <div className="-mr-4 overflow-hidden pb-4 pt-10 sm:-mr-6 lg:hidden">
          <Mesa arrangement="hero" settled={settled} className="w-[118%] sm:w-[104%]" />
          <p className="mt-6 text-xs text-[#8fa68d]">Valores ilustrativos.</p>
        </div>

        {/* argumentos */}
        <div id="como-funciona" className="scroll-mt-20 pb-10 lg:pb-[20vh]">
          {steps.map((step) => (
            <section
              key={step.id}
              ref={register(step.id)}
              data-arrangement={step.id}
              aria-labelledby={`step-${step.id}`}
              className="flex flex-col justify-center border-t border-white/10 py-14 lg:min-h-[78vh] lg:border-t-0 lg:py-0"
            >
              <h2 id={`step-${step.id}`} className={cn(display, "text-[2rem] leading-[1.02] text-white sm:text-[2.6rem]")}>
                {step.title}
              </h2>
              <p className="mt-5 max-w-[36rem] text-pretty text-base leading-relaxed text-[#bdd0bb] sm:text-[1.0625rem]">
                {step.body}
              </p>
              <p className="mt-5 flex max-w-[36rem] items-start gap-2 text-sm font-medium text-[#eef5ec]">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#bef264]" />
                {step.detail}
              </p>
              <div className="mt-9 text-[15px] lg:hidden" aria-hidden>
                <StepPiece id={step.id} />
              </div>
            </section>
          ))}
        </div>
      </div>

      {/* mesa fixa (desktop) */}
      <div className="hidden lg:col-span-7 lg:block">
        <div className="sticky top-[4.5rem] flex h-[calc(100svh-4.5rem)] flex-col justify-center py-10">
          <Mesa arrangement={arrangement} settled={settled} className="w-[108%] translate-x-[7%]" />
          <p className="mt-4 text-right text-xs text-[#8fa68d]">Valores ilustrativos.</p>
        </div>
      </div>
    </div>
  );
}

// ─── Menos digitação ────────────────────────────────────────────────────────
// Mesmas peças de papel da mesa, agora pousadas no chão escuro do app.

const categoryBars = [
  { name: "Mercado", pct: 31, value: "R$ 1.102,40", color: "#16a34a" },
  { name: "Moradia", pct: 27, value: "R$ 960,00", color: "#2563eb" },
  { name: "Transporte", pct: 16, value: "R$ 568,90", color: "#ea580c" },
  { name: "Saúde", pct: 11, value: "R$ 391,20", color: "#0891b2" },
  { name: "Lazer", pct: 9, value: "R$ 320,00", color: "#7c3aed" },
];

const paper = "rounded-[20px] bg-[#f6f8f3] text-[#10231a] shadow-[0_1.75rem_3.5rem_-1.25rem_rgba(0,0,0,0.75)]";

function MenosDigitacao() {
  return (
    <section aria-labelledby="menos-digitacao" className="bg-[#0a0a0a] py-24 sm:py-32">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-10">
        <h2 id="menos-digitacao" className={cn(display, "max-w-3xl text-[2.2rem] leading-[1.02] text-white sm:text-5xl")}>
          Menos digitação.{" "}
          <span className="block text-[#8fa68d]">Mais tempo pra decidir.</span>
        </h2>

        {/* insights */}
        <div className="mt-16 grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-4">
            <h3 className="font-display text-2xl font-bold tracking-[-0.025em] text-white sm:text-3xl">Pra onde foi o dinheiro.</h3>
            <p className="mt-3 max-w-md leading-relaxed text-[#a9b8a6]">
              Gastos por categoria e por mês, com a evolução do seu saldo, sem montar gráfico nenhum.
            </p>
          </div>
          <div aria-hidden className={cn(paper, "p-6 sm:p-8 lg:col-span-8 lg:-rotate-1")}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="font-display text-xl font-extrabold tracking-[-0.02em]">Setembro</span>
              <span className="text-sm tabular-nums text-[#4b5f52]">R$ 3.342,50 em gastos</span>
            </div>
            <ul className="mt-6 space-y-4">
              {categoryBars.map((bar) => (
                <li key={bar.name} className="grid grid-cols-[5.25rem_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[7rem_1fr_7rem]">
                  <span className="text-[#34473b]">{bar.name}</span>
                  <span className="h-2.5 overflow-hidden rounded-pill bg-[#e5ecdf]">
                    <span className="block h-full rounded-pill" style={{ width: `${bar.pct * 3}%`, background: bar.color }} />
                  </span>
                  <span className="text-right font-semibold tabular-nums">{bar.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* extrato + biometria */}
        <div className="mt-20 grid grid-cols-1 gap-16 md:grid-cols-2 md:gap-10 lg:gap-16">
          <div>
            <h3 className="font-display text-2xl font-bold tracking-[-0.025em] text-white sm:text-3xl">Importe o extrato.</h3>
            <p className="mt-3 max-w-md leading-relaxed text-[#a9b8a6]">
              Suba o arquivo OFX do seu banco, revise e confirme. O que já estava lançado é ignorado.
            </p>
            <div aria-hidden className={cn(paper, "mt-8 flex items-center gap-3 p-4 sm:p-5 md:rotate-1")}>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-icon bg-[#ecfccb] text-[#3f6212]">
                <FileText className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1 text-sm">
                <span className="block truncate font-semibold">extrato-setembro.ofx</span>
                <span className="text-[#4b5f52]">38 importados · 3 já existiam</span>
              </span>
              <Check className="h-5 w-5 shrink-0 text-[#4d7c0f]" />
            </div>
          </div>

          <div>
            <h3 className="font-display text-2xl font-bold tracking-[-0.025em] text-white sm:text-3xl">Entre com a digital.</h3>
            <p className="mt-3 max-w-md leading-relaxed text-[#a9b8a6]">
              Face ID ou digital no lugar da senha, processados no seu próprio aparelho.
            </p>
            <div aria-hidden className={cn(paper, "mt-8 flex items-center gap-3 p-4 sm:p-5 md:-rotate-1")}>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#bef264] text-[#10231a]">
                <Fingerprint className="h-5 w-5" />
              </span>
              <span className="text-sm">
                <span className="block font-semibold">Entrar com biometria</span>
                <span className="text-[#4b5f52]">Toque no sensor para continuar</span>
              </span>
            </div>
          </div>
        </div>

        <p className="mt-10 text-xs text-[#8fa68d]">Valores ilustrativos.</p>
      </div>
    </section>
  );
}

// ─── Segurança ──────────────────────────────────────────────────────────────

const securityPoints: { lead: string; text: string }[] = [
  { lead: "Nada de acesso ao banco.", text: "O MeuGasto nunca se conecta à sua conta bancária: você lança ou importa o extrato, e só." },
  { lead: "Conexão criptografada.", text: "Toda comunicação com o app passa por HTTPS, em infraestrutura segura." },
  { lead: "Senha fora da rede.", text: "Com a biometria, sua senha não precisa trafegar a cada entrada." },
  { lead: "Só você vê seus dados.", text: "Nunca compartilhamos nem visualizamos o que você lança." },
];

function Seguranca() {
  return (
    <section id="seguranca" aria-labelledby="seguranca-title" className="scroll-mt-16 bg-[#0a0a0a] pb-24 sm:pb-32">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-14 border-t border-[#1f2b24] px-4 pt-20 sm:px-6 sm:pt-24 lg:grid-cols-12 lg:gap-16 lg:px-10">
        <div className="lg:col-span-5">
          <h2 id="seguranca-title" className={cn(display, "text-[2.2rem] leading-[1.02] text-white sm:text-5xl")}>
            Seus dados ficam com você.{" "}
            <span className="block text-[#bef264]">E só com você.</span>
          </h2>

          {/* a promessa como peça do app: nenhum banco conectado */}
          <div aria-hidden className={cn(paper, "mt-12 max-w-sm p-5 sm:p-6 lg:-rotate-2")}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[#4b5f52]">Bancos conectados</span>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[#10231a] text-[#bef264]">
                <Lock className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-1 font-display text-4xl font-extrabold tracking-[-0.03em]">Nenhum</p>
            <p className="mt-4 border-t border-[#dfe7da] pt-4 text-sm leading-relaxed text-[#34473b]">
              Seus lançamentos entram por você: manualmente ou pelo arquivo OFX do extrato.
            </p>
          </div>
        </div>

        <ul className="self-end border-t border-[#1f2b24] lg:col-span-7">
          {securityPoints.map(({ lead, text }) => (
            <li key={lead} className="border-b border-[#1f2b24] py-7">
              <p className="max-w-2xl text-xl leading-snug text-[#a9b8a6] sm:text-2xl">
                <strong className="font-display font-bold tracking-[-0.02em] text-white">{lead}</strong> {text}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ─── Preço ──────────────────────────────────────────────────────────────────

type BillingCycle = "monthly" | "annual";

// Crossfade: quando `value` muda, primeiro esconde o conteúdo antigo (fade-out) e só troca
// o valor exibido depois que a transição de saída terminou. Evita a troca seca de texto.
function useCrossfade<T>(value: T, duration = 200) {
  const [displayValue, setDisplayValue] = useState(value);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (value === displayValue) return;
    setVisible(false);
    const timeout = setTimeout(() => {
      setDisplayValue(value);
      setVisible(true);
    }, duration);
    return () => clearTimeout(timeout);
  }, [value, displayValue, duration]);

  return { displayValue, visible };
}

const basicFeatures = [
  "Todas as carteiras num saldo só",
  "Cartões com faturas, parcelamentos e estornos",
  "Contas a pagar e receber, com recorrência",
  "Metas financeiras vinculadas a categorias",
  "Importação de extrato OFX",
  "Insights por categoria e login biométrico",
];

const businessFeatures = [
  "Tudo do plano Básico",
  "Versão personalizada para o seu negócio",
  "Manutenções corretivas prioritárias",
  "Atualizações dedicadas",
];

function BusinessContactCta() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={cn(
          "flex w-full cursor-pointer items-center justify-center gap-2 rounded-pill px-6 py-3.5 text-sm font-bold text-[#eef5ec] ring-1 ring-white/25 transition-colors duration-200 hover:bg-white/10",
          focusRing,
        )}
      >
        Falar com vendas
        <ArrowRight className="h-4 w-4" />
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
            aria-hidden="true"
            tabIndex={-1}
          />
          <div className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl bg-[#f6f8f3] text-left text-[#10231a] shadow-[0_1.5rem_3rem_-1rem_rgba(0,0,0,0.6)]">
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Interesse no plano Empresarial")}`}
              className="flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-colors duration-200 hover:bg-[#e5ecdf] focus-visible:bg-[#e5ecdf] focus-visible:outline-none"
            >
              <Mail className="h-4 w-4" />
              Por e-mail
            </a>
            <a
              href={`https://wa.me/${SALES_WHATSAPP_NUMBER}?text=${encodeURIComponent(SALES_WHATSAPP_MESSAGE)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 border-t border-[#dfe7da] px-4 py-3 text-sm font-semibold transition-colors duration-200 hover:bg-[#e5ecdf] focus-visible:bg-[#e5ecdf] focus-visible:outline-none"
            >
              <MessageCircle className="h-4 w-4" />
              Pelo WhatsApp
            </a>
          </div>
        </>
      )}
    </div>
  );
}

function Precos() {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const isAnnual = cycle === "annual";
  const { displayValue: displayCycle, visible } = useCrossfade(cycle);
  const shownAnnual = displayCycle === "annual";
  const fade = cn("transition-[opacity,transform] duration-200 ease-out", visible ? "opacity-100" : "-translate-y-1 opacity-0");

  return (
    <section id="precos" aria-labelledby="precos-title" className="relative scroll-mt-16 overflow-hidden bg-[#0e2a1e] py-24 sm:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-48 -top-56 h-[36rem] w-[36rem] rounded-full bg-[radial-gradient(closest-side,rgba(190,242,100,0.12),rgba(255,255,255,0.04)_55%,transparent_72%)]"
      />
      <div className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-10">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <h2 id="precos-title" className={cn(display, "max-w-2xl text-[2.2rem] leading-[1.02] text-white sm:text-5xl")}>
            Um plano pra você.{" "}
            <span className="block text-[#bef264]">Quinze dias pra decidir.</span>
          </h2>

          <div role="group" aria-label="Ciclo de cobrança" className="relative inline-flex self-start rounded-pill bg-[#091f15] p-1 ring-1 ring-white/10 lg:self-auto">
            <span
              aria-hidden
              className={cn(
                "absolute inset-y-1 left-1 w-28 rounded-pill bg-[#bef264] transition-transform duration-300",
                ease,
                isAnnual && "translate-x-28",
              )}
            />
            {(["monthly", "annual"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setCycle(value)}
                aria-pressed={cycle === value}
                className={cn(
                  "relative z-10 w-28 cursor-pointer rounded-pill py-2.5 text-sm font-bold transition-colors duration-300",
                  focusRing,
                  cycle === value ? "text-[#10231a]" : "text-[#bdd0bb] hover:text-white",
                )}
              >
                {value === "monthly" ? "Mensal" : "Anual"}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Básico */}
          <div className="flex flex-col rounded-[24px] bg-[#f6f8f3] p-7 text-[#10231a] shadow-[0_2rem_4rem_-1.5rem_rgba(0,0,0,0.55)] sm:p-10 lg:col-span-7">
            <h3 className="font-display text-2xl font-extrabold tracking-[-0.03em]">Básico</h3>
            <p className="mt-1 text-[#4b5f52]">Para organizar a sua vida financeira.</p>
            <div className={cn("mt-7", fade)}>
              <p className="font-display text-5xl font-extrabold tracking-[-0.04em] tabular-nums sm:text-6xl">
                {shownAnnual ? "R$ 299,90" : "R$ 29,90"}
                <span className="ml-1 font-body text-lg font-medium tracking-normal text-[#4b5f52]">
                  {shownAnnual ? "/ano" : "/mês"}
                </span>
              </p>
              <p className="mt-2 text-sm font-semibold text-[#3f6212]">
                {shownAnnual
                  ? "Equivale a R$ 24,99/mês, cerca de 2 meses grátis (16%)"
                  : "ou R$ 299,90/ano, cerca de 2 meses grátis (16%)"}
              </p>
            </div>
            <ul className="mt-8 grid grid-cols-1 gap-x-8 gap-y-3 border-t border-[#dfe7da] pt-7 sm:grid-cols-2">
              {basicFeatures.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-[0.9375rem] text-[#34473b]">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#4d7c0f]" />
                  <span className="min-w-0">{feature}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-9">
              <Link
                to="/register"
                className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-pill bg-[#10231a] px-7 py-4 text-base font-bold text-[#bef264] transition-[background-color,transform] duration-200 hover:bg-[#163a2a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10231a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f6f8f3] active:scale-[0.98] sm:w-auto"
              >
                Começar teste grátis
                <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="mt-3 text-sm text-[#4b5f52]">15 dias grátis, sem cartão de crédito. Cancele quando quiser.</p>
            </div>
          </div>

          {/* Empresarial */}
          <div className="flex flex-col rounded-[24px] bg-[#163a2a] p-7 text-[#eef5ec] ring-1 ring-white/10 sm:p-10 lg:col-span-5">
            <h3 className="font-display text-2xl font-extrabold tracking-[-0.03em] text-white">Empresarial</h3>
            <p className="mt-1 text-[#bdd0bb]">Uma versão do MeuGasto feita para o seu negócio.</p>
            <div className={cn("mt-7", fade)}>
              <p className="text-sm text-[#bdd0bb]">A partir de</p>
              <p className="font-display text-4xl font-extrabold tracking-[-0.04em] text-white tabular-nums sm:text-5xl">
                {shownAnnual ? "R$ 599,90" : "R$ 49,90"}
                <span className="ml-1 font-body text-lg font-medium tracking-normal text-[#bdd0bb]">
                  {shownAnnual ? "/ano" : "/mês"}
                </span>
              </p>
              <p className="mt-2 text-sm text-[#bdd0bb]">Valor final sob consulta, conforme o seu negócio.</p>
            </div>
            <ul className="mt-8 space-y-3 border-t border-white/10 pt-7">
              {businessFeatures.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-[0.9375rem] text-[#dbe7d8]">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#bef264]" />
                  <span className="min-w-0">{feature}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-9">
              <BusinessContactCta />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Dúvidas + contato ──────────────────────────────────────────────────────

// Estas perguntas também são publicadas como FAQPage (JSON-LD) no index.html.
// Ao mexer aqui, atualize lá — structured data precisa bater com o texto visível.
const faqs: { question: string; answer: string }[] = [
  {
    question: "Como funciona o teste grátis de 15 dias?",
    answer:
      "Você cria sua conta e usa o app completo por 15 dias sem pagar nada. Só pedimos pagamento se você decidir continuar.",
  },
  {
    question: "Preciso conectar minha conta bancária?",
    answer:
      "Não. Você cadastra suas transações manualmente ou importa o extrato do seu banco via arquivo OFX. O MeuGasto não acessa sua conta bancária diretamente.",
  },
  {
    question: "Como cancelo?",
    answer: "A qualquer momento, direto nas configurações da sua conta, sem precisar ligar ou mandar e-mail.",
  },
  {
    question: "Meus dados financeiros estão seguros?",
    answer:
      "Toda comunicação é criptografada (HTTPS) e o login biométrico não expõe sua senha na rede. Veja mais na seção de Segurança acima.",
  },
  {
    question: "Qual a diferença entre o plano Básico e o Empresarial?",
    answer:
      "O Básico dá acesso completo ao MeuGasto para uso pessoal, com assinatura direta pelo app. O Empresarial é uma versão personalizada para o seu negócio, com manutenções corretivas prioritárias e atualizações dedicadas. O valor final e o escopo são definidos em conversa com nosso time.",
  },
  {
    question: "Posso trocar entre mensal e anual depois de assinar?",
    answer:
      "Sim. No plano Básico, você troca entre mensal e anual quando quiser, direto nas configurações da conta, e a mudança vale a partir do próximo ciclo de cobrança. No Empresarial, qualquer ajuste é combinado direto com nosso time.",
  },
  {
    question: "O teste grátis de 15 dias vale para qual plano?",
    answer:
      "Só para o plano Básico. O Empresarial funciona por consulta comercial, fale com a gente pra montar a melhor proposta pro seu negócio.",
  },
];

function FAQItem({ question, answer, isOpen, onToggle, id }: { question: string; answer: string; isOpen: boolean; onToggle: () => void; id: string }) {
  return (
    <li className="border-b border-[#1f2b24]">
      <h3 className="font-body">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={id}
          className="group flex w-full cursor-pointer items-center justify-between gap-6 py-5 text-left text-lg font-semibold text-white focus-visible:outline-none"
        >
          <span className="min-w-0 rounded-sm group-focus-visible:ring-2 group-focus-visible:ring-[#bef264] group-focus-visible:ring-offset-4 group-focus-visible:ring-offset-[#0a0a0a]">
            {question}
          </span>
          <span
            className={cn(
              "grid h-8 w-8 shrink-0 place-items-center rounded-full ring-1 transition-[transform,background-color,color] duration-300",
              ease,
              isOpen ? "rotate-45 bg-[#bef264] text-[#10231a] ring-[#bef264]" : "text-[#a9b8a6] ring-[#2f4a3c] group-hover:text-white",
            )}
          >
            <Plus className="h-4 w-4" />
          </span>
        </button>
      </h3>
      <div
        id={id}
        className={cn("grid transition-[grid-template-rows] duration-300", ease, isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
      >
        <div className="overflow-hidden">
          <p className="max-w-2xl pb-6 leading-relaxed text-[#a9b8a6]">{answer}</p>
        </div>
      </div>
    </li>
  );
}

function Duvidas() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard indisponível (ex: contexto não seguro), link mailto continua funcionando.
    }
  };

  return (
    <section id="duvidas" aria-labelledby="duvidas-title" className="scroll-mt-16 bg-[#0a0a0a] py-24 sm:py-32">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-14 px-4 sm:px-6 lg:grid-cols-12 lg:gap-10 lg:px-10">
        <div className="lg:col-span-5">
          <h2 id="duvidas-title" className={cn(display, "text-[2.2rem] leading-[1.02] text-white sm:text-5xl")}>
            Ficou alguma dúvida?{" "}
            <span className="block text-[#8fa68d]">A gente responde.</span>
          </h2>

          <div id="contato" className="mt-10 space-y-3">
            <div className="flex items-center gap-2">
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="flex min-w-0 items-center gap-3 rounded-sm text-base font-semibold text-[#bef264] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bef264] focus-visible:ring-offset-4 focus-visible:ring-offset-[#0a0a0a]"
              >
                <Mail className="h-5 w-5 shrink-0" />
                <span className="break-all">{CONTACT_EMAIL}</span>
              </a>
              <button
                type="button"
                onClick={handleCopy}
                aria-label={copied ? "E-mail copiado" : "Copiar e-mail"}
                title={copied ? "Copiado!" : "Copiar e-mail"}
                className={cn(
                  "grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full ring-1 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bef264]",
                  copied ? "bg-[#bef264] text-[#10231a] ring-[#bef264]" : "text-[#a9b8a6] ring-[#2f4a3c] hover:text-white",
                )}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <a
              href={`https://wa.me/${SALES_WHATSAPP_NUMBER}?text=${encodeURIComponent(CONTACT_WHATSAPP_MESSAGE)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-fit items-center gap-3 rounded-sm text-base font-semibold text-[#bef264] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bef264] focus-visible:ring-offset-4 focus-visible:ring-offset-[#0a0a0a]"
            >
              <MessageCircle className="h-5 w-5 shrink-0" />
              {CONTACT_WHATSAPP_DISPLAY}
            </a>
          </div>
        </div>

        <ul className="border-t border-[#1f2b24] lg:col-span-7">
          {faqs.map((faq, index) => (
            <FAQItem
              key={faq.question}
              id={`faq-${index}`}
              question={faq.question}
              answer={faq.answer}
              isOpen={openIndex === index}
              onToggle={() => setOpenIndex((current) => (current === index ? null : index))}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}

// ─── Fechamento ─────────────────────────────────────────────────────────────

function Fechamento() {
  return (
    <section aria-labelledby="fechamento-title" className="relative overflow-hidden bg-[#0e2a1e] py-24 sm:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 -top-48 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(closest-side,rgba(190,242,100,0.16),rgba(255,255,255,0.05)_55%,transparent_72%)]"
      />
      <div className="relative mx-auto flex w-full max-w-7xl flex-col items-start gap-10 px-4 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-10">
        <h2 id="fechamento-title" className={cn(display, "max-w-3xl text-[2.5rem] leading-[0.98] text-white sm:text-6xl lg:text-7xl")}>
          Comece hoje.{" "}
          <span className="block text-[#bef264]">Em 15 dias você sabe se é pra você.</span>
        </h2>
        <div className="shrink-0">
          <Link to="/register" className={cn(limeButton, "px-8 py-4 text-base")}>
            Começar teste grátis
            <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="mt-3 text-sm text-[#bdd0bb]">Sem cartão de crédito. Cancele quando quiser.</p>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-[#091f15] py-10 text-sm text-[#bdd0bb]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10">
        <Logo />
        <p>
          © {new Date().getFullYear()} MeuGasto · Desenvolvido pela{" "}
          <a
            href={AZUOS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-sm font-semibold text-[#bef264] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bef264] focus-visible:ring-offset-2 focus-visible:ring-offset-[#091f15]"
          >
            Azuos Dev
          </a>
        </p>
      </div>
    </footer>
  );
}

export function LandingPage() {
  useLandingChrome();

  return (
    <div className="min-h-screen overflow-x-clip bg-[#0e2a1e] font-body text-[#eef5ec] selection:bg-[#bef264] selection:text-[#10231a]">
      <Nav />
      <main>
        <div className="relative">
          {/* luz ambiente do hero, a mesma "lua" do painel de login */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-80 -top-80 h-[44rem] w-[44rem] lg:-right-56 lg:-top-40 rounded-full bg-[radial-gradient(closest-side,rgba(190,242,100,0.14),rgba(255,255,255,0.04)_55%,transparent_72%)]"
          />
          <HeroAndMesa />
        </div>
        <MenosDigitacao />
        <Seguranca />
        <Precos />
        <Duvidas />
        <Fechamento />
      </main>
      <Footer />
    </div>
  );
}
