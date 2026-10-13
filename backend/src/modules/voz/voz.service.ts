import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Category, CategoryDocument } from '../categories/schemas/category.schema';
import { Wallet, WalletDocument } from '../wallets/schemas/wallet.schema';
import { TransactionsService } from '../transactions/transactions.service';
import { TransactionType } from '../transactions/schemas/transaction.schema';
import { CartoesService } from '../cartoes/cartoes.service';
import { WalletsService } from '../wallets/wallets.service';
import { GroqClient } from './groq.client';
import { ConfirmarVozDto, LancamentoVozDto, TipoLancamentoVoz } from './dto/confirmar-voz.dto';

// Nada aqui é persistido: é o rascunho que o usuário revisa/edita antes de confirmar.
export interface RascunhoVoz {
  type: TipoLancamentoVoz;
  value: number | null;
  description: string;
  date: string;
  categoryId: string | null;
  carteiraId: string | null;
  carteiraDestinoId: string | null;
  parcelas: number;
}

export interface ResultadoInterpretacao {
  transcricao: string;
  itens: RascunhoVoz[];
}

export type ResultadoConfirmacao =
  | { indice: number; ok: true; avisoLimite?: unknown }
  | { indice: number; ok: false; mensagem: string; limiteExcedido?: boolean };

interface ContextoUsuario {
  hoje: string;
  categorias: Array<{ ref: string; id: string; nome: string; isIncome: boolean }>;
  carteiras: Array<{ ref: string; id: string; nome: string; tipo: Wallet['tipo'] }>;
  carteiraPadraoId: string | null;
}

const MAX_ITENS = 30;
const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const ROTULO_TIPO_CARTEIRA: Record<Wallet['tipo'], string> = {
  conta: 'conta bancária',
  dinheiro: 'dinheiro em espécie',
  credito: 'cartão de crédito',
};
const TIPO_POR_PALAVRA: Record<string, TipoLancamentoVoz> = {
  gasto: 'EXPENSE',
  ganho: 'INCOME',
  transferencia: 'TRANSFER',
};

