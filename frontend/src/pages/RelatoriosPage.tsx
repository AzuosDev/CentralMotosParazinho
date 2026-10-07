import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, CheckCircle2, Repeat } from "lucide-react";
import { PageHeader, Placeholder } from "../components/PageHeader";
import { MONTH_NAMES } from "../components/insights/period";
import {
  DeltaBadge,
  ReportCard,
  ReportSkeleton,
  StatTile,
} from "../components/insights/ReportPrimitives";
import { api } from "../lib/api";
import { formatCurrency, formatDisplayDate } from "../lib/finance";
import { cn } from "../lib/utils";
import type { AccountsOverview, InsightsOverview } from "../types/insights";

const SCORE_TONE: Record<InsightsOverview["healthScore"]["label"], string> = {
  Excelente: "text-semantic-income",
  Boa: "text-semantic-income",
  "Atenção": "text-semantic-pending",
  "Crítica": "text-semantic-expense",
};

/** Os três subscores são 0-100 e entram no total com pesos 50/25/25. */
const SCORE_PARTS = [
  { key: "savingsRateSub", label: "Taxa de poupança", weight: "50%" },
  { key: "overdueAccountsSub", label: "Contas em atraso", weight: "25%" },
  { key: "spendingTrendSub", label: "Tendência de gasto", weight: "25%" },
] as const;

