import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';

export type AdminUserStatus =
  | 'gratis_liberado'
  | 'ativo'
  | 'assinatura_expirada'
  | 'em_teste'
  | 'teste_expirado'
  | 'cancelado'
  | 'sem_assinatura';

// Espelha computeHasAccess em frontend/src/contexts/AuthContext.tsx — é a mesma regra
// que decide se o usuário passa pelo SubscriptionGate, só que calculada aqui pra render
// o status de cada usuário na tela de admin sem duplicar a lógica no frontend.
function resolveStatus(user: {
  isLegacyFree?: boolean;
  subscriptionStatus?: string | null;
  trialEndsAt?: Date | null;
  subscriptionExpiresAt?: Date | null;
}): { status: AdminUserStatus; hasAccess: boolean } {
  if (user.isLegacyFree) return { status: 'gratis_liberado', hasAccess: true };

  if (user.subscriptionStatus === 'active') {
    const expired = !!user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) <= new Date();
    return expired ? { status: 'assinatura_expirada', hasAccess: false } : { status: 'ativo', hasAccess: true };
  }

  if (user.subscriptionStatus === 'trial') {
    const valid = !!user.trialEndsAt && new Date(user.trialEndsAt) > new Date();
    return valid ? { status: 'em_teste', hasAccess: true } : { status: 'teste_expirado', hasAccess: false };
  }

  if (user.subscriptionStatus === 'cancelled') return { status: 'cancelado', hasAccess: false };

  return { status: 'sem_assinatura', hasAccess: false };
}

const ADMIN_USER_FIELDS =
  'email name createdAt emailVerified isLegacyFree subscriptionStatus plan billingCycle trialEndsAt subscriptionExpiresAt';

@Injectable()
export class AdminService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async listUsers() {
    const users = await this.userModel
      .find()
      .select(ADMIN_USER_FIELDS)
      .sort({ createdAt: -1 })
      .limit(500)
      .lean()
      .exec();

    return users.map((u) => {
      const { status, hasAccess } = resolveStatus(u);
      return {
        _id: u._id,
        email: u.email,
        name: u.name ?? null,
        createdAt: u.createdAt,
        emailVerified: u.emailVerified,
        isLegacyFree: u.isLegacyFree ?? false,
        subscriptionStatus: u.subscriptionStatus ?? null,
        plan: u.plan ?? null,
        billingCycle: u.billingCycle ?? null,
        trialEndsAt: u.trialEndsAt ?? null,
        subscriptionExpiresAt: u.subscriptionExpiresAt ?? null,
        status,
        hasAccess,
      };
    });
  }

  async setFreeAccess(userId: string, isLegacyFree: boolean) {
    const updated = await this.userModel
      .findByIdAndUpdate(userId, { $set: { isLegacyFree } }, { new: true })
      .select(ADMIN_USER_FIELDS)
      .lean()
      .exec();
    if (!updated) throw new NotFoundException('Usuário não encontrado');

    const { status, hasAccess } = resolveStatus(updated);
    return { ...updated, status, hasAccess };
  }

  // Concede um período de teste manual (independente do trial de 15 dias do cadastro) —
  // útil pra dar acesso temporário sem marcar o usuário como grátis pra sempre.
  async setTrial(userId: string, days: number) {
    const trialEndsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const updated = await this.userModel
      .findByIdAndUpdate(userId, { $set: { subscriptionStatus: 'trial', trialEndsAt } }, { new: true })
      .select(ADMIN_USER_FIELDS)
      .lean()
      .exec();
    if (!updated) throw new NotFoundException('Usuário não encontrado');

    const { status, hasAccess } = resolveStatus(updated);
    return { ...updated, status, hasAccess };
  }
}
