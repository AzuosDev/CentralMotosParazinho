import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';
import { Transaction, TransactionSchema } from '../transactions/schemas/transaction.schema';
import { Category, CategorySchema } from '../categories/schemas/category.schema';
import { PendingAccount, PendingAccountSchema } from '../pending/schemas/pending-account.schema';
import { Goal, GoalSchema } from '../goals/schemas/goal.schema';
import { Wallet, WalletSchema } from '../wallets/schemas/wallet.schema';
import { Fatura, FaturaSchema } from '../cartoes/schemas/fatura.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Transaction.name, schema: TransactionSchema },
      { name: Category.name, schema: CategorySchema },
      { name: PendingAccount.name, schema: PendingAccountSchema },
      { name: Goal.name, schema: GoalSchema },
      { name: Wallet.name, schema: WalletSchema },
      { name: Fatura.name, schema: FaturaSchema },
    ]),
  ],
  controllers: [InsightsController],
  providers: [InsightsService],
})
export class InsightsModule {}
