import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MotoDocument = Moto & Document;

export type MotoStatus = 'em_estoque' | 'vendida';

export const MOTO_STATUS: MotoStatus[] = ['em_estoque', 'vendida'];

@Schema({ timestamps: true })
export class Moto {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, maxlength: 120 })
  modelo!: string;

  @Prop({ required: true, min: 1900, max: 2200 })
  ano!: number;

  // Placa e chassi são identificadores públicos da moto: guardados em maiúsculas e sem
  // separadores (ver MotosService#normalizarPlaca/#normalizarChassi) para que a busca por
  // duplicata não dependa de como o usuário digitou.
  @Prop({ required: true, maxlength: 10 })
  placa!: string;

  @Prop({ required: true, maxlength: 30 })
  chassi!: string;

  @Prop({ required: true, maxlength: 40 })
  cor!: string;

  @Prop({ required: true, min: 0 })
  km!: number;

  @Prop({ required: true, min: 0 })
  valorCompra!: number;

  @Prop({ type: Date, required: true })
  dataCompra!: Date;

  // Percentual sobre valorCompra que o usuário quer ganhar na revenda. É a base do
  // precoSugerido devolvido na leitura — não é preço, é margem.
  @Prop({ required: true, min: 0 })
  margemDesejada!: number;

  // O preço que de fato foi para o anúncio. Opcional porque a moto pode entrar no estoque
  // antes de ser anunciada; quando ausente, a leitura cai no precoSugerido.
  @Prop({ type: Number, min: 0 })
  precoAnunciado?: number;

  @Prop({ type: String, enum: MOTO_STATUS, default: 'em_estoque' })
  status!: MotoStatus;

  // Preenchidos juntos e só quando status === 'vendida' (ver MotosService#vender).
  @Prop({ type: Number, min: 0 })
  valorVenda?: number;

  @Prop({ type: Date })
  dataVenda?: Date;
}

export const MotoSchema = SchemaFactory.createForClass(Moto);
MotoSchema.index({ userId: 1 });
MotoSchema.index({ userId: 1, status: 1 });
// Placa é única por usuário, não globalmente: duas lojas podem ter cadastrado a mesma moto.
MotoSchema.index({ userId: 1, placa: 1 }, { unique: true });
