import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SupportMessageDocument = SupportMessage & Document;

export type SupportMessageTipo = 'bug' | 'sugestao';
export type SupportMessageStatus = 'aberto' | 'lido';

@Schema({ timestamps: true })
export class SupportMessage {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 150 })
  titulo!: string;

  @Prop({ type: String, enum: ['bug', 'sugestao'], required: true })
  tipo!: SupportMessageTipo;

  @Prop({ required: true, maxlength: 2000 })
  mensagem!: string;

  @Prop({ type: String, enum: ['aberto', 'lido'], default: 'aberto' })
  status!: SupportMessageStatus;

  // Marcado sempre que o dono da conversa (não o admin) abre a thread — usado só pra
  // saber se há resposta do suporte ainda não vista, pro sininho/contador do usuário.
  @Prop({ type: Date, default: null })
  lastViewedByUserAt?: Date | null;

  createdAt?: Date;
}

export const SupportMessageSchema = SchemaFactory.createForClass(SupportMessage);

SupportMessageSchema.index({ userId: 1, createdAt: -1 });
