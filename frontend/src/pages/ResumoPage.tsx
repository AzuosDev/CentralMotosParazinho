import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, Placeholder } from "../components/PageHeader";
import {
  BarList,
  DeltaBadge,
  ReportCard,
  ReportSkeleton,
  StatTile,
} from "../components/insights/ReportPrimitives";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/finance";
import type { AnnualAggregates, PeriodTotals } from "../types/insights";

function pct(value: number) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function AveragesTable({
  label,
  totals,
}: {
  label: string;
  totals: PeriodTotals;
}) {
  return (
    <div className="rounded-xl bg-bg-muted p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
        {label}
      </p>
      <dl className="mt-3 flex flex-col gap-2 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-text-secondary">Entradas</dt>
          <dd className="font-semibold text-semantic-income">
            {formatCurrency(totals.totalIncome)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-text-secondary">Saídas</dt>
          <dd className="font-semibold text-semantic-expense">
            {formatCurrency(totals.totalExpense)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-border-default pt-2">
          <dt className="text-text-secondary">Média mensal</dt>
          <dd className="font-semibold text-text-primary">
            {formatCurrency(totals.avgMonthlyBalance)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-text-muted">Meses com movimento</dt>
          <dd className="text-text-secondary">{totals.monthsWithData}</dd>
        </div>
      </dl>
    </div>
  );
}

export function ResumoPage() {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const years = Array.from({ length: 8 }, (_, index) => year + 1 - index);

  const summaryQuery = useQuery({
    queryKey: ["insights", "annual-aggregates", year],
    queryFn: async () => {
      const { data } = await api.get<AnnualAggregates>(
        "/api/insights/annual-aggregates",
        { params: { year } },
      );

      return data;
    },
  });

  const data = summaryQuery.data;
  const balance = data
    ? data.current.totalIncome - data.current.totalExpense
    : 0;
  const hasData = Boolean(
    data && (data.current.totalIncome > 0 || data.current.totalExpense > 0),
  );

  return (
    <>
      <PageHeader
        title="Resumo"
        subtitle="O ano fechado, comparado com o anterior."
        action={
          <select
            aria-label="Ano do resumo"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            className="rounded-xl border border-bg-muted bg-bg-card px-4 py-3 text-sm text-text-primary outline-none transition focus:border-accent-brand"
          >
            {years.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        }
      />

      {summaryQuery.isLoading ? (
        <ReportSkeleton cards={2} />
      ) : summaryQuery.isError || !data ? (
        <Placeholder message="Não foi possível carregar o resumo do ano." />
      ) : !hasData ? (
        <Placeholder message={`Nenhuma movimentação registrada em ${year}.`} />
      ) : (
        <div className="flex flex-col gap-4">
          <ReportCard
            title={`O ano de ${data.year}`}
            hint={`Variação calculada contra ${data.previousYear}.`}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <StatTile
                label="Entradas"
                value={formatCurrency(data.current.totalIncome)}
                tone="income"
                footer={<DeltaBadge pct={data.yoyChange.incomePct} />}
              />
              <StatTile
                label="Saídas"
                value={formatCurrency(data.current.totalExpense)}
                tone="expense"
                footer={
                  <DeltaBadge
                    pct={data.yoyChange.expensePct}
                    higherIsBetter={false}
                  />
                }
              />
              <StatTile
                label="Saldo do ano"
                value={formatCurrency(balance)}
                tone={balance < 0 ? "expense" : "income"}
                footer={<DeltaBadge pct={data.yoyChange.balancePct} />}
              />
            </div>
          </ReportCard>

          <ReportCard
            title="Ano a ano"
            hint="A média mensal usa só os meses com movimento, não doze — um ano começado em agosto não fica com a média diluída."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <AveragesTable label={String(data.year)} totals={data.current} />
              <AveragesTable
                label={String(data.previousYear)}
                totals={data.previous}
              />
            </div>
          </ReportCard>

          <ReportCard
            title="Maiores categorias do ano"
            hint="Inclui compras no cartão — é “no que gastei”, não “quanto saiu da conta”."
          >
            <BarList
              emptyMessage="Nenhuma saída categorizada neste ano."
              items={data.topCategories.map((category) => ({
                key: category.categoryId ?? category.name,
                name: category.name,
                total: category.total,
                caption: (
                  <span className="inline-flex items-center gap-2">
                    {pct(category.percentOfExpenses)}% das saídas
                    {category.yoyPct !== null && (
                      <DeltaBadge pct={category.yoyPct} higherIsBetter={false} />
                    )}
                  </span>
                ),
              }))}
            />
          </ReportCard>
        </div>
      )}
    </>
  );
}
