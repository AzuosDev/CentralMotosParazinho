import { CalendarClock, Fuel } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "../lib/utils";
import { BrandBadge } from "./BrandMark";

/*
 * Painel de destaques das telas de autenticação (só a partir de lg).
 *
 * É a superfície de marca da Central Motos: o painel de instrumentos. Preto
 * #050505 com um banho de vermelho baixo, como farol batendo no asfalto, e as
 * peças do app desenhadas como mostradores — superfície escura, régua fina de
 * luz na borda de cima, número tabular grande. O progresso da meta é um
 * ponteiro de conta-giros, não uma barra.
 *
 * É independente de tema: idêntico no claro e no escuro, porque é a marca e não
 * a interface. Por isso as cores aqui são valores literais e não tokens — a
 * mesma divisão que o resto do app já fazia para a camada de marca.
 * Os valores mostrados são exemplos, não dados do usuário.
 */

const BRAND = "#e10600";
const INK = "#ffffff";
const INK_SOFT = "#a3a3a3";
const SURFACE = "#0d0d0d";
const SURFACE_RAISED = "#1a1a1a";
const RULE = "#333333";

const SLIDES = [
  {
    title: "Suas faturas sob controle",
    body: "Cadastre seus cartões e acompanhe cada fatura e parcelamento, sabendo exatamente quanto vence em cada mês.",
  },
  {
    title: "Metas que andam sozinhas",
    body: "Vincule uma categoria a uma meta e cada lançamento nela atualiza o progresso, sem conta de cabeça.",
  },
  {
    title: "Nenhuma conta esquecida",
    body: "Contas a pagar e a receber, recorrentes ou não, com aviso no dia do vencimento.",
  },
] as const;

const INTERVAL_MS = 3500;

/** Uma curva só em todo o painel, e sombra com deslocamento e borrão de verdade. */
const lift =
  "transition-[transform,box-shadow,border-color] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]";
const panelShadow = "0 1.5rem 3rem -1rem rgba(0,0,0,0.85)";
const panelShadowLifted = "0 2.25rem 4rem -1rem rgba(0,0,0,0.9)";

