import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Transaction, TransactionDocument, TransactionType } from '../transactions/schemas/transaction.schema';
import { PendingAccount, PendingAccountDocument } from '../pending/schemas/pending-account.schema';
import { Goal, GoalDocument } from '../goals/schemas/goal.schema';
import { WalletsService } from '../wallets/wallets.service';
import { SIGNED_VALUE_EXPR } from '../transactions/transaction-aggregation.util';
import { GetDashboardDto } from './dto/get-dashboard.dto';

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
    @InjectModel(PendingAccount.name) private pendingModel: Model<PendingAccountDocument>,
    @InjectModel(Goal.name) private goalModel: Model<GoalDocument>,
    private walletsService: WalletsService,
  ) {}

  // Mesma regra de excludeCardPurchasesMatch() em wallets.service.ts: compra no crédito
  // (faturaId setado) é dívida, não dinheiro saindo de carteira nenhuma — só deve reduzir o
  // Saldo quando a fatura é paga de verdade (TRANSFER criada em CartoesService#pagar).
  // Aplicado só nos totais que representam "quanto dinheiro eu tenho/movimentei"
  // (Saldo/Entradas/Saídas/gráfico de evolução); expensesByCategory e recentTransactions
  // continuam incluindo compras no cartão, que é "no que eu gastei" (outra pergunta).
  private excludeCardPurchasesMatch() {
    return { faturaId: { $exists: false } };
  }

  async getDashboard(userId: string, query: GetDashboardDto) {
    const now = new Date();
    const month = query.month ?? now.getMonth() + 1;
    const year = query.year ?? now.getFullYear();
    const yearStart = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
    const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

    let startDate: Date;
    let endDate: Date;
    const period = query.period ?? 'monthly';

    if (period === 'daily') {
      startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
      endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    } else if (period === 'weekly') {
      const dow = now.getUTCDay();
      const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (dow === 0 ? 6 : dow - 1)));
      const sunday = new Date(monday);
      sunday.setUTCDate(monday.getUTCDate() + 6);
      sunday.setUTCHours(23, 59, 59, 999);
      startDate = monday;
      endDate = sunday;
    } else if (period === 'yearly') {
      startDate = yearStart;
      endDate = yearEnd;
    } else {
      startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
      endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    }
    const userObjectId = new Types.ObjectId(userId);

    // All 5 transaction queries consolidated into a single $facet round-trip.
    // Pending, goals and o saldo das carteiras rodam em paralelo com ele via Promise.all.
    const [facetResult, pendingAccounts, goals, wallets] = await Promise.all([
      this.transactionModel
        .aggregate([
          {
            $match: {
              userId: userObjectId,
              date: { $gte: yearStart, $lte: yearEnd },
              // Mesma lógica de effectiveSaldoMatch() em wallets.service.ts:
              // inclui transações não-agendadas OU agendadas cuja data já passou.
              $or: [{ agendado: { $ne: true } }, { date: { $lte: now } }],
            },
          },
          {
            $facet: {
              totalIncome: [
                { $match: { type: TransactionType.INCOME, date: { $gte: startDate, $lte: endDate }, ...this.excludeCardPurchasesMatch() } },
                { $group: { _id: null, total: { $sum: '$value' } } },
              ],
              totalExpenses: [
                { $match: { type: TransactionType.EXPENSE, date: { $gte: startDate, $lte: endDate }, ...this.excludeCardPurchasesMatch() } },
                // Estorno de compra no cartão (isEstorno) é subtraído em vez de somado — senão
                // uma compra devolvida continuaria contando como gasto no total do mês.
                { $group: { _id: null, total: { $sum: SIGNED_VALUE_EXPR } } },
              ],
              expensesByCategory: [
                { $match: { type: TransactionType.EXPENSE, date: { $gte: startDate, $lte: endDate } } },
                { $group: { _id: '$categoryId', total: { $sum: SIGNED_VALUE_EXPR } } },
                {
                  $lookup: {
                    from: 'categories',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'category',
                  },
                },
                { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
                {
                  $project: {
                    categoryId: '$_id',
                    categoryName: { $ifNull: ['$category.name', 'Sem categoria'] },
                    categoryColor: { $ifNull: ['$category.color', '#6B7280'] },
                    categoryIcon: { $ifNull: ['$category.icon', 'Receipt'] },
                    total: 1,
                  },
                },
                { $sort: { total: -1 } },
              ],
              monthlyAggregation: [
                { $match: this.excludeCardPurchasesMatch() },
                {
                  $group: {
                    _id: { month: { $month: '$date' }, type: '$type' },
                    total: { $sum: SIGNED_VALUE_EXPR },
                  },
                },
                {
                  $project: {
                    _id: 0,
                    month: '$_id.month',
                    type: '$_id.type',
                    total: 1,
                  },
                },
              ],
              recentTransactions: [
                { $match: { date: { $gte: startDate, $lte: endDate } } },
                { $sort: { date: -1 } },
                { $limit: 5 },
                {
                  $lookup: {
                    from: 'categories',
                    localField: 'categoryId',
                    foreignField: '_id',
                    as: 'category',
                  },
                },
                { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
                {
                  $project: {
                    id: '$_id',
                    type: 1,
                    value: 1,
                    date: 1,
                    description: 1,
                    categoryName: '$category.name',
                    categoryColor: '$category.color',
                  },
                },
              ],
            },
          },
        ])
        .exec(),
      this.pendingModel
        .find({
          userId: userObjectId,
          // 'tipo' não existe em documentos legados (anteriores a essa feature); o
          // default 'PAGAR' do schema só é aplicado depois que o Mongo já leu o
          // documento, então o filtro de query precisa aceitar tipo ausente também
          // (mesmo critério usado em pending.service.ts/tipoMatch).
          $or: [{ tipo: 'PAGAR' }, { tipo: { $exists: false } }],
          paid: false,
          skipped: { $ne: true },
          isRecorrente: { $ne: true },
          dueDate: { $lte: endDate },
        })
        .sort({ dueDate: 1 })
        .exec(),
      this.goalModel.find({ userId: userObjectId }).exec(),
      // Mesmo cálculo usado em "Carteiras"/patrimônio (WalletsService#findAll): saldo
      // inicial + todas as transações desde sempre + transferências, sem cartão. O Saldo do
      // Dashboard é sempre "quanto eu tenho agora" — não muda com o mês/ano selecionado no
      // topo (esses só afetam Entradas/Saídas/gráfico/categorias abaixo), e sempre bate com
      // o que "Carteiras" mostra logo abaixo dele.
      this.walletsService.findAll(userId),
    ]);

    const facet = facetResult[0];

    const totalIncome = facet.totalIncome[0]?.total ?? 0;
    const totalExpenses = facet.totalExpenses[0]?.total ?? 0;

    const balance = Number(
      wallets.reduce((sum, w) => sum + (typeof w.saldo === 'number' ? w.saldo : 0), 0).toFixed(2),
    );

    const savingsRate = totalIncome > 0 ? parseFloat((((totalIncome - totalExpenses) / totalIncome) * 100).toFixed(1)) : 0;

    const monthlyEvolution = Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      income: 0,
      expenses: 0,
    }));

    for (const item of facet.monthlyAggregation) {
      const monthIndex = item.month - 1;
      if (monthIndex >= 0 && monthIndex < 12) {
        if (item.type === TransactionType.INCOME) {
          monthlyEvolution[monthIndex].income = item.total;
        } else if (item.type === TransactionType.EXPENSE) {
          monthlyEvolution[monthIndex].expenses = item.total;
        }
      }
    }

    const totalPending = pendingAccounts.reduce((sum, item) => sum + item.value, 0);

    const goalsSummary = goals.map((goal) => ({
      ...goal.toObject(),
      percentComplete: goal.targetValue > 0 ? Math.round((goal.currentValue / goal.targetValue) * 100) : 0,
    }));

    return {
      month,
      year,
      totalIncome,
      totalExpense: totalExpenses,
      totalExpenses,
      balance,
      savingsRate,
      expensesByCategory: facet.expensesByCategory,
      monthlyEvolution,
      recentTransactions: facet.recentTransactions,
      pendingAccounts: {
        items: pendingAccounts,
        totalPending,
      },
      goalsSummary,
    };
  }
}
