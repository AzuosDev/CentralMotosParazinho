import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Category, CategoryDocument } from '../categories/schemas/category.schema';
import { Wallet, WalletDocument } from '../wallets/schemas/wallet.schema';
import { Moto, MotoDocument } from '../motos/schemas/moto.schema';
import { TransactionsService } from '../transactions/transactions.service';
import { TransactionType } from '../transactions/schemas/transaction.schema';
import { CartoesService } from '../cartoes/cartoes.service';
import { WalletsService } from '../wallets/wallets.service';
import { GroqClient } from './groq.client';
import { ConfirmarVozDto, LancamentoVozDto, TipoLancamentoVoz } from './dto/confirmar-voz.dto';

// Forma de pagamento citada na fala, independente de qual carteira a IA escolheu — é o que
// permite acertar "em espécie" mesmo quando o nome da carteira não lembra dinheiro, e avisar
// o usuário quando ele não tem carteira daquele tipo.
export type FormaPagamentoVoz = 'dinheiro' | 'credito';

// Para onde vai um gasto: o custo de uma moto do estoque ou as despesas gerais. null = a fala
// não deixou claro, e o usuário escolhe na revisão. Só existe em gasto (ganho e transferência
// não entram no custo de moto nenhuma).
export type DestinoGastoVoz = 'moto' | 'geral';

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
  formaPagamento: FormaPagamentoVoz | null;
  destino: DestinoGastoVoz | null;
  motoId: string | null;
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
  motos: Array<{ ref: string; id: string; descricao: string; modelo: string }>;
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
const NOME_DE_DINHEIRO_FISICO = /\b(dinheiro|esp[eé]cie|cash|bolso|f[ií]sic[oa])\b/i;
const DESTINO_POR_PALAVRA: Record<string, DestinoGastoVoz> = {
  moto: 'moto',
  geral: 'geral',
};
const FORMA_POR_PALAVRA: Record<string, FormaPagamentoVoz> = {
  dinheiro: 'dinheiro',
  credito: 'credito',
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
    @InjectModel(Moto.name) private motoModel: Model<MotoDocument>,
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

    const motoId = item.type === 'EXPENSE' && item.motoId ? item.motoId : undefined;

    if (isCartao && (item.parcelas ?? 1) >= 2) {
      // Parcelamento não guarda motoId (cada parcela nasce dentro do CartoesService) — a
      // revisão já avisa e o frontend nem envia; recusar evita sumir com o vínculo calado.
      if (motoId) {
        throw new BadRequestException(
          'Compra parcelada não guarda o vínculo com a moto. Lance à vista ou marque como gasto geral.',
        );
      }
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
      // TransactionsService#create checa a posse da moto (moto de outro usuário é erro).
      motoId,
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
    const [categorias, carteiras, motos] = await Promise.all([
      this.categoryModel.find({ $or: [{ userId: userObjectId }, { userId: null }] }).sort({ name: 1 }).lean().exec(),
      this.walletModel
        .find({ userId: userObjectId, arquivadaEm: { $exists: false } })
        .sort({ createdAt: 1 })
        .lean()
        .exec(),
      // Só o pátio: gasto novo é de moto que ainda está lá (mesma regra do MotoField).
      this.motoModel.find({ userId: userObjectId, status: 'em_estoque' }).sort({ dataCompra: 1 }).lean().exec(),
    ]);

    // Referências curtas (c1, w1...) em vez de ObjectIds: o modelo erra menos copiando
    // "c3" do que 24 caracteres hexadecimais, e gasta menos tokens da cota gratuita.
    const cats = categorias.map((c, i) => ({
      ref: `c${i + 1}`,
      id: String(c._id),
      nome: c.name,
      isIncome: Boolean(c.isIncome),
    }));
    // O formulário de "Nova Carteira" não pergunta o tipo (tudo nasce 'conta'), então quem
    // cria uma carteira "Dinheiro" ou "Bolso" para o dinheiro físico a tem como conta. Para a
    // voz, o nome basta para tratá-la como dinheiro em espécie.
    const wallets = carteiras.map((w, i) => ({
      ref: `w${i + 1}`,
      id: String(w._id),
      nome: w.nome,
      tipo: w.tipo === 'conta' && NOME_DE_DINHEIRO_FISICO.test(w.nome) ? ('dinheiro' as const) : w.tipo,
    }));

    const motosCtx = motos.map((m, i) => ({
      ref: `m${i + 1}`,
      id: String(m._id),
      modelo: m.modelo,
      descricao: [m.modelo, m.ano, m.cor, `placa ${m.placa}`].filter(Boolean).join(' '),
    }));

    let padrao = wallets.find((w) => w.id === carteiraPadraoId)?.id ?? null;
    if (!padrao) {
      const naoCartoes = wallets.filter((w) => w.tipo !== 'credito');
      if (naoCartoes.length === 1) padrao = naoCartoes[0].id;
    }

    return {
      hoje: isDataValida(hoje) ? hoje : hojeEmSaoPaulo(),
      categorias: cats,
      carteiras: wallets,
      motos: motosCtx,
      carteiraPadraoId: padrao,
    };
  }

  private montarDicasTranscricao(ctx: ContextoUsuario): string {
    const nomes = [
      ...ctx.carteiras.map((w) => w.nome),
      ...ctx.categorias.map((c) => c.nome),
      ...new Set(ctx.motos.map((m) => m.modelo)),
    ];
    return `Lançamentos financeiros em reais: gastei, paguei, recebi, transferi, Pix, parcelado, em espécie, em dinheiro, no débito, no crédito, moto, peça, oficina. ${nomes.join(', ')}.`;
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
      '- carteira: código só se a fala mencionar a conta, cartão ou forma de pagamento ("no Nubank", "no cartão do Inter", "em dinheiro", "no crédito"). Senão null. Em transferencia: carteira = origem e carteiraDestino = destino. Cada lançamento usa a carteira dita PARA ELE — não copie a carteira de um lançamento para o outro.',
      '- "em espécie", "em dinheiro", "dinheiro vivo", "cash", "na mão" = a carteira do tipo "dinheiro em espécie". Se não existir nenhuma desse tipo, carteira = null (NUNCA use uma conta bancária no lugar).',
      '- pagamento: "dinheiro" se a fala disser que foi em espécie/dinheiro vivo; "credito" se disser crédito/cartão de crédito; senão null. Preencha mesmo que nenhuma carteira combine.',
      '- parcelas: número de parcelas se disser "em 10x", "parcelado em 3 vezes"; senão 1. O valor é sempre o TOTAL da compra (se disser "10x de 50", valor = 500).',
      ...(ctx.motos.length > 0
        ? [
            '- O usuário revende motos. Todo GASTO tem um destino: "moto" (gasto com uma moto do estoque: peça, pneu, óleo, revisão, mecânico, oficina, funilaria, pintura, lavagem, documentação, DETRAN, vistoria, transferência de documento, IPVA, licenciamento, multa, frete/guincho da moto, ou quando cita modelo/placa/cor de uma moto) ou "geral" (despesa que não é de moto nenhuma: almoço, mercado, luz, aluguel, internet, Uber, salário etc.).',
            '- destino = null quando a fala não permite saber (ex.: "gastei 20 reais da Nubank", "paguei 50 no Pix"). NÃO chute: na dúvida, null — o usuário escolhe depois.',
            '- moto: o código da lista de motos SÓ se a fala identificar UMA moto (modelo, placa, cor, ano). Se combinar com mais de uma ou não disser qual, null. Se moto != null, destino = "moto". Em ganho e transferência, destino e moto = null.',
          ]
        : []),
      '- Ignore hesitações e repetições. Em correções ("foi 40, não, 50") use o valor final.',
      '',
      `Categorias de GASTO: ${listar(ctx.categorias.filter((c) => !c.isIncome))}`,
      `Categorias de GANHO: ${listar(ctx.categorias.filter((c) => c.isIncome))}`,
      ...(ctx.motos.length > 0 ? [`Motos em estoque: ${ctx.motos.map((m) => `${m.ref}=${m.descricao}`).join('; ')}`] : []),
      `Carteiras e cartões: ${ctx.carteiras.map((w) => `${w.ref}=${w.nome} (${ROTULO_TIPO_CARTEIRA[w.tipo] ?? w.tipo})`).join('; ') || '(nenhuma)'}`,
      '',
      'Responda APENAS com JSON neste formato:',
      `{"lancamentos":[{"tipo":"gasto","valor":45.9,"descricao":"Mercado","data":"2026-01-31","categoria":"c1","carteira":null,"carteiraDestino":null,"parcelas":1,"pagamento":null${ctx.motos.length > 0 ? ',"destino":"geral","moto":null' : ''}}]}`,
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
    const motoPorRef = new Map(ctx.motos.map((m) => [m.ref, m]));
    // Só dá para deduzir a carteira pela forma de pagamento quando há exatamente uma daquele tipo.
    const unicaDoTipo = (tipo: Wallet['tipo']) => {
      const doTipo = ctx.carteiras.filter((w) => w.tipo === tipo);
      return doTipo.length === 1 ? doTipo[0].id : null;
    };

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

      let formaPagamento: FormaPagamentoVoz | null =
        type === 'TRANSFER' ? null : FORMA_POR_PALAVRA[String(b.pagamento ?? '').toLowerCase()] ?? null;
      if (type === 'INCOME' && formaPagamento === 'credito') formaPagamento = null;

      let carteiraId = walletPorRef.get(String(b.carteira ?? ''))?.id ?? null;
      let carteiraDestinoId: string | null = null;
      if (type === 'TRANSFER') {
        carteiraDestinoId = walletPorRef.get(String(b.carteiraDestino ?? ''))?.id ?? null;
      } else {
        if (type === 'INCOME' && carteiraId && walletPorId.get(carteiraId)?.tipo === 'credito') carteiraId = null;
        // A forma de pagamento dita manda: "20 em espécie" nunca cai numa conta bancária,
        // mesmo que a IA tenha escolhido uma ou que haja carteira padrão.
        if (formaPagamento && carteiraId && walletPorId.get(carteiraId)?.tipo !== formaPagamento) carteiraId = null;
        if (formaPagamento && !carteiraId) carteiraId = unicaDoTipo(formaPagamento);
        if (!carteiraId && !formaPagamento) {
          const padrao = ctx.carteiraPadraoId ? walletPorId.get(ctx.carteiraPadraoId) : undefined;
          carteiraId = padrao && !(type === 'INCOME' && padrao.tipo === 'credito') ? padrao.id : null;
        }
      }

      // Sem moto em estoque não há o que perguntar: todo gasto é geral.
      let destino: DestinoGastoVoz | null = null;
      let motoId: string | null = null;
      if (type === 'EXPENSE') {
        motoId = motoPorRef.get(String(b.moto ?? ''))?.id ?? null;
        if (ctx.motos.length === 0) destino = 'geral';
        else if (motoId) destino = 'moto';
        else destino = DESTINO_POR_PALAVRA[String(b.destino ?? '').toLowerCase()] ?? null;
        // Uma moto só no pátio: "gasto de moto" só pode ser dela.
        if (destino === 'moto' && !motoId && ctx.motos.length === 1) motoId = ctx.motos[0].id;
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
          formaPagamento,
          destino,
          motoId,
        },
      ];
    });
  }
}
