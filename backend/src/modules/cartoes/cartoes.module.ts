import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Wallet, WalletSchema } from '../wallets/schemas/wallet.schema';
import { Fatura, FaturaSchema } from './schemas/fatura.schema';
import { Parcelamento, ParcelamentoSchema } from './schemas/parcelamento.schema';
import { Transaction, TransactionSchema } from '../transactions/schemas/transaction.schema';
import { PendingAccount, PendingAccountSchema } from '../pending/schemas/pending-account.schema';
import { Category, CategorySchema } from '../categories/schemas/category.schema';
import { Goal, GoalSchema } from '../goals/schemas/goal.schema';
import { CartoesService } from './cartoes.service';
import { CartoesController } from './cartoes.controller';
import { FaturasCronService } from './faturas-cron.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Wallet.name, schema: WalletSchema },
      { name: Fatura.name, schema: FaturaSchema },
      { name: Parcelamento.name, schema: ParcelamentoSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: PendingAccount.name, schema: PendingAccountSchema },
      { name: Category.name, schema: CategorySchema },
      { name: Goal.name, schema: GoalSchema },
    ]),
  ],
  providers: [CartoesService, FaturasCronService],
  controllers: [CartoesController],
  exports: [CartoesService],
})
export class CartoesModule {}
