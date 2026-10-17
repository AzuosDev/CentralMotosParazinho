import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

export interface PixData {
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
  customer?: string;
  value?: number;
  description?: string;
  paymentDate?: string | null;
  clientPaymentDate?: string | null;
  invoiceUrl?: string | null;
  billingType?: string;
  deleted?: boolean;
}

interface AsaasListResponse<T> {
  data: T[];
  hasMore: boolean;
}

interface AsaasQrCodeResponse {
  encodedImage: string;
  payload: string;
  expirationDate?: string;
}

interface AsaasCustomerResponse {
  id: string;
}

export type FaturaStatus = 'paga' | 'pendente' | 'vencida' | 'cancelada' | 'estornada';

export interface FaturaAssinatura {
  id: string;
  origem: 'pix' | 'cartao';
  descricao: string;
  valor: number;
  status: FaturaStatus;
  vencimento: string | null;
  pagoEm: string | null;
  url: string | null;
  // Só cobranças PIX do Asaas ainda não pagas têm QR Code pra gerar de novo.
  podePagarPix: boolean;
}

export interface DiagnosticoItem {
  chave: string;
  ok: boolean;
  detalhe: string;
}

const ASAAS_PAGO = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'];
const ASAAS_ESTORNADO = [
  'REFUNDED', 'REFUND_REQUESTED', 'REFUND_IN_PROGRESS',
  'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE', 'AWAITING_CHARGEBACK_REVERSAL',
];

function statusAsaas(status: string): FaturaStatus {
  if (ASAAS_PAGO.includes(status)) return 'paga';
  if (status === 'OVERDUE') return 'vencida';
  if (ASAAS_ESTORNADO.includes(status)) return 'estornada';
  return 'pendente';
}

function statusStripe(status: Stripe.Invoice.Status | null): FaturaStatus {
  if (status === 'paid') return 'paga';
  if (status === 'void') return 'cancelada';
  if (status === 'uncollectible') return 'vencida';
  return 'pendente';
}

const DIA_MS = 24 * 60 * 60 * 1000;

// Plano único do sistema. Os valores vêm de PLANO_EMPRESARIAL_VALOR_MENSAL/_ANUAL (em
// reais) para o preço poder mudar sem deploy; os defaults são os valores antigos.
export const PLANO = 'empresarial';
export const PLANO_NOME = 'Plano Empresarial';
const VALOR_PADRAO = { monthly: 29.9, annual: 299.9 };

