import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ trim: true })
  name?: string;

  @Prop()
  avatarUrl?: string;

  @Prop({ required: true })
  password!: string;

  @Prop({ default: false })
  emailVerified!: boolean;

  // Contas são criadas pelos admins (não há cadastro público). isAdmin dá acesso ao
  // Painel Admin; ADMIN_EMAIL é sempre admin, independente deste campo (admin.guard.ts).
  @Prop({ default: false })
  isAdmin?: boolean;

  // Conta bloqueada por um admin: não loga, não renova token e o JwtAuthGuard recusa
  // qualquer request — os dados ficam intactos para um eventual desbloqueio.
  @Prop({ default: false })
  bloqueado?: boolean;

  @Prop()
  emailVerificationToken?: string;

  @Prop()
  passwordResetToken?: string;

  @Prop()
  passwordResetExpires?: Date;

  // Subscription fields
  @Prop({ type: String, default: null })
  subscriptionStatus?: string | null;

  @Prop({ type: String, default: null })
  plan?: string | null;

  @Prop({ type: Date, default: null })
  trialEndsAt?: Date | null;

  @Prop({ default: false })
  isLegacyFree?: boolean;

  @Prop({ type: String, default: null })
  cpfCnpj?: string | null;

  @Prop({ type: String, default: null })
  stripeCustomerId?: string | null;

  @Prop({ type: String, default: null })
  stripeSubscriptionId?: string | null;

  @Prop({ type: String, default: null })
  asaasCustomerId?: string | null;

  @Prop({ type: Date, default: null })
  subscriptionExpiresAt?: Date | null;

  @Prop({ type: String, default: null })
  billingCycle?: string | null;

  // Ids de cobranças do Asaas que já estenderam a assinatura — garante que webhook e
  // polling aplicando o mesmo pagamento só renovem o prazo uma vez (billing.service.ts).
  @Prop({ type: [String], default: [] })
  asaasPagamentosAplicados?: string[];

  // Preço próprio deste cliente no Plano Empresarial, definido pelo admin. null = usa o
  // preço padrão (BillingConfig). Ver BillingService#precosDoUsuario.
  @Prop({ type: Number, default: null })
  valorMensalPersonalizado?: number | null;

  @Prop({ type: Number, default: null })
  valorAnualPersonalizado?: number | null;

  // Populados pelo Mongoose via @Schema({ timestamps: true }) — declarados aqui só para
  // o TypeScript reconhecer os campos (não geram Prop/coluna extra no schema).
  createdAt?: Date;
  updatedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
