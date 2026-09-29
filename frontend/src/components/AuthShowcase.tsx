import { ArrowUpRight, CalendarClock, Plane } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "../lib/utils";

/*
 * Painel de destaques das telas de autenticação (só a partir de lg).
 * É uma superfície de marca: o verde-floresta e o lima são os mesmos nos dois
 * temas, por isso as cores ficam aqui e não nos tokens de tema.
 * Os valores da ilustração são exemplos, não dados do usuário.
 */

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

const lift =
  "transition-[transform,box-shadow] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]";

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
      aria-label="Recursos do MeuGasto"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="relative flex h-full flex-col overflow-hidden rounded-[28px] bg-[#0e2a1e] px-10 pb-10 pt-8 text-[#eef5ec] xl:px-14"
    >
      {/* luz ambiente: círculo claro no canto, como uma lua atrás da ilustração */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 -top-48 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle_at_35%_65%,rgba(190,242,100,0.16),rgba(255,255,255,0.05)_55%,transparent_72%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(to_top,rgba(5,20,13,0.55),transparent)]"
      />

      <div className="relative flex justify-end">
        <Link
          to="/landing"
          className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm font-medium text-[#cfe0cc] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bef264]"
        >
          Conhecer o MeuGasto
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="relative flex flex-1 items-center justify-center py-8">
        <Illustration active={active} />
      </div>

      <div className="relative mx-auto w-full max-w-md text-center">
        <div key={active} className="motion-safe:animate-auth-rise">
          <h2 className="text-balance font-body text-[1.75rem] font-bold leading-tight tracking-[-0.02em] text-white">
            {slide.title}
          </h2>
          <p className="mx-auto mt-3 max-w-[42ch] text-pretty text-[0.9375rem] leading-relaxed text-[#bdd0bb]">
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
                  "block h-1.5 rounded-pill transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-focus-visible:ring-2 group-focus-visible:ring-[#bef264] group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-[#0e2a1e]",
                  i === active ? "w-6 bg-[#bef264]" : "w-1.5 bg-white/30 group-hover:bg-white/60",
                )}
              />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function Illustration({ active }: { active: number }) {
  return (
    <div aria-hidden className="relative aspect-[10/9] w-full max-w-[440px] select-none">
      {/* cartão */}
      <div
        className={cn(
          "absolute -top-[3%] right-0 z-10 aspect-[1.586] w-[52%] rotate-[-14deg] rounded-[14px] p-4",
          "bg-[linear-gradient(135deg,#d9f99d_0%,#a3e635_42%,#65a30d_100%)] text-[#132414]",
          "shadow-[0_18px_40px_-12px_rgba(0,0,0,0.55)]",
          lift,
          active === 0 && "-translate-y-2 shadow-[0_28px_50px_-12px_rgba(0,0,0,0.6)]",
        )}
      >
        <div className="flex items-start justify-between">
          <span className="font-body text-sm font-bold tracking-tight">MeuGasto</span>
          <span className="h-5 w-7 rounded-[5px] bg-[linear-gradient(135deg,#fef9c3,#ca8a04)] opacity-80" />
        </div>
        <p className="absolute bottom-4 left-4 font-body text-[0.8125rem] font-semibold tabular-nums tracking-[0.18em]">
          •••• 4821
        </p>
        <p className="absolute bottom-4 right-4 text-[0.625rem] font-semibold uppercase tracking-wider opacity-70">
          Crédito
        </p>
      </div>

      {/* fatura */}
      <div
        className={cn(
          "absolute left-[4%] top-[20%] w-[64%] rounded-[18px] bg-[#f6f8f3] p-5 text-[#10231a]",
          "shadow-[0_24px_48px_-16px_rgba(0,0,0,0.6)]",
          lift,
          active === 0 && "-translate-y-1.5",
        )}
      >
        <p className="text-xs font-medium text-[#4b5f52]">Fatura de outubro</p>
        <p className="mt-1 font-body text-[1.625rem] font-bold tabular-nums tracking-[-0.02em]">
          R$ 1.284,37
        </p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-pill bg-[#dfe7da]">
          <div className="h-full w-[43%] rounded-pill bg-[#65a30d]" />
        </div>
        <p className="mt-1.5 text-[0.6875rem] tabular-nums text-[#4b5f52]">
          43% de R$ 3.000,00 de limite
        </p>
        <ul className="mt-4 space-y-2 border-t border-[#dfe7da] pt-3 text-xs">
          {[
            ["Mercado", "R$ 312,90"],
            ["Streaming", "R$ 39,90"],
            ["Farmácia", "R$ 86,40"],
          ].map(([name, value]) => (
            <li key={name} className="flex justify-between">
              <span className="text-[#34473b]">{name}</span>
              <span className="font-semibold tabular-nums">{value}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* meta */}
      <div
        className={cn(
          "absolute bottom-[3%] right-[3%] z-20 w-[44%] rounded-[16px] bg-white p-4 text-[#10231a]",
          "shadow-[0_18px_36px_-12px_rgba(0,0,0,0.55)]",
          lift,
          active === 1 && "-translate-y-3 shadow-[0_28px_48px_-12px_rgba(0,0,0,0.6)] ring-2 ring-[#bef264]",
        )}
      >
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-[9px] bg-[#ecfccb] text-[#3f6212]">
            <Plane className="h-3.5 w-3.5" />
          </span>
          <span className="text-xs font-semibold">Viagem</span>
          <span className="ml-auto text-xs font-bold tabular-nums text-[#3f6212]">68%</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-pill bg-[#e5ecdf]">
          <div className="h-full w-[68%] rounded-pill bg-[#84cc16]" />
        </div>
        <p className="mt-1.5 text-[0.6875rem] tabular-nums text-[#4b5f52]">
          R$ 3.400 de R$ 5.000
        </p>
      </div>

      {/* conta a pagar */}
      <div
        className={cn(
          "absolute bottom-[10%] left-0 z-20 flex items-center gap-2.5 rounded-pill bg-[#163a2a] py-2 pl-2 pr-4 text-[#eef5ec] ring-1 ring-white/10",
          "shadow-[0_16px_32px_-12px_rgba(0,0,0,0.6)]",
          lift,
          active === 2 && "-translate-y-3 ring-2 ring-[#bef264]",
        )}
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[#bef264] text-[#132414]">
          <CalendarClock className="h-4 w-4" />
        </span>
        <span className="text-xs leading-tight">
          <span className="block font-semibold">Aluguel</span>
          <span className="text-[#bdd0bb]">vence amanhã</span>
        </span>
      </div>
    </div>
  );
}
