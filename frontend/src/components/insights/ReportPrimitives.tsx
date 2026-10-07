import type { ReactNode } from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { formatCurrency } from "../../lib/finance";
import { cn } from "../../lib/utils";

export function ReportCard({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-card bg-bg-card p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-sans text-base font-bold text-text-primary">
            {title}
          </h2>
          {hint && <p className="mt-0.5 text-xs text-text-muted">{hint}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/**
 * Variação percentual. `higherIsBetter` inverte a cor: em gasto, subir é ruim.
 * pct nulo significa que o período anterior foi zero — não há base de comparação,
 * e mostrar "+100%" ali seria invenção.
 */
export function DeltaBadge({
  pct,
  higherIsBetter = true,
}: {
  pct: number | null;
  higherIsBetter?: boolean;
}) {
  if (pct === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-pill bg-bg-muted px-2 py-0.5 text-xs font-semibold text-text-muted">
        <Minus className="h-3 w-3" />
        sem base
      </span>
    );
  }

  const flat = Math.abs(pct) < 0.05;
  const good = higherIsBetter ? pct > 0 : pct < 0;
  const Icon = pct > 0 ? TrendingUp : TrendingDown;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-semibold",
        flat
          ? "bg-bg-muted text-text-secondary"
          : good
            ? "bg-semantic-income/10 text-semantic-income"
            : "bg-semantic-expense/10 text-semantic-expense",
      )}
    >
      {flat ? <Minus className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
      {pct > 0 ? "+" : ""}
      {pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
    </span>
  );
}

export function StatTile({
  label,
  value,
  footer,
  tone = "neutral",
}: {
  label: string;
  value: string;
  footer?: ReactNode;
  tone?: "neutral" | "income" | "expense";
}) {
  return (
    <div className="rounded-xl bg-bg-muted p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-sans text-xl font-bold",
          tone === "income" && "text-semantic-income",
          tone === "expense" && "text-semantic-expense",
          tone === "neutral" && "text-text-primary",
        )}
      >
        {value}
      </p>
      {footer && <div className="mt-2">{footer}</div>}
    </div>
  );
}

/**
 * Ranking com barra proporcional. A barra usa o maior valor da lista como 100%,
 * não o percentual que a API devolve — assim a diferença entre o 1º e o 2º fica
 * legível mesmo quando ambos são fatias pequenas do total.
 */
export function BarList({
  items,
  emptyMessage,
}: {
  items: { key: string; name: string; total: number; caption?: ReactNode }[];
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-text-secondary">{emptyMessage}</p>;
  }

  const max = Math.max(...items.map((item) => item.total), 1);

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="truncate text-sm font-medium text-text-primary">
              {item.name}
            </span>
            <span className="shrink-0 text-sm font-semibold text-text-primary">
              {formatCurrency(item.total)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-pill bg-bg-muted">
            <div
              className="h-full rounded-pill bg-accent-brand"
              style={{ width: `${Math.max((item.total / max) * 100, 2)}%` }}
            />
          </div>
          {item.caption && (
            <p className="mt-1 text-xs text-text-muted">{item.caption}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ReportSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: cards }, (_, index) => (
        <div key={index} className="h-40 animate-pulse rounded-card bg-bg-card" />
      ))}
    </div>
  );
}

export function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-xl border border-bg-muted bg-bg-card p-3 text-sm text-text-primary shadow-xl">
      <p className="mb-2 font-semibold">{label}</p>
      {payload.map((item) => (
        <p key={item.name} style={{ color: item.color }}>
          {item.name}: {formatCurrency(item.value ?? 0)}
        </p>
      ))}
    </div>
  );
}