export function AuthShowcase() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setTimeout(
      () => setActive((i) => (i + 1) % SLIDES.length),
      INTERVAL_MS,
    );
    return () => window.clearTimeout(id);
  }, [active, paused]);

  const slide = SLIDES[active];

  return (
    <section
      aria-roledescription="carrossel"
      aria-label="Recursos do sistema da Central Motos"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="relative flex h-full flex-col overflow-hidden rounded-[28px] bg-[#050505] px-10 pb-10 pt-8 text-white ring-1 ring-white/5 xl:px-14"
    >
      {/* farol no asfalto: a luz da marca entra por baixo, fora da área de leitura */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-56 left-1/2 h-[42rem] w-[52rem] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(225,6,0,0.22),rgba(225,6,0,0.07)_45%,transparent_70%)]"
      />
      {/* ranhura fina na diagonal, como fibra: textura sem virar enfeite */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:repeating-linear-gradient(135deg,rgba(255,255,255,0.025)_0px,rgba(255,255,255,0.025)_1px,transparent_1px,transparent_7px)]"
      />

      <div className="relative flex items-center gap-3">
        <BrandBadge className="h-11 w-11" />
        <span className="flex flex-col leading-none">
          <span className="text-[0.8125rem] font-extrabold uppercase tracking-[0.2em] text-white">
            Central
          </span>
          <span className="text-[0.8125rem] font-extrabold uppercase tracking-[0.2em] text-[#e10600]">
            Motos
          </span>
        </span>
        <span className="ml-auto text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-[#7a7a7a]">
          Parazinho · CE
        </span>
      </div>

      <div className="relative flex flex-1 items-center justify-center py-8">
        <Instruments active={active} />
      </div>

      <div className="relative mx-auto w-full max-w-md text-center">
        <div key={active} className="motion-safe:animate-auth-rise">
          <h2 className="text-balance font-body text-[1.75rem] font-bold leading-tight tracking-[-0.02em] text-white">
            {slide.title}
          </h2>
          <p className="mx-auto mt-3 max-w-[42ch] text-pretty text-[0.9375rem] leading-relaxed text-[#a3a3a3]">
            {slide.body}
          </p>
        </div>

        <div className="mt-8 flex items-center justify-center gap-1">
          {SLIDES.map((s, i) => (
            <button
              key={s.title}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Mostrar recurso ${i + 1} de ${SLIDES.length}: ${s.title}`}
              aria-current={i === active}
              className="group grid h-6 place-items-center px-1 focus-visible:outline-none"
            >
              <span
                className={cn(
                  "block h-1.5 rounded-pill transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-focus-visible:ring-2 group-focus-visible:ring-[#e10600] group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-[#050505]",
                  i === active ? "w-6 bg-[#e10600]" : "w-1.5 bg-white/25 group-hover:bg-white/50",
                )}
              />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Régua de luz na borda de cima: é ela que descola a peça escura do fundo escuro. */
const rim = "inset 0 1px 0 rgba(255,255,255,0.07)";

function Instruments({ active }: { active: number }) {
  return (
    <div aria-hidden className="relative aspect-[10/9] w-full max-w-[440px] select-none">
      {/* cartão */}
      <div
        className={cn(
          "absolute -top-[7%] right-0 z-10 aspect-[1.586] w-[50%] rotate-[-12deg] rounded-[14px] border border-white/10 p-4",
          "bg-[linear-gradient(145deg,#2a2a2a_0%,#101010_55%,#050505_100%)]",
          lift,
          active === 0 && "-translate-y-2 border-[#e10600]/40",
        )}
        style={{ boxShadow: active === 0 ? `${panelShadowLifted}, ${rim}` : `${panelShadow}, ${rim}` }}
      >
        <div className="flex items-start justify-between">
          <span className="text-[0.6875rem] font-extrabold uppercase tracking-[0.18em]" style={{ color: BRAND }}>
            Central Motos
          </span>
          <span className="h-5 w-7 rounded-[5px] bg-[linear-gradient(135deg,#6b6b6b,#2e2e2e)]" />
        </div>
        <p
          className="absolute bottom-4 left-4 font-body text-[0.8125rem] font-semibold tabular-nums tracking-[0.18em]"
          style={{ color: INK }}
        >
          •••• 4821
        </p>
        <p
          className="absolute bottom-4 right-4 text-[0.625rem] font-semibold uppercase tracking-wider"
          style={{ color: INK_SOFT }}
        >
          Crédito
        </p>
      </div>

      {/* fatura */}
      <div
        className={cn(
          "absolute left-[4%] top-[13%] w-[64%] rounded-[18px] border border-white/10 p-5",
          lift,
          active === 0 && "-translate-y-1.5",
        )}
        style={{ backgroundColor: SURFACE, boxShadow: `${panelShadow}, ${rim}` }}
      >
        <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em]" style={{ color: INK_SOFT }}>
          Fatura de outubro
        </p>
        <p className="mt-1 font-body text-[1.625rem] font-bold tabular-nums tracking-[-0.02em]" style={{ color: INK }}>
          R$ 1.284,37
        </p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-pill" style={{ backgroundColor: SURFACE_RAISED }}>
          <div className="h-full w-[43%] rounded-pill" style={{ backgroundColor: BRAND }} />
        </div>
        <p className="mt-1.5 text-[0.6875rem] tabular-nums" style={{ color: INK_SOFT }}>
          43% de R$ 3.000,00 de limite
        </p>
        <ul className="mt-4 space-y-2 border-t pt-3 text-xs" style={{ borderColor: RULE }}>
          {[
            ["Peças e acessórios", "R$ 312,90"],
            ["Combustível", "R$ 239,90"],
            ["Oficina", "R$ 186,40"],
          ].map(([name, value]) => (
            <li key={name} className="flex justify-between">
              <span style={{ color: INK_SOFT }}>{name}</span>
              <span className="font-semibold tabular-nums" style={{ color: INK }}>
                {value}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* meta: ponteiro de conta-giros, não barra */}
      <div
        className={cn(
          "absolute bottom-0 right-0 z-20 flex w-[46%] items-center gap-3 rounded-[16px] border border-white/10 p-4",
          lift,
          active === 1 && "-translate-y-3 border-[#e10600]/50",
        )}
        style={{
          backgroundColor: SURFACE,
          boxShadow: active === 1 ? `${panelShadowLifted}, ${rim}` : `${panelShadow}, ${rim}`,
        }}
      >
        <Gauge percent={68} />
        <span className="min-w-0 leading-tight">
          <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: INK }}>
            <Fuel className="h-3.5 w-3.5" style={{ color: BRAND }} />
            Reserva
          </span>
          <span className="mt-1 block whitespace-nowrap text-[0.6875rem] tabular-nums" style={{ color: INK_SOFT }}>
            R$ 3.400 / 5.000
          </span>
        </span>
      </div>

      {/* conta a pagar */}
      <div
        className={cn(
          "absolute bottom-[9%] left-0 z-20 flex items-center gap-2.5 rounded-pill border border-white/10 py-2 pl-2 pr-4",
          lift,
          active === 2 && "-translate-y-3 border-[#e10600]/50",
        )}
        style={{
          backgroundColor: SURFACE_RAISED,
          boxShadow: active === 2 ? `${panelShadowLifted}, ${rim}` : `${panelShadow}, ${rim}`,
        }}
      >
        <span className="grid h-8 w-8 place-items-center rounded-full" style={{ backgroundColor: BRAND }}>
          <CalendarClock className="h-4 w-4" style={{ color: INK }} />
        </span>
        <span className="text-xs leading-tight">
          <span className="block font-semibold" style={{ color: INK }}>
            Aluguel
          </span>
          <span style={{ color: INK_SOFT }}>vence amanhã</span>
        </span>
      </div>
    </div>
  );
}

function Gauge({ percent }: { percent: number }) {
  // Arco de 240°, aberto embaixo — o desenho de um conta-giros.
  const r = 22;
  const sweep = (240 / 360) * 2 * Math.PI * r;
  const full = 2 * Math.PI * r;

  return (
    <span className="relative grid h-14 w-14 shrink-0 place-items-center">
      <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-[210deg]">
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke={SURFACE_RAISED}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${sweep} ${full}`}
        />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke={BRAND}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${(sweep * percent) / 100} ${full}`}
        />
      </svg>
      <span
        className="absolute font-body text-[0.8125rem] font-bold tabular-nums"
        style={{ color: INK }}
      >
        {percent}%
      </span>
    </span>
  );
}
