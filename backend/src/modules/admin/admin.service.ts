import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../users/schemas/user.schema';
import { ADMIN_EMAIL, isAdminUser } from '../../common/guards/admin.guard';
import { CreateUserDto } from './dto/create-user.dto';

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
  'email name createdAt emailVerified isLegacyFree subscriptionStatus plan billingCycle trialEndsAt subscriptionExpiresAt isAdmin bloqueado';

type AdminUserDoc = Pick<User, 'email' | 'isLegacyFree' | 'subscriptionStatus' | 'trialEndsAt' | 'subscriptionExpiresAt' | 'isAdmin' | 'bloqueado'>;

function toAdminView<T extends AdminUserDoc>(u: T) {
  const { status, hasAccess } = resolveStatus(u);
  return {
    ...u,
    isAdmin: isAdminUser(u),
    isRootAdmin: u.email === ADMIN_EMAIL,
    bloqueado: u.bloqueado ?? false,
    status,
    hasAccess: hasAccess && !u.bloqueado,
  };
}

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
        isAdmin: isAdminUser(u),
        isRootAdmin: u.email === ADMIN_EMAIL,
        bloqueado: u.bloqueado ?? false,
        status,
        hasAccess: hasAccess && !u.bloqueado,
      };
    });
  }

  // Única porta de entrada de contas novas (o cadastro público foi desativado): o admin
  // define a senha inicial e repassa ao usuário. Email já nasce verificado — quem criou
  // a conta é o admin, não existe "confirme seu email" para alguém que não se cadastrou.
  async createUser(dto: CreateUserDto) {
    const email = dto.email.toLowerCase().trim();
    if (await this.userModel.exists({ email })) {
      throw new ConflictException('Já existe uma conta com este email');
    }

    const diasTeste = dto.diasTeste ?? 15;
    const created = await this.userModel.create({
      email,
      name: dto.name?.trim() || undefined,
      password: await bcrypt.hash(dto.password, 12),
      emailVerified: true,
      isAdmin: dto.isAdmin ?? false,
      isLegacyFree: dto.acesso === 'gratis',
      subscriptionStatus: dto.acesso === 'teste' ? 'trial' : null,
      trialEndsAt: dto.acesso === 'teste' ? new Date(Date.now() + diasTeste * 24 * 60 * 60 * 1000) : null,
    });

    const doc = await this.userModel.findById(created._id).select(ADMIN_USER_FIELDS).lean().exec();
    return toAdminView(doc!);
  }

  async setBloqueio(userId: string, bloqueado: boolean, requesterId: string) {
    const alvo = await this.findAlvo(userId);
    if (bloqueado && (alvo.email === ADMIN_EMAIL || alvo._id.toString() === requesterId)) {
      throw new BadRequestException('Não é possível bloquear esta conta');
    }
    return this.update(userId, { bloqueado });
  }

  async setAdmin(userId: string, isAdmin: boolean) {
    const alvo = await this.findAlvo(userId);
    if (!isAdmin && alvo.email === ADMIN_EMAIL) {
      throw new BadRequestException('O administrador principal não pode ser rebaixado');
    }
    return this.update(userId, { isAdmin });
  }

  async resetSenha(userId: string, password: string) {
    await this.findAlvo(userId);
    await this.userModel.updateOne(
      { _id: userId },
      { $set: { password: await bcrypt.hash(password, 12) }, $unset: { passwordResetToken: 1, passwordResetExpires: 1 } },
    ).exec();
    return { ok: true };
  }

  private async findAlvo(userId: string) {
    const alvo = await this.userModel.findById(userId).select('email').lean().exec();
    if (!alvo) throw new NotFoundException('Usuário não encontrado');
    return alvo;
  }

  private async update(userId: string, set: Partial<User>) {
    const updated = await this.userModel
      .findByIdAndUpdate(userId, { $set: set }, { new: true })
      .select(ADMIN_USER_FIELDS)
      .lean()
      .exec();
    if (!updated) throw new NotFoundException('Usuário não encontrado');
    return toAdminView(updated);
  }

  async setFreeAccess(userId: string, isLegacyFree: boolean) {
    const updated = await this.userModel
      .findByIdAndUpdate(userId, { $set: { isLegacyFree } }, { new: true })
      .select(ADMIN_USER_FIELDS)
      .lean()
      .exec();
    if (!updated) throw new NotFoundException('Usuário não encontrado');

    return toAdminView(updated);
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

    return toAdminView(updated);
  }
}
