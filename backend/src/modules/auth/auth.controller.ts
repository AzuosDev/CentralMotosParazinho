import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, Query, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from '../../common/guards/local-auth.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ICurrentUser } from '../../common/types/current-user.type';

interface RequestWithUser extends Request {
  user: ICurrentUser;
}

@ApiTags('Auth')
@ApiBearerAuth()
@Controller('api/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // Cadastro público desativado: o sistema é de uso interno e as contas são criadas
  // pelos admins (POST /api/admin/users). A rota continua respondendo para que um
  // frontend antigo em cache mostre a mensagem certa em vez de um 404 genérico.
  @Post('register')
  register() {
    throw new ForbiddenException('Cadastro desativado. Peça acesso ao administrador.');
  }

  @Get('verify-email')
  async verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Throttle(1, 60)
  @Post('resend-verification')
  async resendVerification(@Body() dto: ResendVerificationDto) {
    await this.authService.resendVerification(dto.email);
    return { ok: true };
  }

  @Throttle(5, 60)
  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Req() req: RequestWithUser) {
    const user = req.user;
    return this.authService.login(user);
  }

  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Req() req: RequestWithUser, @Body() dto: RefreshTokenDto) {
    const user = req.user;
    await this.authService.logout(user._id.toString(), dto.refreshToken);
    return { ok: true };
  }

  @Throttle(5, 60)
  @Post('forgot-password')
  async forgot(@Body() body: { email: string }) {
    await this.authService.forgotPassword(body.email);
    return { ok: true };
  }

  @Post('reset-password')
  async reset(@Body() dto: ResetPasswordDto) {
    const nextPassword = dto.newPassword ?? dto.password;

    if (!nextPassword) {
      throw new BadRequestException('Informe a nova senha');
    }

    return this.authService.resetPassword(dto.token, nextPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() req: RequestWithUser) {
    const user = req.user;
    return user;
  }
}
