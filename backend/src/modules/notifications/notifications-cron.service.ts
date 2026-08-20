import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { PendingAccount, PendingAccountDocument } from '../pending/schemas/pending-account.schema';
import { NotificationsService } from './notifications.service';
import { NotificationType } from './schemas/notification.schema';

@Injectable()
export class NotificationsCronService {
  private readonly logger = new Logger(NotificationsCronService.name);
  private isRunning = false;

  constructor(
    @InjectModel(PendingAccount.name)
    private readonly pendingModel: Model<PendingAccountDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron('0 8 * * *', { timeZone: 'America/Sao_Paulo' })
  async handleDailyNotifications() {
    if (process.env.CRON_NOTIFICATIONS !== 'true') return;
    if (this.isRunning) {
      this.logger.warn('Notification cron already running, skipping');
      return;
    }
    this.isRunning = true;
    try {
      await this.generateNotifications();
    } catch (err) {
      this.logger.error('Error generating notifications', err);
    } finally {
      this.isRunning = false;
    }
  }

  async generateNotificationsForUser(userId: Types.ObjectId): Promise<void> {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setUTCHours(23, 59, 59, 999);

    const accounts = await this.pendingModel
      .find({ userId, paid: false, skipped: { $ne: true }, dueDate: { $lte: todayEnd } })
      .lean()
      .exec();

    for (const account of accounts) {
      const dueDay = new Date(account.dueDate);
      dueDay.setUTCHours(0, 0, 0, 0);
      const isToday = dueDay.getTime() === todayStart.getTime();

      let type: NotificationType;
      let title: string;

      if (account.tipo === 'RECEBER') {
        type = isToday ? 'VENCE_HOJE_RECEBER' : 'VENCIDA_RECEBER';
        title = isToday ? 'Recebimento esperado hoje' : 'Recebimento em atraso';
      } else {
        type = isToday ? 'VENCE_HOJE_PAGAR' : 'VENCIDA_PAGAR';
        title = isToday ? 'Conta vence hoje' : 'Conta vencida';
      }

      const valueFormatted = account.value.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

      await this.notificationsService.upsertNotification({
        userId: account.userId as Types.ObjectId,
        pendingAccountId: (account as any)._id as Types.ObjectId,
        type,
        title,
        message: `${account.title}: R$ ${valueFormatted}`,
        generatedDate: todayStart,
      });
    }
  }

  async generateNotifications() {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setUTCHours(23, 59, 59, 999);

    const accounts = await this.pendingModel
      .find({
        paid: false,
        skipped: { $ne: true },
        dueDate: { $lte: todayEnd },
      })
      .lean()
      .exec();

    this.logger.log(`Processing ${accounts.length} overdue/due-today accounts`);

    for (const account of accounts) {
      const dueDay = new Date(account.dueDate);
      dueDay.setUTCHours(0, 0, 0, 0);
      const isToday = dueDay.getTime() === todayStart.getTime();

      let type: NotificationType;
      let title: string;

      if (account.tipo === 'RECEBER') {
        type = isToday ? 'VENCE_HOJE_RECEBER' : 'VENCIDA_RECEBER';
        title = isToday ? 'Recebimento esperado hoje' : 'Recebimento em atraso';
      } else {
        type = isToday ? 'VENCE_HOJE_PAGAR' : 'VENCIDA_PAGAR';
        title = isToday ? 'Conta vence hoje' : 'Conta vencida';
      }

      const valueFormatted = account.value.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

      await this.notificationsService.upsertNotification({
        userId: account.userId as Types.ObjectId,
        pendingAccountId: (account as any)._id as Types.ObjectId,
        type,
        title,
        message: `${account.title}: R$ ${valueFormatted}`,
        generatedDate: todayStart,
      });
    }

    this.logger.log('Daily notifications generated successfully');
  }
}
