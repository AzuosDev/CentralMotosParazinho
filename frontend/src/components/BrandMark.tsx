import { cn } from "../lib/utils";

/*
 * A marca da Central Motos em dois registros, porque um só não serve aos dois
 * tamanhos que o app precisa:
 *
 *  - <BrandBadge/>  o emblema circular de verdade, em arquivo. Só onde há
 *    espaço para ele ser lido: autenticação. Abaixo de ~64px o lettering curvo
 *    e as motos viram borrão.
 *  - <BrandLockup/> o símbolo reduzido (o mesmo do favicon) ao lado do nome.
 *    É o que entra na barra lateral e no cabeçalho, onde a marca mede 28–36px.
 *
 * O símbolo é inline e não um <img> de propósito: ele herda a cor do tema e
 * aparece junto do primeiro quadro, sem segunda requisição.
 */

const BADGE_SRC = "/brand/central-motos-logo.png";

export function BrandBadge({
  className,
  ...props
}: Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "alt">) {
  return (
    <img
      {...props}
      src={BADGE_SRC}
      alt="Central Motos"
      width={512}
      height={512}
      // O arquivo é um emblema circular num quadrado de fundo escuro; sem o recorte
      // redondo o canto do PNG aparece como um quadrado mais claro sobre o preto.
      className={cn("select-none rounded-full object-contain", className)}
    />
  );
}

export function BrandSymbol({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      aria-hidden
      focusable="false"
      className={cn("shrink-0", className)}
    >
      <circle cx="256" cy="256" r="236" fill="rgb(var(--accent-brand))" />
      <g
        fill="none"
        stroke="#ffffff"
        strokeWidth={38}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M225 207A74 74 0 1 0 225 305" />
        <path d="M291 330V182l64 74 64-74v148" />
      </g>
    </svg>
  );
}

export function BrandLockup({
  className,
  symbolClassName,
  showName = true,
}: {
  className?: string;
  symbolClassName?: string;
  showName?: boolean;
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <BrandSymbol className={cn("h-8 w-8", symbolClassName)} />
      {showName && (
        <span className="flex min-w-0 flex-col leading-none">
          <span className="truncate text-[0.9375rem] font-extrabold uppercase tracking-[0.14em] text-text-primary">
            Central
          </span>
          <span className="truncate text-[0.9375rem] font-extrabold uppercase tracking-[0.14em] text-accent-brand">
            Motos
          </span>
        </span>
      )}
    </span>
  );
}
