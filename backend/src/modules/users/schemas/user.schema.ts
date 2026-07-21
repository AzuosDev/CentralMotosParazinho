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
}

export const UserSchema = SchemaFactory.createForClass(User);
