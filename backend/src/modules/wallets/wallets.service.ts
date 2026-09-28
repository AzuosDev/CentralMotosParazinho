import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Wallet, WalletDocument } from './schemas/wallet.schema';
import { Transaction, TransactionDocument, TransactionType } from '../transactions/schemas/transaction.schema';
import { Fatura, FaturaDocument } from '../cartoes/schemas/fatura.schema';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';
import { TransferWalletDto } from './dto/transfer-wallet.dto';

@Injectable()
export class WalletsService {
  constructor(
    @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
    @InjectModel(Fatura.name) private faturaModel: Model<FaturaDocument>,
  ) {}

  private toObjectId(value: string, field: string) {
    if (!Types.ObjectId.isValid(value)) throw new BadRequestException(`${field} must be a valid ObjectId`);
    return new Types.ObjectId(value);
  }

  async create(userId: string, dto: CreateWalletDto) {
    const userObjectId = this.toObjectId(userId, 'userId');
    return this.walletModel.create({
      userId: userObjectId,
      nome: dto.nome,
      saldo: dto.saldo ?? 0,
      saldoInicial: dto.saldo ?? 0,
      icone: dto.icone,
      tipo: dto.tipo ?? 'conta',
      limite: dto.tipo === 'credito' ? dto.limite : undefined,
      diaFechamento: dto.tipo === 'credito' ? dto.diaFechamento : undefined,
      diaVencimento: dto.tipo === 'credito' ? dto.diaVencimento : undefined,
      carteiraPagamentoId:
        dto.tipo === 'credito' && dto.carteiraPagamentoId && Types.ObjectId.isValid(dto.carteiraPagamentoId)
          ? new Types.ObjectId(dto.carteiraPagamentoId)
          : undefined,
      taxaJurosRotativo: dto.tipo === 'credito' ? dto.taxaJurosRotativo : undefined,
      bandeira: dto.tipo === 'credito' ? dto.bandeira : undefined,
      ultimosDigitos: dto.tipo === 'credito' ? dto.ultimosDigitos : undefined,
    });
  }

  private effectiveSaldoMatch() {
    // Inclui transações não-agendadas OU agendadas cuja data já passou.
    // O campo agendado nunca é auto-expirado no banco, então transações criadas como
    // futuras que já venceram continuariam excluídas do saldo para sempre sem esta cláusula.
    const now = new Date();
    return {
      $or: [
        { agendado: { $ne: true } },
        { date: { $lte: now } },
      ],
    };
  }

  // Compra no crédito (faturaId setado) é dívida, não dinheiro saindo da carteira — não
  // pode entrar na soma de saldo de nenhuma carteira. Mesmo padrão de effectiveSaldoMatch().
  private excludeCardPurchasesMatch() {
    return { faturaId: { $exists: false } };
  }

  // Mesma carteira virtual usada em transactions.service.ts/pending.service.ts para
  // dados anteriores à feature de múltiplas carteiras.
  private static readonly LEGACY_WALLET_ID = 'legacy-wallet';