function HealthScore({ health }: { health: InsightsOverview["healthScore"] }) {
  return (
    <ReportCard
      title="Saúde financeira"
      hint="Nota de 0 a 100 do mês corrente, recalculada a cada acesso."
    >
      <div className="flex flex-wrap items-center gap-6">
        <div className="shrink-0">
          <p className={cn("font-sans text-5xl font-bold", SCORE_TONE[health.label])}>
            {health.score}
          </p>
          <p className="mt-1 text-sm font-semibold text-text-secondary">
            {health.label}
          </p>
        </div>

        <ul className="flex min-w-[15rem] flex-1 flex-col gap-3">
          {SCORE_PARTS.map((part) => {
            const value = health.breakdown[part.key];

            return (
              <li key={part.key}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-text-secondary">
                    {part.label}{" "}
                    <span className="text-text-muted">· peso {part.weight}</span>
                  </span>
                  <span className="font-semibold text-text-primary">
                    {Math.round(value)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-pill bg-bg-muted">
                  <div
                    className="h-full rounded-pill bg-accent-brand"
                    style={{ width: `${value}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </ReportCard>
  );
}

function MonthComparison({
  comparison,
}: {
  comparison: InsightsOverview["monthComparison"];
}) {
  const previousLabel = `${MONTH_NAMES[comparison.previousMonth - 1]}/${comparison.previousYear}`;

  return (
    <ReportCard
      title="Comparação com o mês anterior"
      hint={
        comparison.hasPreviousMonthData
          ? `Contra ${previousLabel}.`
          : `Sem movimentação em ${previousLabel} — não há base de comparação.`
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <StatTile
          label="Entradas"
          value={formatCurrency(comparison.currentIncome)}
          tone="income"
          footer={
            <div className="flex items-center gap-2">
              <DeltaBadge pct={comparison.incomePct} />
              <span className="text-xs text-text-muted">
                antes {formatCurrency(comparison.previousIncome)}
              </span>
            </div>
          }
        />
        <StatTile
          label="Saídas"
          value={formatCurrency(comparison.currentExpense)}
          tone="expense"
          footer={
            <div className="flex items-center gap-2">
              <DeltaBadge pct={comparison.expensePct} higherIsBetter={false} />
              <span className="text-xs text-text-muted">
                antes {formatCurrency(comparison.previousExpense)}
              </span>
            </div>
          }
        />
      </div>
    </ReportCard>
  );
}

function MonthProjection({
  projection,
}: {
  projection: InsightsOverview["monthEndProjection"];
}) {
  const progress = (projection.daysElapsed / projection.daysInMonth) * 100;

  return (
    <ReportCard
      title="Projeção para o fim do mês"
      hint={`Extrapola o ritmo dos ${projection.daysElapsed} dias corridos para os ${projection.daysInMonth} do mês — é tendência, não compromisso.`}
    >
      <div className="mb-4">
        <div className="h-1.5 overflow-hidden rounded-pill bg-bg-muted">
          <div
            className="h-full rounded-pill bg-accent-brand"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-text-muted">
          dia {projection.daysElapsed} de {projection.daysInMonth}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Entradas projetadas"
          value={formatCurrency(projection.projectedIncome)}
          tone="income"
          footer={
            <span className="text-xs text-text-muted">
              até agora {formatCurrency(projection.actualIncome)}
            </span>
          }
        />
        <StatTile
          label="Saídas projetadas"
          value={formatCurrency(projection.projectedExpense)}
          tone="expense"
          footer={
            <span className="text-xs text-text-muted">
              até agora {formatCurrency(projection.actualExpense)}
            </span>
          }
        />
        <StatTile
          label="Saldo projetado"
          value={formatCurrency(projection.projectedBalance)}
          tone={projection.projectedBalance < 0 ? "expense" : "income"}
        />
      </div>
    </ReportCard>
  );
}

function AccountsPanel({ accounts }: { accounts: AccountsOverview }) {
  const { paidVsPending, overdue, dueThisWeek, installmentsInProgress } = accounts;

  return (
    <ReportCard
      title="Contas"
      hint="Situação das contas a pagar, independente do período selecionado."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Pagas"
          value={formatCurrency(paidVsPending.paidValue)}
          footer={
            <span className="inline-flex items-center gap-1 text-xs text-text-muted">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {paidVsPending.paidCount} conta(s)
            </span>
          }
        />
        <StatTile
          label="Em aberto"
          value={formatCurrency(paidVsPending.pendingValue)}
          footer={
            <span className="text-xs text-text-muted">
              {paidVsPending.pendingCount} conta(s)
            </span>
          }
        />
        <StatTile
          label="Em atraso"
          value={formatCurrency(overdue.value)}
          tone={overdue.count > 0 ? "expense" : "neutral"}
          footer={
            <span className="inline-flex items-center gap-1 text-xs text-text-muted">
              <AlertTriangle className="h-3.5 w-3.5" />
              {overdue.count} conta(s)
            </span>
          }
        />
        <StatTile
          label="Vencem nesta semana"
          value={formatCurrency(dueThisWeek.value)}
          footer={
            <span className="inline-flex items-center gap-1 text-xs text-text-muted">
              <CalendarClock className="h-3.5 w-3.5" />
              {dueThisWeek.count} conta(s)
            </span>
          }
        />
      </div>

      {accounts.activeRecurringCount > 0 && (
        <p className="mt-4 inline-flex items-center gap-2 text-sm text-text-secondary">
          <Repeat className="h-4 w-4 text-accent-brand" />
          {accounts.activeRecurringCount} conta(s) recorrente(s) ativa(s)
        </p>
      )}

      {installmentsInProgress.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-3 text-sm font-semibold text-text-primary">
            Parcelamentos em andamento
          </h3>
          <ul className="flex flex-col gap-3">
            {installmentsInProgress.map((plan) => (
              <li key={plan.id}>
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-text-primary">
                    {plan.title}
                  </span>
                  <span className="text-xs text-text-muted">
                    {plan.paidParcelas}/{plan.totalParcelas} ·{" "}
                    {formatCurrency(plan.valorParcela)} · próxima{" "}
                    {formatDisplayDate(plan.nextDueDate)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-pill bg-bg-muted">
                  <div
                    className="h-full rounded-pill bg-accent-brand"
                    style={{
                      width: `${(plan.paidParcelas / plan.totalParcelas) * 100}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ReportCard>
  );
}

export function RelatoriosPage() {
  const overviewQuery = useQuery({
    queryKey: ["insights", "overview"],
    queryFn: async () => {
      const { data } = await api.get<InsightsOverview>("/api/insights/overview");
      return data;
    },
  });

  const accountsQuery = useQuery({
    queryKey: ["insights", "accounts-overview"],
    queryFn: async () => {
      const { data } = await api.get<AccountsOverview>(
        "/api/insights/accounts-overview",
      );
      return data;
    },
  });

  return (
    <>
      <PageHeader
        title="Visão Geral"
        subtitle="O retrato do mês corrente: saúde, comparação, projeção e contas."
      />

      {overviewQuery.isLoading ? (
        <ReportSkeleton cards={3} />
      ) : overviewQuery.isError || !overviewQuery.data ? (
        <Placeholder message="Não foi possível carregar a visão geral." />
      ) : (
        <div className="flex flex-col gap-4">
          <HealthScore health={overviewQuery.data.healthScore} />
          <MonthComparison comparison={overviewQuery.data.monthComparison} />
          <MonthProjection projection={overviewQuery.data.monthEndProjection} />

          {overviewQuery.data.topCategoryThisMonth && (
            <ReportCard title="Maior categoria do mês">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-sans text-lg font-bold text-text-primary">
                  {overviewQuery.data.topCategoryThisMonth.name}
                </span>
                <span className="text-sm text-text-secondary">
                  {formatCurrency(overviewQuery.data.topCategoryThisMonth.total)} ·{" "}
                  {overviewQuery.data.topCategoryThisMonth.percentOfExpenses.toLocaleString(
                    "pt-BR",
                    { maximumFractionDigits: 1 },
                  )}
                  % das saídas
                </span>
              </div>
            </ReportCard>
          )}

          {accountsQuery.data && <AccountsPanel accounts={accountsQuery.data} />}
        </div>
      )}
    </>
  );
}
