import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Transaction, TransactionDocument, TransactionType } from '../transactions/schemas/transaction.schema';
import { PendingAccount, PendingAccountDocument } from '../pending/schemas/pending-account.schema';
import { Goal, GoalDocument } from '../goals/schemas/goal.schema';
import { Category, CategoryDocument } from '../categories/schemas/category.schema';
import { Wallet, WalletDocument } from '../wallets/schemas/wallet.schema';
import { GetCashflowDto } from './dto/get-cashflow.dto';

type CashflowGranularity = 'day' | 'week' | 'month';

export interface CashflowPoint {
  date: string;
  income: number;
  expense: number;
}

export interface CashflowResult {
  period: 'month' | 'quarter' | 'year' | 'custom';
  granularity: CashflowGranularity;
  from: string;
  to: string;
  points: CashflowPoint[];
  totals: { income: number; expense: number; balance: number };
}

export interface CategoryBreakdownItem {
  categoryId: string | null;
  name: string;
  total: number;
}

export interface ExpenseCategoryItem extends CategoryBreakdownItem {
  percentOfExpenses: number;
}

export interface IncomeSourceItem extends CategoryBreakdownItem {
  percentOfIncome: number;
}

export interface ExpensesBreakdownResult {
  period: 'month' | 'quarter' | 'year' | 'custom';
  granularity: CashflowGranularity;
  from: string;
  to: string;
  byCategory: ExpenseCategoryItem[];
  evolutionSeries: string[];
  evolution: { date: string; values: Record<string, number> }[];
  topCategoryTrend: { name: string; currentMonthTotal: number; previousMonthTotal: number; momPct: number | null } | null;
}

export interface IncomeConsistency {
  monthsWithData: number;
  avgIncome: number;
  currentMonthTotal: number;
  variationPct: number | null;
}

export interface IncomeBreakdownResult {
  period: 'month' | 'quarter' | 'year' | 'custom';
  from: string;
  to: string;
  bySource: IncomeSourceItem[];
  monthlyConsistency: { month: string; total: number }[];
  consistency: IncomeConsistency | null;
}

export interface AccountsOverview {
  paidVsPending: { paidCount: number; paidValue: number; pendingCount: number; pendingValue: number };
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
}

export interface WalletEvolutionPoint {
  date: string;
  balance: number;
}

export interface WalletEvolution {
  id: string;
  nome: string;
  currentBalance: number;
  points: WalletEvolutionPoint[];
}

export interface GoalPace {
  avgMonthlyContribution: number;
  monthsRemaining: number | null;
  requiredMonthlyContribution: number | null;
  onTrack: boolean | null;
}

export interface GoalProgress {
  id: string;
  name: string;
  targetValue: number;
  currentValue: number;
  percentComplete: number;
  deadline: string | null;
  completed: boolean;
  monthlyContributions: { month: string; amount: number }[];
  pace: GoalPace;
}

// Trunca uma data pro início do bucket (dia/semana/mês) em UTC. Semana começa na segunda-feira.
function truncateToBucket(date: Date, granularity: CashflowGranularity): Date {
  if (granularity === 'month') {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  }

  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

  if (granularity === 'week') {
    const weekday = day.getUTCDay();
    const diffToMonday = weekday === 0 ? -6 : 1 - weekday;
    day.setUTCDate(day.getUTCDate() + diffToMonday);
  }

  return day;
}

