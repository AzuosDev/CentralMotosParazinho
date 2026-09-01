import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Wallet, WalletDocument } from '../wallets/schemas/wallet.schema';
import { Fatura, FaturaDocument } from './schemas/fatura.schema';
import { Parcelamento, ParcelamentoDocument } from './schemas/parcelamento.schema';
import { Transaction, TransactionDocument, TransactionType } from '../transactions/schemas/transaction.schema';
import { PendingAccount, PendingAccountDocument } from '../pending/schemas/pending-account.schema';
import { Category, CategoryDocument } from '../categories/schemas/category.schema';
import { Goal, GoalDocument } from '../goals/schemas/goal.schema';
import { CreateParcelamentoDto } from './dto/create-parcelamento.dto';
import { PagarFaturaDto } from './dto/pagar-fatura.dto';
import { VincularContaPendenteDto } from './dto/vincular-conta-pendente.dto';

@Injectable()
export class CartoesService {
  constructor(
    @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
    @InjectModel(Fatura.name) private faturaModel: Model<FaturaDocument>,
    @InjectModel(Parcelamento.name) private parcelamentoModel: Model<ParcelamentoDocument>,
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
    @InjectModel(PendingAccount.name) private pendingModel: Model<PendingAccountDocument>,
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
    @InjectModel(Goal.name) private goalModel: Model<GoalDocument>,
  ) {}