  // incluirCartoes: o seletor de forma de pagamento (transação/conta pendente) precisa dos
  // cartões junto das carteiras de dinheiro/conta — mas o Saldo Total do patrimônio
  // (WalletsPage.tsx) continua sem eles, por isso o default é excluir.
  async findAll(userId: string, incluirCartoes = false) {
    const userObjectId = new Types.ObjectId(userId);
    // saldoInicial é o valor declarado pelo usuário ao criar a carteira (nunca alterado
    // por $inc). O saldo exibido é: saldoInicial + soma(INCOME) - soma(EXPENSE) + TC - TD.
    // Isso garante corretude independente do histórico de $inc em wallet.saldo.
    // Cartões de crédito (tipo: 'credito') ficam de fora: eles não têm "saldo" no sentido de
    // dinheiro disponível, e se entrassem aqui inflariam/corromperiam o Saldo Total somado no
    // frontend (WalletsPage.tsx). Só aparecem em /api/cartoes.
    // Busca TODAS as carteiras (inclusive arquivadas) para não deixar as transações de uma
    // carteira arquivada vazarem pro balde de "Saldo Histórico" abaixo (ver realWalletIds) —
    // a carteira arquivada só é removida do array `wallets` (o que vira `result`/soma de
    // patrimônio) depois, sem afetar o casamento de transação → carteira.
    const [allWallets, saldoAgg, transferCreditsAgg, transferDebitsAgg] = await Promise.all([
      this.walletModel.find({ userId: userObjectId, tipo: { $ne: 'credito' } }).sort({ createdAt: 1 }).exec(),
      // income - expense por carteira (TRANSFER excluído para não duplicar com TC/TD;
      // compras no crédito excluídas por não serem saída real de dinheiro)
      this.transactionModel.aggregate([
        { $match: { userId: userObjectId, ...this.effectiveSaldoMatch(), ...this.excludeCardPurchasesMatch(), type: { $in: [TransactionType.INCOME, TransactionType.EXPENSE] } } },
        {
          $group: {
            _id: '$carteiraId',
            saldo: { $sum: { $cond: [{ $eq: ['$type', TransactionType.INCOME] }, '$value', { $multiply: ['$value', -1] }] } },
          },
        },
      ]),
      // Transfers recebidas (carteira destino ganha), excluindo agendadas
      this.transactionModel.aggregate([
        { $match: { userId: userObjectId, type: TransactionType.TRANSFER, carteiraDestinoId: { $exists: true, $ne: null }, ...this.effectiveSaldoMatch() } },
        { $group: { _id: '$carteiraDestinoId', saldo: { $sum: '$value' } } },
      ]),
      // Transfers enviadas (carteira origem perde)
      this.transactionModel.aggregate([
        { $match: { userId: userObjectId, type: TransactionType.TRANSFER, carteiraId: { $exists: true, $ne: null }, ...this.effectiveSaldoMatch() } },
        { $group: { _id: '$carteiraId', saldo: { $sum: '$value' } } },
      ]),
    ]);

    // Não basta checar "r._id é truthy": dados gravados por código antigo (sem o
    // conceito de carteiras) podem ter carteiraId como null, ausente, string vazia, ou
    // até um ObjectId válido mas órfão (carteira que nunca existiu para este usuário).
    // Qualquer grupo que não corresponda a uma carteira real do usuário cai no saldo
    // legado — assim nenhum valor desaparece silenciosamente por não bater com nada.
    // Usa allWallets (não o `wallets` filtrado abaixo) para que uma carteira arquivada
    // ainda seja reconhecida como "real" aqui — senão seu saldo vazaria pro balde de
    // Saldo Histórico em vez de simplesmente ficar de fora da soma.
    const realWalletIds = new Set(allWallets.map((w) => w._id.toString()));
    const wallets = allWallets.filter((w) => !w.arquivadaEm);
    const saldoAggMap = new Map<string, number>();
    let legacySaldo = 0;
    saldoAgg.forEach((r) => {
      const key = r._id != null ? String(r._id) : '';
      if (!key || !realWalletIds.has(key)) {
        legacySaldo += r.saldo;
      } else {
        saldoAggMap.set(key, r.saldo);
      }
    });

    const transferCreditsMap = new Map<string, number>();
    transferCreditsAgg.forEach((r) => {
      if (r._id != null) transferCreditsMap.set(r._id.toString(), r.saldo);
    });

    const transferDebitsMap = new Map<string, number>();
    transferDebitsAgg.forEach((r) => {
      if (r._id != null) transferDebitsMap.set(r._id.toString(), r.saldo);
    });

    const result: Array<Record<string, unknown>> = wallets.map((w) => {
      const id = w._id.toString();
      const saldo = (w.saldoInicial ?? 0)
        + (saldoAggMap.get(id) ?? 0)
        + (transferCreditsMap.get(id) ?? 0)
        - (transferDebitsMap.get(id) ?? 0);
      return { ...w.toObject(), saldo };
    });

    if (legacySaldo !== 0) {
      result.push({
        _id: WalletsService.LEGACY_WALLET_ID,
        nome: 'Saldo Histórico (Sem Carteira)',
        tipo: 'VIRTUAL',
        saldo: legacySaldo,
      });
    }

    if (incluirCartoes) {
      const cartoes = await this.walletModel
        .find({ userId: userObjectId, tipo: 'credito', arquivadaEm: { $exists: false } })
        .sort({ createdAt: 1 })
        .exec();
      result.push(...cartoes.map((w) => ({ ...w.toObject() })));
    }

    return result;
  }

