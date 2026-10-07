import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader, Placeholder } from "../components/PageHeader";
import { PeriodSelector } from "../components/insights/PeriodSelector";
import {
  defaultPeriodFilter,
  periodLabel,
  periodParams,
} from "../components/insights/period";
import type { PeriodFilter } from "../components/insights/period";
import {
  BarList,
  ChartTooltip,
  DeltaBadge,
  ReportCard,
  ReportSkeleton,
  StatTile,
} from "../components/insights/ReportPrimitives";
import { CATEGORY_PALETTE, CATEGORY_NEUTRAL } from "../lib/colors";
import { api } from "../lib/api";
import { formatCompactValue, formatCurrency } from "../lib/finance";
import { cn } from "../lib/utils";
import type {
  CashflowResult,
  ExpensesBreakdownResult,
  GoalProgress,
  IncomeBreakdownResult,
  WalletEvolution,
} from "../types/insights";

function pct(value: number) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

/**
 * Rótulo do eixo X conforme a granularidade que a própria API escolheu: em
 * período diário o ano é ruído, em mensal o dia é.
 */
function axisLabel(iso: string, granularity: "day" | "week" | "month") {
  const date = new Date(iso);

  if (granularity === "month") {
    return new Intl.DateTimeFormat("pt-BR", {
      month: "short",
      timeZone: "UTC",
    }).format(date);
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function CashflowSection({ filter }: { filter: PeriodFilter }) {
  const params = periodParams(filter);

  const query = useQuery({
    queryKey: ["insights", "cashflow", params],
    queryFn: async () => {
      const { data } = await api.get<CashflowResult>("/api/insights/cashflow", {
        params,
      });

      return data;
    },
  });

  if (query.isLoading) {
    return <ReportSkeleton cards={1} />;
  }

  if (query.isError || !query.data) {
    return <Placeholder message="Não foi possível carregar o fluxo de caixa." />;
  }

  const { totals, points, granularity } = query.data;
  const chartData = points.map((point) => ({
    label: axisLabel(point.date, granularity),
    income: point.income,
    expense: point.expense,
  }));

  return (
    <ReportCard
      title="Fluxo de caixa"
      hint={`${periodLabel(filter)} · agrupado por ${
        granularity === "day" ? "dia" : granularity === "week" ? "semana" : "mês"
      }.`}
      action={
        <div className="flex gap-4 text-xs text-text-secondary">
          <span className="flex items-center gap-2">
            <i className="h-2.5 w-2.5 rounded-full bg-semantic-income" /> Entradas
          </span>
          <span className="flex items-center gap-2">
            <i className="h-2.5 w-2.5 rounded-full bg-semantic-expense" /> Saídas
          </span>
        </div>
      }
    >
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Entradas"
          value={formatCurrency(totals.income)}
          tone="income"
        />
        <StatTile
          label="Saídas"
          value={formatCurrency(totals.expense)}
          tone="expense"
        />
        <StatTile
          label="Saldo"
          value={formatCurrency(totals.balance)}
          tone={totals.balance < 0 ? "expense" : "income"}
        />
      </div>

      {chartData.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-secondary">
          Nenhuma movimentação neste período.
        </p>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="cashflowIncome" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="rgb(var(--color-income))"
                    stopOpacity={0.18}
                  />
                  <stop
                    offset="95%"
                    stopColor="rgb(var(--color-income))"
                    stopOpacity={0}
                  />
                </linearGradient>
                <linearGradient id="cashflowExpense" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="rgb(var(--color-expense))"
                    stopOpacity={0.18}
                  />
                  <stop
                    offset="95%"
                    stopColor="rgb(var(--color-expense))"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                stroke="rgb(var(--chart-axis))"
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="rgb(var(--chart-axis))"
                tickLine={false}
                axisLine={false}
                tickFormatter={formatCompactValue}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                name="Entradas"
                dataKey="income"
                stroke="rgb(var(--color-income))"
                fill="url(#cashflowIncome)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                name="Saídas"
                dataKey="expense"
                stroke="rgb(var(--color-expense))"
                fill="url(#cashflowExpense)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </ReportCard>
  );
}

function ExpensesSection({ filter }: { filter: PeriodFilter }) {
  const params = periodParams(filter);

  const query = useQuery({
    queryKey: ["insights", "expenses-breakdown", params],
    queryFn: async () => {
      const { data } = await api.get<ExpensesBreakdownResult>(
        "/api/insights/expenses-breakdown",
        { params },
      );

      return data;
    },
  });

  if (query.isLoading) {
    return <ReportSkeleton cards={1} />;
  }

  if (query.isError || !query.data) {
    return <Placeholder message="Não foi possível carregar as saídas." />;
  }

  const { byCategory, topCategoryTrend } = query.data;

  return (
    <ReportCard
      title="Saídas por categoria"
      hint="Inclui compras no cartão, como todo relatório de categoria."
    >
      {topCategoryTrend && (
        <div className="mb-5 rounded-xl bg-bg-muted p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
            Maior categoria · mês a mês
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-sans text-lg font-bold text-text-primary">
              {topCategoryTrend.name}
            </span>
            <DeltaBadge pct={topCategoryTrend.momPct} higherIsBetter={false} />
          </div>
          <p className="mt-1 text-xs text-text-muted">
            {formatCurrency(topCategoryTrend.currentMonthTotal)} neste mês ·{" "}
            {formatCurrency(topCategoryTrend.previousMonthTotal)} no anterior
          </p>
        </div>
      )}

      <BarList
        emptyMessage="Nenhuma saída categorizada neste período."
        items={byCategory.map((category) => ({
          key: category.categoryId ?? category.name,
          name: category.name,
          total: category.total,
          caption: `${pct(category.percentOfExpenses)}% das saídas`,
        }))}
      />
    </ReportCard>
  );
}

function IncomeSection({ filter }: { filter: PeriodFilter }) {
  const params = periodParams(filter);

  const query = useQuery({
    queryKey: ["insights", "income-breakdown", params],
    queryFn: async () => {
      const { data } = await api.get<IncomeBreakdownResult>(
        "/api/insights/income-breakdown",
        { params },
      );

      return data;
    },
  });

  if (query.isLoading) {
    return <ReportSkeleton cards={1} />;
  }

  if (query.isError || !query.data) {
    return <Placeholder message="Não foi possível carregar as entradas." />;
  }

  const { bySource, consistency } = query.data;

  return (
    <ReportCard
      title="Entradas por origem"
      hint={
        consistency
          ? `Média de ${formatCurrency(consistency.avgIncome)} em ${consistency.monthsWithData} mês(es) com entrada.`
          : undefined
      }
    >
      {consistency && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <StatTile
            label="Entradas no mês corrente"
            value={formatCurrency(consistency.currentMonthTotal)}
            tone="income"
            footer={<DeltaBadge pct={consistency.variationPct} />}
          />
          <StatTile
            label="Média mensal"
            value={formatCurrency(consistency.avgIncome)}
          />
        </div>
      )}

      <BarList
        emptyMessage="Nenhuma entrada registrada neste período."
        items={bySource.map((source) => ({
          key: source.categoryId ?? source.name,
          name: source.name,
          total: source.total,
          caption: `${pct(source.percentOfIncome)}% das entradas`,
        }))}
      />
    </ReportCard>
  );
}

function WalletsSection({ filter }: { filter: PeriodFilter }) {
  const params = periodParams(filter);

  const query = useQuery({
    queryKey: ["insights", "wallets-evolution", params],
    queryFn: async () => {
      const { data } = await api.get<WalletEvolution[]>(
        "/api/insights/wallets-evolution",
        { params },
      );

      return Array.isArray(data) ? data : [];
    },
  });

  // Memoizado para que a união de datas abaixo não recalcule a cada render.
  const wallets = useMemo(() => query.data ?? [], [query.data]);

  /**
   * Cada carteira tem a própria série de pontos; o gráfico precisa de uma linha
   * por data com uma chave por carteira. A união das datas evita que uma
   * carteira criada no meio do período encurte o eixo das outras.
   */
  const chartData = useMemo(() => {
    const dates = [
      ...new Set(wallets.flatMap((wallet) => wallet.points.map((p) => p.date))),
    ].sort();

    return dates.map((date) => {
      const row: Record<string, string | number> = { label: axisLabel(date, "day") };

      for (const wallet of wallets) {
        const point = wallet.points.find((candidate) => candidate.date === date);

        if (point) {
          row[wallet.id] = point.balance;
        }
      }

      return row;
    });
  }, [wallets]);

  if (query.isLoading) {
    return <ReportSkeleton cards={1} />;
  }

  if (query.isError) {
    return <Placeholder message="Não foi possível carregar a evolução das carteiras." />;
  }

  return (
    <ReportCard
      title="Evolução das carteiras"
      hint="Saldo acumulado por carteira. Compras no cartão não entram — elas criam dívida, não saída de caixa."
    >
      {wallets.length === 0 || chartData.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-secondary">
          Nenhuma carteira com movimento neste período.
        </p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-text-secondary">
            {wallets.map((wallet, index) => (
              <span key={wallet.id} className="flex items-center gap-2">
                <i
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    backgroundColor:
                      CATEGORY_PALETTE[index] ?? CATEGORY_NEUTRAL,
                  }}
                />
                {wallet.nome}
                <span className="text-text-muted">
                  {formatCurrency(wallet.currentBalance)}
                </span>
              </span>
            ))}
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis
                  dataKey="label"
                  stroke="rgb(var(--chart-axis))"
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="rgb(var(--chart-axis))"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatCompactValue}
                />
                <Tooltip content={<ChartTooltip />} />
                {wallets.map((wallet, index) => (
                  <Line
                    key={wallet.id}
                    type="monotone"
                    name={wallet.nome}
                    dataKey={wallet.id}
                    stroke={CATEGORY_PALETTE[index] ?? CATEGORY_NEUTRAL}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </ReportCard>
  );
}

function GoalsSection({ filter }: { filter: PeriodFilter }) {
  const params = periodParams(filter);

  const query = useQuery({
    queryKey: ["insights", "goals-progress", params],
    queryFn: async () => {
      const { data } = await api.get<GoalProgress[]>(
        "/api/insights/goals-progress",
        { params },
      );

      return Array.isArray(data) ? data : [];
    },
  });

  if (query.isLoading) {
    return <ReportSkeleton cards={1} />;
  }

  const goals = query.data ?? [];

  return (
    <ReportCard
      title="Ritmo das metas"
      hint="O aporte necessário por mês vem do que falta dividido pelos meses até o prazo."
    >
      {goals.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-secondary">
          Nenhuma meta cadastrada.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {goals.map((goal) => (
            <li key={goal.id}>
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium text-text-primary">
                  {goal.name}
                </span>
                <span className="text-sm text-text-secondary">
                  {formatCurrency(goal.currentValue)} de{" "}
                  {formatCurrency(goal.targetValue)}
                </span>
              </div>

              <div className="h-1.5 overflow-hidden rounded-pill bg-bg-muted">
                <div
                  className={cn(
                    "h-full rounded-pill",
                    goal.completed ? "bg-semantic-income" : "bg-accent-brand",
                  )}
                  style={{ width: `${Math.min(goal.percentComplete, 100)}%` }}
                />
              </div>

              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                <span>{pct(goal.percentComplete)}% concluído</span>
                <span>
                  aporte médio {formatCurrency(goal.pace.avgMonthlyContribution)}/mês
                </span>
                {goal.pace.requiredMonthlyContribution !== null && (
                  <span>
                    necessário{" "}
                    {formatCurrency(goal.pace.requiredMonthlyContribution)}/mês
                  </span>
                )}
                {goal.pace.onTrack !== null && !goal.completed && (
                  <span
                    className={cn(
                      "font-semibold",
                      goal.pace.onTrack
                        ? "text-semantic-income"
                        : "text-semantic-pending",
                    )}
                  >
                    {goal.pace.onTrack ? "no ritmo" : "abaixo do ritmo"}
                  </span>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </ReportCard>
  );
}

export function InsightsPage() {
  const [filter, setFilter] = useState<PeriodFilter>(defaultPeriodFilter);

  return (
    <>
      <PageHeader
        title="Insights"
        subtitle="Fluxo, composição e ritmo — tudo no período que você escolher."
      />

      <div className="mb-5">
        <PeriodSelector value={filter} onChange={setFilter} />
      </div>

      <div className="flex flex-col gap-4">
        <CashflowSection filter={filter} />
        <div className="grid gap-4 lg:grid-cols-2">
          <ExpensesSection filter={filter} />
          <IncomeSection filter={filter} />
        </div>
        <WalletsSection filter={filter} />
        <GoalsSection filter={filter} />
      </div>
    </>
  );
}
