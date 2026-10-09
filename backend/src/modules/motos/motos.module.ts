import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Moto, MotoSchema } from './schemas/moto.schema';
import { Transaction, TransactionSchema } from '../transactions/schemas/transaction.schema';
import { Category, CategorySchema } from '../categories/schemas/category.schema';
import { Wallet, WalletSchema } from '../wallets/schemas/wallet.schema';
import { TransactionsModule } from '../transactions/transactions.module';
import { MotosService } from './motos.service';
import { MotosController } from './motos.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Moto.name, schema: MotoSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: Category.name, schema: CategorySchema },
      { name: Wallet.name, schema: WalletSchema },
    ]),
    // A venda e a compra da moto viram Transaction por TransactionsService — é ele que
    // mexe em Wallet.saldo e nas metas. Dependência de mão única: TransactionsModule
    // registra o model de Moto direto e nunca importa MotosModule de volta.
    TransactionsModule,
  ],
  providers: [MotosService],
  controllers: [MotosController],
  exports: [MotosService],
})
export class MotosModule {}