export interface PlanoInfo {
  id: string;
  nome: string;
  valorMensal: number;
  valorAnual: number;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private stripe: Stripe;
  private stripeConfigurado: boolean;

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
    this.stripeConfigurado = !!stripeKey;
  }

  // Só presença das chaves — usado pela tela de Configurações pra decidir quais formas de
  // pagamento oferecer. Não expõe valor nenhum; o teste real das chaves é diagnostico().
  getConfigStatus(): { pix: boolean; cartao: boolean; plano: PlanoInfo } {
    return {
      pix: !!this.configService.get<string>('ASAAS_API_KEY'),
      cartao: this.stripeConfigurado && !!this.stripePriceId('monthly'),
      plano: {
        id: PLANO,
        nome: PLANO_NOME,
        valorMensal: this.valorPlano('monthly'),
        valorAnual: this.valorPlano('annual'),
      },
    };
  }

  private valorPlano(cycle: 'monthly' | 'annual'): number {
    const raw = this.configService.get<string>(
      cycle === 'annual' ? 'PLANO_EMPRESARIAL_VALOR_ANUAL' : 'PLANO_EMPRESARIAL_VALOR_MENSAL',
    );
    const valor = raw ? Number(raw.replace(',', '.')) : NaN;
    return Number.isFinite(valor) && valor > 0 ? Math.round(valor * 100) / 100 : VALOR_PADRAO[cycle];
  }

  // STRIPE_PRICE_BASICO_* são os nomes antigos, aceitos enquanto o ambiente não é renomeado.
  private stripePriceKeys(cycle: 'monthly' | 'annual'): [string, string] {
    return cycle === 'annual'
      ? ['STRIPE_PRICE_EMPRESARIAL_ANNUAL', 'STRIPE_PRICE_BASICO_ANNUAL']
      : ['STRIPE_PRICE_EMPRESARIAL_MONTHLY', 'STRIPE_PRICE_BASICO_MONTHLY'];
  }

  private stripePriceId(cycle: 'monthly' | 'annual'): string | undefined {
    const [nova, antiga] = this.stripePriceKeys(cycle);
    return this.configService.get<string>(nova) || this.configService.get<string>(antiga) || undefined;
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
    const priceId = this.stripePriceId(dto.cycle);
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
      metadata: { userId: user._id.toString(), plan: PLANO, cycle: dto.cycle },
      subscription_data: {
        metadata: { userId: user._id.toString(), plan: PLANO, cycle: dto.cycle },
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

    const value = this.valorPlano(dto.cycle);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 3);
    const dueDateStr = dueDate.toISOString().split('T')[0];
    const externalReference = `${user._id.toString()}__${PLANO}__${dto.cycle}`;

    // Reaproveita uma cobrança PIX ainda em aberto do mesmo plano/ciclo em vez de criar
    // outra — sem isso, cada clique em "Pagar" (checkout ou Configurações) deixava uma
    // cobrança pendente a mais na lista de faturas do usuário e no painel do Asaas.
    const abertas = await this.asaasFetch<AsaasListResponse<AsaasPaymentResponse>>(
      `/payments?customer=${encodeURIComponent(asaasCustomerId)}&status=PENDING` +
        `&externalReference=${encodeURIComponent(externalReference)}&limit=1`,
    );
    // Cobrança aberta com valor antigo (preço do plano mudou) não é reaproveitada.
    const paymentData = abertas.data.find((p) => !p.deleted && p.billingType === 'PIX' && p.value === value)
      ?? await this.asaasFetch<AsaasPaymentResponse>('/payments', {
        method: 'POST',
        body: JSON.stringify({
          customer: asaasCustomerId,
          billingType: 'PIX',
          value,
          dueDate: dueDateStr,
          description: `Central Motos - ${PLANO_NOME} ${dto.cycle === 'annual' ? 'Anual' : 'Mensal'}`,
          externalReference,
        }),
      });

    return { method: 'pix', pixData: await this.pixDoPagamento(paymentData) };
  }

  private async pixDoPagamento(payment: AsaasPaymentResponse): Promise<PixData> {
    const qrData = await this.asaasFetch<AsaasQrCodeResponse>(`/payments/${payment.id}/pixQrCode`);
    return {
      id: payment.id,
      qrCodeImage: qrData.encodedImage,
      copiaECola: qrData.payload,
      expiracao: qrData.expirationDate ?? payment.dueDate,
    };
  }

  // Cobranças do Asaas (PIX) + invoices do Stripe (cartão) do usuário, mais recentes primeiro.
  // Uma origem fora do ar não derruba a outra: o erro só é logado e a lista vem parcial.
  async listarFaturas(userId: string): Promise<FaturaAssinatura[]> {
    const user = await this.userModel.findById(userId).select('asaasCustomerId stripeCustomerId').lean().exec();
    if (!user) throw new NotFoundException('User not found');

    const faturas: FaturaAssinatura[] = [];

    if (user.asaasCustomerId && this.configService.get<string>('ASAAS_API_KEY')) {
      try {
        const resp = await this.asaasFetch<AsaasListResponse<AsaasPaymentResponse>>(
          `/payments?customer=${encodeURIComponent(user.asaasCustomerId)}&limit=50`,
        );
        for (const p of resp.data) {
          if (p.deleted) continue;
          const status = statusAsaas(p.status);
          faturas.push({
            id: p.id,
            origem: 'pix',
            descricao: p.description ?? 'Assinatura Central Motos',
            valor: p.value ?? 0,
            status,
            vencimento: p.dueDate ?? null,
            pagoEm: p.clientPaymentDate ?? p.paymentDate ?? null,
            url: p.invoiceUrl ?? null,
            podePagarPix: p.billingType === 'PIX' && (status === 'pendente' || status === 'vencida'),
          });
        }
      } catch (err) {
        this.logger.error(`[Asaas] Falha ao listar faturas de ${userId}: ${(err as Error).message}`);
      }
    }

    if (user.stripeCustomerId && this.stripeConfigurado) {
      try {
        const invoices = await this.stripe.invoices.list({ customer: user.stripeCustomerId, limit: 24 });
        for (const inv of invoices.data) {
          if (inv.status === 'draft' || !inv.id) continue;
          const status = statusStripe(inv.status);
          const paidAt = inv.status_transitions?.paid_at;
          faturas.push({
            id: inv.id,
            origem: 'cartao',
            descricao: inv.lines?.data?.[0]?.description ?? inv.description ?? 'Assinatura Central Motos',
            valor: (status === 'paga' ? inv.amount_paid : inv.amount_due) / 100,
            status,
            vencimento: new Date((inv.due_date ?? inv.created) * 1000).toISOString().split('T')[0],
            pagoEm: paidAt ? new Date(paidAt * 1000).toISOString().split('T')[0] : null,
            url: inv.hosted_invoice_url ?? null,
            podePagarPix: false,
          });
        }
      } catch (err) {
        this.logger.error(`[Stripe] Falha ao listar faturas de ${userId}: ${(err as Error).message}`);
      }
    }

    return faturas.sort((a, b) => (b.vencimento ?? '').localeCompare(a.vencimento ?? ''));
  }

  // QR Code / copia e cola de uma cobrança PIX já existente (fatura em aberto listada nas
  // Configurações). Confere que a cobrança é do próprio usuário antes de devolver o PIX.
  async pixDaFatura(userId: string, paymentId: string): Promise<PixData> {
    const user = await this.userModel.findById(userId).select('asaasCustomerId').lean().exec();
    if (!user?.asaasCustomerId) throw new NotFoundException('Fatura não encontrada');

    const payment = await this.asaasFetch<AsaasPaymentResponse>(`/payments/${encodeURIComponent(paymentId)}`);
    if (payment.deleted || payment.customer !== user.asaasCustomerId) {
      throw new NotFoundException('Fatura não encontrada');
    }
    if (payment.billingType !== 'PIX' || ASAAS_PAGO.includes(payment.status)) {
      throw new BadRequestException('Esta fatura não está disponível para pagamento via PIX');
    }
    return this.pixDoPagamento(payment);
  }

  // Ativa/renova a assinatura a partir de uma cobrança paga do Asaas. Idempotente por id do
  // pagamento (asaasPagamentosAplicados): o polling do checkout, o polling das Configurações
  // e o webhook chamam isto para o mesmo pagamento, e só o primeiro estende o prazo. A
  // renovação soma ao prazo atual quando ainda está vigente, então pagar antes de vencer
  // não "perde" os dias que faltavam.
  private async aplicarPagamentoAsaas(paymentId: string, userId: string, cycle?: string): Promise<void> {
    const user = await this.userModel.findById(userId).select('subscriptionStatus subscriptionExpiresAt').lean().exec();
    if (!user) return;

    const agora = Date.now();
    const atual = user.subscriptionStatus === 'active' && user.subscriptionExpiresAt
      ? new Date(user.subscriptionExpiresAt).getTime()
      : 0;
    const base = Math.max(agora, atual);
    const days = cycle === 'annual' ? 365 : 30;

    await this.userModel.updateOne(
      { _id: userId, asaasPagamentosAplicados: { $ne: paymentId } },
      {
        $set: {
          subscriptionStatus: 'active',
          plan: PLANO,
          billingCycle: cycle ?? 'monthly',
          subscriptionExpiresAt: new Date(base + days * DIA_MS),
        },
        $push: { asaasPagamentosAplicados: paymentId },
      },
    ).exec();
  }

  async verifyAndActivatePix(paymentId: string, userId: string): Promise<{ paid: boolean }> {
    const data = await this.asaasFetch<AsaasPaymentResponse>(`/payments/${encodeURIComponent(paymentId)}`);
    const [refUserId, , cycle] = (data.externalReference ?? '').split('__');
    // Cobrança de outro usuário: não revela nem o status dela.
    if (refUserId !== userId) throw new NotFoundException('Pagamento não encontrado');

    const paid = ASAAS_PAGO.includes(data.status);
    if (paid) await this.aplicarPagamentoAsaas(data.id, userId, cycle);

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
          plan: PLANO,
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

  // O corpo do webhook não é confiável por si só (a rota é pública): se ASAAS_WEBHOOK_TOKEN
  // estiver configurado, o header asaas-access-token tem que bater; e, de qualquer forma, o
  // pagamento é relido na API do Asaas com a nossa chave — status e externalReference vêm
  // de lá, não do corpo. Sem isso, qualquer um podia POSTar um "PAYMENT_RECEIVED" forjado
  // com o próprio userId no externalReference e ganhar assinatura de graça.
  async handleAsaasWebhook(
    body: { event: string; payment?: { id?: string } },
    accessToken?: string,
  ): Promise<void> {
    const tokenEsperado = this.configService.get<string>('ASAAS_WEBHOOK_TOKEN');
    if (tokenEsperado && accessToken !== tokenEsperado) {
      this.logger.warn('[Asaas] Webhook com asaas-access-token inválido — ignorado');
      throw new UnauthorizedException('Token do webhook inválido');
    }

    const { event, payment } = body ?? {};
    if (event !== 'PAYMENT_CONFIRMED' && event !== 'PAYMENT_RECEIVED') return;
    if (!payment?.id) return;

    const real = await this.asaasFetch<AsaasPaymentResponse>(`/payments/${encodeURIComponent(payment.id)}`);
    if (!ASAAS_PAGO.includes(real.status) || !real.externalReference) return;

    const [userId, , cycle] = real.externalReference.split('__');
    if (!userId || !Types.ObjectId.isValid(userId)) return;

    await this.aplicarPagamentoAsaas(real.id, userId, cycle);
  }

  // Testa de verdade cada chave de pagamento configurada (não só a presença). Só para
  // admin: o detalhe revela ambiente, ids de preço e status da conta Asaas.
  async diagnostico(): Promise<DiagnosticoItem[]> {
    const itens: DiagnosticoItem[] = [];
    const get = (k: string) => this.configService.get<string>(k);

    // ── Asaas (PIX) ──
    const asaasKey = get('ASAAS_API_KEY');
    const asaasUrl = this.asaasUrl;
    const urlSandbox = asaasUrl.includes('sandbox');
    if (!asaasKey) {
      itens.push({ chave: 'ASAAS_API_KEY', ok: false, detalhe: 'Não configurada — PIX indisponível.' });
    } else {
      const keySandbox = asaasKey.includes('_hmlg_');
      const keyProd = asaasKey.includes('_prod_');
      const ambienteKey = keySandbox ? 'sandbox' : keyProd ? 'produção' : 'indefinido (chave em formato antigo)';
      const ambienteOk = !(keySandbox && !urlSandbox) && !(keyProd && urlSandbox);
      itens.push({
        chave: 'ASAAS_URL',
        ok: ambienteOk,
        detalhe: ambienteOk
          ? `${asaasUrl} (${urlSandbox ? 'sandbox' : 'produção'})`
          : `${asaasUrl} não combina com a chave (${ambienteKey}) — a API vai responder 401.`,
      });
      try {
        const st = await this.asaasFetch<{ general?: string }>('/myAccount/status');
        itens.push({
          chave: 'ASAAS_API_KEY',
          ok: true,
          detalhe: `Chave válida (${ambienteKey}). Conta: ${st.general ?? 'status desconhecido'}.`,
        });
        try {
          const chaves = await this.asaasFetch<AsaasListResponse<{ key: string; type: string }>>(
            '/pix/addressKeys?status=ACTIVE&limit=10',
          );
          itens.push({
            chave: 'Chave PIX no Asaas',
            ok: chaves.data.length > 0,
            detalhe: chaves.data.length > 0
              ? `${chaves.data.length} chave(s) PIX ativa(s) (${chaves.data.map((c) => c.type).join(', ')}).`
              : 'Nenhuma chave PIX ativa na conta — o Asaas não gera QR Code sem uma.',
          });
        } catch (err) {
          itens.push({ chave: 'Chave PIX no Asaas', ok: false, detalhe: (err as Error).message });
        }
      } catch (err) {
        itens.push({ chave: 'ASAAS_API_KEY', ok: false, detalhe: `Rejeitada pela API: ${(err as Error).message}` });
      }
    }
    itens.push({
      chave: 'ASAAS_WEBHOOK_TOKEN',
      ok: !!get('ASAAS_WEBHOOK_TOKEN'),
      detalhe: get('ASAAS_WEBHOOK_TOKEN')
        ? 'Configurado — o webhook confere o header asaas-access-token.'
        : 'Não configurado. O webhook ainda relê o pagamento na API, mas configure o mesmo token aqui e no painel do Asaas.',
    });

    // ── Stripe (cartão) ──
    if (!this.stripeConfigurado) {
      itens.push({ chave: 'STRIPE_SECRET_KEY', ok: false, detalhe: 'Não configurada — pagamento com cartão indisponível.' });
    } else {
      const sk = get('STRIPE_SECRET_KEY')!;
      try {
        await this.stripe.balance.retrieve();
        itens.push({
          chave: 'STRIPE_SECRET_KEY',
          ok: true,
          detalhe: `Chave válida (${sk.startsWith('sk_live_') || sk.startsWith('rk_live_') ? 'produção' : 'teste'}).`,
        });
        for (const cycle of ['monthly', 'annual'] as const) {
          const [nova, antiga] = this.stripePriceKeys(cycle);
          const k = get(nova) ? nova : get(antiga) ? antiga : nova;
          const priceId = get(k);
          if (!priceId) {
            itens.push({ chave: k, ok: false, detalhe: 'Não configurado.' });
            continue;
          }
          try {
            const price = await this.stripe.prices.retrieve(priceId);
            const valor = price.unit_amount != null ? (price.unit_amount / 100).toFixed(2) : '?';
            itens.push({
              chave: k,
              ok: price.active,
              detalhe: `${priceId}: ${price.currency.toUpperCase()} ${valor}${price.recurring ? ` / ${price.recurring.interval}` : ''}${price.active ? '' : ' (INATIVO)'}`,
            });
          } catch (err) {
            itens.push({ chave: k, ok: false, detalhe: `${priceId} não encontrado: ${(err as Error).message}` });
          }
        }
      } catch (err) {
        itens.push({ chave: 'STRIPE_SECRET_KEY', ok: false, detalhe: `Rejeitada pela API: ${(err as Error).message}` });
      }
      itens.push({
        chave: 'STRIPE_WEBHOOK_SECRET',
        ok: !!get('STRIPE_WEBHOOK_SECRET'),
        detalhe: get('STRIPE_WEBHOOK_SECRET')
          ? 'Configurado.'
          : 'Não configurado — pagamentos com cartão não ativam a assinatura automaticamente.',
      });
    }

    for (const cycle of ['monthly', 'annual'] as const) {
      const k = cycle === 'annual' ? 'PLANO_EMPRESARIAL_VALOR_ANUAL' : 'PLANO_EMPRESARIAL_VALOR_MENSAL';
      itens.push({
        chave: k,
        ok: true,
        detalhe: `${PLANO_NOME} ${cycle === 'annual' ? 'anual' : 'mensal'}: R$ ${this.valorPlano(cycle).toFixed(2).replace('.', ',')}` +
          (get(k) ? '' : ' (valor padrão — variável não configurada)'),
      });
    }

    itens.push({
      chave: 'APP_URL',
      ok: !!get('APP_URL'),
      detalhe: get('APP_URL') ?? 'Não configurado — usando https://meugasto.vercel.app nos retornos do Stripe.',
    });

    return itens;
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
