import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
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
  config() {
    return this.billingService.getConfigStatus();
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

  // Testa as chaves de pagamento contra as APIs do Asaas/Stripe.
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

  @UseGuards(JwtAuthGuard)
  @Post('portal')
  async billingPortal(@Req() req: RequestWithUser) {
    return this.billingService.createPortalSession(req.user._id.toString());
  }

  // Sem guard, isso mutava subscriptionStatus/isLegacyFree de todo mundo sem autenticação.
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('migrate-legacy')
  async migrateLegacy(@Body() body: { excludeEmails?: string[] }) {
    return this.billingService.migrateLegacyUsers(body.excludeEmails ?? []);
  }

  @SkipThrottle()
  @Post('webhook/stripe')
  async stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') sig: string,
  ) {
    await this.billingService.handleStripeWebhook(req.rawBody!, sig);
    return { received: true };
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
