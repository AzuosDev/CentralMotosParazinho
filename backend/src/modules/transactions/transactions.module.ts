import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Transaction, TransactionSchema } from './schemas/transaction.schema';
import { Category, CategorySchema } from '../categories/schemas/category.schema';
import { Goal, GoalSchema } from '../goals/schemas/goal.schema';
import { Wallet, WalletSchema } from '../wallets/schemas/wallet.schema';
import { CartoesModule } from '../cartoes/cartoes.module';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Transaction.name, schema: TransactionSchema },
      { name: Category.name, schema: CategorySchema },
      { name: Goal.name, schema: GoalSchema },
      { name: Wallet.name, schema: WalletSchema },
    ]),
    CartoesModule,
  ],
  providers: [TransactionsService],
  controllers: [TransactionsController],
  exports: [TransactionsService],
})
export class TransactionsModule {}