function hojeEmSaoPaulo(): string {
  // en-CA formata como YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

export function isDataValida(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const d = new Date(`${valor}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
}

function normalizarValor(valor: unknown): number | null {
  const n = typeof valor === 'string' ? Number(valor.replace(',', '.')) : Number(valor);
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000_000) return null;
  return Math.round(n * 100) / 100;
}

function normalizarDescricao(valor: unknown): string {
  if (typeof valor !== 'string') return '';
  const limpo = valor.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200);
  return limpo.charAt(0).toUpperCase() + limpo.slice(1);
}

@Injectable()
export class VozService {
  constructor(
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
    @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
    private readonly groq: GroqClient,
    private readonly transactionsService: TransactionsService,
    private readonly cartoesService: CartoesService,
    private readonly walletsService: WalletsService,
  ) {}

  async interpretar(
    userId: string,
    entrada: { audio?: { buffer: Buffer; mimetype: string }; texto?: string; carteiraPadraoId?: string; hoje?: string },
  ): Promise<ResultadoInterpretacao> {
    const textoDigitado = entrada.texto?.trim();
    if (!entrada.audio && !textoDigitado) {
      throw new BadRequestException('Envie um áudio ou um texto para interpretar.');
    }

    const ctx = await this.carregarContexto(userId, entrada.carteiraPadraoId, entrada.hoje);

    const transcricao = entrada.audio
      ? await this.groq.transcrever(entrada.audio.buffer, entrada.audio.mimetype, this.montarDicasTranscricao(ctx))
      : textoDigitado!;

    if (!transcricao) {
      return { transcricao: '', itens: [] };
    }

    const resposta = await this.groq.completarJson(this.montarPromptSistema(ctx), transcricao);
    return { transcricao, itens: this.sanearResposta(resposta, ctx) };
  }

  /**
   * Salva os itens um a um, na ordem, reaproveitando os mesmos serviços das telas manuais —
   * assim saldo de carteira, meta vinculada, fatura/limite de cartão e parcelamento seguem
   * exatamente as regras de sempre. Sequencial de propósito: a avaliação de limite do
   * cartão de um item depende das compras anteriores do mesmo lote.
   *
   * Não é tudo-ou-nada: um item que falha (ex.: estoura limite do cartão) não impede os
   * outros; o frontend mantém só os que falharam na tela para corrigir e reenviar.
   */
  async confirmar(userId: string, dto: ConfirmarVozDto): Promise<{ resultados: ResultadoConfirmacao[] }> {
    const resultados: ResultadoConfirmacao[] = [];
    for (const [indice, item] of dto.itens.entries()) {
      try {
        const avisoLimite = await this.salvarItem(userId, item);
        resultados.push(avisoLimite ? { indice, ok: true, avisoLimite } : { indice, ok: true });
      } catch (err) {
        resultados.push({ indice, ok: false, ...this.descreverErro(err) });
      }
    }
    return { resultados };
  }

  private async salvarItem(userId: string, item: LancamentoVozDto): Promise<unknown> {
    const description = item.description?.trim() || undefined;

    if (item.type === 'TRANSFER') {
      if (!item.carteiraId || !item.carteiraDestinoId) {
        throw new BadRequestException('Escolha a carteira de origem e a de destino.');
      }
      await this.walletsService.transfer(userId, {
        carteiraOrigemId: item.carteiraId,
        carteiraDestinoId: item.carteiraDestinoId,
        value: item.value,
        description,
        date: item.date,
      });
      return null;
    }

    if (!item.carteiraId || !Types.ObjectId.isValid(item.carteiraId)) {
      throw new BadRequestException('Escolha a carteira ou cartão.');
    }
    if (item.type === 'EXPENSE' && !item.categoryId) {
      throw new BadRequestException('Escolha uma categoria para o gasto.');
    }

    const wallet = await this.walletModel
      .findOne({ _id: new Types.ObjectId(item.carteiraId), userId: new Types.ObjectId(userId) })
      .lean()
      .exec();
    if (!wallet) throw new BadRequestException('Carteira não encontrada.');

    const isCartao = wallet.tipo === 'credito';
    if (isCartao && item.type === 'INCOME') {
      throw new BadRequestException('Um ganho não pode entrar num cartão de crédito — escolha uma carteira.');
    }

    if (isCartao && (item.parcelas ?? 1) >= 2) {
      const parcelamento = await this.cartoesService.criarParcelamento(userId, {
        carteiraId: item.carteiraId,
        categoryId: item.categoryId,
        descricao: description ?? 'Compra parcelada',
        valorTotal: item.value,
        totalParcelas: item.parcelas!,
        dataCompra: item.date,
        confirmarMesmoAssim: item.confirmarMesmoAssim,
      });
      return (parcelamento as { avisoLimite?: unknown })?.avisoLimite ?? null;
    }

    const criada = await this.transactionsService.create(userId, {
      type: item.type === 'INCOME' ? TransactionType.INCOME : TransactionType.EXPENSE,
      value: item.value,
      categoryId: item.categoryId || undefined,
      carteiraId: item.carteiraId,
      description,
      date: item.date,
      confirmarMesmoAssim: isCartao ? item.confirmarMesmoAssim : undefined,
    });
    return (criada as { avisoLimite?: unknown })?.avisoLimite ?? null;
  }

  private descreverErro(err: unknown): { mensagem: string; limiteExcedido?: boolean } {
    if (err instanceof HttpException) {
      const resp = err.getResponse();
      const raw = typeof resp === 'string' ? resp : (resp as { message?: string | string[] }).message;
      const mensagem = Array.isArray(raw) ? raw.join(' ') : raw || err.message;
      const limiteExcedido =
        err.getStatus() === 409 && typeof resp === 'object' && resp !== null && 'limiteDisponivel' in resp;
      return limiteExcedido ? { mensagem, limiteExcedido } : { mensagem };
    }
    console.error('[voz] erro inesperado ao salvar lançamento', err);
    return { mensagem: 'Erro inesperado ao salvar este lançamento.' };
  }

  private async carregarContexto(userId: string, carteiraPadraoId?: string, hoje?: string): Promise<ContextoUsuario> {
    const userObjectId = new Types.ObjectId(userId);
    const [categorias, carteiras] = await Promise.all([
      this.categoryModel.find({ $or: [{ userId: userObjectId }, { userId: null }] }).sort({ name: 1 }).lean().exec(),
      this.walletModel
        .find({ userId: userObjectId, arquivadaEm: { $exists: false } })
        .sort({ createdAt: 1 })
        .lean()
        .exec(),
    ]);

    // Referências curtas (c1, w1...) em vez de ObjectIds: o modelo erra menos copiando
    // "c3" do que 24 caracteres hexadecimais, e gasta menos tokens da cota gratuita.
    const cats = categorias.map((c, i) => ({
      ref: `c${i + 1}`,
      id: String(c._id),
      nome: c.name,
      isIncome: Boolean(c.isIncome),
    }));
    const wallets = carteiras.map((w, i) => ({ ref: `w${i + 1}`, id: String(w._id), nome: w.nome, tipo: w.tipo }));

    let padrao = wallets.find((w) => w.id === carteiraPadraoId)?.id ?? null;
    if (!padrao) {
      const naoCartoes = wallets.filter((w) => w.tipo !== 'credito');
      if (naoCartoes.length === 1) padrao = naoCartoes[0].id;
    }

    return {
      hoje: isDataValida(hoje) ? hoje : hojeEmSaoPaulo(),
      categorias: cats,
      carteiras: wallets,
      carteiraPadraoId: padrao,
    };
  }

  private montarDicasTranscricao(ctx: ContextoUsuario): string {
    const nomes = [...ctx.carteiras.map((w) => w.nome), ...ctx.categorias.map((c) => c.nome)];
    return `Lançamentos financeiros em reais: gastei, paguei, recebi, transferi, Pix, parcelado. ${nomes.join(', ')}.`;
  }

  private montarPromptSistema(ctx: ContextoUsuario): string {
    const diaSemana = DIAS_SEMANA[new Date(`${ctx.hoje}T12:00:00Z`).getUTCDay()];
    const listar = (itens: Array<{ ref: string; nome: string }>) =>
      itens.map((i) => `${i.ref}=${i.nome}`).join('; ') || '(nenhuma)';

    return [
      'Você converte o que o usuário falou (português do Brasil, transcrito de áudio, pode ter erros de transcrição) em lançamentos financeiros estruturados.',
      `Hoje é ${ctx.hoje} (${diaSemana}).`,
      '',
      'Regras:',
      '- Uma fala pode conter VÁRIOS lançamentos. Gere um item para cada valor/movimentação distinta, na ordem em que foram ditos.',
      '- tipo: "gasto" (gastei, paguei, comprei, saiu, debitou, Pix para alguém), "ganho" (recebi, entrou, vendi, ganhei, caiu), "transferencia" (só quando move dinheiro ENTRE duas carteiras do próprio usuário, ex.: "passei 200 do Nubank para o dinheiro").',
      '- valor: número em reais com ponto decimal. "45 e 90" = 45.90; "mil e duzentos" = 1200; "1,5 mil" = 1500; "cinquenta conto" = 50; "duas pilas" = 2. Use null se o valor não foi dito.',
      '- data: YYYY-MM-DD. Sem menção = hoje. Resolva "ontem", "anteontem", "sexta passada", "semana passada", "dia 5" (dia 5 do mês atual; se ainda não chegou, do mês anterior).',
      '- descricao: curta (até 60 caracteres), o que foi comprado/recebido e de quem/onde. Sem o valor e sem a data.',
      '- categoria: o código da lista que melhor se encaixa, respeitando gasto x ganho. null se nenhuma servir.',
      '- carteira: código só se a fala mencionar a conta, cartão ou forma de pagamento ("no Nubank", "no cartão do Inter", "em dinheiro", "no crédito"). Senão null. Em transferencia: carteira = origem e carteiraDestino = destino.',
      '- parcelas: número de parcelas se disser "em 10x", "parcelado em 3 vezes"; senão 1. O valor é sempre o TOTAL da compra (se disser "10x de 50", valor = 500).',
      '- Ignore hesitações e repetições. Em correções ("foi 40, não, 50") use o valor final.',
      '',
      `Categorias de GASTO: ${listar(ctx.categorias.filter((c) => !c.isIncome))}`,
      `Categorias de GANHO: ${listar(ctx.categorias.filter((c) => c.isIncome))}`,
      `Carteiras e cartões: ${ctx.carteiras.map((w) => `${w.ref}=${w.nome} (${ROTULO_TIPO_CARTEIRA[w.tipo] ?? w.tipo})`).join('; ') || '(nenhuma)'}`,
      '',
      'Responda APENAS com JSON neste formato:',
      '{"lancamentos":[{"tipo":"gasto","valor":45.9,"descricao":"Mercado","data":"2026-01-31","categoria":"c1","carteira":null,"carteiraDestino":null,"parcelas":1}]}',
      'Se nada do que foi dito for um lançamento financeiro, responda {"lancamentos":[]}.',
    ].join('\n');
  }

  // A IA é tratada como entrada não confiável: cada campo é revalidado contra os dados reais
  // do usuário. Referência inexistente, tipo incoerente ou data inválida viram null/padrão
  // para o usuário completar na revisão — nunca um ID inventado.
  private sanearResposta(resposta: unknown, ctx: ContextoUsuario): RascunhoVoz[] {
    const brutos = (resposta as { lancamentos?: unknown })?.lancamentos;
    if (!Array.isArray(brutos)) return [];

    const catPorRef = new Map(ctx.categorias.map((c) => [c.ref, c]));
    const walletPorRef = new Map(ctx.carteiras.map((w) => [w.ref, w]));
    const walletPorId = new Map(ctx.carteiras.map((w) => [w.id, w]));

    return brutos.slice(0, MAX_ITENS).flatMap((bruto): RascunhoVoz[] => {
      if (typeof bruto !== 'object' || bruto === null) return [];
      const b = bruto as Record<string, unknown>;

      const type = TIPO_POR_PALAVRA[String(b.tipo ?? '').toLowerCase()] ?? 'EXPENSE';
      const value = normalizarValor(b.valor);
      const description = normalizarDescricao(b.descricao);
      // Item sem valor e sem descrição é ruído da transcrição, não um lançamento.
      if (value === null && !description) return [];

      const categoria = catPorRef.get(String(b.categoria ?? ''));
      const categoriaCoerente =
        type !== 'TRANSFER' && categoria && categoria.isIncome === (type === 'INCOME') ? categoria.id : null;

      let carteiraId = walletPorRef.get(String(b.carteira ?? ''))?.id ?? null;
      let carteiraDestinoId: string | null = null;
      if (type === 'TRANSFER') {
        carteiraDestinoId = walletPorRef.get(String(b.carteiraDestino ?? ''))?.id ?? null;
      } else {
        if (type === 'INCOME' && carteiraId && walletPorId.get(carteiraId)?.tipo === 'credito') carteiraId = null;
        if (!carteiraId) {
          const padrao = ctx.carteiraPadraoId ? walletPorId.get(ctx.carteiraPadraoId) : undefined;
          carteiraId = padrao && !(type === 'INCOME' && padrao.tipo === 'credito') ? padrao.id : null;
        }
      }

      const ehCompraNoCartao = type === 'EXPENSE' && carteiraId !== null && walletPorId.get(carteiraId)?.tipo === 'credito';
      const parcelasBrutas = Math.trunc(Number(b.parcelas));
      const parcelas = ehCompraNoCartao && parcelasBrutas >= 2 ? Math.min(parcelasBrutas, 48) : 1;

      return [
        {
          type,
          value,
          description,
          date: isDataValida(b.data) ? b.data : ctx.hoje,
          categoryId: categoriaCoerente,
          carteiraId,
          carteiraDestinoId,
          parcelas,
        },
      ];
    });
  }
}
