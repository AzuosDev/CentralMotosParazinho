import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Transaction, TransactionDocument, TransactionType } from '../transactions/schemas/transaction.schema';
import { Category, CategoryDocument } from '../categories/schemas/category.schema';
import { SIGNED_VALUE_EXPR } from '../transactions/transaction-aggregation.util';
import { ExpensePeriod } from './dto/get-expenses.dto';

type ExpenseRow = {
  categoryId: string;
  name: string;
  color: string;
  icon?: string;
  amount: number;
  previousAmount: number;
  variation: number;
};

@Injectable()
export class ExpensesService {
  constructor(
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
  ) {}

  private getRanges(period: ExpensePeriod, now = new Date()) {
    if (period === ExpensePeriod.WEEKLY) {
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
      const start = new Date(end);
      start.setUTCDate(start.getUTCDate() - 6);
      const previousEnd = new Date(start);
      previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
      const previousStart = new Date(previousEnd);
      previousStart.setUTCDate(previousStart.getUTCDate() - 6);
      return { currentStart: start, currentEnd: end, previousStart, previousEnd };
    }

    if (period === ExpensePeriod.YEARLY) {
      const year = now.getUTCFullYear();
      const currentStart = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
      const currentEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
      const previousStart = new Date(Date.UTC(year - 1, 0, 1, 0, 0, 0));
      const previousEnd = new Date(Date.UTC(year - 1, 11, 31, 23, 59, 59, 999));
      return { currentStart, currentEnd, previousStart, previousEnd };
    }

    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const currentStart = new Date(Date.UTC(year, month, 1, 0, 0, 0));
    const currentEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
    const previousStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const previousEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    return { currentStart, currentEnd, previousStart, previousEnd };
  }

  async getExpenses(userId: string, period: ExpensePeriod = ExpensePeriod.MONTHLY) {
    const userObjectId = new Types.ObjectId(userId);
    const { currentStart, currentEnd, previousStart, previousEnd } = this.getRanges(period);

    const [current, previous] = await Promise.all([
      this.transactionModel
        .aggregate([
          {
            $match: {
              userId: userObjectId,
              type: TransactionType.EXPENSE,
              date: { $gte: currentStart, $lte: currentEnd },
            },
          },
          { $group: { _id: '$categoryId', amount: { $sum: SIGNED_VALUE_EXPR } } },
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
              name: { $ifNull: ['$category.name', 'Categoria'] },
              color: { $ifNull: ['$category.color', '#6B7280'] },
              icon: { $ifNull: ['$category.icon', 'Receipt'] },
              amount: 1,
            },
          },
          { $sort: { amount: -1 } },
        ])
        .exec(),
      this.transactionModel
        .aggregate([
          {
            $match: {
              userId: userObjectId,
              type: TransactionType.EXPENSE,
              date: { $gte: previousStart, $lte: previousEnd },
            },
          },
          { $group: { _id: '$categoryId', amount: { $sum: SIGNED_VALUE_EXPR } } },
          {
            $project: {
              categoryId: '$_id',
              amount: 1,
            },
          },
        ])
        .exec(),
    ]);

    const previousMap = new Map(previous.map((item) => [String(item.categoryId), item.amount]));

    const categories: ExpenseRow[] = current.map((item) => {
      const previousAmount = previousMap.get(String(item.categoryId)) ?? 0;
      const amount = item.amount ?? 0;
      return {
        categoryId: String(item.categoryId ?? ''),
        name: item.name,
        color: item.color,
        icon: item.icon,
        amount,
        previousAmount,
        variation: previousAmount > 0 ? ((amount - previousAmount) / previousAmount) * 100 : 0,
      };
    });

    return {
      period,
      categories,
    };
  }
}
