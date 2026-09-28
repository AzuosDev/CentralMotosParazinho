import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ICurrentUser } from '../../common/types/current-user.type';
import { SupportService } from './support.service';
import { CreateSupportMessageDto } from './dto/create-support-message.dto';
import { UpdateSupportMessageStatusDto } from './dto/update-support-message-status.dto';
import { CreateSupportReplyDto } from './dto/create-support-reply.dto';

@ApiTags('Support')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post('messages')
  async create(@CurrentUser() user: ICurrentUser, @Body() dto: CreateSupportMessageDto) {
    return this.supportService.create(user._id.toString(), user.email, dto);
  }

  @UseGuards(AdminGuard)
  @Get('messages')
  async findAll() {
    return this.supportService.findAllForAdmin();
  }

  @Get('messages/mine')
  async findMine(@CurrentUser() user: ICurrentUser) {
    return this.supportService.findMessagesForUser(user._id.toString());
  }

  // Sem AdminGuard: o mesmo endpoint serve o sininho de qualquer usuário logado,
  // branch por role acontece dentro do service.
  @Get('notifications')
  async getBellNotifications(@CurrentUser() user: ICurrentUser) {
    return this.supportService.getBellNotifications(user._id.toString(), user.email);
  }

  @Patch('messages/:id/dismiss')
  async dismissBellItem(@Param('id') id: string, @CurrentUser() user: ICurrentUser) {
    return this.supportService.dismissBellItem(id, { userId: user._id.toString(), email: user.email });
  }

  @UseGuards(AdminGuard)
  @Patch('messages/:id/status')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateSupportMessageStatusDto) {
    return this.supportService.updateStatus(id, dto.status);
  }

  // Sem AdminGuard: a autorização (dono da mensagem ou admin) é checada dentro do
  // service, já que o próprio usuário também precisa ler/responder a sua conversa.
  @Get('messages/:id/thread')
  async getThread(@Param('id') id: string, @CurrentUser() user: ICurrentUser) {
    return this.supportService.getThread(id, { userId: user._id.toString(), email: user.email });
  }

  @Post('messages/:id/replies')
  async addReply(
    @Param('id') id: string,
    @CurrentUser() user: ICurrentUser,
    @Body() dto: CreateSupportReplyDto,
  ) {
    return this.supportService.addReply(id, { userId: user._id.toString(), email: user.email }, dto.mensagem);
  }
}
