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

  @UseGuards(JwtAuthGuard)
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
  async asaasWebhook(@Body() body: { event: string; payment: { id: string; status: string; externalReference?: string; dueDate: string } }) {
    await this.billingService.handleAsaasWebhook(body);
    return { received: true };
  }
}
