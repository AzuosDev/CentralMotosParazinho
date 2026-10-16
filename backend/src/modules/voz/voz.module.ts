import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Category, CategorySchema } from '../categories/schemas/category.schema';
import { Wallet, WalletSchema } from '../wallets/schemas/wallet.schema';
import { Moto, MotoSchema } from '../motos/schemas/moto.schema';
import { TransactionsModule } from '../transactions/transactions.module';
import { CartoesModule } from '../cartoes/cartoes.module';
import { WalletsModule } from '../wallets/wallets.module';
import { VozController } from './voz.controller';
import { VozService } from './voz.service';
import { GroqClient } from './groq.client';

// Lançamento por voz: Groq (Whisper + LLM) transforma a fala em rascunhos; a gravação de
// fato reaproveita TransactionsService/CartoesService/WalletsService, sem regra própria.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Category.name, schema: CategorySchema },
      { name: Wallet.name, schema: WalletSchema },
      { name: Moto.name, schema: MotoSchema },
    ]),
    TransactionsModule,
    CartoesModule,
    WalletsModule,
  ],
  providers: [VozService, GroqClient],
  controllers: [VozController],
})
export class VozModule {}
