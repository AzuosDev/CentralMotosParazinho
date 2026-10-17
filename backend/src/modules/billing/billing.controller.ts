import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { SetPrecosDto } from './dto/precos.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { ICurrentUser } from '../../common/types/current-user.type';

interface RequestWithUser extends Request {
  user: ICurrentUser;
}

@ApiTags('Billing')
@ApiBearerAuth()
@Controller('api/billing')
export class BillingController {
  constructor(private billingService: BillingService) {}

  @UseGuards(JwtAuthGuard)
  @Post('checkout')
  async createCheckout(@Req() req: RequestWithUser, @Body() dto: CreateCheckoutDto): Promise<unknown> {
    return this.billingService.createCheckout(req.user._id.toString(), dto);
  }

  // Quais formas de pagamento o servidor tem configuradas (só presença, sem valores).
  @UseGuards(JwtAuthGuard)
  @Get('config')
  async config(@Req() req: RequestWithUser) {
    return this.billingService.getConfigStatus(req.user._id.toString());
  }

  // Preço padrão do Plano Empresarial (Painel Admin → Pagamentos).
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('precos')
  async precos() {
    return this.billingService.precosPadrao();
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Put('precos')
  async definirPrecos(@Body() dto: SetPrecosDto) {
    return this.billingService.definirPrecosPadrao(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('faturas')
  async faturas(@Req() req: RequestWithUser) {
    return this.billingService.listarFaturas(req.user._id.toString());
  }

  @UseGuards(JwtAuthGuard)
  @Get('faturas/:paymentId/pix')
  async pixDaFatura(@Req() req: RequestWithUser, @Param('paymentId') paymentId: string) {
    return this.billingService.pixDaFatura(req.user._id.toString(), paymentId);
  }

  // Testa a configuração do PIX (Asaas) contra a API real e mostra o preço do plano.
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('diagnostico')
  async diagnostico() {
    return this.billingService.diagnostico();
  }

  @UseGuards(JwtAuthGuard)
  @Get('pix/:paymentId/status')
  async pixStatus(@Req() req: RequestWithUser, @Param('paymentId') paymentId: string) {
    return this.billingService.verifyAndActivatePix(paymentId, req.user._id.toString());
  }

  // Sem guard, isso mutava subscriptionStatus/isLegacyFree de todo mundo sem autenticação.
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('migrate-legacy')
  async migrateLegacy(@Body() body: { excludeEmails?: string[] }) {
    return this.billingService.migrateLegacyUsers(body.excludeEmails ?? []);
  }

  @SkipThrottle()
  @Post('webhook/asaas')
  async asaasWebhook(
    @Body() body: { event: string; payment?: { id?: string } },
    @Headers('asaas-access-token') accessToken?: string,
  ) {
    await this.billingService.handleAsaasWebhook(body, accessToken);
    return { received: true };
  }
}
