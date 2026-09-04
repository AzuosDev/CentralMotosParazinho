import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { Transaction, TransactionSchema } from '../transactions/schemas/transaction.schema';
import { Category, CategorySchema } from '../categories/schemas/category.schema';
import { PendingAccount, PendingAccountSchema } from '../pending/schemas/pending-account.schema';
import { Goal, GoalSchema } from '../goals/schemas/goal.schema';
import { WalletsModule } from '../wallets/wallets.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Transaction.name, schema: TransactionSchema },
      { name: Category.name, schema: CategorySchema },
      { name: PendingAccount.name, schema: PendingAccountSchema },
      { name: Goal.name, schema: GoalSchema },
    ]),
    WalletsModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
