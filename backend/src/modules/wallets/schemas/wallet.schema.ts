import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WalletDocument = Wallet & Document;

export type WalletTipo = 'conta' | 'dinheiro' | 'credito';

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

  @Prop({ type: String, enum: ['conta', 'dinheiro', 'credito'], default: 'conta' })
  tipo!: WalletTipo;

  // Campos abaixo só têm sentido quando tipo === 'credito'.
  @Prop({ type: Number })
  limite?: number;

  @Prop({ type: Number, min: 1, max: 31 })
  diaFechamento?: number;

  @Prop({ type: Number, min: 1, max: 31 })
  diaVencimento?: number;

  @Prop({ type: Types.ObjectId, ref: 'Wallet' })
  carteiraPagamentoId?: Types.ObjectId;

  // Percentual ao mês aplicado sobre o saldo rotativo não pago.
  @Prop({ type: Number, min: 0 })
  taxaJurosRotativo?: number;

  @Prop({ type: String, maxlength: 50 })
  bandeira?: string;

  @Prop({ type: String, maxlength: 4 })
  ultimosDigitos?: string;
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);
WalletSchema.index({ userId: 1 });
WalletSchema.index({ userId: 1, tipo: 1 });