  async findOne(userId: string, id: string) {
    const userObjectId = new Types.ObjectId(userId);
    // Cartões de crédito não são servidos por esta rota genérica — ver findAll().
    const wallet = await this.walletModel.findOne({
      _id: this.toObjectId(id, 'id'),
      userId: userObjectId,
      tipo: { $ne: 'credito' },
    }).exec();

    if (!wallet) throw new NotFoundException('Carteira não encontrada');

    const [transactions, incomeExpenseAgg, transferCreditsAgg, transferDebitsAgg] = await Promise.all([
      this.transactionModel
        .find({
          userId: userObjectId,
          $or: [
            { carteiraId: wallet._id },
            { type: TransactionType.TRANSFER, carteiraDestinoId: wallet._id },
          ],
        })
        .sort({ date: -1 })
        .limit(20)
        .exec(),
      // income - expense desta carteira (TRANSFER excluído; compra no crédito excluída)
      this.transactionModel.aggregate([
        { $match: { userId: userObjectId, carteiraId: wallet._id, ...this.effectiveSaldoMatch(), ...this.excludeCardPurchasesMatch(), type: { $in: [TransactionType.INCOME, TransactionType.EXPENSE] } } },
        { $group: { _id: null, saldo: { $sum: { $cond: [{ $eq: ['$type', TransactionType.INCOME] }, '$value', { $multiply: ['$value', -1] }] } } } },
      ]),
      // Transfers recebidas por esta carteira (carteiraDestino), excluindo agendadas
      this.transactionModel.aggregate([
        { $match: { userId: userObjectId, type: TransactionType.TRANSFER, carteiraDestinoId: wallet._id, ...this.effectiveSaldoMatch() } },
        { $group: { _id: null, saldo: { $sum: '$value' } } },
      ]),
      // Transfers enviadas por esta carteira (carteiraId)
      this.transactionModel.aggregate([
        { $match: { userId: userObjectId, type: TransactionType.TRANSFER, carteiraId: wallet._id, ...this.effectiveSaldoMatch() } },
        { $group: { _id: null, saldo: { $sum: '$value' } } },
      ]),
    ]);

    // saldoInicial + soma(INCOME-EXPENSE) + transferências = saldo correto sempre,
    // independente do estado de wallet.saldo ($inc pode ter ficado fora de sincronia).
    const saldo = (wallet.saldoInicial ?? 0)
      + (incomeExpenseAgg[0]?.saldo ?? 0)
      + (transferCreditsAgg[0]?.saldo ?? 0)
      - (transferDebitsAgg[0]?.saldo ?? 0);
    return { ...wallet.toObject(), saldo, transactions };
  }

  async update(userId: string, id: string, dto: UpdateWalletDto) {
    const wallet = await this.walletModel.findOne({
      _id: this.toObjectId(id, 'id'),
      userId: this.toObjectId(userId, 'userId'),
    }).exec();

    if (!wallet) throw new NotFoundException('Carteira não encontrada');

    if (dto.nome !== undefined) wallet.nome = dto.nome;
    if (dto.icone !== undefined) wallet.icone = dto.icone;
    if (dto.tipo !== undefined) wallet.tipo = dto.tipo;
    if (dto.limite !== undefined) wallet.limite = dto.limite;
    if (dto.diaFechamento !== undefined) wallet.diaFechamento = dto.diaFechamento;
    if (dto.diaVencimento !== undefined) wallet.diaVencimento = dto.diaVencimento;
    if (typeof dto.carteiraPagamentoId !== 'undefined') {
      wallet.carteiraPagamentoId =
        dto.carteiraPagamentoId && Types.ObjectId.isValid(dto.carteiraPagamentoId)
          ? new Types.ObjectId(dto.carteiraPagamentoId)
          : undefined;
    }
    if (dto.taxaJurosRotativo !== undefined) wallet.taxaJurosRotativo = dto.taxaJurosRotativo;
    if (dto.bandeira !== undefined) wallet.bandeira = dto.bandeira;
    if (dto.ultimosDigitos !== undefined) wallet.ultimosDigitos = dto.ultimosDigitos;
    if (typeof dto.saldo === 'number') {
      wallet.saldoInicial = dto.saldo;
      // Recompõe wallet.saldo para que futuras operações $inc continuem corretas.
      const incExpAgg = await this.transactionModel.aggregate([
        { $match: { userId: wallet.userId, carteiraId: wallet._id, ...this.effectiveSaldoMatch(), ...this.excludeCardPurchasesMatch(), type: { $in: [TransactionType.INCOME, TransactionType.EXPENSE] } } },
        { $group: { _id: null, saldo: { $sum: { $cond: [{ $eq: ['$type', TransactionType.INCOME] }, '$value', { $multiply: ['$value', -1] }] } } } },
      ]);
      wallet.saldo = dto.saldo + (incExpAgg[0]?.saldo ?? 0);
    }

    await wallet.save();
    return wallet;
  }

