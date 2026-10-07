import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UserDocument, User } from './schemas/user.schema';
import { Transaction, TransactionDocument } from '../transactions/schemas/transaction.schema';
import { Wallet, WalletDocument } from '../wallets/schemas/wallet.schema';
import { Goal, GoalDocument } from '../goals/schemas/goal.schema';
import { PendingAccount, PendingAccountDocument } from '../pending/schemas/pending-account.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
    @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
    @InjectModel(Goal.name) private goalModel: Model<GoalDocument>,
    @InjectModel(PendingAccount.name) private pendingAccountModel: Model<PendingAccountDocument>,
  ) {}

  async create(dto: { email: string; password: string }) {
    const hashed = await bcrypt.hash(dto.password, 12);
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    const trialEndsAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    const created = await this.userModel.create({
      email: dto.email,
      password: hashed,
      emailVerified: false,
      emailVerificationToken,
      subscriptionStatus: 'trial',
      trialEndsAt,
      // Enquanto não houver preço definido para a Central Motos, o trial de 15 dias
      // trancaria todo mundo fora ao vencer: computeHasAccess passa a retornar false
      // e o SubscriptionGate redireciona para /checkout, uma tela que não tem como
      // concluir sem price id no Stripe. isLegacyFree curto-circuita essa checagem.
      // Quando o preço existir, remova esta linha — quem já se cadastrou mantém a
      // flag e fica grandfathered, que é exatamente o que 'legacy free' significa.
      isLegacyFree: true,
    });
    const obj = created.toObject() as Record<string, unknown>;
    delete obj['password'];
    delete obj['passwordResetToken'];
    delete obj['passwordResetExpires'];
    return obj;
  }

  async findByEmail(email: string) {
    return this.userModel.findOne({ email }).exec();
  }

  async findById(id: string) {
    const doc = await this.userModel.findById(id).select('-password').exec();
    if (!doc) throw new NotFoundException('User not found');
    const hash = crypto.createHash('md5').update(doc.email.toLowerCase().trim()).digest('hex');
    return {
      ...doc.toObject(),
      gravatarUrl: `https://www.gravatar.com/avatar/${hash}?s=200&d=mp`,
    };
  }

  async updateAvatar(userId: string, avatarUrl: string | null) {
    if (avatarUrl && avatarUrl.length > 500_000) {
      throw new BadRequestException('Imagem muito grande. Use uma foto menor.');
    }
    const update = avatarUrl ? { avatarUrl } : { $unset: { avatarUrl: 1 } };
    const user = await this.userModel.findByIdAndUpdate(userId, update, { new: true }).select('-password').exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async markEmailVerified(userId: string) {
    return this.userModel.findByIdAndUpdate(userId, { emailVerified: true, emailVerificationToken: null }, { new: true }).select('-password').exec();
  }

  async markEmailVerifiedByToken(token: string) {
    return this.userModel.findOneAndUpdate({ emailVerificationToken: token }, { emailVerified: true, emailVerificationToken: null }, { new: true }).select('-password').exec();
  }

  async regenerateVerificationToken(email: string) {
    const user = await this.userModel.findOne({ email }).exec();
    if (!user) throw new NotFoundException('User not found');
    if (user.emailVerified) throw new BadRequestException('Email já verificado. Faça login.');

    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    user.emailVerificationToken = emailVerificationToken;
    await user.save();
    return emailVerificationToken;
  }

  async setPasswordResetToken(email: string) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000);
    const user = await this.userModel.findOneAndUpdate({ email }, { passwordResetToken: token, passwordResetExpires: expires }, { new: true }).exec();
    if (!user) throw new NotFoundException('User not found');
    return token;
  }

  async updateName(userId: string, name: string) {
    const user = await this.userModel.findByIdAndUpdate(userId, { name: name.trim() }, { new: true }).select('-password').exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException('User not found');
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) throw new BadRequestException('Senha atual incorreta.');
    const hashed = await bcrypt.hash(newPassword, 12);
    Object.assign(user, { password: hashed });
    await user.save();
    return { ok: true };
  }

  async changePasswordDirect(userId: string, newPassword: string): Promise<{ ok: boolean }> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException('User not found');
    const hashed = await bcrypt.hash(newPassword, 12);
    Object.assign(user, { password: hashed });
    await user.save();
    return { ok: true };
  }

  async resetData(userId: string) {
    const userObjectId = new Types.ObjectId(userId);
    await Promise.all([
      this.transactionModel.deleteMany({ userId: userObjectId }).exec(),
      this.walletModel.deleteMany({ userId: userObjectId }).exec(),
      this.goalModel.deleteMany({ userId: userObjectId }).exec(),
      this.pendingAccountModel.deleteMany({ userId: userObjectId }).exec(),
    ]);
    return { reset: true };
  }

  async deleteAccount(userId: string) {
    const user = await this.userModel.findByIdAndDelete(userId).exec();
    if (!user) throw new NotFoundException('User not found');
    return { deleted: true };
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.userModel.findOne({ passwordResetToken: token, passwordResetExpires: { $gt: new Date() } }).exec();
    if (!user) throw new NotFoundException('Token inválido ou expirado');
    const hashed = await bcrypt.hash(newPassword, 12);
    // Mongoose marks these fields as readonly on the class; bypass via Object.assign
    Object.assign(user, { password: hashed, passwordResetToken: undefined, passwordResetExpires: undefined });
    await user.save();
    const obj = user.toObject() as Record<string, unknown>;
    delete obj['password'];
    return obj;
  }
}
