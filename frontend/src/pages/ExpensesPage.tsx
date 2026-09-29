import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, TrendingDown, TrendingUp } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { TransactionModal } from "../components/modals/TransactionModal";
import { DynamicIcon } from "../components/DynamicIcon";
import { api } from "../lib/api";
import { formatCurrency, normalizeExpenseCategory } from "../lib/finance";
import { cn } from "../lib/utils";
import type { DashboardResponse } from "../types/api";
import type { CategoryExpense } from "../types/finance";

const periodTabs = [
  { label: "Diário", value: "daily" },
  { label: "Semanal", value: "weekly" },
  { label: "Mensal", value: "monthly" },
  { label: "Anual", value: "yearly" },
] as const;

type ExpensePeriod = (typeof periodTabs)[number]["value"];

const MONTH_OPTIONS = [
  "Janeiro", "Fevereiro", "Março", "Abril",
  "Maio", "Junho", "Julho", "Agosto",
  "Setembro", "Outubro", "Novembro", "Dezembro",
];

function CategoryRow({ category, onClick }: { category: CategoryExpense; onClick: () => void }) {
  const variation = Number.isFinite(category.variation) ? category.variation : 0;
  const isIncrease = variation > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-bg-muted bg-bg-card p-4 text-left transition hover:border-bg-overlay hover:bg-bg-overlay"
    >
      <span
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
        style={{ backgroundColor: `${category.color}22` }}
      >
        <DynamicIcon name={category.icon} className="h-5 w-5" style={{ color: category.color }} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text-primary">{category.name}</p>
        <p className="text-xs text-text-secondary">Total no período</p>
      </div>

      <div className="text-right">
        <p className="text-sm font-semibold text-text-primary">{formatCurrency(category.amount)}</p>
        <p
          className={cn(
            "text-xs font-semibold",
            isIncrease ? "text-accent-red" : "text-accent-lime",
          )}
        >
          {isIncrease ? "↑" : "↓"} {Math.abs(variation).toFixed(1)}%
        </p>
      </div>
    </button>
  );
}

export function ExpensesPage() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<ExpensePeriod>("daily");
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const now = new Date();
  const currentYear = now.getFullYear();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(currentYear);
  const years = useMemo(
    () => Array.from({ length: 11 }, (_, i) => currentYear + 5 - i),
    [currentYear],
  );

  const monthPickerVisible = period === "monthly";

  const expensesQuery = useQuery({
    queryKey: ["dashboard-expenses", period, month, year],
    queryFn: async () => {
      const { data } = await api.get<DashboardResponse>("/api/dashboard", {
        params: { month, year, period },
      });
      const source = data.expensesByCategory ?? [];

      return (Array.isArray(source) ? source : []).map((item, index) =>
        normalizeExpenseCategory(item, index),
      );
    },
  });

  const categories = expensesQuery.data ?? [];

  const topCategory = useMemo(
    () => categories.reduce<CategoryExpense | null>((best, current) => {
      if (!best || current.amount > best.amount) {
        return current;
      }

      return best;
    }, null),
    [categories],
  );

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-text-secondary">Controle de gastos</p>
          <h1 className="font-sans text-3xl font-bold">Gastos por categoria</h1>
        </div>
        <div className="flex items-center gap-2">
          {monthPickerVisible && (
            <>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="rounded-xl border border-bg-muted bg-bg-card px-3 py-2.5 text-sm text-text-primary outline-none transition focus:border-accent-lime"
              >
                {MONTH_OPTIONS.map((label, i) => (
                  <option key={label} value={i + 1}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="rounded-xl border border-bg-muted bg-bg-card px-3 py-2.5 text-sm text-text-primary outline-none transition focus:border-accent-lime"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </>
          )}
          <button
            type="button"
            onClick={() => setAddExpenseOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-accent-lime px-4 py-3 text-sm font-bold text-black transition hover:brightness-110"
          >
            <Plus className="h-4 w-4" />
            Nova
          </button>
        </div>
      </header>

      <div className="flex gap-2 overflow-x-auto rounded-2xl bg-bg-card p-2">
        {periodTabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setPeriod(tab.value)}
            className={cn(
              "rounded-xl px-4 py-2.5 text-sm font-semibold transition",
              period === tab.value
                ? "bg-bg-muted text-text-primary"
                : "text-text-secondary hover:bg-bg-overlay hover:text-text-primary",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {expensesQuery.isLoading ? (
        <div className="rounded-2xl bg-bg-card p-6">
          <div className="flex items-center justify-center gap-2 text-sm text-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin text-accent-lime" />
            Carregando categorias...
          </div>
        </div>
      ) : categories.length === 0 ? (
        <div className="rounded-2xl bg-bg-card p-8 text-center text-sm text-text-secondary">
          Nenhuma categoria de gasto encontrada para o período selecionado.
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
          <div className="rounded-2xl bg-bg-card p-5">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-text-primary">
              <TrendingDown className="h-4 w-4 text-accent-red" />
              Gastos por categoria
            </div>

            <div className="grid gap-5 lg:grid-cols-[1fr_240px]">
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categories}
                      dataKey="amount"
                      innerRadius={68}
                      outerRadius={96}
                      paddingAngle={2}
                    >
                      {categories.map((category) => (
                        <Cell key={category.id} fill={category.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => formatCurrency(Number(value))}
                      contentStyle={{
                        backgroundColor: "var(--tooltip-bg)",
                        border: "1px solid var(--tooltip-border)",
                        borderRadius: 14,
                        color: "var(--tooltip-text)",
                      }}
                      labelStyle={{ color: "var(--tooltip-text)", fontWeight: 600 }}
                      itemStyle={{ color: "var(--tooltip-item)" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="relative -mt-44 flex h-24 items-center justify-center text-center">
                  <div className="max-w-[160px]">
                    <p className="text-[11px] uppercase tracking-[0.25em] text-text-muted">Mais gasto</p>
                    <p className="text-sm font-semibold text-text-primary">{topCategory?.name ?? "—"}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {categories.map((category) => (
                  <div key={category.id} className="flex items-center gap-3 rounded-2xl bg-bg-muted p-3">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-text-primary">{category.name}</p>
                      <p className="text-xs text-text-secondary">{formatCurrency(category.amount)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <aside className="rounded-2xl bg-bg-card p-5">
            <div className="mb-4 flex items-center justify-between gap-2 text-sm font-semibold text-text-primary">
              <span>Resumo</span>
              <TrendingUp className="h-4 w-4 text-accent-lime" />
            </div>
            <p className="text-xs text-text-secondary">
              Clique em uma categoria para filtrar as transações do período atual.
            </p>
            <div className="mt-4 space-y-3">
              {categories.map((category) => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  onClick={() => {
                    if (!category.id || category.id.startsWith("category-")) {
                      navigate(`/transactions?type=EXPENSE&semCategoria=true&month=${month}&year=${year}`);
                      return;
                    }
                    navigate(`/transactions?type=EXPENSE&categoryId=${category.id}&month=${month}&year=${year}`);
                  }}
                />
              ))}
            </div>
          </aside>
        </div>
      )}
      <TransactionModal open={addExpenseOpen} onClose={() => setAddExpenseOpen(false)} defaultTab="EXPENSE" />
    </section>
  );
}
