import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

interface PixData {
  id: string;
  qrCodeImage: string;
  copiaECola: string;
  expiracao: string;
}

interface CheckoutResult {
  method: 'stripe' | 'pix';
  url?: string;
  pixData?: PixData;
}

interface AsaasPaymentResponse {
  id: string;
  status: string;
  externalReference?: string;
  dueDate: string;
}

interface AsaasQrCodeResponse {
  encodedImage: string;
  payload: string;
  expirationDate?: string;
}

interface AsaasCustomerResponse {
  id: string;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private stripe: Stripe;

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private configService: ConfigService,
  ) {
    // O SDK do Stripe lança na construção se a key for falsy (string vazia inclusa) — sem
    // isso, qualquer ambiente de dev sem STRIPE_SECRET_KEY configurada (comum: ninguém
    // mexendo em billing localmente) derruba o boot inteiro da aplicação, não só as rotas
    // de billing. Em produção mantém o fail-fast original (string vazia, Stripe lança).
    const stripeKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    const fallbackKey = process.env.NODE_ENV === 'production' ? '' : 'sk_test_local_dev_placeholder';
    this.stripe = new Stripe(stripeKey || fallbackKey);
  }

  private get asaasUrl() {
    return this.configService.get<string>('ASAAS_URL') ?? 'https://api.asaas.com/v3';
  }

  private get asaasHeaders() {
    return {
      'access_token': this.configService.get<string>('ASAAS_API_KEY') ?? '',
      'Content-Type': 'application/json',
    };
  }

  private async asaasFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const resp = await fetch(`${this.asaasUrl}${path}`, {
      ...init,
      headers: { ...this.asaasHeaders, ...(init?.headers ?? {}) },
    });
    const text = await resp.text();
    if (!resp.ok) {
      this.logger.error(`[Asaas] ${init?.method ?? 'GET'} ${path} → ${resp.status}: ${text}`);
      throw new BadRequestException(`Erro Asaas (${resp.status}): ${text}`);
    }
    return JSON.parse(text) as T;
  }

  async createCheckout(userId: string, dto: CreateCheckoutDto): Promise<CheckoutResult> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException('User not found');

    if (dto.method === 'stripe') {
      return this.createStripeCheckout(user, dto);
    }
    return this.createAsaasPixCheckout(user, dto);
  }

  private async createStripeCheckout(user: UserDocument, dto: CreateCheckoutDto): Promise<CheckoutResult> {
    const priceKey = dto.cycle === 'annual' ? 'STRIPE_PRICE_BASICO_ANNUAL' : 'STRIPE_PRICE_BASICO_MONTHLY';
    const priceId = this.configService.get<string>(priceKey);
    if (!priceId) throw new BadRequestException('Preço não configurado no servidor');

    const appUrl = this.configService.get<string>('APP_URL') ?? 'https://meugasto.vercel.app';

    let customerId = user.stripeCustomerId ?? undefined;
    if (!customerId) {
      const customer = await this.stripe.customers.create({
        email: user.email,
        metadata: { userId: user._id.toString() },
      });
      customerId = customer.id;
      await this.userModel.findByIdAndUpdate(user._id, { stripeCustomerId: customerId }).exec();
    }

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/checkout?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/checkout`,
      metadata: { userId: user._id.toString(), plan: dto.plan, cycle: dto.cycle },
      subscription_data: {
        metadata: { userId: user._id.toString(), plan: dto.plan, cycle: dto.cycle },
      },
    });

    return { method: 'stripe', url: session.url! };
  }

  private async createAsaasPixCheckout(user: UserDocument, dto: CreateCheckoutDto): Promise<CheckoutResult> {
    let asaasCustomerId = user.asaasCustomerId ?? undefined;

    const cpfCnpj = dto.cpfCnpj ?? user.cpfCnpj ?? undefined;
    if (!cpfCnpj) throw new BadRequestException('CPF ou CNPJ é obrigatório para pagamento via PIX');

    const cpfCnpjDigits = cpfCnpj.replace(/\D/g, '');
    const customerPayload = {
      name: user.name ?? user.email.split('@')[0],
      email: user.email,
      cpfCnpj: cpfCnpjDigits,
      notificationDisabled: true,
    };

    if (!asaasCustomerId) {
      const customerData = await this.asaasFetch<AsaasCustomerResponse>('/customers', {
        method: 'POST',
        body: JSON.stringify(customerPayload),
      });
      asaasCustomerId = customerData.id;
    } else {
      await this.asaasFetch<AsaasCustomerResponse>(`/customers/${asaasCustomerId}`, {
        method: 'PUT',
        body: JSON.stringify(customerPayload),
      });
    }

    await this.userModel.findByIdAndUpdate(user._id, { asaasCustomerId, cpfCnpj: cpfCnpjDigits }).exec();

    const value = dto.cycle === 'annual' ? 299.90 : 29.90;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 3);
    const dueDateStr = dueDate.toISOString().split('T')[0];
    const externalReference = `${user._id.toString()}__${dto.plan}__${dto.cycle}`;

    const paymentData = await this.asaasFetch<AsaasPaymentResponse>('/payments', {
      method: 'POST',
      body: JSON.stringify({
        customer: asaasCustomerId,
        billingType: 'PIX',
        value,
        dueDate: dueDateStr,
        description: `Central Motos - Plano Básico ${dto.cycle === 'annual' ? 'Anual' : 'Mensal'}`,
        externalReference,
      }),
    });

    const qrData = await this.asaasFetch<AsaasQrCodeResponse>(`/payments/${paymentData.id}/pixQrCode`);

    return {
      method: 'pix',
      pixData: {
        id: paymentData.id,
        qrCodeImage: qrData.encodedImage,
        copiaECola: qrData.payload,
        expiracao: paymentData.dueDate,
      },
    };
  }

  async verifyAndActivatePix(paymentId: string, userId: string): Promise<{ paid: boolean }> {
    const data = await this.asaasFetch<AsaasPaymentResponse>(`/payments/${paymentId}`);
    const paid = data.status === 'CONFIRMED' || data.status === 'RECEIVED';

    if (paid && data.externalReference) {
      const parts = data.externalReference.split('__');
      const [refUserId, plan, cycle] = parts;
      if (refUserId === userId) {
        const days = cycle === 'annual' ? 365 : 30;
        const subscriptionExpiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        await this.userModel.findByIdAndUpdate(userId, {
          subscriptionStatus: 'active',
          plan: plan ?? 'basico',
          billingCycle: cycle ?? 'monthly',
          subscriptionExpiresAt,
        }).exec();
      }
    }

    return { paid };
  }

  async handleStripeWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      this.logger.warn('[Stripe] STRIPE_WEBHOOK_SECRET não configurado — webhook ignorado');
      return;
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      this.logger.error(`[Stripe] Assinatura inválida: ${(err as Error).message}`);
      throw new BadRequestException('Assinatura do webhook inválida');
    }

    this.logger.log(`[Stripe] Evento recebido: ${event.type} (id: ${event.id})`);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const cycle = session.metadata?.cycle ?? 'monthly';

      this.logger.log(`[Stripe] checkout.session.completed — userId: ${userId}, cycle: ${cycle}, sessionId: ${session.id}`);

      if (userId) {
        const days = cycle === 'annual' ? 365 : 30;
        await this.userModel.findByIdAndUpdate(userId, {
          subscriptionStatus: 'active',
          plan: session.metadata?.plan ?? 'basico',
          billingCycle: cycle,
          stripeSubscriptionId: session.subscription as string,
          subscriptionExpiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
        }).exec();
        this.logger.log(`[Stripe] Usuário ${userId} ativado com sucesso`);
      } else {
        this.logger.warn('[Stripe] checkout.session.completed sem userId no metadata — assinatura não ativada');
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription;
      this.logger.log(`[Stripe] customer.subscription.deleted — subscriptionId: ${sub.id}`);
      await this.userModel.updateOne(
        { stripeSubscriptionId: sub.id },
        { subscriptionStatus: 'cancelled', stripeSubscriptionId: null },
      ).exec();
      this.logger.log(`[Stripe] Assinatura ${sub.id} cancelada`);
    }
  }

  async handleAsaasWebhook(body: { event: string; payment: AsaasPaymentResponse }): Promise<void> {
    const { event, payment } = body;

    if ((event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') && payment.externalReference) {
      const parts = payment.externalReference.split('__');
      const [userId, plan, cycle] = parts;
      if (!userId) return;

      const days = cycle === 'annual' ? 365 : 30;
      await this.userModel.findByIdAndUpdate(userId, {
        subscriptionStatus: 'active',
        plan: plan ?? 'basico',
        billingCycle: cycle ?? 'monthly',
        subscriptionExpiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      }).exec();
    }
  }

  async createPortalSession(userId: string): Promise<{ url: string }> {
    const user = await this.userModel.findById(userId).exec();
    if (!user?.stripeCustomerId) throw new NotFoundException('Assinatura via cartão não encontrada');

    const appUrl = this.configService.get<string>('APP_URL') ?? 'https://meugasto.vercel.app';
    const session = await this.stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${appUrl}/settings`,
    });
    return { url: session.url };
  }

  async migrateLegacyUsers(excludeEmails: string[] = []): Promise<{ updated: number }> {
    const filter: Record<string, unknown> = { subscriptionStatus: null };
    if (excludeEmails.length) {
      filter['email'] = { $nin: excludeEmails.map((e) => e.toLowerCase()) };
    }
    const result = await this.userModel.updateMany(
      filter,
      { $set: { isLegacyFree: true, subscriptionStatus: 'active', plan: 'free_legacy' } },
    ).exec();
    return { updated: result.modifiedCount };
  }
}