  // Arquivar existe pra carteiras (sobretudo cartões) que saíram de uso mas cujo histórico
  // não pode sumir dos relatórios de meses passados — diferente de remove(), que apaga.
  // Arquivada some de findAll() (listagem/seletor/soma de patrimônio) mas segue existindo
  // e continua aparecendo em qualquer consulta que agregue Transaction diretamente
  // (dashboard, insights), já que essas nunca filtram pela lista de carteiras.
  async arquivar(userId: string, id: string) {
    const userObjectId = this.toObjectId(userId, 'userId');
    const wallet = await this.walletModel.findOne({ _id: this.toObjectId(id, 'id'), userId: userObjectId }).exec();
    if (!wallet) throw new NotFoundException('Carteira não encontrada');
    if (wallet.arquivadaEm) throw new BadRequestException('Esta carteira já está arquivada.');

    if (wallet.tipo === 'credito') {
      // Mesma definição de "não quitada" usada em cartoes.service.ts#calcularLimiteUsado —
      // aberta, fechada ou parcial contam como pendência, só 'paga' libera o arquivamento.
      const faturaPendente = await this.faturaModel.exists({
        userId: userObjectId,
        carteiraId: wallet._id,
        status: { $ne: 'paga' },
      });
      if (faturaPendente) {
        throw new BadRequestException('Não é possível arquivar um cartão com fatura em aberto ou não paga.');
      }

      // agendado no banco não expira sozinho (ver effectiveSaldoMatch) — checar a própria
      // data em vez do flag evita um falso bloqueio por uma parcela cujo flag ficou obsoleto.
      const parcelaFutura = await this.transactionModel.exists({
        userId: userObjectId,
        carteiraId: wallet._id,
        parcelamentoId: { $exists: true },
        date: { $gt: new Date() },
      });
      if (parcelaFutura) {
        throw new BadRequestException('Não é possível arquivar um cartão com parcelas futuras pendentes.');
      }
    }

    wallet.arquivadaEm = new Date();
    await wallet.save();
    return wallet;
  }

  async desarquivar(userId: string, id: string) {
    const wallet = await this.walletModel.findOneAndUpdate(
      { _id: this.toObjectId(id, 'id'), userId: this.toObjectId(userId, 'userId') },
      { $unset: { arquivadaEm: 1 } },
      { new: true },
    ).exec();
    if (!wallet) throw new NotFoundException('Carteira não encontrada');
    return wallet;
  }

  async remove(userId: string, id: string) {
    const walletObjectId = this.toObjectId(id, 'id');
    const userObjectId = this.toObjectId(userId, 'userId');

    const linked = await this.transactionModel.exists({
      userId: userObjectId,
      $or: [
        { carteiraId: walletObjectId },
        { carteiraDestinoId: walletObjectId },
      ],
    });
    if (linked) throw new BadRequestException('Não é possível excluir uma carteira que possui transações vinculadas.');

    const wallet = await this.walletModel.findOneAndDelete({
      _id: walletObjectId,
      userId: userObjectId,
    }).exec();

    if (!wallet) throw new NotFoundException('Carteira não encontrada');
    return { deleted: true };
  }

  async transfer(userId: string, dto: TransferWalletDto) {
    if (dto.carteiraOrigemId === dto.carteiraDestinoId) {
      throw new BadRequestException('Carteiras de origem e destino devem ser diferentes');
    }

    const userObjectId = this.toObjectId(userId, 'userId');
    const [origem, destino] = await Promise.all([
      this.walletModel.findOne({ _id: this.toObjectId(dto.carteiraOrigemId, 'carteiraOrigemId'), userId: userObjectId }).exec(),
      this.walletModel.findOne({ _id: this.toObjectId(dto.carteiraDestinoId, 'carteiraDestinoId'), userId: userObjectId }).exec(),
    ]);

    if (!origem) throw new NotFoundException('Carteira de origem não encontrada');
    if (!destino) throw new NotFoundException('Carteira de destino não encontrada');

    await this.transactionModel.create({
      userId: userObjectId,
      type: TransactionType.TRANSFER,
      tipoTransacao: 'transferencia',
      value: dto.value,
      date: new Date(dto.date),
      description: dto.description ?? `Transferência para ${destino.nome}`,
      carteiraId: origem._id,
      carteiraDestinoId: destino._id,
    });

    return {
      origem: { id: origem._id, nome: origem.nome },
      destino: { id: destino._id, nome: destino.nome },
    };
  }
}
