import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Moto, MotoSchema } from './schemas/moto.schema';
import { Transaction, TransactionSchema } from '../transactions/schemas/transaction.schema';
import { MotosService } from './motos.service';
import { MotosController } from './motos.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Moto.name, schema: MotoSchema },
      { name: Transaction.name, schema: TransactionSchema },
    ]),
  ],
  providers: [MotosService],
  controllers: [MotosController],
  exports: [MotosService],
})
export class MotosModule {}
