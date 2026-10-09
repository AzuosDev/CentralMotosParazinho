import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Transaction, TransactionDocument, TransactionType } from './schemas/transaction.schema';
import { Category, CategoryDocument } from '../categories/schemas/category.schema';
import { Goal, GoalDocument } from '../goals/schemas/goal.schema';
import { Wallet, WalletDocument } from '../wallets/schemas/wallet.schema';
import { Moto, MotoDocument } from '../motos/schemas/moto.schema';
import { CartoesService } from '../cartoes/cartoes.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
    @InjectModel(Goal.name) private goalModel: Model<GoalDocument>,
    @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
    @InjectModel(Moto.name) private motoModel: Model<MotoDocument>,
    private cartoesService: CartoesService,
  ) {}

  // Dados anteriores à feature de múltiplas carteiras não têm carteiraId. Em vez de
  // devolver null pro frontend, injeta uma carteira virtual para exibição — o nome do
  // campo (`nome`) segue a mesma convenção de Wallet.nome para não exigir um caminho de
  // leitura diferente entre carteira real e virtual.
  private static readonly LEGACY_WALLET = {
    _id: 'legacy-wallet',
    nome: 'Saldo Histórico (Sem Carteira)',
    tipo: 'VIRTUAL' as const,
  };

  private attachVirtualWallet<T extends { carteiraId?: Types.ObjectId }>(doc: T) {
    return { ...doc, carteira: doc.carteiraId ? undefined : TransactionsService.LEGACY_WALLET };
  }

  private toObjectId(value: string, fieldName: string) {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`${fieldName} must be a valid ObjectId`);
    }
    return new Types.ObjectId(value);
  }

  // Diferente de carteiraId logo abaixo, um motoId inválido/de outro usuário é erro, não é
  // silenciosamente ignorado: deixar passar gravaria um vínculo que nunca aparece em
  // nenhum relatório de moto, e o usuário não teria como perceber.
  private async resolverMoto(userObjectId: Types.ObjectId, motoId: string) {
    const motoObjectId = this.toObjectId(motoId, 'motoId');
    const moto = await this.motoModel.exists({ _id: motoObjectId, userId: userObjectId });
    if (!moto) {
      throw new BadRequestException('Moto não encontrada para este usuário');
    }
    return motoObjectId;
  }

  async create(userId: string, dto: CreateTransactionDto) {
    // fitId indica transação importada via OFX — categoria opcional nesses casos
    if (dto.type === TransactionType.EXPENSE && !dto.categoryId && !dto.fitId) {
      throw new BadRequestException('categoryId is required for expense transactions');
    }

    const userObjectId = this.toObjectId(userId, 'userId');
    let categoryObjectId: Types.ObjectId | undefined;

    if (dto.categoryId) {
      categoryObjectId = this.toObjectId(dto.categoryId, 'categoryId');
      const valid = await this.categoryModel.findOne({
        _id: categoryObjectId,
        $or: [{ userId: null }, { userId: userObjectId }],
      }).exec();
      if (!valid) {
        throw new BadRequestException('Invalid category for this user');
      }
    }

    const carteiraObjectId =
      dto.carteiraId && Types.ObjectId.isValid(dto.carteiraId)
        ? new Types.ObjectId(dto.carteiraId)
        : undefined;

    const motoObjectId = dto.motoId ? await this.resolverMoto(userObjectId, dto.motoId) : undefined;

    const isScheduled = dto.date > new Date().toISOString().slice(0, 10);

    // Cartão de crédito é uma Wallet (tipo: 'credito') — compra não mexe em saldo (é dívida
    // sendo criada, não dinheiro saindo), então precisa saber o tipo da carteira antes de
    // decidir o cascade. CartoesService resolve/cria a fatura do ciclo e valida o limite;
    // quem persiste a Transaction continua sendo este método, para manter um único caminho
    // de criação e manter o incrementLinkedGoal abaixo funcionando igual pros dois casos.
    let wallet: WalletDocument | null = null;
    if (carteiraObjectId) {
      wallet = await this.walletModel.findOne({ _id: carteiraObjectId, userId: userObjectId }).exec();
    }
    // Carteira arquivada (WalletsService#arquivar) não aceita lançamento novo — o caso de
    // cartão é bloqueado de novo, mais abaixo, dentro de resolverFaturaParaCompra; aqui cobre
    // o caso de carteira comum, que nunca passa por lá.
    if (wallet?.arquivadaEm) {
      throw new BadRequestException('Esta carteira está arquivada e não aceita novos lançamentos.');
    }
    const isCredito = wallet?.tipo === 'credito';

    let faturaId: Types.ObjectId | undefined;
    let avisoLimite: Awaited<ReturnType<CartoesService['avaliarLimite']>> = null;
    if (isCredito && wallet) {
      const resolved = await this.cartoesService.registrarCompra(userObjectId, wallet, {
        type: dto.type,
        value: dto.value,
        date: new Date(dto.date),
        confirmarMesmoAssim: dto.confirmarMesmoAssim,
      });
      faturaId = resolved.faturaId;
      avisoLimite = resolved.avisoLimite;
    }

    const transaction = await this.transactionModel.create({
      userId: userObjectId,
      type: dto.type,
      value: dto.value,
      categoryId: categoryObjectId,
      description: dto.description,
      date: new Date(dto.date),
      carteiraId: carteiraObjectId,
      agendado: isScheduled,
      fitId: dto.fitId ?? undefined,
      faturaId,
      motoId: motoObjectId,
    });

    if (!isScheduled) {
      if (dto.type === TransactionType.EXPENSE && categoryObjectId) {
        await this.incrementLinkedGoal(userObjectId, categoryObjectId, dto.value);
      }

      if (carteiraObjectId && !isCredito) {
        const inc = dto.type === TransactionType.INCOME ? dto.value : -dto.value;
        await this.walletModel.findOneAndUpdate(
          { _id: carteiraObjectId, userId: userObjectId },
          { $inc: { saldo: inc } },
        ).exec();
      }
    }

    if (faturaId) {
      await this.cartoesService.recomputeValorTotal(userObjectId, faturaId);
    }

    // avisoLimite só é anexado (não-persistido) quando a compra é no cartão e passou de 80%
    // do limite sem estourar — o frontend usa isso para distinguir aviso de bloqueio (409).
    if (isCredito) {
      return { ...transaction.toObject(), avisoLimite };
    }
    return transaction;
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

  async findAll(
    userId: string,
    type?: TransactionType,
    page = 1,
    limit = 10,
    categoryId?: string,
    month?: number,
    year?: number,
    carteiraId?: string,
    semCategoria?: boolean,
    motoId?: string,
  ) {
    const filter: FilterQuery<TransactionDocument> = { userId: new Types.ObjectId(userId) };
    if (type) {
      filter.type = type;
    }

    if (semCategoria) {
      filter.categoryId = { $in: [null, undefined] };
    } else if (categoryId) {
      filter.categoryId = this.toObjectId(categoryId, 'categoryId');
    }

    if (month && year) {
      const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
      const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
      filter.date = { $gte: startDate, $lte: endDate };
    }

    if (carteiraId && Types.ObjectId.isValid(carteiraId)) {
      const walletOid = new Types.ObjectId(carteiraId);
      filter.$or = [{ carteiraId: walletOid }, { carteiraDestinoId: walletOid }];
    }

    if (motoId) {
      filter.motoId = this.toObjectId(motoId, 'motoId');
    }

    const [docs, total] = await Promise.all([
      this.transactionModel.find(filter).sort({ date: -1 }).skip((page - 1) * limit).limit(limit).exec(),
      this.transactionModel.countDocuments(filter).exec(),
    ]);

    const data = docs.map((d) => this.attachVirtualWallet(d.toObject()));

    return { data, total, page, limit };
  }

  async findOne(userId: string, id: string) {
    const transaction = await this.transactionModel.findOne({
      _id: this.toObjectId(id, 'id'),
      userId: this.toObjectId(userId, 'userId'),
    }).exec();
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }
    return transaction;
  }

  async update(userId: string, id: string, dto: UpdateTransactionDto) {
    const userObjectId = this.toObjectId(userId, 'userId');
    const transaction = await this.transactionModel.findOne({
      _id: this.toObjectId(id, 'id'),
      userId: userObjectId,
    }).exec();
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    // Transação de cartão de crédito: valor/data não são editáveis (reatribuiria a fatura
    // silenciosamente) — corrija estornando e lançando de novo. Descrição e categoria podem
    // mudar livremente; nunca houve efeito de saldo/wallet a desfazer aqui.
    if (transaction.faturaId) {
      const blockedFields: Array<keyof UpdateTransactionDto> = ['value', 'date', 'carteiraId', 'carteiraDestinoId'];
      const attemptedBlocked = blockedFields.filter((f) => typeof dto[f] !== 'undefined');
      if (attemptedBlocked.length > 0 || (dto.type && dto.type !== transaction.type)) {
        throw new BadRequestException(
          'Transações de cartão de crédito só permitem editar descrição e categoria. Para corrigir valor ou data, estorne e lance novamente.',
        );
      }

      if (typeof dto.description !== 'undefined') transaction.description = dto.description;
      if (dto.categoryId) transaction.categoryId = this.toObjectId(dto.categoryId, 'categoryId');
      // motoId é liberado aqui de propósito: ele não participa da resolução da fatura, só
      // diz a que moto o gasto pertence — é informação de classificação, como a categoria.
      if (typeof dto.motoId !== 'undefined') {
        transaction.motoId = dto.motoId ? await this.resolverMoto(userObjectId, dto.motoId) : undefined;
      }
      await transaction.save();
      return transaction;
    }

    const oldCarteiraId = transaction.carteiraId as Types.ObjectId | undefined;
    const oldValue = transaction.value;
    const oldType = transaction.type;
    const oldAgendado = transaction.agendado ?? false;

    if (dto.type) transaction.type = dto.type;
    if (typeof dto.value !== 'undefined') transaction.value = dto.value;
    if (dto.categoryId) transaction.categoryId = this.toObjectId(dto.categoryId, 'categoryId');
    if (typeof dto.description !== 'undefined') transaction.description = dto.description;
    if (dto.date) {
      transaction.date = new Date(dto.date);
      transaction.agendado = dto.date > new Date().toISOString().slice(0, 10);
    }
    // String vazia desvincula a moto; um id revincula (depois de checar a posse).
    if (typeof dto.motoId !== 'undefined') {
      transaction.motoId = dto.motoId ? await this.resolverMoto(userObjectId, dto.motoId) : undefined;
    }
    if (typeof dto.carteiraDestinoId !== 'undefined') {
      transaction.carteiraDestinoId =
        dto.carteiraDestinoId && Types.ObjectId.isValid(dto.carteiraDestinoId)
          ? new Types.ObjectId(dto.carteiraDestinoId)
          : undefined;
    }

    const newAgendado = transaction.agendado ?? false;

    if (typeof dto.carteiraId !== 'undefined') {
      const newCarteiraId =
        dto.carteiraId && Types.ObjectId.isValid(dto.carteiraId)
          ? new Types.ObjectId(dto.carteiraId)
          : undefined;

      // Reverse old wallet effect (only if old tx wasn't scheduled — agendado txs never hit the wallet)
      if (oldCarteiraId && !oldAgendado) {
        const reversal = oldType === TransactionType.INCOME ? -oldValue : oldValue;
        await this.walletModel.findOneAndUpdate(
          { _id: oldCarteiraId, userId: userObjectId },
          { $inc: { saldo: reversal } },
        ).exec();
      }

      // Apply new wallet effect (only if not scheduled)
      if (newCarteiraId && !newAgendado) {
        const inc = transaction.type === TransactionType.INCOME ? transaction.value : -transaction.value;
        await this.walletModel.findOneAndUpdate(
          { _id: newCarteiraId, userId: userObjectId },
          { $inc: { saldo: inc } },
        ).exec();
      }

      transaction.carteiraId = newCarteiraId;
    } else if (oldCarteiraId) {
      // Same wallet — compute net change in balance effect, including agendado flips.
      // Effect is 0 when scheduled (never hits wallet), otherwise ±value.
      const oldEffect = oldAgendado ? 0 : (oldType === TransactionType.INCOME ? oldValue : -oldValue);
      const newEffect = newAgendado ? 0 : (transaction.type === TransactionType.INCOME ? transaction.value : -transaction.value);
      const diff = newEffect - oldEffect;
      if (diff !== 0) {
        await this.walletModel.findOneAndUpdate(
          { _id: oldCarteiraId, userId: userObjectId },
          { $inc: { saldo: diff } },
        ).exec();
      }
    }

    await transaction.save();
    return transaction;
  }

  async checkFitIdExists(userId: string, carteiraId: string, fitId: string): Promise<boolean> {
    const doc = await this.transactionModel.findOne({
      userId: this.toObjectId(userId, 'userId'),
      carteiraId: this.toObjectId(carteiraId, 'carteiraId'),
      fitId,
    }).exec();
    return !!doc;
  }

  async remove(userId: string, id: string) {
    const userObjectId = this.toObjectId(userId, 'userId');
    const transaction = await this.transactionModel.findOne({
      _id: this.toObjectId(id, 'id'),
      userId: userObjectId,
    }).exec();
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    const faturaId = transaction.faturaId as Types.ObjectId | undefined;

    await transaction.deleteOne();

    // Estorno já decrementou a meta na criação — apagar o estorno não deveria decrementar
    // de novo (ficaria assimétrico, mas evita um segundo decremento incorreto).
    if (transaction.type === TransactionType.EXPENSE && transaction.categoryId && !transaction.isEstorno) {
      await this.decrementLinkedGoal(userObjectId, transaction.categoryId as Types.ObjectId, transaction.value);
    }

    // Transação de cartão nunca teve efeito de saldo em nenhuma carteira — nada a reverter.
    if (!transaction.agendado && transaction.carteiraId && transaction.type !== TransactionType.TRANSFER && !faturaId) {
      const reversal = transaction.type === TransactionType.INCOME ? -transaction.value : transaction.value;
      await this.walletModel.findOneAndUpdate(
        { _id: transaction.carteiraId, userId: userObjectId },
        { $inc: { saldo: reversal } },
      ).exec();
    }

    if (faturaId) {
      await this.cartoesService.recomputeValorTotal(userObjectId, faturaId);
    }

    return { deleted: true };
  }

  // Lazy migration: associa em lote transações legadas (sem carteiraId) a uma carteira
  // real escolhida pelo usuário. Só aceita transações ainda sem carteira para não
  // sobrescrever um vínculo já existente sem reverter o efeito de saldo dele — esse
  // mesmo cuidado é o que `update()` já faz transação por transação.
  async associateTransactionsToWallet(userId: string, transactionIds: string[], targetWalletId: string) {
    const userObjectId = this.toObjectId(userId, 'userId');
    const walletObjectId = this.toObjectId(targetWalletId, 'targetWalletId');

    const wallet = await this.walletModel.findOne({ _id: walletObjectId, userId: userObjectId }).exec();
    if (!wallet) throw new NotFoundException('Carteira de destino não encontrada');

    const uniqueIds = Array.from(new Set(transactionIds));
    const objectIds = uniqueIds.map((id) => this.toObjectId(id, 'transactionIds'));

    const transactions = await this.transactionModel
      .find({ _id: { $in: objectIds }, userId: userObjectId })
      .exec();

    if (transactions.length !== objectIds.length) {
      const foundIds = new Set(transactions.map((t) => t._id.toString()));
      const missing = uniqueIds.filter((id) => !foundIds.has(id));
      throw new BadRequestException(`Transações não encontradas: ${missing.join(', ')}`);
    }

    const alreadyLinked = transactions.filter((t) => t.carteiraId);
    if (alreadyLinked.length) {
      throw new BadRequestException(
        `As transações a seguir já possuem carteira associada: ${alreadyLinked
          .map((t) => t._id.toString())
          .join(', ')}`,
      );
    }

    // Saldo da carteira (wallets.service.findAll/findOne) é recalculado por agregação
    // sobre Transaction.carteiraId, então o updateMany abaixo já é suficiente para o
    // saldo exibido ficar correto. Ainda assim mantemos o campo estático Wallet.saldo em
    // dia, no mesmo padrão usado em create()/update()/remove() desta classe.
    const eligibleForSaldo = transactions.filter((t) => !t.agendado && t.type !== TransactionType.TRANSFER);
    const impact = eligibleForSaldo.reduce(
      (sum, t) => sum + (t.type === TransactionType.INCOME ? t.value : -t.value),
      0,
    );

    await this.transactionModel
      .updateMany({ _id: { $in: objectIds }, userId: userObjectId }, { $set: { carteiraId: walletObjectId } })
      .exec();

    if (impact !== 0) {
      await this.walletModel
        .findOneAndUpdate({ _id: walletObjectId, userId: userObjectId }, { $inc: { saldo: impact } })
        .exec();
    }

    return {
      updatedCount: transactions.length,
      walletId: walletObjectId.toString(),
      impact,
    };
  }
}
