import { useMemo, useState, useContext } from "react";
import { TransactionModalContext } from "../components/layout/AppLayout";
import { Plus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { Wallet as WalletType } from "../types/api";
import { BankLogo } from "../components/ui/BankLogo";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Clock,
  Eye,
  EyeOff,
  PiggyBank,
  ReceiptText,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useShowValues } from "../hooks/useShowValues";

import { api } from "../lib/api";
import { cn } from "../lib/utils";
import type { DashboardResponse } from "../types/api";

type DashboardApiResponse = DashboardResponse;

type MonthlyPoint = {
  month: string;
  income: number;
  expense: number;
};

type CategoryExpense = {
  id: string;
  name: string;
  color: string;
  amount: number;
};

type RecentTransaction = {
  id: string;
  categoryName: string;
  categoryColor: string;
  description?: string;
  date: string;
  amount: number;
  type: "INCOME" | "EXPENSE";
};

type DashboardData = {
  balance: number;
  totalIncome: number;
  totalExpense: number;
  pendingTotal: number;
  savingsRate: number;
  monthlyEvolution: MonthlyPoint[];
  categories: CategoryExpense[];
  recentTransactions: RecentTransaction[];
};

const monthOptions = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function readNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number(value.replace(",", "."));
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
}

function readString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return "";
}

function getDashboardValue(data: DashboardApiResponse, keys: string[]) {
  const record = data as unknown as Record<string, unknown>;
  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }

  return undefined;
}

function normalizeDashboard(data: DashboardApiResponse): DashboardData {
  const record = data as unknown as Record<string, unknown>;
  const summary = asRecord(record.summary);
  const pending = asRecord(record.pending);
  const pendingAccounts = asRecord(record.pendingAccounts);
  const categorySource =
    getDashboardValue(data, [
      "categories",
      "expensesByCategory",
      "categoryExpenses",
    ]) ?? [];
  const transactionSource =
    getDashboardValue(data, [
      "recentTransactions",
      "transactions",
      "latestTransactions",
    ]) ?? [];
  const monthlySource =
    getDashboardValue(data, [
      "monthlyEvolution",
      "evolution",
      "chartData",
      "monthly",
    ]) ?? [];

  const totalIncome = readNumber(
    record.totalIncome,
    record.income,
    record.entries,
    summary.totalIncome,
    summary.income,
  );
  const totalExpense = readNumber(
    record.totalExpenses,
    record.totalExpense,
    record.expense,
    record.expenses,
    record.outputs,
    summary.totalExpense,
    summary.expense,
  );
  const balance = readNumber(
    record.balance,
    record.saldo,
    summary.balance,
    totalIncome - totalExpense,
  );

  return {
    balance,
    totalIncome,
    totalExpense,
    pendingTotal: readNumber(
      record.pendingTotal,
      record.totalPending,
      record.pendingAmount,
      pendingAccounts.totalPending,
      pending.total,
      summary.pendingTotal,
    ),
    savingsRate: readNumber(
      record.savingsRate,
      record.savingRate,
      record.poupancaRate,
      summary.savingsRate,
    ),
    monthlyEvolution: asArray(monthlySource).map((item, index) => ({
      month:
        readString(item.label, item.name) ||
        monthOptions[(readNumber(item.month) || index + 1) - 1] ||
        monthOptions[index % 12],
      income: readNumber(item.income, item.totalIncome, item.entries),
      expense: readNumber(
        item.expense,
        item.totalExpense,
        item.expenses,
        item.outputs,
      ),
    })),
    categories: asArray(categorySource)
      .map((item, index) => {
        const category = asRecord(item.category);
        return {
          id:
            readString(
              item.id,
              item._id,
              item.categoryId,
              category.id,
              category._id,
            ) || `category-${index}`,
          name:
            readString(
              item.name,
              item.categoryName,
              category.name,
              item.label,
            ) || "Categoria",
          color:
            readString(item.color, item.categoryColor, category.color) ||
            "#6B7280",
          amount: readNumber(item.amount, item.total, item.value),
        };
      })
      .filter((item) => item.amount > 0),
    recentTransactions: asArray(transactionSource)
      .slice(0, 5)
      .map((item, index) => {
        const category = asRecord(item.category);
        const type = readString(item.type, item.transactionType).toUpperCase();

        return {
          id: readString(item.id, item._id) || `transaction-${index}`,
          categoryName:
            readString(item.categoryName, category.name, item.category) ||
            "Movimentação",
          categoryColor:
            readString(item.categoryColor, category.color) ||
            (type === "INCOME" ? "#A3E635" : "#EF4444"),
          description: readString(item.description, item.notes),
          date: readString(
            item.date,
            item.createdAt,
            item.paidAt,
            item.dueDate,
          ),
          amount: readNumber(item.amount, item.value, item.total),
          type: type === "INCOME" ? "INCOME" : "EXPENSE",
        };
      }),
  };
}

