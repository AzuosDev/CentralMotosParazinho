import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PendingAccountDocument = PendingAccount & Document;

@Schema({ timestamps: true })
export class PendingAccount {
  /**
   * Indica se a conta é parcelada.
   * @default false
   */
  @Prop({ type: Boolean, default: false })
  isParcelada!: boolean;

  /**
   * Indica se a conta é recorrente.
   * @default false
   */
  @Prop({ type: Boolean, default: false })
  isRecorrente!: boolean;

  /**
   * Categoria da conta.
   * @default 'Outro'
   */
  @Prop({ type: String, default: 'Outro' })
  categoria!: string;

  /**
   * Forma de pagamento.
   * @default 'Outro'
   */
  @Prop({
    type: String,
    enum: ['Cartão de Crédito', 'Pix', 'Dinheiro', 'Outro'],
    default: 'Outro',
  })
  formatoPagamento!: string;

  /**
   * Indica se a conta é a pagar (despesa) ou a receber (receita).
   * @default 'PAGAR'
   */
  @Prop({ type: String, enum: ['PAGAR', 'RECEBER'], default: 'PAGAR' })
  tipo!: string;

  /**
   * Quando false, quitar a conta não gera transação financeira nem afeta saldos.
   * Útil para registrar despesas/receitas retroativas que já foram contabilizadas externamente.
   * @default true
   */
  @Prop({ type: Boolean, default: true })
  affectsBalance!: boolean;

  @Prop({ type: Number })
  numeroParcela?: number;

  @Prop({ type: String })
  grupoParceladoId?: string;

  // Subdocumento de parcelas (presente apenas se isParcelada = true)
  @Prop({
    type: {
      totalParcelas: { type: Number, required: true },
      valorParcela: { type: Number, required: true },
      qtdParcelasPagas: { type: Number, default: 0 },
      parcelasPagas: { type: [Number], default: [] },
      dataInicio: { type: Date, required: true },
      dataFim: { type: Date, required: true },
    },
    required: false,
  })
  parcelas?: {
    totalParcelas: number;
    valorParcela: number;
    qtdParcelasPagas: number;
    parcelasPagas: number[];
    dataInicio: Date;
    dataFim: Date;
  };

  // Subdocumento de recorrência (presente apenas se isRecorrente = true)
  @Prop({
    type: {
      periodoRecorrencia: {
        type: String,
        enum: ['Diário', 'Semanal', 'Mensal', 'Anual'],
        default: 'Mensal',
      },
      dataProxima: { type: Date, required: false },
      dataTermino: { type: Date, required: false },
    },
    required: false,
  })
  recorrencia?: {
    periodoRecorrencia: string;
    dataProxima?: Date;
    dataTermino?: Date;
  };

  // ID do molde recorrente — presente apenas em instâncias geradas ao pagar
  @Prop({ type: String })
  recorrenciaTemplateId?: string;

  // Marca o mês como pulado sem alterar o molde
  @Prop({ type: Boolean, default: false })
  skipped?: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Wallet' })
  carteiraId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Category' })
  categoryId?: Types.ObjectId;

  @Prop({ required: true, maxlength: 200 })
  title!: string;

  @Prop({ required: true, min: 0.01 })
  value!: number;

  @Prop({ required: true })
  dueDate!: Date;

  @Prop({ default: false })
  paid!: boolean;

  @Prop()
  paidAt?: Date;

  @Prop({ maxlength: 500 })
  description?: string;

  // Presente quando esta conta pendente É a fatura de um cartão (uma por ciclo, criada
  // lazily por CartoesService). Bloqueia o fluxo genérico de liquidação/remoção desta
  // classe — pagamento de fatura tem regras próprias (carteira pagadora, parcial, rotativo)
  // que não cabem no PATCH genérico de contas pendentes.
  @Prop({ type: Types.ObjectId, ref: 'Fatura' })
  faturaId?: Types.ObjectId;
}

export const PendingAccountSchema = SchemaFactory.createForClass(PendingAccount);
PendingAccountSchema.index({ userId: 1, dueDate: 1 });
PendingAccountSchema.index({ userId: 1, paid: 1, dueDate: 1 });
PendingAccountSchema.index({ userId: 1, recorrenciaTemplateId: 1, dueDate: 1 });
PendingAccountSchema.index({ userId: 1, tipo: 1, dueDate: 1 });



