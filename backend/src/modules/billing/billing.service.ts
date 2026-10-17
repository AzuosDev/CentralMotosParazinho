import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { BillingConfig, BillingConfigDocument } from './schemas/billing-config.schema';

export interface PixData {
  id: string;
  qrCodeImage: string;
  copiaECola: string;
  expiracao: string;
}

interface CheckoutResult {
  method: 'pix';
  pixData: PixData;
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
  origem: 'pix';
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

const DIA_MS = 24 * 60 * 60 * 1000;

// Plano único do sistema, pago só por PIX. O preço é definido pelo admin no Painel Admin:
// um padrão para todos (BillingConfig) e, opcionalmente, um preço próprio por cliente
// (User.valor*Personalizado). Sem nada configurado, cai nas variáveis
// PLANO_EMPRESARIAL_VALOR_* e, por fim, nos valores antigos abaixo.
export const PLANO = 'empresarial';
export const PLANO_NOME = 'Plano Empresarial';
const VALOR_PADRAO = { monthly: 29.9, annual: 299.9 };
const CONFIG_PLANO = 'plano';

export interface Precos {
  valorMensal: number;
  valorAnual: number;
}

export interface PlanoInfo extends Precos {
  id: string;
  nome: string;
  // true quando o cliente tem preço próprio definido pelo admin.
  personalizado: boolean;
}

type Cycle = 'monthly' | 'annual';

function arredonda(v: number) {
  return Math.round(v * 100) / 100;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(BillingConfig.name) private billingConfigModel: Model<BillingConfigDocument>,
    private configService: ConfigService,
  ) {}

  // Se o PIX está disponível e quanto ESTE usuário paga (preço próprio ou o padrão).
  async getConfigStatus(userId: string): Promise<{ pix: boolean; plano: PlanoInfo }> {
    const { precos, personalizado } = await this.precosDoUsuario(userId);
    return {
      pix: !!this.configService.get<string>('ASAAS_API_KEY'),
      plano: { id: PLANO, nome: PLANO_NOME, ...precos, personalizado },
    };
  }

  private precoEnv(cycle: Cycle): number {
    const raw = this.configService.get<string>(
      cycle === 'annual' ? 'PLANO_EMPRESARIAL_VALOR_ANUAL' : 'PLANO_EMPRESARIAL_VALOR_MENSAL',
    );
    const valor = raw ? Number(raw.replace(',', '.')) : NaN;
    return Number.isFinite(valor) && valor > 0 ? arredonda(valor) : VALOR_PADRAO[cycle];
  }

  // Preço padrão do plano (o que o admin definiu; sem definição, variável de ambiente/padrão).
  async precosPadrao(): Promise<Precos & { definidoPeloAdmin: boolean }> {
    const cfg = await this.billingConfigModel.findOne({ chave: CONFIG_PLANO }).lean().exec();
    if (cfg) return { valorMensal: cfg.valorMensal, valorAnual: cfg.valorAnual, definidoPeloAdmin: true };
    return { valorMensal: this.precoEnv('monthly'), valorAnual: this.precoEnv('annual'), definidoPeloAdmin: false };
  }

  async definirPrecosPadrao(precos: Precos): Promise<Precos & { definidoPeloAdmin: boolean }> {
    const set = { valorMensal: arredonda(precos.valorMensal), valorAnual: arredonda(precos.valorAnual) };
    await this.billingConfigModel
      .updateOne({ chave: CONFIG_PLANO }, { $set: set }, { upsert: true })
      .exec();
    return { ...set, definidoPeloAdmin: true };
  }

  async precosDoUsuario(userId: string): Promise<{ precos: Precos; personalizado: boolean }> {
    const [padrao, user] = await Promise.all([
      this.precosPadrao(),
      this.userModel.findById(userId).select('valorMensalPersonalizado valorAnualPersonalizado').lean().exec(),
    ]);
    const mensal = user?.valorMensalPersonalizado ?? null;
    const anual = user?.valorAnualPersonalizado ?? null;
    return {
      precos: { valorMensal: mensal ?? padrao.valorMensal, valorAnual: anual ?? padrao.valorAnual },
      personalizado: mensal != null || anual != null,
    };
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

    if (!this.configService.get<string>('ASAAS_API_KEY')) {
      throw new BadRequestException('Pagamento via PIX indisponível no momento');
    }
    return this.createAsaasPixCheckout(user, dto);
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

    const { precos } = await this.precosDoUsuario(user._id.toString());
    const value = dto.cycle === 'annual' ? precos.valorAnual : precos.valorMensal;
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

  // Cobranças PIX (Asaas) do usuário, mais recentes primeiro. Se o Asaas estiver fora do ar
  // o erro só é logado e a lista vem vazia, sem derrubar a tela de Configurações.
  async listarFaturas(userId: string): Promise<FaturaAssinatura[]> {
    const user = await this.userModel.findById(userId).select('asaasCustomerId').lean().exec();
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

    const padrao = await this.precosPadrao();
    const fmt = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
    itens.push({
      chave: 'Preço padrão do plano',
      ok: padrao.definidoPeloAdmin,
      detalhe: `${PLANO_NOME}: ${fmt(padrao.valorMensal)}/mês · ${fmt(padrao.valorAnual)}/ano` +
        (padrao.definidoPeloAdmin ? '' : ' — ainda não definido pelo admin (usando valor padrão).'),
    });

    return itens;
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
