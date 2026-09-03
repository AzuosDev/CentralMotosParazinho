import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PendingAccount, PendingAccountSchema } from './schemas/pending-account.schema';
import { Transaction, TransactionSchema } from '../transactions/schemas/transaction.schema';
import { Category, CategorySchema } from '../categories/schemas/category.schema';
import { Wallet, WalletSchema } from '../wallets/schemas/wallet.schema';
import { CartoesModule } from '../cartoes/cartoes.module';
import { PendingService } from './pending.service';
import { PendingController } from './pending.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PendingAccount.name, schema: PendingAccountSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: Category.name, schema: CategorySchema },
      { name: Wallet.name, schema: WalletSchema },
    ]),
    CartoesModule,
  ],
  providers: [PendingService],
  controllers: [PendingController],
})
export class PendingModule {}