  private toObjectId(value: string, fieldName: string) {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`${fieldName} must be a valid ObjectId`);
    }
    return new Types.ObjectId(value);
  }

  private daysInMonthUtc(year: number, month: number) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  // Mesmo padrão (setMonth local, não UTC) de pending.service.ts#addMonths — reaproveitado
  // por consistência, embora misture local/UTC como o original.
  private addMonths(date: Date, months: number) {
    const nextDate = new Date(date);
    nextDate.setMonth(nextDate.getMonth() + months);
    return nextDate;
  }

  private async incrementLinkedGoal(userId: Types.ObjectId, categoryId: Types.ObjectId, amount: number) {
    const goal = await this.goalModel.findOne({ userId, linkedCategoryId: categoryId }).exec();
    if (!goal) return;
    goal.currentValue = Math.max(0, goal.currentValue + amount);
    goal.completed = goal.currentValue >= goal.targetValue;
    await goal.save();
  }

  private async decrementLinkedGoal(userId: Types.ObjectId, categoryId: Types.ObjectId, amount: number) {
    const goal = await this.goalModel.findOne({ userId, linkedCategoryId: categoryId }).exec();
    if (!goal) return;
    goal.currentValue = Math.max(0, goal.currentValue - amount);
    goal.completed = goal.currentValue >= goal.targetValue;
    await goal.save();
  }

  // Regra padrão de cartão: compra depois do dia de fechamento cai no ciclo seguinte.
  // Vencimento no mesmo mês do fechamento se diaVencimento > diaFechamento, senão mês seguinte.
  private resolverCicloFatura(wallet: WalletDocument, dataCompra: Date) {
    const D = wallet.diaFechamento!;
    const V = wallet.diaVencimento!;
    const day = dataCompra.getUTCDate();

    let closingYear = dataCompra.getUTCFullYear();
    let closingMonth = dataCompra.getUTCMonth() + 1;
    if (day > D) {
      closingMonth += 1;
      if (closingMonth > 12) { closingMonth = 1; closingYear += 1; }
    }
    const fechamentoDay = Math.min(D, this.daysInMonthUtc(closingYear, closingMonth));
    const dataFechamento = new Date(Date.UTC(closingYear, closingMonth - 1, fechamentoDay, 23, 59, 59, 999));

    let vencMonth = closingMonth;
    let vencYear = closingYear;
    if (V <= D) {
      vencMonth += 1;
      if (vencMonth > 12) { vencMonth = 1; vencYear += 1; }
    }
    const vencDay = Math.min(V, this.daysInMonthUtc(vencYear, vencMonth));
    const dataVencimento = new Date(Date.UTC(vencYear, vencMonth - 1, vencDay));

    let inicioMonth = closingMonth - 1;
    let inicioYear = closingYear;
    if (inicioMonth < 1) { inicioMonth = 12; inicioYear -= 1; }
    const inicioFechamentoDay = Math.min(D, this.daysInMonthUtc(inicioYear, inicioMonth));
    const dataInicio = new Date(Date.UTC(inicioYear, inicioMonth - 1, inicioFechamentoDay + 1));

    const mesReferencia = `${closingYear}-${String(closingMonth).padStart(2, '0')}`;

    return { mesReferencia, dataInicio, dataFechamento, dataVencimento };
  }

  // Cria (lazy) a fatura do ciclo que contém dataCompra, e a PendingAccount que a
  // representa — uma por ciclo, criada na 1ª compra, valor crescendo a cada nova compra.
  async resolverFaturaParaCompra(userId: Types.ObjectId, wallet: WalletDocument, dataCompra: Date): Promise<FaturaDocument> {
    if (typeof wallet.diaFechamento !== 'number' || typeof wallet.diaVencimento !== 'number') {
      throw new BadRequestException(
        'Configure o dia de fechamento e o dia de vencimento do cartão antes de lançar compras.',
      );
    }
    const ciclo = this.resolverCicloFatura(wallet, dataCompra);
    const existente = await this.faturaModel
      .findOne({ userId, carteiraId: wallet._id, mesReferencia: ciclo.mesReferencia })
      .exec();
    if (existente) return existente;

    const fatura = await this.faturaModel.create({
      userId,
      carteiraId: wallet._id,
      ...ciclo,
      valorTotal: 0,
      valorPago: 0,
      status: 'aberta',
      saldoRotativoAnterior: 0,
      jurosAplicados: 0,
    });

    const pending = await this.pendingModel.create({
      userId,
      title: `Fatura ${wallet.nome}`,
      value: 0.01,
      dueDate: ciclo.dataVencimento,
      paid: false,
      isParcelada: false,
      isRecorrente: false,
      tipo: 'PAGAR',
      categoria: 'Cartão de Crédito',
      faturaId: fatura._id,
    });

    fatura.pendingAccountId = pending._id as Types.ObjectId;
    await fatura.save();
    return fatura;
  }

  // Soma (valorTotal - valorPago) de todas as faturas não quitadas do cartão. Como o
  // parcelamento já cria (lazy) as faturas futuras com as parcelas comprometidas, isso já
  // cobre "parcelas futuras já comprometidas" sem lógica extra.
  async calcularLimiteUsado(userId: Types.ObjectId, carteiraId: Types.ObjectId): Promise<number> {
    const faturas = await this.faturaModel.find({ userId, carteiraId, status: { $ne: 'paga' } }).exec();
    const total = faturas.reduce((sum, f) => sum + (f.valorTotal - f.valorPago), 0);
    return Math.max(0, Number(total.toFixed(2)));
  }

  async checkLimite(userId: Types.ObjectId, wallet: WalletDocument, valorNovo: number, confirmarMesmoAssim?: boolean): Promise<void> {
    if (typeof wallet.limite !== 'number') return;
    const limiteUsadoAtual = await this.calcularLimiteUsado(userId, wallet._id as Types.ObjectId);
    const novoUsado = limiteUsadoAtual + valorNovo;
    if (novoUsado > wallet.limite && !confirmarMesmoAssim) {
      throw new ConflictException({
        message: 'Esta compra ultrapassa o limite disponível do cartão.',
        limite: wallet.limite,
        limiteUsado: limiteUsadoAtual,
        limiteDisponivel: Math.max(0, Number((wallet.limite - limiteUsadoAtual).toFixed(2))),
      });
    }
  }

  // Recalcula valorTotal por agregação sobre as Transactions da fatura (nunca via $inc, para
  // não dar drift) e mantém PendingAccount.value = valorTotal + saldoRotativoAnterior em dia.
  async recomputeValorTotal(faturaId: Types.ObjectId): Promise<FaturaDocument | null> {
    const fatura = await this.faturaModel.findById(faturaId).exec();
    if (!fatura) return null;

    const agg = await this.transactionModel.aggregate([
      { $match: { faturaId: fatura._id, type: TransactionType.EXPENSE } },
      {
        $group: {
          _id: null,
          total: { $sum: { $cond: ['$isEstorno', { $multiply: ['$value', -1] }, '$value'] } },
        },
      },
    ]);
    fatura.valorTotal = Number((agg[0]?.total ?? 0).toFixed(2));
    await fatura.save();

    if (fatura.pendingAccountId) {
      const valorDevido = Math.max(0.01, Number((fatura.valorTotal + fatura.saldoRotativoAnterior).toFixed(2)));
      await this.pendingModel.findByIdAndUpdate(fatura.pendingAccountId, { $set: { value: valorDevido } }).exec();
    }

    return fatura;
  }

  // Chamado por TransactionsService.create() quando carteiraId aponta para um cartão.
  // Só resolve a fatura e valida limite — quem persiste a Transaction é TransactionsService,
  // que então chama recomputeValorTotal() para refletir a nova compra.
  async registrarCompra(
    userId: Types.ObjectId,
    wallet: WalletDocument,
    params: { type: TransactionType; value: number; date: Date; confirmarMesmoAssim?: boolean },
  ): Promise<{ faturaId: Types.ObjectId }> {
    if (params.type !== TransactionType.EXPENSE) {
      throw new BadRequestException('Carteira de cartão de crédito só aceita transações do tipo despesa.');
    }
    const fatura = await this.resolverFaturaParaCompra(userId, wallet, params.date);
    await this.checkLimite(userId, wallet, params.value, params.confirmarMesmoAssim);
    return { faturaId: fatura._id as Types.ObjectId };
  }

  async criarParcelamento(userId: string, dto: CreateParcelamentoDto) {
    const userObjectId = this.toObjectId(userId, 'userId');
    const walletObjectId = this.toObjectId(dto.carteiraId, 'carteiraId');
    const wallet = await this.walletModel.findOne({ _id: walletObjectId, userId: userObjectId, tipo: 'credito' }).exec();
    if (!wallet) throw new NotFoundException('Cartão não encontrado');

    let categoryObjectId: Types.ObjectId | undefined;
    if (dto.categoryId) {
      categoryObjectId = this.toObjectId(dto.categoryId, 'categoryId');
      const valid = await this.categoryModel
        .findOne({ _id: categoryObjectId, $or: [{ userId: null }, { userId: userObjectId }] })
        .exec();
      if (!valid) throw new BadRequestException('Invalid category for this user');
    }

    await this.checkLimite(userObjectId, wallet, dto.valorTotal, dto.confirmarMesmoAssim);

    const dataCompra = new Date(dto.dataCompra);
    const valorParcelaBase = Math.floor((dto.valorTotal / dto.totalParcelas) * 100) / 100;
    const somaBase = Number((valorParcelaBase * dto.totalParcelas).toFixed(2));
    const resto = Number((dto.valorTotal - somaBase).toFixed(2));

    const parcelamento = await this.parcelamentoModel.create({
      userId: userObjectId,
      carteiraId: wallet._id,
      categoryId: categoryObjectId,
      descricao: dto.descricao,
      valorTotal: dto.valorTotal,
      totalParcelas: dto.totalParcelas,
      dataCompra,
    });

    const todayStr = new Date().toISOString().slice(0, 10);
    const faturaIdsAfetadas = new Set<string>();
    const transacoesCriadas: TransactionDocument[] = [];

    for (let i = 0; i < dto.totalParcelas; i++) {
      const data = i === 0 ? dataCompra : this.addMonths(dataCompra, i);
      const fatura = await this.resolverFaturaParaCompra(userObjectId, wallet, data);
      const valor = i === 0 ? Number((valorParcelaBase + resto).toFixed(2)) : valorParcelaBase;
      const agendado = data.toISOString().slice(0, 10) > todayStr;

      const tx = await this.transactionModel.create({
        userId: userObjectId,
        type: TransactionType.EXPENSE,
        value: valor,
        categoryId: categoryObjectId,
        description: dto.descricao,
        date: data,
        carteiraId: wallet._id,
        agendado,
        faturaId: fatura._id,
        parcelamentoId: parcelamento._id,
        numeroParcela: i + 1,
        totalParcelas: dto.totalParcelas,
      });
      transacoesCriadas.push(tx);
      faturaIdsAfetadas.add((fatura._id as Types.ObjectId).toString());

      if (!agendado && categoryObjectId) {
        await this.incrementLinkedGoal(userObjectId, categoryObjectId, valor);
      }
    }

    for (const fid of faturaIdsAfetadas) {
      await this.recomputeValorTotal(new Types.ObjectId(fid));
    }

    return { parcelamento, transacoes: transacoesCriadas };
  }

  async pagar(userId: string, cartaoId: string, faturaId: string, dto: PagarFaturaDto) {
    const userObjectId = this.toObjectId(userId, 'userId');
    const walletObjectId = this.toObjectId(cartaoId, 'cartaoId');
    const faturaObjectId = this.toObjectId(faturaId, 'faturaId');

    const wallet = await this.walletModel.findOne({ _id: walletObjectId, userId: userObjectId, tipo: 'credito' }).exec();
    if (!wallet) throw new NotFoundException('Cartão não encontrado');

    const fatura = await this.faturaModel
      .findOne({ _id: faturaObjectId, userId: userObjectId, carteiraId: walletObjectId })
      .exec();
    if (!fatura) throw new NotFoundException('Fatura não encontrada');
    if (fatura.status === 'paga') throw new BadRequestException('Esta fatura já está paga.');

    const payerWalletId = dto.carteiraPagadoraId
      ? this.toObjectId(dto.carteiraPagadoraId, 'carteiraPagadoraId')
      : wallet.carteiraPagamentoId;
    if (!payerWalletId) {
      throw new BadRequestException('Informe a carteira pagadora (nenhuma carteira padrão configurada para este cartão).');
    }

    const payerWallet = await this.walletModel
      .findOne({ _id: payerWalletId, userId: userObjectId, tipo: { $ne: 'credito' } })
      .exec();
    if (!payerWallet) throw new NotFoundException('Carteira pagadora não encontrada');

    const totalDevido = Number((fatura.valorTotal + fatura.saldoRotativoAnterior).toFixed(2));
    const restante = Number((totalDevido - fatura.valorPago).toFixed(2));
    if (restante <= 0) throw new BadRequestException('Esta fatura não possui saldo devedor.');
    const valorPago = Math.min(dto.valor, restante);

    await this.transactionModel.create({
      userId: userObjectId,
      type: TransactionType.TRANSFER,
      tipoTransacao: 'transferencia',
      value: valorPago,
      date: new Date(),
      description: `Pagamento fatura ${wallet.nome}`,
      carteiraId: payerWallet._id,
      faturaId: fatura._id,
    });

    fatura.valorPago = Number((fatura.valorPago + valorPago).toFixed(2));
    fatura.status = fatura.valorPago + 0.005 >= totalDevido ? 'paga' : 'parcial';
    await fatura.save();

    if (fatura.pendingAccountId) {
      const paga = fatura.status === 'paga';
      await this.pendingModel.findByIdAndUpdate(fatura.pendingAccountId, {
        $set: { paid: paga, ...(paga ? { paidAt: new Date() } : {}) },
      }).exec();
    }

    return fatura;
  }

  async estornar(userId: string, transacaoId: string) {
    const userObjectId = this.toObjectId(userId, 'userId');
    const transacaoObjectId = this.toObjectId(transacaoId, 'transacaoId');

    const original = await this.transactionModel
      .findOne({ _id: transacaoObjectId, userId: userObjectId, faturaId: { $exists: true } })
      .exec();
    if (!original) throw new NotFoundException('Transação de cartão não encontrada');
    if (original.isEstorno) throw new BadRequestException('Não é possível estornar um estorno.');

    const estorno = await this.transactionModel.create({
      userId: userObjectId,
      type: TransactionType.EXPENSE,
      value: original.value,
      categoryId: original.categoryId,
      description: `Estorno: ${original.description ?? ''}`.trim(),
      date: new Date(),
      carteiraId: original.carteiraId,
      agendado: false,
      faturaId: original.faturaId,
      isEstorno: true,
    });

    await this.recomputeValorTotal(original.faturaId as Types.ObjectId);

    if (!original.agendado && original.categoryId) {
      await this.decrementLinkedGoal(userObjectId, original.categoryId as Types.ObjectId, original.value);
    }

    return estorno;
  }

  // Ação explícita de migração: converte uma PendingAccount parcelada existente (lançada à
  // mão hoje) num Parcelamento vinculado a um cartão. Nada automático — usuário escolhe
  // cartão e informa quantas parcelas já pagou/faltam.
  async vincularContaPendente(userId: string, dto: VincularContaPendenteDto) {
    const userObjectId = this.toObjectId(userId, 'userId');
    const pendingObjectId = this.toObjectId(dto.pendingAccountId, 'pendingAccountId');
    const walletObjectId = this.toObjectId(dto.carteiraId, 'carteiraId');

    const wallet = await this.walletModel.findOne({ _id: walletObjectId, userId: userObjectId, tipo: 'credito' }).exec();
    if (!wallet) throw new NotFoundException('Cartão não encontrado');

    const pending = await this.pendingModel.findOne({ _id: pendingObjectId, userId: userObjectId }).exec();
    if (!pending) throw new NotFoundException('Conta pendente não encontrada');
    if (pending.faturaId) throw new BadRequestException('Esta conta já está vinculada a um cartão.');

    const totalParcelas = dto.parcelasJaPagas + dto.parcelasRestantes;
    if (totalParcelas < 1) throw new BadRequestException('Informe ao menos uma parcela.');

    const valorParcela = pending.parcelas?.valorParcela ?? pending.value;
    const descricao = pending.title;
    const categoryObjectId = pending.categoryId as Types.ObjectId | undefined;
    const dataCompraBase = pending.parcelas?.dataInicio ?? pending.dueDate;

    const parcelamento = await this.parcelamentoModel.create({
      userId: userObjectId,
      carteiraId: wallet._id,
      categoryId: categoryObjectId,
      descricao,
      valorTotal: Number((valorParcela * totalParcelas).toFixed(2)),
      totalParcelas,
      dataCompra: dataCompraBase,
    });

    const today = new Date();
    const faturaIdsAfetadas = new Set<string>();

    for (let i = 0; i < dto.parcelasRestantes; i++) {
      const numeroParcela = dto.parcelasJaPagas + i + 1;
      const data = i === 0 ? today : this.addMonths(today, i);
      const fatura = await this.resolverFaturaParaCompra(userObjectId, wallet, data);
      const agendado = i > 0;

      await this.transactionModel.create({
        userId: userObjectId,
        type: TransactionType.EXPENSE,
        value: valorParcela,
        categoryId: categoryObjectId,
        description: descricao,
        date: data,
        carteiraId: wallet._id,
        agendado,
        faturaId: fatura._id,
        parcelamentoId: parcelamento._id,
        numeroParcela,
        totalParcelas,
      });
      faturaIdsAfetadas.add((fatura._id as Types.ObjectId).toString());

      if (!agendado && categoryObjectId) {
        await this.incrementLinkedGoal(userObjectId, categoryObjectId, valorParcela);
      }
    }

    for (const fid of faturaIdsAfetadas) {
      await this.recomputeValorTotal(new Types.ObjectId(fid));
    }

    if (pending.grupoParceladoId) {
      const grupo = await this.pendingModel.find({ userId: userObjectId, grupoParceladoId: pending.grupoParceladoId }).exec();
      const ids = grupo.map((g) => g._id);
      await this.pendingModel.deleteMany({ userId: userObjectId, grupoParceladoId: pending.grupoParceladoId }).exec();
      await this.transactionModel.deleteMany({ userId: userObjectId, pendingAccountId: { $in: ids } }).exec();
    } else {
      await this.pendingModel.deleteOne({ _id: pending._id }).exec();
      await this.transactionModel.deleteMany({ userId: userObjectId, pendingAccountId: pending._id }).exec();
    }

    return { parcelamento };
  }

  async listarCartoes(userId: string) {
    const userObjectId = this.toObjectId(userId, 'userId');
    const wallets = await this.walletModel.find({ userId: userObjectId, tipo: 'credito' }).sort({ createdAt: 1 }).exec();

    const result = [];
    for (const wallet of wallets) {
      const limiteUsado = await this.calcularLimiteUsado(userObjectId, wallet._id as Types.ObjectId);
      const faturaAberta = await this.faturaModel
        .findOne({ userId: userObjectId, carteiraId: wallet._id, status: { $in: ['aberta', 'fechada', 'parcial'] } })
        .sort({ dataFechamento: 1 })
        .exec();
      result.push({
        ...wallet.toObject(),
        limiteUsado,
        limiteDisponivel: typeof wallet.limite === 'number' ? Math.max(0, Number((wallet.limite - limiteUsado).toFixed(2))) : undefined,
        faturaAberta,
      });
    }
    return result;
  }

  async detalharCartao(userId: string, cartaoId: string) {
    const userObjectId = this.toObjectId(userId, 'userId');
    const wallet = await this.walletModel
      .findOne({ _id: this.toObjectId(cartaoId, 'cartaoId'), userId: userObjectId, tipo: 'credito' })
      .exec();
    if (!wallet) throw new NotFoundException('Cartão não encontrado');

    const faturas = await this.faturaModel.find({ userId: userObjectId, carteiraId: wallet._id }).sort({ dataFechamento: -1 }).exec();
    const limiteUsado = await this.calcularLimiteUsado(userObjectId, wallet._id as Types.ObjectId);
    return {
      ...wallet.toObject(),
      limiteUsado,
      limiteDisponivel: typeof wallet.limite === 'number' ? Math.max(0, Number((wallet.limite - limiteUsado).toFixed(2))) : undefined,
      faturas,
    };
  }

  async detalharFatura(userId: string, cartaoId: string, faturaId: string) {
    const userObjectId = this.toObjectId(userId, 'userId');
    const fatura = await this.faturaModel
      .findOne({
        _id: this.toObjectId(faturaId, 'faturaId'),
        userId: userObjectId,
        carteiraId: this.toObjectId(cartaoId, 'cartaoId'),
      })
      .exec();
    if (!fatura) throw new NotFoundException('Fatura não encontrada');

    const transacoes = await this.transactionModel.find({ userId: userObjectId, faturaId: fatura._id }).sort({ date: 1 }).exec();
    return { ...fatura.toObject(), transacoes };
  }

  async listarParcelamentos(userId: string, cartaoId: string) {
    const userObjectId = this.toObjectId(userId, 'userId');
    const walletObjectId = this.toObjectId(cartaoId, 'cartaoId');
    const parcelamentos = await this.parcelamentoModel
      .find({ userId: userObjectId, carteiraId: walletObjectId })
      .sort({ dataCompra: -1 })
      .exec();

    const now = new Date();
    const result = [];
    for (const p of parcelamentos) {
      const transacoes = await this.transactionModel
        .find({ userId: userObjectId, parcelamentoId: p._id })
        .sort({ numeroParcela: 1 })
        .exec();
      const restantes = transacoes.filter((t) => t.agendado && t.date > now);
      result.push({
        ...p.toObject(),
        transacoes,
        parcelasPagas: transacoes.length - restantes.length,
        parcelasRestantes: restantes.length,
        valorRestante: Number(restantes.reduce((s, t) => s + t.value, 0).toFixed(2)),
      });
    }
    return result;
  }

  // Transição aberta→fechada (por data, não por ação do usuário) + gatilho de
  // rotativo/juros: ao fechar a fatura N, olha a fatura N-1 do mesmo cartão — se não
  // quitada, o restante (pode ser negativo, ex. crédito de estorno) vira
  // saldoRotativoAnterior de N, e juros sobre o restante positivo viram uma Transaction
  // própria dentro de N. Chamado pelo cron diário de FaturasCronService.
  async fecharFaturasVencidas(now: Date = new Date()): Promise<number> {
    const vencidas = await this.faturaModel
      .find({ status: 'aberta', dataFechamento: { $lt: now } })
      .sort({ dataFechamento: 1 })
      .exec();

    for (const fatura of vencidas) {
      fatura.status = 'fechada';

      const anterior = await this.faturaModel
        .findOne({ userId: fatura.userId, carteiraId: fatura.carteiraId, dataFechamento: { $lt: fatura.dataFechamento } })
        .sort({ dataFechamento: -1 })
        .exec();

      if (anterior && anterior.status !== 'aberta') {
        const devidoAnterior = Number((anterior.valorTotal + anterior.saldoRotativoAnterior).toFixed(2));
        const restante = Number((devidoAnterior - anterior.valorPago).toFixed(2));

        if (restante !== 0) {
          fatura.saldoRotativoAnterior = restante;

          if (restante > 0) {
            const wallet = await this.walletModel.findById(fatura.carteiraId).exec();
            const taxa = wallet?.taxaJurosRotativo ?? 0;
            if (taxa > 0) {
              const juros = Number((restante * (taxa / 100)).toFixed(2));
              if (juros > 0) {
                const categoriaJuros = await this.categoryModel.findOne({ slug: 'taxas' }).exec();
                await this.transactionModel.create({
                  userId: fatura.userId,
                  type: TransactionType.EXPENSE,
                  value: juros,
                  categoryId: categoriaJuros?._id,
                  description: 'Juros rotativo do cartão',
                  date: fatura.dataFechamento,
                  carteiraId: fatura.carteiraId,
                  agendado: false,
                  faturaId: fatura._id,
                });
                fatura.jurosAplicados = juros;
              }
            }
          }
        }
      }

      await fatura.save();
      await this.recomputeValorTotal(fatura._id as Types.ObjectId);
    }

    return vencidas.length;
  }
}
