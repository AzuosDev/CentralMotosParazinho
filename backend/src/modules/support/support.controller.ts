import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ICurrentUser } from '../../common/types/current-user.type';
import { SupportService } from './support.service';
import { CreateSupportMessageDto } from './dto/create-support-message.dto';
import { UpdateSupportMessageStatusDto } from './dto/update-support-message-status.dto';

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

  @UseGuards(AdminGuard)
  @Patch('messages/:id/status')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateSupportMessageStatusDto) {
    return this.supportService.updateStatus(id, dto.status);
  }
}
