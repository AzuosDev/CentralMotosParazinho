// Espelha as interfaces de backend/src/modules/insights/insights.service.ts.
// Não há pacote de tipos compartilhado: quando o service mudar, atualize aqui à mão.

export type InsightsPeriod = "month" | "quarter" | "year" | "custom";

export type CashflowGranularity = "day" | "week" | "month";

/** Parâmetros aceitos por /cashflow, /expenses-breakdown, /income-breakdown, etc. */
export type PeriodQuery = {
  period?: InsightsPeriod;
  month?: number;
  quarter?: number;
  year?: number;
  from?: string;
  to?: string;
};

export type CashflowPoint = {
  date: string;
  income: number;
  expense: number;
};

export type CashflowResult = {
  period: InsightsPeriod;
  granularity: CashflowGranularity;
  from: string;
  to: string;
  points: CashflowPoint[];
  totals: { income: number; expense: number; balance: number };
};

export type CategoryBreakdownItem = {
  categoryId: string | null;
  name: string;
  total: number;
};

export type ExpenseCategoryItem = CategoryBreakdownItem & {
  percentOfExpenses: number;
};

export type IncomeSourceItem = CategoryBreakdownItem & {
  percentOfIncome: number;
};

export type ExpensesBreakdownResult = {
  period: InsightsPeriod;
  granularity: CashflowGranularity;
  from: string;
  to: string;
  byCategory: ExpenseCategoryItem[];
  evolutionSeries: string[];
  evolution: { date: string; values: Record<string, number> }[];
  topCategoryTrend: {
    name: string;
    currentMonthTotal: number;
    previousMonthTotal: number;
    momPct: number | null;
  } | null;
};

export type IncomeConsistency = {
  monthsWithData: number;
  avgIncome: number;
  currentMonthTotal: number;
  variationPct: number | null;
};

export type IncomeBreakdownResult = {
  period: InsightsPeriod;
  from: string;
  to: string;
  bySource: IncomeSourceItem[];
  monthlyConsistency: { month: string; total: number }[];
  consistency: IncomeConsistency | null;
};

export type AccountsOverview = {
  paidVsPending: {
    paidCount: number;
    paidValue: number;
    pendingCount: number;
    pendingValue: number;
  };
  overdue: { count: number; value: number };
  dueThisWeek: { count: number; value: number };
  installmentsInProgress: {
    id: string;
    title: string;
    totalParcelas: number;
    paidParcelas: number;
    valorParcela: number;
    nextDueDate: string;
  }[];
  activeRecurringCount: number;
};

export type WalletEvolution = {
  id: string;
  nome: string;
  currentBalance: number;
  points: { date: string; balance: number }[];
};

export type GoalPace = {
  avgMonthlyContribution: number;
  monthsRemaining: number | null;
  requiredMonthlyContribution: number | null;
  onTrack: boolean | null;
};

export type GoalProgress = {
  id: string;
  name: string;
  targetValue: number;
  currentValue: number;
  percentComplete: number;
  deadline: string | null;
  completed: boolean;
  monthlyContributions: { month: string; amount: number }[];
  pace: GoalPace;
};

export type InsightsOverview = {
  topCategoryThisMonth: {
    categoryId: string | null;
    name: string;
    total: number;
    percentOfExpenses: number;
  } | null;
  monthComparison: {
    currentMonth: number;
    currentYear: number;
    previousMonth: number;
    previousYear: number;
    currentIncome: number;
    currentExpense: number;
    previousIncome: number;
    previousExpense: number;
    incomePct: number | null;
    expensePct: number | null;
    hasPreviousMonthData: boolean;
  };
  monthEndProjection: {
    daysElapsed: number;
    daysInMonth: number;
    actualIncome: number;
    actualExpense: number;
    projectedIncome: number;
    projectedExpense: number;
    projectedBalance: number;
  };
  healthScore: {
    score: number;
    label: "Excelente" | "Boa" | "Atenção" | "Crítica";
    breakdown: {
      savingsRateSub: number;
      overdueAccountsSub: number;
      spendingTrendSub: number;
    };
  };
};

export type PeriodTotals = {
  totalIncome: number;
  totalExpense: number;
  monthsWithData: number;
  avgMonthlyIncome: number;
  avgMonthlyExpense: number;
  avgMonthlyBalance: number;
};

export type TopCategory = {
  categoryId: string | null;
  name: string;
  total: number;
  percentOfExpenses: number;
  yoyPct: number | null;
};

export type AnnualAggregates = {
  year: number;
  previousYear: number;
  current: PeriodTotals;
  previous: PeriodTotals;
  yoyChange: {
    incomePct: number | null;
    expensePct: number | null;
    balancePct: number | null;
  };
  topCategories: TopCategory[];
};
