import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { EmailAttachment, passwordResetEmail, verificationEmail } from '../emails/auth-emails';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {}

  private getBaseUrl() {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL')?.trim();
    return frontendUrl ? frontendUrl.replace(/\/$/, '') : 'http://localhost:5173';
  }

  private getFromAddress() {
    return this.configService.get<string>('EMAIL_FROM')?.trim() || this.configService.get<string>('EMAIL_USER')?.trim();
  }

  private getTransport() {
    const host = this.configService.get<string>('EMAIL_HOST')?.trim();
    const portValue = this.configService.get<string>('EMAIL_PORT')?.trim();
    const user = this.configService.get<string>('EMAIL_USER')?.trim();
    const pass = this.configService.get<string>('EMAIL_PASS')?.trim();

    if (!host || !portValue || !user || !pass) {
      return null;
    }

    const port = Number(portValue);
    if (!Number.isFinite(port)) {
      return null;
    }

    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });
  }

  private async sendMail(
    to: string,
    subject: string,
    text: string,
    html: string,
    attachments: EmailAttachment[] = [],
  ) {
    try {
      const from = this.getFromAddress();
      const transport = this.getTransport();

      if (!from || !transport) {
        this.logger.warn('Email config is incomplete. Skipping outbound email.');
        return false;
      }

      await transport.sendMail({
        from,
        to,
        subject,
        text,
        html,
        attachments,
      });

      return true;
    } catch (err) {
      this.logger.error('Email send failed', (err as Error)?.stack || String(err));
      return false;
    }
  }

  async sendVerificationEmail(to: string, token: string, name?: string) {
    const baseUrl = this.getBaseUrl();
    const verifyUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
    const email = verificationEmail({ verifyUrl, baseUrl, name });
    return this.sendMail(to, email.subject, email.text, email.html, email.attachments);
  }

  async sendPasswordResetEmail(to: string, token: string, name?: string) {
    const baseUrl = this.getBaseUrl();
    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
    const email = passwordResetEmail({ resetUrl, baseUrl, name });
    return this.sendMail(to, email.subject, email.text, email.html, email.attachments);
  }
}
