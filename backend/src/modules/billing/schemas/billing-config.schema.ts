import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BillingConfigDocument = BillingConfig & Document;

// Documento único (chave 'plano') com o preço padrão do Plano Empresarial, definido pelo
// admin no Painel Admin → Pagamentos. Um cliente pode ter preço próprio
// (User.valorMensalPersonalizado/valorAnualPersonalizado), que tem prioridade sobre este.
@Schema({ timestamps: true, collection: 'billingconfigs' })
export class BillingConfig {
  @Prop({ required: true, unique: true })
  chave!: string;

  @Prop({ required: true, min: 0.01 })
  valorMensal!: number;

  @Prop({ required: true, min: 0.01 })
  valorAnual!: number;
}

export const BillingConfigSchema = SchemaFactory.createForClass(BillingConfig);
