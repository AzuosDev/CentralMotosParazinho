import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { AdminService } from './admin.service';
import { SetFreeAccessDto } from './dto/set-free-access.dto';
import { SetTrialDto } from './dto/set-trial.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { SetAdminDto, SetBloqueioDto } from './dto/set-flag.dto';
import { ResetSenhaDto } from './dto/reset-senha.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ICurrentUser } from '../../common/types/current-user.type';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('api/admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  async listUsers() {
    return this.adminService.listUsers();
  }

  @Post('users')
  async createUser(@Body() dto: CreateUserDto) {
    return this.adminService.createUser(dto);
  }

  @Patch('users/:id/bloqueio')
  async setBloqueio(@Param('id') id: string, @Body() dto: SetBloqueioDto, @CurrentUser() user: ICurrentUser) {
    return this.adminService.setBloqueio(id, dto.bloqueado, user._id.toString());
  }

  @Patch('users/:id/admin')
  async setAdmin(@Param('id') id: string, @Body() dto: SetAdminDto) {
    return this.adminService.setAdmin(id, dto.isAdmin);
  }

  @Patch('users/:id/senha')
  async resetSenha(@Param('id') id: string, @Body() dto: ResetSenhaDto) {
    return this.adminService.resetSenha(id, dto.password);
  }

  @Patch('users/:id/free-access')
  async setFreeAccess(@Param('id') id: string, @Body() dto: SetFreeAccessDto) {
    return this.adminService.setFreeAccess(id, dto.isLegacyFree);
  }

  @Patch('users/:id/trial')
  async setTrial(@Param('id') id: string, @Body() dto: SetTrialDto) {
    return this.adminService.setTrial(id, dto.days);
  }
}
