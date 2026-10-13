import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TransactionDocument = Transaction & Document;

export enum TransactionType {
  EXPENSE = 'EXPENSE',
  INCOME = 'INCOME',
  TRANSFER = 'TRANSFER',
}

/**
 * Transação criada pelo fluxo de uma moto, não lançada à mão: a receita da venda e a
 * despesa opcional da compra (módulo motos). O marcador existe por três regras:
 *
 * 1. não entra no custoGastos da moto — a compra já é contada como valorCompra e a venda
 *    como valorVenda, somá-las de novo contaria o mesmo dinheiro duas vezes;
 * 2. não é editável nem excluível pela tela de transações — quem manda nesses números é a
 *    ficha da moto, que mantém moto e lançamento em sincronia;
 * 3. é como MotosService acha o lançamento para sincronizar, desfazer ou excluir junto
 *    com a moto.
 */
export const TRANSACTION_ORIGEM = ['compra_moto', 'venda_moto'] as const;
export type TransactionOrigem = (typeof TRANSACTION_ORIGEM)[number];

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

  // Presente só na Transaction de estorno, aponta pra compra original que ela reverte —
  // é o que permite CartoesService#estornar recusar um segundo estorno da mesma compra
  // (sem isso não havia como saber se uma compra já tinha sido estornada).
  @Prop({ type: Types.ObjectId, ref: 'Transaction' })
  estornoDeTransacaoId?: Types.ObjectId;

  // Vincula a transação a uma moto do estoque (módulo motos): é o que permite somar os
  // gastos de uma moto em MotosService#resumo/#relatorio e o que faz MotosService#remove
  // recusar a exclusão de uma moto que já tem histórico financeiro.
  @Prop({ type: Types.ObjectId, ref: 'Moto' })
  motoId?: Types.ObjectId;

  // Ver TRANSACTION_ORIGEM acima. Ausente em tudo que o usuário lança pela tela de
  // transações — só o módulo motos grava este campo, nunca um DTO de entrada.
  @Prop({ type: String, enum: TRANSACTION_ORIGEM })
  origem?: TransactionOrigem;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);
TransactionSchema.index({ userId: 1, date: -1 });
TransactionSchema.index({ userId: 1, carteiraId: 1, fitId: 1 }, { sparse: true });
TransactionSchema.index({ importBatchId: 1 }, { sparse: true });
TransactionSchema.index({ faturaId: 1 }, { sparse: true });
TransactionSchema.index({ parcelamentoId: 1 }, { sparse: true });
TransactionSchema.index({ estornoDeTransacaoId: 1 }, { sparse: true });
TransactionSchema.index({ userId: 1, motoId: 1 }, { sparse: true });
