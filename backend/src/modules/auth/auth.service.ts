import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RefreshTokenDocument } from './schemas/refresh-token.schema';
import * as crypto from 'crypto';
import { EmailService } from '../../common/services/email.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    @InjectModel('RefreshToken') private refreshModel: Model<RefreshTokenDocument>,
    private emailService: EmailService,
  ) {}

  async register(dto: { email: string; password: string }) {
    const user = await this.usersService.create(dto);
    await this.emailService.sendVerificationEmail(user['email'] as string, user['emailVerificationToken'] as string);
    const { emailVerificationToken, password, passwordResetToken, passwordResetExpires, ...safeUser } = user;
    return safeUser;
  }

  async resendVerification(email: string) {
    const token = await this.usersService.regenerateVerificationToken(email);
    await this.emailService.sendVerificationEmail(email, token);
    return true;
  }

  async sendPasswordReset(email: string) {
    const token = await this.usersService.setPasswordResetToken(email);
    await this.emailService.sendPasswordResetEmail(email, token);
    return true;
  }

  async verifyEmail(token: string) {
    const user = await this.usersService.markEmailVerifiedByToken(token);
    if (!user) throw new UnauthorizedException('Token inválido');
    return this.login(user);
  }

  private hashRefreshToken(rawToken: string) {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  async login(user: { _id: Types.ObjectId | string; email: string }) {
    const payload = { sub: user._id.toString(), email: user.email };
    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const rawRefresh = crypto.randomBytes(64).toString('hex');
    const hashed = this.hashRefreshToken(rawRefresh);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.refreshModel.create({ userId: user._id, token: hashed, expiresAt });
    return { accessToken, refreshToken: rawRefresh };
  }

  async refresh(rawRefreshToken: string) {
    const hashed = this.hashRefreshToken(rawRefreshToken);
    const t = await this.refreshModel.findOne({ token: hashed, expiresAt: { $gt: new Date() } }).exec();
    if (!t) {
      throw new UnauthorizedException('Refresh token inválido');
    }
    const userId = t.userId.toString();
    const user = await this.usersService.findById(userId);
    // rotate
    await this.refreshModel.findByIdAndDelete(t._id).exec();
    const payload = { sub: userId, email: user.email };
    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const newRaw = crypto.randomBytes(64).toString('hex');
    const newHashed = this.hashRefreshToken(newRaw);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.refreshModel.create({ userId, token: newHashed, expiresAt });
    return { accessToken, refreshToken: newRaw };
  }

  async logout(userId: string, rawRefreshToken: string) {
    const hashed = this.hashRefreshToken(rawRefreshToken);
    const result = await this.refreshModel.deleteOne({ userId, token: hashed }).exec();
    return result.deletedCount > 0;
  }

  async forgotPassword(email: string) {
    await this.sendPasswordReset(email);
    return true;
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.usersService.resetPassword(token, newPassword);
    return this.login(user as unknown as { _id: Types.ObjectId; email: string });
  }
}
