import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ParcelamentoDocument = Parcelamento & Document;

@Schema({ timestamps: true })
export class Parcelamento {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Wallet', required: true })
  carteiraId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Category' })
  categoryId?: Types.ObjectId;

  @Prop({ required: true, maxlength: 200 })
  descricao!: string;

  @Prop({ required: true, min: 0.01 })
  valorTotal!: number;

  @Prop({ required: true, min: 2 })
  totalParcelas!: number;

  @Prop({ required: true })
  dataCompra!: Date;
}

export const ParcelamentoSchema = SchemaFactory.createForClass(Parcelamento);
ParcelamentoSchema.index({ userId: 1, carteiraId: 1 });
