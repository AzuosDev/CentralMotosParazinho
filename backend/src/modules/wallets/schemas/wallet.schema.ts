import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WalletDocument = Wallet & Document;

@Schema({ timestamps: true })
export class Wallet {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, maxlength: 100 })
  nome!: string;

  @Prop({ default: 0 })
  saldo!: number;

  // Saldo que o usuário declara ter antes do primeiro lançamento.
  // Imutável pelo $inc — apenas alterado explicitamente via update().
  @Prop({ default: 0 })
  saldoInicial!: number;

  @Prop()
  icone?: string;
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);
WalletSchema.index({ userId: 1 });