function formatCurrency(value: number) {
  return brlFormatter.format(value);
}

function formatCompact(value: number) {
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toLocaleString("pt-BR", {
      maximumFractionDigits: 1,
    })}K`;
  }

  return value.toLocaleString("pt-BR");
}

function formatDate(value: string) {
  const date = value ? new Date(value) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return "--/--";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function Skeleton({ className }: { className: string }) {
  return (
    <div className={cn("animate-pulse rounded-2xl bg-bg-muted", className)} />
  );
}

function DashboardSkeleton() {
  return (
    <section className="space-y-6">
      <div className="flex justify-end gap-3">
        <Skeleton className="h-12 w-32" />
        <Skeleton className="h-12 w-28" />
      </div>
      <Skeleton className="h-40 w-full" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-32" />
        ))}
      </div>
      <Skeleton className="h-80 w-full" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-72 w-full" />
    </section>
  );
}

function EmptyWallet() {
  return (
    <svg
      viewBox="0 0 160 120"
      className="mx-auto h-28 w-36 text-text-muted"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="20"
        y="34"
        width="116"
        height="68"
        rx="16"
        fill="currentColor"
        opacity="0.22"
      />
      <path
        d="M36 34h82c10 0 18 8 18 18v10h-34c-11 0-20 9-20 20v20H36c-10 0-18-8-18-18V52c0-10 8-18 18-18Z"
        fill="currentColor"
        opacity="0.45"
      />
      <path
        d="M86 74c0-8 6-14 14-14h40v36h-40c-8 0-14-6-14-14v-8Z"
        fill="rgb(var(--bg-card))"
        stroke="#4B5563"
        strokeWidth="4"
      />
      <circle cx="104" cy="78" r="5" fill="rgb(var(--accent-lime-line))" />
      <path
        d="M42 28 88 16c8-2 15 3 17 10l2 8H42v-6Z"
        fill="rgb(var(--accent-lime-line))"
        opacity="0.3"
      />
    </svg>
  );
}

// O traço do gráfico usa a variante "line" do acento; como texto, usa a "ink"
// (no tema escuro as duas são idênticas; no claro a "ink" é mais escura).
function toInkColor(color?: string) {
  return color
    ?.replace("--accent-lime-line", "--accent-lime-ink")
    .replace("--accent-orange)", "--accent-orange-ink)");
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-xl border border-bg-muted bg-bg-card p-3 text-sm text-text-primary shadow-xl">
      <p className="mb-2 font-semibold">{label}</p>
      {payload.map((item) => (
        <p key={item.name} style={{ color: toInkColor(item.color) }}>
          {item.name}: {formatCurrency(item.value ?? 0)}
        </p>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const currentYear = new Date().getFullYear();
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [year, setYear] = useState(currentYear);
  const navigate = useNavigate();
  const { setOpen: setAddModalOpen } = useContext(TransactionModalContext);
  const { show, toggle } = useShowValues();
  const fmt = (v: number) => (show ? formatCurrency(v) : "R$ ••••");


  const years = useMemo(() => Array.from({ length: 11 }, (_, index) => currentYear + 5 - index), [currentYear]);

  const dashboardQuery = useQuery({
    queryKey: ["dashboard", month, year],
    queryFn: async () => {
      const { data } = await api.get<DashboardApiResponse>("/api/dashboard", {
        params: { month, year },
      });

      return normalizeDashboard(data);
    },
  });

  const walletsQuery = useQuery<WalletType[]>({
    queryKey: ["wallets"],
    queryFn: async () => {
      const { data } = await api.get<WalletType[]>("/api/wallets");
      return Array.isArray(data) ? data : [];
    },
  });

  if (dashboardQuery.isLoading) {
    return <DashboardSkeleton />;
  }

  const dashboard =
    dashboardQuery.data ?? normalizeDashboard({} as DashboardResponse);
  const hasTransactions = dashboard.recentTransactions.length > 0;
  const maxCategoryAmount = Math.max(
    ...dashboard.categories.map((item) => item.amount),
    0,
  );

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-text-secondary">Visão geral</p>
          <h1 className="font-sans text-3xl font-bold">Dashboard</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAddModalOpen(true)}
            className="hidden md:flex items-center gap-2 rounded-xl bg-accent-lime px-4 py-3 text-sm font-bold text-black transition-opacity hover:brightness-110"
            aria-label="Adicionar transação"
          >
            <Plus className="h-6 w-6" /> Nova
          </button>
          <select
            value={month}
            onChange={(event) => setMonth(Number(event.target.value))}
            className="rounded-xl border border-bg-muted bg-bg-card px-4 py-3 text-sm text-text-primary outline-none transition focus:border-accent-lime"
          >
            {monthOptions.map((label, index) => (
              <option key={label} value={index + 1}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            className="rounded-xl border border-bg-muted bg-bg-card px-4 py-3 text-sm text-text-primary outline-none transition focus:border-accent-lime"
          >
            {years.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      {dashboardQuery.isError && (
        <div className="rounded-2xl border border-accent-red/30 bg-accent-red/10 p-4 text-sm text-accent-red">
          Não foi possível carregar o dashboard agora.
        </div>
      )}

      <div className="rounded-2xl bg-bg-card p-6">
        <p className="text-sm uppercase tracking-widest text-text-secondary">Saldo</p>
        <div className="mt-3 flex items-center gap-3">
          <strong className={cn("font-sans text-3xl font-extrabold sm:text-5xl", dashboard.balance < 0 ? "text-accent-red" : "text-accent-lime")}>
            {fmt(dashboard.balance)}
          </strong>
          <button
            onClick={toggle}
            className="rounded-lg p-1 text-text-secondary transition hover:text-text-primary"
            aria-label={show ? "Ocultar valores" : "Mostrar valores"}
          >
            {show ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
          </button>
        </div>
        <div className="mt-5 flex flex-wrap gap-4 text-sm">
          <span className="text-accent-lime">
            Entradas: {fmt(dashboard.totalIncome)}
          </span>
          <span className="text-accent-red">
            Saídas: {fmt(dashboard.totalExpense)}
          </span>
        </div>
      </div>

      {/* Carteiras */}
      {(walletsQuery.data && walletsQuery.data.length > 0) && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-sans text-lg font-bold">Carteiras</h2>
            <Link to="/carteiras" className="text-sm font-semibold text-accent-lime">
              Gerenciar
            </Link>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
            {walletsQuery.data.map((wallet) => (
              <Link
                key={wallet._id}
                to={`/carteiras/${wallet._id}`}
                className="flex shrink-0 flex-row items-center gap-2 rounded-full bg-bg-card px-4 py-2 text-sm transition hover:bg-bg-muted"
              >
                <BankLogo nome={wallet.nome} icone={wallet.icone} className="h-5 w-5" />
                <span className="max-w-[120px] truncate text-text-secondary">{wallet.nome}</span>
                <strong className={cn("font-sans font-bold", wallet.saldo < 0 ? "text-accent-red" : "text-accent-lime")}>
                  {fmt(wallet.saldo)}
                </strong>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-bg-card p-5">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="font-sans text-xl font-bold">Evolução Mensal</h2>
          <div className="flex gap-4 text-xs text-text-secondary">
            <span className="flex items-center gap-2">
              <i className="h-2.5 w-2.5 rounded-full bg-accent-lime" />{" "}
              Entradas
            </span>
            <span className="flex items-center gap-2">
              <i className="h-2.5 w-2.5 rounded-full bg-accent-orange" />{" "}
              Saídas
            </span>
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dashboard.monthlyEvolution}>
              <defs>
                <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="rgb(var(--accent-lime-line))" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="rgb(var(--accent-lime-line))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="rgb(var(--accent-orange))" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="rgb(var(--accent-orange))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="month" stroke="rgb(var(--chart-axis))" tickLine={false} axisLine={false} />
              <YAxis stroke="rgb(var(--chart-axis))" tickLine={false} axisLine={false} tickFormatter={formatCompact} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" name="Entradas" dataKey="income" stroke="rgb(var(--accent-lime-line))" fill="url(#incomeGradient)" strokeWidth={2} />
              <Area type="monotone" name="Saídas" dataKey="expense" stroke="rgb(var(--accent-orange))" fill="url(#expenseGradient)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {!hasTransactions ? (
        <div className="rounded-2xl border border-bg-muted bg-bg-card p-8 text-center">
          <EmptyWallet />
          <h2 className="mt-4 font-sans text-xl font-bold">
            Nenhuma movimentação este mês
          </h2>
          <button
            onClick={() => navigate("/transactions?type=EXPENSE&action=create")}
            className="mt-5 rounded-xl bg-accent-lime px-5 py-3 text-sm font-bold text-black transition hover:brightness-110"
          >
            Adicionar primeiro gasto
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <SummaryCard
              icon={TrendingUp}
              label="Entradas"
              value={fmt(dashboard.totalIncome)}
              iconClassName="text-accent-lime"
              onClick={() => navigate("/transactions?type=INCOME")}
            />
            <SummaryCard
              icon={TrendingDown}
              label="Saídas"
              value={fmt(dashboard.totalExpense)}
              iconClassName="text-accent-red"
              onClick={() => navigate("/expenses")}
            />
            <Link
              to="/contas"
              className="rounded-2xl bg-bg-card p-4 transition hover:bg-bg-muted"
            >
              <Clock className="mb-4 h-6 w-6 text-accent-yellow" />
              <strong className="block text-xl">
                {fmt(dashboard.pendingTotal)}
              </strong>
              <span className="text-sm text-text-secondary">
                Contas
              </span>
            </Link>
            <SummaryCard
              icon={PiggyBank}
              label="Taxa de Poupança"
              value={show ? `${dashboard.savingsRate.toFixed(1)}%` : "••••"}
              iconClassName="text-accent-lime"
            />
          </div>

          <div className="rounded-2xl bg-bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-sans text-xl font-bold">
                Gastos por Categoria
              </h2>
              <Link
                to="/expenses"
                className="text-sm font-semibold text-accent-lime"
              >
                Ver todas
              </Link>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {dashboard.categories.slice(0, 6).map((category) => (
                <div key={category.id} className="rounded-xl bg-bg-muted p-4">
                  <div className="flex items-center gap-3">
                    <span
                      className="grid h-10 w-10 place-items-center rounded-xl"
                      style={{ backgroundColor: `${category.color}22` }}
                    >
                      <ReceiptText
                        className="h-5 w-5"
                        style={{ color: category.color }}
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{category.name}</p>
                      <p className="text-sm text-text-secondary">
                        {fmt(category.amount)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 h-2 rounded-full bg-bg-overlay">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${maxCategoryAmount ? (category.amount / maxCategoryAmount) * 100 : 0}%`,
                        backgroundColor: category.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-sans text-xl font-bold">
                Últimas Transações
              </h2>
              <Link
                to="/transactions"
                className="text-sm font-semibold text-accent-lime"
              >
                Ver todas
              </Link>
            </div>
            <div className="divide-y divide-bg-muted">
              {dashboard.recentTransactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center gap-3 py-4"
                >
                  <span
                    className="grid h-11 w-11 place-items-center rounded-xl"
                    style={{
                      backgroundColor: `${transaction.categoryColor}22`,
                    }}
                  >
                    {transaction.type === "INCOME" ? (
                      <TrendingUp
                        className="h-5 w-5"
                        style={{ color: transaction.categoryColor }}
                      />
                    ) : (
                      <TrendingDown
                        className="h-5 w-5"
                        style={{ color: transaction.categoryColor }}
                      />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {transaction.categoryName}
                    </p>
                    <p className="truncate text-sm text-text-secondary">
                      {transaction.description || "Sem descrição"} ·{" "}
                      {formatDate(transaction.date)}
                    </p>
                  </div>
                  <strong
                    className={cn(
                      "text-sm",
                      transaction.type === "INCOME"
                        ? "text-accent-lime"
                        : "text-accent-red",
                    )}
                  >
                    {transaction.type === "INCOME" ? "+" : "-"}{" "}
                    {fmt(transaction.amount)}
                  </strong>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  iconClassName,
  onClick,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  iconClassName: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-2xl bg-bg-card p-4",
        onClick && "cursor-pointer transition hover:bg-bg-muted",
      )}
    >
      <Icon className={cn("mb-4 h-6 w-6", iconClassName)} />
      <strong className="block text-xl">{value}</strong>
      <span className="text-sm text-text-secondary">{label}</span>
    </div>
  );
}
