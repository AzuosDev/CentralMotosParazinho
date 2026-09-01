import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FaturaDocument = Fatura & Document;

export type FaturaStatus = 'aberta' | 'fechada' | 'parcial' | 'paga';

@Schema({ timestamps: true })
export class Fatura {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Wallet', required: true })
  carteiraId!: Types.ObjectId;

  // Chave do ciclo, ex "2026-09" — ano/mês em que a fatura fecha.
  @Prop({ required: true, maxlength: 7 })
  mesReferencia!: string;

  @Prop({ required: true })
  dataInicio!: Date;

  @Prop({ required: true })
  dataFechamento!: Date;

  @Prop({ required: true })
  dataVencimento!: Date;

  // Recalculado por agregação sobre Transaction (faturaId=esta), nunca via $inc — evita
  // drift entre o valor exibido e as transações reais, mesma filosofia de WalletsService.
  @Prop({ default: 0 })
  valorTotal!: number;

  @Prop({ default: 0 })
  valorPago!: number;

  @Prop({ type: String, enum: ['aberta', 'fechada', 'parcial', 'paga'], default: 'aberta' })
  status!: FaturaStatus;

  // Débito principal não pago do ciclo anterior — não é uma Transaction, só um saldo
  // carregado. Os juros sobre esse saldo, quando aplicados, viram uma Transaction própria
  // (visível na listagem) e entram em valorTotal deste ciclo.
  @Prop({ default: 0 })
  saldoRotativoAnterior!: number;

  @Prop({ default: 0 })
  jurosAplicados!: number;

  @Prop({ type: Types.ObjectId, ref: 'PendingAccount' })
  pendingAccountId?: Types.ObjectId;
}

export const FaturaSchema = SchemaFactory.createForClass(Fatura);
FaturaSchema.index({ userId: 1, carteiraId: 1, mesReferencia: 1 }, { unique: true });
FaturaSchema.index({ userId: 1, carteiraId: 1, dataFechamento: 1 });
