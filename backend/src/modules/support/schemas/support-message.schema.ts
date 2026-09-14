import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SupportMessageDocument = SupportMessage & Document;

export type SupportMessageTipo = 'bug' | 'sugestao';
export type SupportMessageStatus = 'aberto' | 'lido';

@Schema({ timestamps: true })
export class SupportMessage {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, enum: ['bug', 'sugestao'], required: true })
  tipo!: SupportMessageTipo;

  @Prop({ required: true, maxlength: 2000 })
  mensagem!: string;

  @Prop({ type: String, enum: ['aberto', 'lido'], default: 'aberto' })
  status!: SupportMessageStatus;
}

export const SupportMessageSchema = SchemaFactory.createForClass(SupportMessage);

SupportMessageSchema.index({ userId: 1, createdAt: -1 });
