import { Controller, Get, Patch, Param, Post, UseGuards } from '@nestjs/common';
import { Types } from 'mongoose';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ICurrentUser } from '../../common/types/current-user.type';
import { NotificationsService } from './notifications.service';
import { NotificationsCronService } from './notifications-cron.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly notificationsCronService: NotificationsCronService,
  ) {}

  @Get()
  async getUnread(@CurrentUser() user: ICurrentUser) {
    return this.notificationsService.findUnreadByUser(user._id);
  }

  @Patch('read-all')
  async markAllRead(@CurrentUser() user: ICurrentUser) {
    await this.notificationsService.markAllAsRead(user._id);
    return { success: true };
  }

  @Patch(':id/read')
  async markRead(@Param('id') id: string, @CurrentUser() user: ICurrentUser) {
    await this.notificationsService.markAsRead(id, user._id);
    return { success: true };
  }

  @Post('sync')
  async sync(@CurrentUser() user: ICurrentUser) {
    await this.notificationsCronService.generateNotificationsForUser(
      new Types.ObjectId(user._id.toString()),
    );
    return { success: true };
  }
}
