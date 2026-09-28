import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { AdminService } from './admin.service';
import { SetFreeAccessDto } from './dto/set-free-access.dto';
import { SetTrialDto } from './dto/set-trial.dto';

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

  @Patch('users/:id/free-access')
  async setFreeAccess(@Param('id') id: string, @Body() dto: SetFreeAccessDto) {
    return this.adminService.setFreeAccess(id, dto.isLegacyFree);
  }

  @Patch('users/:id/trial')
  async setTrial(@Param('id') id: string, @Body() dto: SetTrialDto) {
    return this.adminService.setTrial(id, dto.days);
  }
}
