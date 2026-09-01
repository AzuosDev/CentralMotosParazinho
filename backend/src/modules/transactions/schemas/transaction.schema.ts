import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TransactionDocument = Transaction & Document;

export enum TransactionType {
  EXPENSE = 'EXPENSE',
  INCOME = 'INCOME',
  TRANSFER = 'TRANSFER',
}

export enum TipoTransacao {
  ENTRADA = 'entrada',
  SAIDA = 'saida',
  TRANSFERENCIA = 'transferencia',
}

@Schema({ timestamps: true })
export class Transaction {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, enum: TransactionType })
  type!: TransactionType;

  @Prop({ enum: TipoTransacao })
  tipoTransacao?: TipoTransacao;

  @Prop({ required: true, min: 0.01 })
  value!: number;

  @Prop({ type: Types.ObjectId, ref: 'Category' })
  categoryId?: Types.ObjectId;

  @Prop({ maxlength: 500 })
  description?: string;

  @Prop({ required: true })
  date!: Date;

  @Prop({ type: Types.ObjectId, ref: 'PendingAccount' })
  pendingAccountId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Wallet' })
  carteiraId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Wallet' })
  carteiraDestinoId?: Types.ObjectId;

  @Prop({ default: false })
  agendado?: boolean;

  @Prop({ type: String, maxlength: 255 })
  fitId?: string;

  @Prop({ type: Types.ObjectId, ref: 'ImportBatch' })
  importBatchId?: Types.ObjectId;

  // Presente apenas em transações de cartão de crédito (compra, juros, estorno). É o
  // marcador que faz WalletsService excluir a transação do saldo de qualquer carteira —
  // compra no crédito é dívida sendo criada, não dinheiro saindo de uma conta.
  @Prop({ type: Types.ObjectId, ref: 'Fatura' })
  faturaId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Parcelamento' })
  parcelamentoId?: Types.ObjectId;

  @Prop({ type: Number })
  numeroParcela?: number;

  @Prop({ type: Number })
  totalParcelas?: number;

  // Estorno de compra no cartão: EXPENSE com valor positivo (o schema não aceita valor
  // negativo) que reduz Fatura.valorTotal e é subtraído dos relatórios de categoria em vez
  // de somado.
  @Prop({ default: false })
  isEstorno?: boolean;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);
TransactionSchema.index({ userId: 1, date: -1 });
TransactionSchema.index({ userId: 1, carteiraId: 1, fitId: 1 }, { sparse: true });
TransactionSchema.index({ importBatchId: 1 }, { sparse: true });
TransactionSchema.index({ faturaId: 1 }, { sparse: true });
TransactionSchema.index({ parcelamentoId: 1 }, { sparse: true });
