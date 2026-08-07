import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Wallet, WalletDocument } from './schemas/wallet.schema';
import { Transaction, TransactionDocument, TransactionType } from '../transactions/schemas/transaction.schema';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';
import { TransferWalletDto } from './dto/transfer-wallet.dto';

@Injectable()
export class WalletsService {
  constructor(
    @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
  ) {}

  private toObjectId(value: string, field: string) {
    if (!Types.ObjectId.isValid(value)) throw new BadRequestException(`${field} must be a valid ObjectId`);
    return new Types.ObjectId(value);
  }

  async create(userId: string, dto: CreateWalletDto) {
    return this.walletModel.create({
      userId: this.toObjectId(userId, 'userId'),
      nome: dto.nome,
      saldo: dto.saldo ?? 0,
      saldoInicial: dto.saldo ?? 0,
      icone: dto.icone,
    });
  }

  private effectiveSaldoMatch() {
    return { $or: [{ agendado: false }, { agendado: { $exists: false } }] };
  }

  // Mesma carteira virtual usada em transactions.service.ts/pending.service.ts para
  // dados anteriores à feature de múltiplas carteiras.
  private static readonly LEGACY_WALLET_ID = 'legacy-wallet';

  async findAll(userId: string) {
    const userObjectId = new Types.ObjectId(userId);
    // saldoInicial é o valor declarado pelo usuário ao criar a carteira (nunca alterado
    // por $inc). O saldo exibido é: saldoInicial + soma(INCOME) - soma(EXPENSE) + TC - TD.
    // Isso garante corretude independente do histórico de $inc em wallet.saldo.
    const [wallets, saldoAgg, transferCreditsAgg, transferDebitsAgg] = await Promise.all([
      this.walletModel.find({ userId: userObjectId }).sort({ createdAt: 1 }).exec(),
      // income - expense por carteira (TRANSFER excluído para não duplicar com TC/TD)
      this.transactionModel.aggregate([
        { $match: { userId: userObjectId, ...this.effectiveSaldoMatch(), type: { $in: [TransactionType.INCOME, TransactionType.EXPENSE] } } },
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
    const realWalletIds = new Set(wallets.map((w) => w._id.toString()));
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

    return result;
  }

  async findOne(userId: string, id: string) {
    const userObjectId = new Types.ObjectId(userId);
    const wallet = await this.walletModel.findOne({
      _id: this.toObjectId(id, 'id'),
      userId: userObjectId,
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
      // income - expense desta carteira (TRANSFER excluído)
      this.transactionModel.aggregate([
        { $match: { userId: userObjectId, carteiraId: wallet._id, ...this.effectiveSaldoMatch(), type: { $in: [TransactionType.INCOME, TransactionType.EXPENSE] } } },
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
    if (typeof dto.saldo === 'number') {
      wallet.saldoInicial = dto.saldo;
      // Recompõe wallet.saldo para que futuras operações $inc continuem corretas.
      const incExpAgg = await this.transactionModel.aggregate([
        { $match: { userId: wallet.userId, carteiraId: wallet._id, ...this.effectiveSaldoMatch(), type: { $in: [TransactionType.INCOME, TransactionType.EXPENSE] } } },
        { $group: { _id: null, saldo: { $sum: { $cond: [{ $eq: ['$type', TransactionType.INCOME] }, '$value', { $multiply: ['$value', -1] }] } } } },
      ]);
      wallet.saldo = dto.saldo + (incExpAgg[0]?.saldo ?? 0);
    }

    await wallet.save();
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
