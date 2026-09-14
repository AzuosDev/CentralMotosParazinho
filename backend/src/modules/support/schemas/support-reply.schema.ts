import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SupportReplyDocument = SupportReply & Document;

export type SupportReplyAuthorRole = 'user' | 'admin';

@Schema({ timestamps: true })
export class SupportReply {
  @Prop({ type: Types.ObjectId, ref: 'SupportMessage', required: true, index: true })
  supportMessageId!: Types.ObjectId;

  @Prop({ type: String, enum: ['user', 'admin'], required: true })
  authorRole!: SupportReplyAuthorRole;

  @Prop({ required: true, trim: true, maxlength: 2000 })
  mensagem!: string;

  createdAt?: Date;
}

export const SupportReplySchema = SchemaFactory.createForClass(SupportReply);

SupportReplySchema.index({ supportMessageId: 1, createdAt: 1 });