function stepBucket(date: Date, granularity: CashflowGranularity): Date {
  const next = new Date(date);
  if (granularity === 'month') next.setUTCMonth(next.getUTCMonth() + 1);
  else if (granularity === 'week') next.setUTCDate(next.getUTCDate() + 7);
  else next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function buildBucketRange(from: Date, to: Date, granularity: CashflowGranularity): Date[] {
  const buckets: Date[] = [];
  let cursor = truncateToBucket(from, granularity);

  while (cursor <= to) {
    buckets.push(new Date(cursor));
    cursor = stepBucket(cursor, granularity);
  }

  return buckets;
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Aproximação simples (meses de 30 dias) — é uma heurística de ritmo, não um cálculo de calendário exato.
function monthsBetween(from: Date, to: Date): number {
  if (to <= from) return 0;
  const days = (to.getTime() - from.getTime()) / 86400000;
  return Math.max(1, Math.ceil(days / 30));
}

export interface PeriodTotals {
  totalIncome: number;
  totalExpense: number;
  monthsWithData: number;
  avgMonthlyIncome: number;
  avgMonthlyExpense: number;
  avgMonthlyBalance: number;
}

export interface TopCategory {
  categoryId: string | null;
  name: string;
  total: number;
  percentOfExpenses: number;
  yoyPct: number | null;
}

export interface AnnualAggregates {
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
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// Base em módulo para não gerar sinal invertido quando o período anterior é negativo (saldo médio).
function percentChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return null;
  }

  return round1(((current - previous) / Math.abs(previous)) * 100);
}

function buildPeriodTotals(totalIncome: number, totalExpense: number, monthsWithData: number): PeriodTotals {
  const avgMonthlyIncome = monthsWithData > 0 ? totalIncome / monthsWithData : 0;
  const avgMonthlyExpense = monthsWithData > 0 ? totalExpense / monthsWithData : 0;

  return {
    totalIncome,
    totalExpense,
    monthsWithData,
    avgMonthlyIncome,
    avgMonthlyExpense,
    avgMonthlyBalance: avgMonthlyIncome - avgMonthlyExpense,
  };
}

export interface InsightsOverview {
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
    label: 'Excelente' | 'Boa' | 'Atenção' | 'Crítica';
    breakdown: {
      savingsRateSub: number;
      overdueAccountsSub: number;
      spendingTrendSub: number;
    };
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function scoreLabel(score: number): InsightsOverview['healthScore']['label'] {
  if (score >= 80) return 'Excelente';
  if (score >= 60) return 'Boa';
  if (score >= 40) return 'Atenção';
  return 'Crítica';
}

@Injectable()
export class InsightsService {
  constructor(
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
    @InjectModel(PendingAccount.name) private pendingModel: Model<PendingAccountDocument>,
    @InjectModel(Goal.name) private goalModel: Model<GoalDocument>,
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
    @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
  ) {}

  async getAnnualAggregates(userId: string, year: number): Promise<AnnualAggregates> {
    const previousYear = year - 1;
    const yearStart = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
    const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
    const prevStart = new Date(Date.UTC(previousYear, 0, 1, 0, 0, 0));
    const prevEnd = new Date(Date.UTC(previousYear, 11, 31, 23, 59, 59, 999));
    const userObjectId = new Types.ObjectId(userId);

    const [facetResult] = await this.transactionModel.aggregate([
      {
        $match: {
          userId: userObjectId,
          agendado: { $ne: true },
          type: { $in: [TransactionType.INCOME, TransactionType.EXPENSE] },
          date: { $gte: prevStart, $lte: yearEnd },
        },
      },
      {
        $facet: {
          currentTotals: [
            { $match: { date: { $gte: yearStart, $lte: yearEnd } } },
            { $group: { _id: '$type', total: { $sum: '$value' } } },
          ],
          previousTotals: [
            { $match: { date: { $gte: prevStart, $lte: prevEnd } } },
            { $group: { _id: '$type', total: { $sum: '$value' } } },
          ],
          currentMonthsWithData: [
            { $match: { date: { $gte: yearStart, $lte: yearEnd } } },
            { $group: { _id: { $month: '$date' } } },
            { $count: 'count' },
          ],
          previousMonthsWithData: [
            { $match: { date: { $gte: prevStart, $lte: prevEnd } } },
            { $group: { _id: { $month: '$date' } } },
            { $count: 'count' },
          ],
          currentByCategory: [
            { $match: { type: TransactionType.EXPENSE, date: { $gte: yearStart, $lte: yearEnd } } },
            { $group: { _id: '$categoryId', total: { $sum: '$value' } } },
            { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'category' } },
            { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
            {
              $project: {
                categoryId: '$_id',
                name: { $ifNull: ['$category.name', 'Sem categoria'] },
                total: 1,
              },
            },
            { $sort: { total: -1 } },
            { $limit: 3 },
          ],
          previousByCategory: [
            { $match: { type: TransactionType.EXPENSE, date: { $gte: prevStart, $lte: prevEnd } } },
            { $group: { _id: '$categoryId', total: { $sum: '$value' } } },
          ],
        },
      },
    ]);

    const findTotal = (rows: { _id: TransactionType; total: number }[], type: TransactionType) =>
      rows.find((row) => row._id === type)?.total ?? 0;

    const current = buildPeriodTotals(
      findTotal(facetResult.currentTotals, TransactionType.INCOME),
      findTotal(facetResult.currentTotals, TransactionType.EXPENSE),
      facetResult.currentMonthsWithData[0]?.count ?? 0,
    );
    const previous = buildPeriodTotals(
      findTotal(facetResult.previousTotals, TransactionType.INCOME),
      findTotal(facetResult.previousTotals, TransactionType.EXPENSE),
      facetResult.previousMonthsWithData[0]?.count ?? 0,
    );

    const previousByCategoryMap = new Map<string, number>(
      (facetResult.previousByCategory as { _id: Types.ObjectId | null; total: number }[]).map((row) => [
        String(row._id ?? 'none'),
        row.total,
      ]),
    );

    const topCategories: TopCategory[] = (
      facetResult.currentByCategory as { categoryId: Types.ObjectId | null; name: string; total: number }[]
    ).map((row) => {
      const key = String(row.categoryId ?? 'none');
      const previousTotal = previousByCategoryMap.get(key) ?? 0;

      return {
        categoryId: row.categoryId ? row.categoryId.toString() : null,
        name: row.name,
        total: row.total,
        percentOfExpenses: current.totalExpense > 0 ? round1((row.total / current.totalExpense) * 100) : 0,
        yoyPct: percentChange(row.total, previousTotal),
      };
    });

    return {
      year,
      previousYear,
      current,
      previous,
      yoyChange: {
        incomePct: percentChange(current.avgMonthlyIncome, previous.avgMonthlyIncome),
        expensePct: percentChange(current.avgMonthlyExpense, previous.avgMonthlyExpense),
        balancePct: percentChange(current.avgMonthlyBalance, previous.avgMonthlyBalance),
      },
      topCategories,
    };
  }

  async getAnnualSummary(userId: string, year: number) {
    const aggregates = await this.getAnnualAggregates(userId, year);
    const noData = aggregates.current.monthsWithData === 0;
    return { ...aggregates, narrative: null, narrativeUnavailable: true, noData };
  }

  // Cards locais/instantâneos (sem custo de API): sempre calculados na hora, sem IA.
  async getOverview(userId: string): Promise<InsightsOverview> {
    const userObjectId = new Types.ObjectId(userId);
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const monthStart = new Date(Date.UTC(currentYear, currentMonth - 1, 1, 0, 0, 0));
    const monthEnd = new Date(Date.UTC(currentYear, currentMonth, 0, 23, 59, 59, 999));
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const daysElapsed = clamp(now.getDate(), 1, daysInMonth);

    // Date.UTC aceita mês negativo e rola pro ano anterior automaticamente (ex: mês 0 = dezembro do ano - 1).
    const prevMonthStart = new Date(Date.UTC(currentYear, currentMonth - 2, 1, 0, 0, 0));
    const prevMonthEnd = new Date(Date.UTC(currentYear, currentMonth - 1, 0, 23, 59, 59, 999));
    const previousMonth = prevMonthStart.getUTCMonth() + 1;
    const previousMonthYear = prevMonthStart.getUTCFullYear();

    const [categoryRows, [monthTotalsFacet], overdueCount] = await Promise.all([
      this.transactionModel.aggregate([
        {
          $match: {
            userId: userObjectId,
            agendado: { $ne: true },
            type: TransactionType.EXPENSE,
            date: { $gte: monthStart, $lte: monthEnd },
          },
        },
        { $group: { _id: '$categoryId', total: { $sum: '$value' } } },
        { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'category' } },
        { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
        { $project: { categoryId: '$_id', name: { $ifNull: ['$category.name', 'Sem categoria'] }, total: 1 } },
        { $sort: { total: -1 } },
      ]),
      this.transactionModel.aggregate([
        {
          $match: {
            userId: userObjectId,
            agendado: { $ne: true },
            type: { $in: [TransactionType.INCOME, TransactionType.EXPENSE] },
            date: { $gte: prevMonthStart, $lte: now },
          },
        },
        {
          $facet: {
            actualThisMonth: [
              { $match: { date: { $gte: monthStart, $lte: now } } },
              { $group: { _id: '$type', total: { $sum: '$value' } } },
            ],
            previousMonthTotals: [
              { $match: { date: { $gte: prevMonthStart, $lte: prevMonthEnd } } },
              { $group: { _id: '$type', total: { $sum: '$value' } } },
            ],
            previousMonthCount: [
              { $match: { date: { $gte: prevMonthStart, $lte: prevMonthEnd } } },
              { $count: 'count' },
            ],
          },
        },
      ]),
      this.pendingModel.countDocuments({
        userId: userObjectId,
        $or: [{ tipo: 'PAGAR' }, { tipo: { $exists: false } }],
        paid: false,
        skipped: { $ne: true },
        dueDate: { $lt: now },
      }),
    ]);

    // 1. Maior categoria de gasto do mês atual.
    const allCategories = categoryRows as { categoryId: Types.ObjectId | null; name: string; total: number }[];
    const monthTotalExpense = allCategories.reduce((sum, row) => sum + row.total, 0);
    const topRow = allCategories[0];
    const topCategoryThisMonth = topRow
      ? {
          categoryId: topRow.categoryId ? topRow.categoryId.toString() : null,
          name: topRow.name,
          total: topRow.total,
          percentOfExpenses: monthTotalExpense > 0 ? round1((topRow.total / monthTotalExpense) * 100) : 0,
        }
      : null;

    const findMonthTotal = (rows: { _id: TransactionType; total: number }[], type: TransactionType) =>
      rows.find((row) => row._id === type)?.total ?? 0;
    const actualIncome = findMonthTotal(monthTotalsFacet.actualThisMonth, TransactionType.INCOME);
    const actualExpense = findMonthTotal(monthTotalsFacet.actualThisMonth, TransactionType.EXPENSE);
    const previousMonthIncome = findMonthTotal(monthTotalsFacet.previousMonthTotals, TransactionType.INCOME);
    const previousMonthExpense = findMonthTotal(monthTotalsFacet.previousMonthTotals, TransactionType.EXPENSE);
    const hasPreviousMonthData = (monthTotalsFacet.previousMonthCount[0]?.count ?? 0) > 0;

    // 2. Comparação mensal (mês atual vs. mês anterior) — card de curto prazo, útil já no 2º mês
    // de uso. A comparação ano a ano continua existindo na aba Fluxo de Caixa e na Média Anual
    // do Relatório Personalizado, só não faz mais parte deste card.
    const monthComparison = {
      currentMonth,
      currentYear,
      previousMonth,
      previousYear: previousMonthYear,
      currentIncome: actualIncome,
      currentExpense: actualExpense,
      previousIncome: previousMonthIncome,
      previousExpense: previousMonthExpense,
      incomePct: percentChange(actualIncome, previousMonthIncome),
      expensePct: percentChange(actualExpense, previousMonthExpense),
      hasPreviousMonthData,
    };

    // 3. Projeção de fim de mês (extrapolação linear pelo ritmo de gasto/ganho até hoje).
    const projectedIncome = (actualIncome / daysElapsed) * daysInMonth;
    const projectedExpense = (actualExpense / daysElapsed) * daysInMonth;

    const monthEndProjection = {
      daysElapsed,
      daysInMonth,
      actualIncome,
      actualExpense,
      projectedIncome,
      projectedExpense,
      projectedBalance: projectedIncome - projectedExpense,
    };

    // 4. Score de saúde financeira (0-100): 50% taxa de poupança do mês, 25% contas em atraso, 25% tendência de gasto.
    let savingsRateSub: number;
    if (actualIncome > 0) {
      const savingsRate = ((actualIncome - actualExpense) / actualIncome) * 100;
      savingsRateSub = clamp((clamp(savingsRate, -100, 100) + 100) / 2, 0, 100);
    } else {
      savingsRateSub = actualExpense > 0 ? 0 : 50;
    }

    const overdueAccountsSub = clamp(100 - overdueCount * 20, 0, 100);

    const spendingTrendSub =
      previousMonthExpense > 0
        ? clamp(70 - ((projectedExpense - previousMonthExpense) / previousMonthExpense) * 100, 0, 100)
        : 50;

    const score = Math.round(0.5 * savingsRateSub + 0.25 * overdueAccountsSub + 0.25 * spendingTrendSub);

    const healthScore = {
      score: clamp(score, 0, 100),
      label: scoreLabel(score),
      breakdown: {
        savingsRateSub: round1(savingsRateSub),
        overdueAccountsSub: round1(overdueAccountsSub),
        spendingTrendSub: round1(spendingTrendSub),
      },
    };

    return {
      topCategoryThisMonth,
      monthComparison,
      monthEndProjection,
      healthScore,
    };
  }

  private resolvePeriodRange(dto: GetCashflowDto): { from: Date; to: Date; granularity: CashflowGranularity } {
    const now = new Date();
    const period = dto.period ?? 'year';

    if (period === 'month') {
      const year = dto.year ?? now.getFullYear();
      const month = dto.month ?? now.getMonth() + 1;
      return {
        from: new Date(Date.UTC(year, month - 1, 1)),
        to: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
        granularity: 'day',
      };
    }

    if (period === 'quarter') {
      const year = dto.year ?? now.getFullYear();
      const quarter = dto.quarter ?? Math.floor(now.getMonth() / 3) + 1;
      const startMonth = (quarter - 1) * 3;
      return {
        from: new Date(Date.UTC(year, startMonth, 1)),
        to: new Date(Date.UTC(year, startMonth + 3, 0, 23, 59, 59, 999)),
        granularity: 'week',
      };
    }

    if (period === 'custom') {
      if (!dto.from || !dto.to) {
        throw new BadRequestException('from e to são obrigatórios quando period=custom');
      }

      const from = new Date(`${dto.from}T00:00:00.000Z`);
      const to = new Date(`${dto.to}T23:59:59.999Z`);

      if (from > to) {
        throw new BadRequestException('from deve ser anterior a to');
      }

      const spanDays = (to.getTime() - from.getTime()) / 86400000;
      const granularity: CashflowGranularity = spanDays <= 31 ? 'day' : spanDays <= 120 ? 'week' : 'month';

      return { from, to, granularity };
    }

    // year (default)
    const year = dto.year ?? now.getFullYear();
    return {
      from: new Date(Date.UTC(year, 0, 1)),
      to: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
      granularity: 'month',
    };
  }

  // Ponto-no-tempo usado por seções sem filtro de período próprio (Metas, Carteiras) quando
  // chamadas a partir do Relatório Personalizado: rebaseia as janelas fixas (12/6 meses) pro
  // FIM do período escolhido, em vez de sempre "agora" — sem período (uso normal das abas),
  // continua ancorado em "agora", igual antes.
  private resolveReportAnchor(dto?: GetCashflowDto): { anchor: Date; bounded: boolean } {
    const hasPeriod = Boolean(dto && (dto.period || dto.from || dto.to || dto.month || dto.quarter || dto.year));
    return { anchor: hasPeriod ? this.resolvePeriodRange(dto!).to : new Date(), bounded: hasPeriod };
  }

  // Entradas e saídas separadas ao longo do tempo. Busca as transações do período e faz o
  // bucketing em JS (não em $group no Mongo) pra reaproveitar a MESMA função de truncamento
  // tanto pros buckets quanto pras datas reais — evita divergência entre o range gerado e o
  // agrupamento (o volume de transações de um único usuário é pequeno o bastante pra isso
  // não pesar, mesmo período a período).
  async getCashflow(userId: string, dto: GetCashflowDto): Promise<CashflowResult> {
    const { from, to, granularity } = this.resolvePeriodRange(dto);
    const userObjectId = new Types.ObjectId(userId);

    const rows = await this.transactionModel
      .find({
        userId: userObjectId,
        agendado: { $ne: true },
        type: { $in: [TransactionType.INCOME, TransactionType.EXPENSE] },
        date: { $gte: from, $lte: to },
      })
      .select('type value date')
      .lean()
      .exec();

    const buckets = buildBucketRange(from, to, granularity);
    const bucketMap = new Map<number, { income: number; expense: number }>();
    for (const bucket of buckets) {
      bucketMap.set(bucket.getTime(), { income: 0, expense: 0 });
    }

    for (const row of rows as unknown as { type: TransactionType; value: number; date: Date }[]) {
      const key = truncateToBucket(new Date(row.date), granularity).getTime();
      const entry = bucketMap.get(key);
      if (!entry) continue;
      if (row.type === TransactionType.INCOME) entry.income += row.value;
      else entry.expense += row.value;
    }

    const points: CashflowPoint[] = buckets.map((bucket) => {
      const entry = bucketMap.get(bucket.getTime())!;
      return { date: bucket.toISOString(), income: entry.income, expense: entry.expense };
    });

    const totals = points.reduce(
      (acc, point) => ({ income: acc.income + point.income, expense: acc.expense + point.expense }),
      { income: 0, expense: 0 },
    );

    return {
      period: dto.period ?? 'year',
      granularity,
      from: from.toISOString(),
      to: to.toISOString(),
      points,
      totals: { income: totals.income, expense: totals.expense, balance: totals.income - totals.expense },
    };
  }

  // Progresso de metas reconstruído a partir do histórico real de contribuições (transações
  // na categoria vinculada à meta), não só um snapshot estático de currentValue/targetValue.
  async getGoalsProgress(userId: string, dto?: GetCashflowDto): Promise<GoalProgress[]> {
    const userObjectId = new Types.ObjectId(userId);
    const goals = await this.goalModel.find({ userId: userObjectId }).exec();

    const { anchor, bounded } = this.resolveReportAnchor(dto);
    const chartMonths = 12;
    const chartStart = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - (chartMonths - 1), 1));
    const paceMonths = 6;
    const paceStart = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - (paceMonths - 1), 1));
    const contributionsDateFilter = bounded ? { $gte: chartStart, $lte: anchor } : { $gte: chartStart };

    return Promise.all(
      goals.map(async (goal) => {
        const categoryId = goal.linkedCategoryId;

        const contributions = categoryId
          ? ((await this.transactionModel
              // Só EXPENSE conta como contribuição — mesmo filtro usado por incrementLinkedGoal/
              // decrementLinkedGoal em transactions.service.ts (só gasto na categoria vinculada
              // move o currentValue da meta).
              .find({ userId: userObjectId, categoryId, type: TransactionType.EXPENSE, date: contributionsDateFilter })
              .select('value date')
              .lean()
              .exec()) as unknown as { value: number; date: Date }[])
          : [];

        const monthlyMap = new Map<string, number>();
        for (let i = 0; i < chartMonths; i++) {
          const bucketDate = new Date(Date.UTC(chartStart.getUTCFullYear(), chartStart.getUTCMonth() + i, 1));
          monthlyMap.set(monthKey(bucketDate), 0);
        }
        for (const contribution of contributions) {
          const key = monthKey(new Date(contribution.date));
          if (monthlyMap.has(key)) {
            monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + contribution.value);
          }
        }

        const monthlyContributions = Array.from(monthlyMap.entries()).map(([month, amount]) => ({ month, amount }));

        const paceContributions = contributions.filter((c) => new Date(c.date) >= paceStart);
        const monthsWithData = new Set(paceContributions.map((c) => monthKey(new Date(c.date)))).size;
        const totalRecent = paceContributions.reduce((sum, c) => sum + c.value, 0);
        const avgMonthlyContribution = monthsWithData > 0 ? totalRecent / monthsWithData : 0;

        let pace: GoalPace;
        if (goal.completed) {
          pace = { avgMonthlyContribution, monthsRemaining: null, requiredMonthlyContribution: null, onTrack: true };
        } else if (goal.deadline) {
          const remainingValue = Math.max(0, goal.targetValue - goal.currentValue);
          const monthsRemaining = monthsBetween(anchor, goal.deadline);
          const requiredMonthlyContribution = monthsRemaining > 0 ? remainingValue / monthsRemaining : remainingValue;
          pace = {
            avgMonthlyContribution,
            monthsRemaining,
            requiredMonthlyContribution,
            onTrack: avgMonthlyContribution >= requiredMonthlyContribution,
          };
        } else {
          pace = { avgMonthlyContribution, monthsRemaining: null, requiredMonthlyContribution: null, onTrack: null };
        }

        return {
          id: (goal._id as Types.ObjectId).toString(),
          name: goal.name,
          targetValue: goal.targetValue,
          currentValue: goal.currentValue,
          percentComplete: goal.targetValue > 0 ? Math.round((goal.currentValue / goal.targetValue) * 100) : 0,
          deadline: goal.deadline ? goal.deadline.toISOString() : null,
          completed: goal.completed,
          monthlyContributions,
          pace,
        };
      }),
    );
  }

  // Soma por categoria num intervalo, pra um tipo de transação — reaproveitado por Gastos
  // (EXPENSE) e Ganhos (INCOME). Nomes vêm de uma única consulta por lote (sem $lookup em loop).
  private async computeCategoryBreakdown(
    userObjectId: Types.ObjectId,
    type: TransactionType,
    from: Date,
    to: Date,
  ): Promise<CategoryBreakdownItem[]> {
    const rows = await this.transactionModel
      .find({ userId: userObjectId, agendado: { $ne: true }, type, date: { $gte: from, $lte: to } })
      .select('categoryId value')
      .lean()
      .exec();

    const totalsByKey = new Map<string, number>();
    for (const row of rows as unknown as { categoryId?: Types.ObjectId; value: number }[]) {
      const key = row.categoryId ? row.categoryId.toString() : 'none';
      totalsByKey.set(key, (totalsByKey.get(key) ?? 0) + row.value);
    }

    const categoryIds = [...totalsByKey.keys()].filter((key) => key !== 'none').map((key) => new Types.ObjectId(key));
    const categories = categoryIds.length
      ? await this.categoryModel.find({ _id: { $in: categoryIds } }).select('name').lean().exec()
      : [];
    const nameByKey = new Map(categories.map((category) => [(category._id as Types.ObjectId).toString(), category.name]));

    return [...totalsByKey.entries()]
      .map(([key, total]) => ({
        categoryId: key === 'none' ? null : key,
        name: key === 'none' ? 'Sem categoria' : (nameByKey.get(key) ?? 'Sem categoria'),
        total,
      }))
      .sort((a, b) => b.total - a.total);
  }

  private async computeTopCategoryTrend(
    userObjectId: Types.ObjectId,
  ): Promise<ExpensesBreakdownResult['topCategoryTrend']> {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    const prevMonthStart = new Date(Date.UTC(year, month - 2, 1));
    const prevMonthEnd = new Date(Date.UTC(year, month - 1, 0, 23, 59, 59, 999));

    const currentBreakdown = await this.computeCategoryBreakdown(userObjectId, TransactionType.EXPENSE, monthStart, monthEnd);
    if (currentBreakdown.length === 0) {
      return null;
    }

    const top = currentBreakdown[0];
    const previousBreakdown = await this.computeCategoryBreakdown(
      userObjectId,
      TransactionType.EXPENSE,
      prevMonthStart,
      prevMonthEnd,
    );
    const previousTotal = previousBreakdown.find((category) => category.categoryId === top.categoryId)?.total ?? 0;

    return {
      name: top.name,
      currentMonthTotal: top.total,
      previousMonthTotal: previousTotal,
      momPct: percentChange(top.total, previousTotal),
    };
  }

  // Distribuição de gastos por categoria no período + evolução (top 5 categorias + "Outros")
  // bucketada na mesma granularidade do período, mais a tendência do mês atual vs. anterior
  // (sempre mês corrente, independente do período selecionado — mesma convenção da Visão Geral).
  async getExpensesBreakdown(userId: string, dto: GetCashflowDto): Promise<ExpensesBreakdownResult> {
    const { from, to, granularity } = this.resolvePeriodRange(dto);
    const userObjectId = new Types.ObjectId(userId);

    const byCategory = await this.computeCategoryBreakdown(userObjectId, TransactionType.EXPENSE, from, to);
    const grandTotal = byCategory.reduce((sum, item) => sum + item.total, 0);

    const topItems = byCategory.slice(0, 5);
    const topKeys = topItems.map((item) => item.categoryId ?? 'none');
    const hasOutros = byCategory.length > topItems.length;
    const evolutionSeries = [...topItems.map((item) => item.name), ...(hasOutros ? ['Outros'] : [])];

    const rows = await this.transactionModel
      .find({ userId: userObjectId, agendado: { $ne: true }, type: TransactionType.EXPENSE, date: { $gte: from, $lte: to } })
      .select('categoryId value date')
      .lean()
      .exec();

    const buckets = buildBucketRange(from, to, granularity);
    const bucketSeries = new Map<number, Map<string, number>>();
    for (const bucket of buckets) {
      bucketSeries.set(bucket.getTime(), new Map());
    }

    for (const row of rows as unknown as { categoryId?: Types.ObjectId; value: number; date: Date }[]) {
      const bucketKey = truncateToBucket(new Date(row.date), granularity).getTime();
      const seriesMap = bucketSeries.get(bucketKey);
      if (!seriesMap) continue;
      const rawKey = row.categoryId ? row.categoryId.toString() : 'none';
      const seriesKey = topKeys.includes(rawKey) ? rawKey : 'outros';
      seriesMap.set(seriesKey, (seriesMap.get(seriesKey) ?? 0) + row.value);
    }

    const evolution = buckets.map((bucket) => {
      const seriesMap = bucketSeries.get(bucket.getTime())!;
      const values: Record<string, number> = {};
      topItems.forEach((item, index) => {
        values[item.name] = seriesMap.get(topKeys[index]) ?? 0;
      });
      if (hasOutros) {
        values['Outros'] = seriesMap.get('outros') ?? 0;
      }
      return { date: bucket.toISOString(), values };
    });

    const topCategoryTrend = await this.computeTopCategoryTrend(userObjectId);

    return {
      period: dto.period ?? 'year',
      granularity,
      from: from.toISOString(),
      to: to.toISOString(),
      byCategory: byCategory.map((item) => ({
        ...item,
        percentOfExpenses: grandTotal > 0 ? round1((item.total / grandTotal) * 100) : 0,
      })),
      evolutionSeries,
      evolution,
      topCategoryTrend,
    };
  }

  private async computeMonthlyIncomeConsistency(userObjectId: Types.ObjectId): Promise<{
    points: { month: string; total: number }[];
    consistency: IncomeConsistency | null;
  }> {
    const now = new Date();
    const lookbackMonths = 12;
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (lookbackMonths - 1), 1));

    const rows = await this.transactionModel
      .find({ userId: userObjectId, agendado: { $ne: true }, type: TransactionType.INCOME, date: { $gte: start } })
      .select('value date')
      .lean()
      .exec();

    const monthlyMap = new Map<string, number>();
    for (let i = 0; i < lookbackMonths; i++) {
      const bucketDate = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
      monthlyMap.set(monthKey(bucketDate), 0);
    }
    for (const row of rows as unknown as { value: number; date: Date }[]) {
      const key = monthKey(new Date(row.date));
      if (monthlyMap.has(key)) {
        monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + row.value);
      }
    }

    const points = Array.from(monthlyMap.entries()).map(([month, total]) => ({ month, total }));

    const currentKey = monthKey(now);
    const currentMonthTotal = monthlyMap.get(currentKey) ?? 0;
    const otherMonthsWithData = points.filter((point) => point.month !== currentKey && point.total > 0);
    const monthsWithData = otherMonthsWithData.length + (currentMonthTotal > 0 ? 1 : 0);

    // Só faz sentido falar de "consistência" com pelo menos 3 meses de histórico real.
    if (monthsWithData < 3) {
      return { points, consistency: null };
    }

    const avgIncome = otherMonthsWithData.reduce((sum, point) => sum + point.total, 0) / otherMonthsWithData.length;

    return {
      points,
      consistency: {
        monthsWithData,
        avgIncome,
        currentMonthTotal,
        variationPct: percentChange(currentMonthTotal, avgIncome),
      },
    };
  }

  // Fontes de renda (categoria como proxy) no período + consistência mês a mês (últimos 12
  // meses fixos, independente do período selecionado — reflete a régua de tempo, não o filtro).
  async getIncomeBreakdown(userId: string, dto: GetCashflowDto): Promise<IncomeBreakdownResult> {
    const { from, to } = this.resolvePeriodRange(dto);
    const userObjectId = new Types.ObjectId(userId);

    const breakdown = await this.computeCategoryBreakdown(userObjectId, TransactionType.INCOME, from, to);
    const grandTotal = breakdown.reduce((sum, item) => sum + item.total, 0);
    const bySource = breakdown.map((item) => ({
      ...item,
      percentOfIncome: grandTotal > 0 ? round1((item.total / grandTotal) * 100) : 0,
    }));

    const { points, consistency } = await this.computeMonthlyIncomeConsistency(userObjectId);

    return {
      period: dto.period ?? 'year',
      from: from.toISOString(),
      to: to.toISOString(),
      bySource,
      monthlyConsistency: points,
      consistency,
    };
  }

  // Pago vs. pendente, atraso, parcelamentos em andamento e recorrentes ativas.
  // isRecorrente:true identifica só o MOLDE de uma série recorrente (não dinheiro real
  // devido) — instâncias já geradas têm isRecorrente:false (ver pending.service.ts), então
  // excluir isRecorrente:true de "concreteAccounts" evita contar o molde como uma conta real.
  async getAccountsOverview(userId: string): Promise<AccountsOverview> {
    const userObjectId = new Types.ObjectId(userId);
    const now = new Date();

    const weekEnd = new Date(now.getTime() + 7 * 86400000);

    const [concreteAccounts, overdueAgg, dueThisWeekAgg, installmentGroups, activeRecurringCount] = await Promise.all([
      this.pendingModel
        .find({ userId: userObjectId, isRecorrente: { $ne: true } })
        .select('paid value')
        .lean()
        .exec(),
      this.pendingModel.aggregate([
        {
          $match: {
            userId: userObjectId,
            isRecorrente: { $ne: true },
            $or: [{ tipo: 'PAGAR' }, { tipo: { $exists: false } }],
            paid: false,
            skipped: { $ne: true },
            dueDate: { $lt: now },
          },
        },
        { $group: { _id: null, count: { $sum: 1 }, value: { $sum: '$value' } } },
      ]),
      this.pendingModel.aggregate([
        {
          $match: {
            userId: userObjectId,
            isRecorrente: { $ne: true },
            $or: [{ tipo: 'PAGAR' }, { tipo: { $exists: false } }],
            paid: false,
            skipped: { $ne: true },
            dueDate: { $gte: now, $lte: weekEnd },
          },
        },
        { $group: { _id: null, count: { $sum: 1 }, value: { $sum: '$value' } } },
      ]),
      this.pendingModel.aggregate([
        { $match: { userId: userObjectId, isParcelada: true, paid: false } },
        { $sort: { numeroParcela: 1 } },
        { $group: { _id: '$grupoParceladoId', doc: { $first: '$$ROOT' } } },
      ]),
      this.pendingModel.countDocuments({
        userId: userObjectId,
        isRecorrente: true,
        recorrenciaTemplateId: { $exists: false },
        $or: [
          { 'recorrencia.dataTermino': { $exists: false } },
          { 'recorrencia.dataTermino': null },
          { 'recorrencia.dataTermino': { $gte: now } },
        ],
      }),
    ]);

    const rows = concreteAccounts as unknown as { paid: boolean; value: number }[];
    const paid = rows.filter((row) => row.paid);
    const pending = rows.filter((row) => !row.paid);

    const groups = installmentGroups as unknown as {
      _id: string;
      doc: {
        title: string;
        value: number;
        dueDate: Date;
        parcelas?: { totalParcelas: number; valorParcela: number; parcelasPagas: number[] };
      };
    }[];

    return {
      paidVsPending: {
        paidCount: paid.length,
        paidValue: paid.reduce((sum, row) => sum + row.value, 0),
        pendingCount: pending.length,
        pendingValue: pending.reduce((sum, row) => sum + row.value, 0),
      },
      overdue: {
        count: overdueAgg[0]?.count ?? 0,
        value: overdueAgg[0]?.value ?? 0,
      },
      dueThisWeek: {
        count: dueThisWeekAgg[0]?.count ?? 0,
        value: dueThisWeekAgg[0]?.value ?? 0,
      },
      installmentsInProgress: groups.map((group) => ({
        id: group._id,
        title: group.doc.title,
        totalParcelas: group.doc.parcelas?.totalParcelas ?? 0,
        paidParcelas: group.doc.parcelas?.parcelasPagas?.length ?? 0,
        valorParcela: group.doc.parcelas?.valorParcela ?? group.doc.value,
        nextDueDate: new Date(group.doc.dueDate).toISOString(),
      })),
      activeRecurringCount,
    };
  }

  // Evolução de saldo cumulativo por carteira, bucketado por mês (não por transação) —
  // mantém o custo baixo mesmo em carteiras com muitas transações acumuladas. Reaproveita
  // a MESMA fórmula de saldo de wallets.service.ts (wallet.saldo + net de carteiraId +
  // créditos de transferência em carteiraDestinoId), aplicada progressivamente no tempo.
  async getWalletsEvolution(userId: string, dto?: GetCashflowDto): Promise<WalletEvolution[]> {
    const userObjectId = new Types.ObjectId(userId);
    const wallets = await this.walletModel.find({ userId: userObjectId }).sort({ createdAt: 1 }).exec();

    const { anchor } = this.resolveReportAnchor(dto);
    const monthsBack = 12;
    const chartStart = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - (monthsBack - 1), 1));
    const bucketEnds = Array.from({ length: monthsBack }, (_, index) => {
      if (index === monthsBack - 1) return anchor;
      return new Date(Date.UTC(chartStart.getUTCFullYear(), chartStart.getUTCMonth() + index + 1, 0, 23, 59, 59, 999));
    });

    return Promise.all(
      wallets.map(async (wallet) => {
        const [outRows, inRows] = await Promise.all([
          this.transactionModel
            .find({ userId: userObjectId, carteiraId: wallet._id, agendado: { $ne: true } })
            .select('type value date')
            .sort({ date: 1 })
            .lean()
            .exec(),
          this.transactionModel
            .find({ userId: userObjectId, type: TransactionType.TRANSFER, carteiraDestinoId: wallet._id })
            .select('value date')
            .sort({ date: 1 })
            .lean()
            .exec(),
        ]);

        const movements = [
          ...(outRows as unknown as { type: TransactionType; value: number; date: Date }[]).map((row) => ({
            date: new Date(row.date),
            delta: row.type === TransactionType.INCOME ? row.value : -row.value,
          })),
          ...(inRows as unknown as { value: number; date: Date }[]).map((row) => ({
            date: new Date(row.date),
            delta: row.value,
          })),
        ].sort((a, b) => a.date.getTime() - b.date.getTime());

        let cursor = 0;
        let runningBalance = wallet.saldo;
        const points: WalletEvolutionPoint[] = bucketEnds.map((bucketEnd, index) => {
          while (cursor < movements.length && movements[cursor].date <= bucketEnd) {
            runningBalance += movements[cursor].delta;
            cursor += 1;
          }
          const bucketDate = new Date(Date.UTC(chartStart.getUTCFullYear(), chartStart.getUTCMonth() + index, 1));
          return { date: bucketDate.toISOString(), balance: runningBalance };
        });

        return {
          id: (wallet._id as Types.ObjectId).toString(),
          nome: wallet.nome,
          currentBalance: runningBalance,
          points,
        };
      }),
    );
  }
}
