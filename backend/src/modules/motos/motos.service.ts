import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Moto, MotoDocument } from './schemas/moto.schema';
import {
  Transaction,
  TransactionDocument,
  TransactionOrigem,
  TransactionType,
} from '../transactions/schemas/transaction.schema';
import { SIGNED_VALUE_EXPR } from '../transactions/transaction-aggregation.util';
import { Category, CategoryDocument } from '../categories/schemas/category.schema';
import { Wallet, WalletDocument } from '../wallets/schemas/wallet.schema';
import { TransactionsService } from '../transactions/transactions.service';
import { CreateMotoDto } from './dto/create-moto.dto';
import { UpdateMotoDto } from './dto/update-moto.dto';
import { VenderMotoDto } from './dto/vender-moto.dto';
import { EditarVendaMotoDto } from './dto/editar-venda-moto.dto';
import { GetMotosDto } from './dto/get-motos.dto';
import { GetRelatorioMotosDto } from './dto/get-relatorio-motos.dto';

export interface GastoPorCategoria {
  categoryId: Types.ObjectId | null;
  categoria: string;
  total: number;
}

export interface LinhaRelatorio {
  _id: Types.ObjectId;
  modelo: string;
  placa: string;
  status: string;
  valorCompra: number;
  valorVenda: number | null;
  dataVenda: Date | null;
  vendidaNoMes: boolean;
  gastosNoMes: number;
  custoTotal: number;
  lucro: number | null;
}

// Categorias de sistema usadas pelos lançamentos que a ficha gera (ver
// default-categories.ts). Resolvidas por slug e criadas por upsert se faltarem, para o
// fluxo não depender do seed já ter rodado nesta base.
const CATEGORIA_COMPRA = {
  slug: 'compra-de-moto',
  name: 'Compra de Moto',
  icon: 'Bike',
  color: '#D95926',
  isIncome: false,
};
const CATEGORIA_VENDA = {
  slug: 'venda-de-moto',
  name: 'Venda de Moto',
  icon: 'Bike',
  color: '#008300',
  isIncome: true,
};

@Injectable()
export class MotosService {
  constructor(
    @InjectModel(Moto.name) private motoModel: Model<MotoDocument>,
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
    @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
    // Os lançamentos passam por TransactionsService, não pelo model: é ele que mexe em
    // Wallet.saldo, nas metas e na fatura. Escrever a Transaction aqui criaria um segundo
    // caminho de criação e a venda não apareceria no saldo.
    private transactionsService: TransactionsService,
  ) {}

  // O projeto não usa replica set (em teste o Mongo é standalone via
  // mongodb-memory-server), então não há sessão/transação do Mongo disponível: cada
  // operação que mexe em moto + lançamento faz rollback manual do que já gravou. Ver
  // #vender, #create e #desfazerVenda.

  /** AAAA-MM-DD, o formato que CreateTransactionDto.date espera. */
  private dataISO(valor: Date) {
    return valor.toISOString().slice(0, 10);
  }

  private async categoriaDeSistema(definicao: typeof CATEGORIA_VENDA) {
    const { slug, ...resto } = definicao;
    const categoria = await this.categoryModel
      .findOneAndUpdate(
        { slug, isDefault: true },
        { $setOnInsert: { ...resto, slug, isDefault: true } },
        { upsert: true, new: true },
      )
      .exec();

    return categoria._id as Types.ObjectId;
  }

  /**
   * A carteira que recebe a venda (ou paga a compra) tem que ser uma conta de verdade:
   * cartão de crédito é dívida, não caixa — receber uma venda nele não faz sentido e o
   * lançamento sairia do saldo por causa do faturaId.
   */
  private async garantirCarteiraDeCaixa(userObjectId: Types.ObjectId, carteiraId: string) {
    const carteiraObjectId = this.toObjectId(carteiraId, 'carteiraId');
    const carteira = await this.walletModel
      .findOne({ _id: carteiraObjectId, userId: userObjectId })
      .exec();

    if (!carteira) throw new BadRequestException('Carteira não encontrada para este usuário.');
    if (carteira.tipo === 'credito') {
      throw new BadRequestException(
        'Escolha uma carteira de caixa (conta ou dinheiro): cartão de crédito não recebe venda nem paga a compra de uma moto.',
      );
    }
    if (carteira.arquivadaEm) {
      throw new BadRequestException('Esta carteira está arquivada e não aceita novos lançamentos.');
    }

    return carteiraObjectId;
  }

  /** O lançamento gerado pela ficha, quando existe (compra ou venda). */
  private async lancamentoDaMoto(
    userObjectId: Types.ObjectId,
    motoObjectId: Types.ObjectId,
    origem: TransactionOrigem,
  ) {
    return this.transactionModel.findOne({ userId: userObjectId, motoId: motoObjectId, origem }).exec();
  }

  private toObjectId(value: string, field: string) {
    if (!Types.ObjectId.isValid(value)) throw new BadRequestException(`${field} must be a valid ObjectId`);
    return new Types.ObjectId(value);
  }

  private arredondar(valor: number) {
    return Math.round(valor * 100) / 100;
  }

  // Guarda a placa num formato só: maiúsculas, sem hífen nem espaço. Sem isso "ABC-1D23" e
  // "abc1d23" viram duas motos diferentes e o índice único por usuário não pega a duplicata.
  private normalizarPlaca(placa: string) {
    return placa.replace(/[\s-]/g, '').toUpperCase();
  }

  private normalizarChassi(chassi: string) {
    return chassi.replace(/[\s-]/g, '').toUpperCase();
  }

  // Soma das despesas vinculadas, por moto. É a base do custoTotal, e todo lugar que devolve
  // precoSugerido/lucro passa por aqui: ter duas fórmulas de precoSugerido na mesma API (uma
  // sobre valorCompra, outra sobre custoTotal) é a forma mais fácil de a tela mostrar um
  // número e o relatório mostrar outro para a mesma moto.
  //
  // `agendado: { $ne: true }` segue o resto do projeto — despesa com data futura ainda não
  // mexeu em saldo nenhum, então também não entra no custo da moto até a data chegar.
  // Estorno é descontado via SIGNED_VALUE_EXPR em vez de somado como gasto cheio.
  // Os lançamentos que a própria ficha gera (origem compra_moto/venda_moto) ficam fora de
  // todo somatório de gasto: a compra já é contada como valorCompra e a venda como
  // valorVenda, então somá-los aqui contaria o mesmo dinheiro duas vezes — a moto
  // apareceria custando o dobro da compra.
  private static readonly SEM_LANCAMENTO_DA_FICHA = { origem: { $exists: false } };

  private async custoGastosPorMoto(userObjectId: Types.ObjectId, motoIds: Types.ObjectId[]) {
    const mapa = new Map<string, number>();
    if (motoIds.length === 0) return mapa;

    const linhas = await this.transactionModel
      .aggregate<{ _id: Types.ObjectId; total: number }>([
        {
          $match: {
            userId: userObjectId,
            motoId: { $in: motoIds },
            type: TransactionType.EXPENSE,
            agendado: { $ne: true },
            ...MotosService.SEM_LANCAMENTO_DA_FICHA,
          },
        },
        { $group: { _id: '$motoId', total: { $sum: SIGNED_VALUE_EXPR } } },
      ])
      .exec();

    for (const linha of linhas) {
      mapa.set(linha._id.toString(), this.arredondar(linha.total));
    }

    return mapa;
  }

  // margemDesejada é percentual sobre o custo total (compra + gastos), não sobre o valor de
  // compra: uma moto que consumiu R$ 2.000 de peças precisa ser anunciada mais caro para a
  // margem se manter. Os campos ficam fora do documento para não desatualizar quando o
  // valorCompra, a margem ou qualquer gasto vinculado mudarem.
  private comCamposCalculados(moto: MotoDocument, custoGastos: number) {
    const obj = moto.toObject();
    const custoTotal = this.arredondar(moto.valorCompra + custoGastos);
    const precoSugerido = this.arredondar(custoTotal * (1 + moto.margemDesejada / 100));
    const lucro = typeof moto.valorVenda === 'number' ? this.arredondar(moto.valorVenda - custoTotal) : null;

    return { ...obj, custoGastos, custoTotal, precoSugerido, lucro };
  }

  private async umaMotoCalculada(moto: MotoDocument, userObjectId: Types.ObjectId) {
    const motoId = moto._id as Types.ObjectId;
    const gastos = await this.custoGastosPorMoto(userObjectId, [motoId]);
    return this.comCamposCalculados(moto, gastos.get(motoId.toString()) ?? 0);
  }

  private async garantirPlacaLivre(userObjectId: Types.ObjectId, placa: string, ignorarId?: Types.ObjectId) {
    const filtro: FilterQuery<MotoDocument> = { userId: userObjectId, placa };
    if (ignorarId) filtro._id = { $ne: ignorarId };

    const existente = await this.motoModel.exists(filtro);
    if (existente) throw new ConflictException(`Já existe uma moto cadastrada com a placa ${placa}.`);
  }

  // AAAA-MM nos limites do mês em UTC, mesmo recorte que TransactionsService#findAll usa
  // para month/year.
  private intervaloDoMes(mes: string) {
    const [ano, mesNumero] = mes.split('-').map(Number);
    return {
      inicio: new Date(Date.UTC(ano, mesNumero - 1, 1, 0, 0, 0, 0)),
      fim: new Date(Date.UTC(ano, mesNumero, 0, 23, 59, 59, 999)),
    };
  }

  async create(userId: string, dto: CreateMotoDto) {
    const userObjectId = this.toObjectId(userId, 'userId');
    const placa = this.normalizarPlaca(dto.placa);

    await this.garantirPlacaLivre(userObjectId, placa);

    // Carteira validada antes de criar a moto: se ela não presta, nada é gravado e não há
    // o que desfazer.
    let carteiraCompraId: Types.ObjectId | undefined;
    if (dto.lancarCompra) {
      if (!dto.carteiraCompraId) {
        throw new BadRequestException('Escolha a carteira que pagou a compra para lançá-la no caixa.');
      }
      if (dto.valorCompra <= 0) {
        throw new BadRequestException('Não é possível lançar uma compra de R$ 0,00 na carteira.');
      }
      carteiraCompraId = await this.garantirCarteiraDeCaixa(userObjectId, dto.carteiraCompraId);
    }

    const moto = await this.motoModel.create({
      userId: userObjectId,
      modelo: dto.modelo,
      ano: dto.ano,
      placa,
      chassi: this.normalizarChassi(dto.chassi),
      cor: dto.cor,
      km: dto.km,
      valorCompra: dto.valorCompra,
      dataCompra: new Date(dto.dataCompra),
      margemDesejada: dto.margemDesejada,
      precoAnunciado: dto.precoAnunciado,
      status: 'em_estoque',
    });

    if (carteiraCompraId) {
      // Rollback manual (não há transação do Mongo): se a despesa falhar — carteira
      // arquivada entre a validação e aqui, por exemplo — a moto recém-criada é apagada,
      // em vez de ficar cadastrada sem o lançamento que o usuário pediu.
      try {
        await this.transactionsService.create(
          userId,
          {
            type: TransactionType.EXPENSE,
            value: dto.valorCompra,
            date: dto.dataCompra.slice(0, 10),
            categoryId: (await this.categoriaDeSistema(CATEGORIA_COMPRA)).toString(),
            carteiraId: carteiraCompraId.toString(),
            motoId: (moto._id as Types.ObjectId).toString(),
            description: `Compra da moto ${moto.modelo} (${moto.placa})`,
          },
          { origem: 'compra_moto' },
        );
      } catch (erro) {
        await this.motoModel.deleteOne({ _id: moto._id, userId: userObjectId }).exec();
        throw erro;
      }
    }

    // O lançamento da compra não entra em custoGastos (ver SEM_LANCAMENTO_DA_FICHA): o
    // valorCompra já responde por ele. Moto nova não tem outro gasto vinculado, então 0.
    return this.comCamposCalculados(moto, 0);
  }

  async findAll(userId: string, query: GetMotosDto) {
    const userObjectId = this.toObjectId(userId, 'userId');
    const filtro: FilterQuery<MotoDocument> = { userId: userObjectId };
    if (query.status) filtro.status = query.status;

    const motos = await this.motoModel.find(filtro).sort({ dataCompra: -1, _id: -1 }).exec();
    const gastos = await this.custoGastosPorMoto(
      userObjectId,
      motos.map((moto) => moto._id as Types.ObjectId),
    );

    return motos.map((moto) => this.comCamposCalculados(moto, gastos.get(moto._id.toString()) ?? 0));
  }

  async findOne(userId: string, id: string) {
    const userObjectId = this.toObjectId(userId, 'userId');
    const moto = await this.motoModel.findOne({ _id: this.toObjectId(id, 'id'), userId: userObjectId }).exec();

    if (!moto) throw new NotFoundException('Moto não encontrada');
    return this.umaMotoCalculada(moto, userObjectId);
  }

  async update(userId: string, id: string, dto: UpdateMotoDto) {
    const motoObjectId = this.toObjectId(id, 'id');
    const userObjectId = this.toObjectId(userId, 'userId');

    const moto = await this.motoModel.findOne({ _id: motoObjectId, userId: userObjectId }).exec();
    if (!moto) throw new NotFoundException('Moto não encontrada');

    if (typeof dto.placa !== 'undefined') {
      const placa = this.normalizarPlaca(dto.placa);
      await this.garantirPlacaLivre(userObjectId, placa, motoObjectId);
      moto.placa = placa;
    }

    if (typeof dto.modelo !== 'undefined') moto.modelo = dto.modelo;
    if (typeof dto.ano !== 'undefined') moto.ano = dto.ano;
    if (typeof dto.chassi !== 'undefined') moto.chassi = this.normalizarChassi(dto.chassi);
    if (typeof dto.cor !== 'undefined') moto.cor = dto.cor;
    if (typeof dto.km !== 'undefined') moto.km = dto.km;
    if (typeof dto.valorCompra !== 'undefined') moto.valorCompra = dto.valorCompra;
    if (typeof dto.dataCompra !== 'undefined') moto.dataCompra = new Date(dto.dataCompra);
    if (typeof dto.margemDesejada !== 'undefined') moto.margemDesejada = dto.margemDesejada;
    if (typeof dto.precoAnunciado !== 'undefined') moto.precoAnunciado = dto.precoAnunciado;

    await moto.save();

    // Valor ou data da compra mudaram: a despesa gerada no cadastro acompanha, senão a
    // ficha passa a dizer um valor de compra e a carteira outro.
    const compra = await this.lancamentoDaMoto(userObjectId, motoObjectId, 'compra_moto');
    if (compra && (typeof dto.valorCompra !== 'undefined' || typeof dto.dataCompra !== 'undefined')) {
      await this.transactionsService.update(
        userId,
        (compra._id as Types.ObjectId).toString(),
        {
          ...(typeof dto.valorCompra !== 'undefined' ? { value: moto.valorCompra } : {}),
          ...(typeof dto.dataCompra !== 'undefined' ? { date: this.dataISO(moto.dataCompra) } : {}),
        },
        { permitirOrigem: true },
      );
    }

    return this.umaMotoCalculada(moto, userObjectId);
  }

  /**
   * Marca a moto como vendida e lança a receita na carteira que recebeu o dinheiro — as
   * duas coisas juntas, porque uma moto que sai do estoque sem receita não aparece em
   * saldo, dashboard nem extrato, que era o furo desta tela.
   *
   * Para corrigir uma venda já registrada, ver #editarVenda; para cancelá-la,
   * #desfazerVenda.
   */
  async vender(userId: string, id: string, dto: VenderMotoDto) {
    const userObjectId = this.toObjectId(userId, 'userId');
    const moto = await this.motoModel.findOne({ _id: this.toObjectId(id, 'id'), userId: userObjectId }).exec();

    if (!moto) throw new NotFoundException('Moto não encontrada');
    if (moto.status === 'vendida') throw new BadRequestException('Esta moto já está marcada como vendida.');

    const dataVenda = new Date(dto.dataVenda);
    if (dataVenda < moto.dataCompra) {
      throw new BadRequestException('A data da venda não pode ser anterior à data da compra.');
    }
    // Transaction.value exige valor positivo: sem isso a receita falharia no meio do
    // caminho, depois de a moto já ter sido marcada como vendida.
    if (dto.valorVenda <= 0) {
      throw new BadRequestException('O valor da venda precisa ser maior que zero.');
    }

    const carteiraObjectId = await this.garantirCarteiraDeCaixa(userObjectId, dto.carteiraId);

    moto.status = 'vendida';
    moto.valorVenda = dto.valorVenda;
    moto.dataVenda = dataVenda;
    await moto.save();

    // Rollback manual: a moto volta a em_estoque se a receita não entrar, para não existir
    // moto vendida sem dinheiro entrando em carteira nenhuma.
    try {
      await this.lancarReceitaVenda(userId, userObjectId, moto, carteiraObjectId, dto.categoryId);
    } catch (erro) {
      await this.motoModel
        .updateOne(
          { _id: moto._id, userId: userObjectId },
          { $set: { status: 'em_estoque' }, $unset: { valorVenda: '', dataVenda: '' } },
        )
        .exec();
      throw erro;
    }

    return this.umaMotoCalculada(moto, userObjectId);
  }

  private async lancarReceitaVenda(
    userId: string,
    userObjectId: Types.ObjectId,
    moto: MotoDocument,
    carteiraObjectId: Types.ObjectId,
    categoryId?: string,
  ) {
    // Moto antiga pode ter sido marcada como vendida sem valor gravado: um 400 explicando
    // é melhor que o erro de validação do Mongo no meio do lançamento.
    if (typeof moto.valorVenda !== 'number' || moto.valorVenda <= 0) {
      throw new BadRequestException(
        'Informe o valor da venda para lançá-la na carteira.',
      );
    }

    const categoria = categoryId
      ? this.toObjectId(categoryId, 'categoryId')
      : await this.categoriaDeSistema(CATEGORIA_VENDA);

    return this.transactionsService.create(
      userId,
      {
        type: TransactionType.INCOME,
        value: moto.valorVenda as number,
        date: this.dataISO(moto.dataVenda as Date),
        categoryId: categoria.toString(),
        carteiraId: carteiraObjectId.toString(),
        motoId: (moto._id as Types.ObjectId).toString(),
        description: `Venda da moto ${moto.modelo} (${moto.placa})`,
      },
      { origem: 'venda_moto' },
    );
  }

  /**
   * Corrige uma venda já registrada e mantém a receita vinculada em sincronia. Também
   * atende a moto antiga, marcada como vendida antes de a venda gerar lançamento: mandar
   * carteiraId cria a receita que faltava ("Lançar venda na carteira" na ficha). Sem
   * carteiraId e sem lançamento existente, nada é criado — moto antiga não ganha
   * lançamento sozinha, só quando o usuário escolhe a carteira.
   */
  async editarVenda(userId: string, id: string, dto: EditarVendaMotoDto) {
    const motoObjectId = this.toObjectId(id, 'id');
    const userObjectId = this.toObjectId(userId, 'userId');

    const moto = await this.motoModel.findOne({ _id: motoObjectId, userId: userObjectId }).exec();
    if (!moto) throw new NotFoundException('Moto não encontrada');
    if (moto.status !== 'vendida') {
      throw new BadRequestException('Esta moto não está vendida. Use "Registrar venda" para vendê-la.');
    }

    const anterior = { valorVenda: moto.valorVenda, dataVenda: moto.dataVenda };

    if (typeof dto.valorVenda !== 'undefined') {
      if (dto.valorVenda <= 0) throw new BadRequestException('O valor da venda precisa ser maior que zero.');
      moto.valorVenda = dto.valorVenda;
    }
    if (dto.dataVenda) {
      const dataVenda = new Date(dto.dataVenda);
      if (dataVenda < moto.dataCompra) {
        throw new BadRequestException('A data da venda não pode ser anterior à data da compra.');
      }
      moto.dataVenda = dataVenda;
    }

    const carteiraObjectId = dto.carteiraId
      ? await this.garantirCarteiraDeCaixa(userObjectId, dto.carteiraId)
      : undefined;

    await moto.save();

    try {
      const lancamento = await this.lancamentoDaMoto(userObjectId, motoObjectId, 'venda_moto');

      if (!lancamento) {
        // Só cria quando a carteira foi escolhida agora: é o caminho do botão "Lançar
        // venda na carteira" das motos vendidas antes desta feature existir.
        if (carteiraObjectId) {
          await this.lancarReceitaVenda(userId, userObjectId, moto, carteiraObjectId, dto.categoryId);
        }
      } else {
        // A atualização passa por TransactionsService para o ajuste de Wallet.saldo ser o
        // mesmo de qualquer edição de transação (inclusive troca de carteira).
        await this.transactionsService.update(
          userId,
          (lancamento._id as Types.ObjectId).toString(),
          {
            value: moto.valorVenda,
            date: this.dataISO(moto.dataVenda as Date),
            ...(carteiraObjectId ? { carteiraId: carteiraObjectId.toString() } : {}),
            ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
          },
          { permitirOrigem: true },
        );
      }
    } catch (erro) {
      // Rollback manual: a moto volta aos valores anteriores se o lançamento não
      // acompanhar, senão ficha e extrato passam a mostrar valores diferentes.
      moto.valorVenda = anterior.valorVenda;
      moto.dataVenda = anterior.dataVenda;
      await moto.save();
      throw erro;
    }

    return this.umaMotoCalculada(moto, userObjectId);
  }

  /**
   * Cancela a venda: a moto volta ao estoque, os campos de venda são limpos e a receita
   * gerada é excluída (devolvendo o saldo da carteira, via TransactionsService#remove).
   * Os gastos lançados à mão na moto continuam vinculados — ela voltou para o pátio, o
   * histórico de custo dela não mudou.
   */
  async desfazerVenda(userId: string, id: string) {
    const motoObjectId = this.toObjectId(id, 'id');
    const userObjectId = this.toObjectId(userId, 'userId');

    const moto = await this.motoModel.findOne({ _id: motoObjectId, userId: userObjectId }).exec();
    if (!moto) throw new NotFoundException('Moto não encontrada');
    if (moto.status !== 'vendida') throw new BadRequestException('Esta moto não está marcada como vendida.');

    // A receita sai primeiro: se a limpeza da moto falhar depois, sobra uma moto vendida
    // sem lançamento — estado que a ficha sabe mostrar e refazer. Na ordem inversa
    // sobraria uma receita órfã no extrato, que ninguém mais acha.
    const lancamento = await this.lancamentoDaMoto(userObjectId, motoObjectId, 'venda_moto');
    if (lancamento) {
      await this.transactionsService.remove(userId, (lancamento._id as Types.ObjectId).toString(), {
        permitirOrigem: true,
      });
    }

    moto.status = 'em_estoque';
    moto.valorVenda = undefined;
    moto.dataVenda = undefined;
    await moto.save();

    return this.umaMotoCalculada(moto, userObjectId);
  }

  async remove(userId: string, id: string) {
    const motoObjectId = this.toObjectId(id, 'id');
    const userObjectId = this.toObjectId(userId, 'userId');

    const moto = await this.motoModel.findOne({ _id: motoObjectId, userId: userObjectId }).exec();
    if (!moto) throw new NotFoundException('Moto não encontrada');

    // Mesmo contrato de WalletsService#remove: uma moto com histórico financeiro não é
    // excluída, porque apagá-la deixaria as transações apontando para um documento que não
    // existe mais. Desvincule ou exclua as transações antes.
    //
    // A exceção são os lançamentos que a própria ficha gerou (compra e venda): eles só
    // existem por causa desta moto e não são alcançáveis de nenhum outro lugar, então vão
    // junto — com o saldo da carteira sendo devolvido por TransactionsService#remove.
    const lancadasAMao = await this.transactionModel.exists({
      userId: userObjectId,
      motoId: motoObjectId,
      ...MotosService.SEM_LANCAMENTO_DA_FICHA,
    });
    if (lancadasAMao) {
      throw new BadRequestException('Não é possível excluir uma moto que possui transações vinculadas.');
    }

    const geradas = await this.transactionModel
      .find({ userId: userObjectId, motoId: motoObjectId, origem: { $exists: true } })
      .exec();

    for (const lancamento of geradas) {
      await this.transactionsService.remove(userId, (lancamento._id as Types.ObjectId).toString(), {
        permitirOrigem: true,
      });
    }

    await this.motoModel.deleteOne({ _id: motoObjectId, userId: userObjectId }).exec();

    return { deleted: true };
  }

  async resumo(userId: string, id: string) {
    const motoObjectId = this.toObjectId(id, 'id');
    const userObjectId = this.toObjectId(userId, 'userId');

    const moto = await this.motoModel.findOne({ _id: motoObjectId, userId: userObjectId }).exec();
    if (!moto) throw new NotFoundException('Moto não encontrada');

    const gastosPorCategoria = await this.transactionModel
      .aggregate<GastoPorCategoria>([
        {
          $match: {
            userId: userObjectId,
            motoId: motoObjectId,
            type: TransactionType.EXPENSE,
            agendado: { $ne: true },
            ...MotosService.SEM_LANCAMENTO_DA_FICHA,
          },
        },
        { $group: { _id: '$categoryId', total: { $sum: SIGNED_VALUE_EXPR } } },
        { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'categoria' } },
        { $unwind: { path: '$categoria', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            categoryId: { $ifNull: ['$_id', null] },
            // Despesa importada por OFX pode não ter categoria (ver TransactionsService#create).
            categoria: { $ifNull: ['$categoria.name', 'Sem categoria'] },
            total: { $round: ['$total', 2] },
          },
        },
        { $sort: { total: -1 } },
      ])
      .exec();

    // Somado a partir das linhas já arredondadas de propósito: o detalhamento por categoria
    // tem que fechar exatamente com o custoGastos exibido ao lado dele.
    const custoGastos = this.arredondar(gastosPorCategoria.reduce((acc, linha) => acc + linha.total, 0));
    const custoTotal = this.arredondar(moto.valorCompra + custoGastos);
    const precoSugerido = this.arredondar(custoTotal * (1 + moto.margemDesejada / 100));

    // Quanto se pode negociar antes de a venda virar prejuízo. Sem precoAnunciado a
    // referência é o preço sugerido — nos dois casos é "preço de venda menos custo".
    const descontoMaximo = this.arredondar((moto.precoAnunciado ?? precoSugerido) - custoTotal);

    const valorVenda = moto.valorVenda;
    const lucro =
      moto.status === 'vendida' && typeof valorVenda === 'number'
        ? this.arredondar(valorVenda - custoTotal)
        : null;
    // custoTotal 0 é possível (valorCompra aceita 0 e pode não haver gasto): nesse caso o
    // percentual não existe, em vez de virar Infinity.
    const lucroPercentual = lucro !== null && custoTotal > 0 ? this.arredondar((lucro / custoTotal) * 100) : null;

    // A ficha precisa saber se a venda já virou receita: é o que decide entre "Editar
    // venda" e "Lançar venda na carteira" (moto vendida antes desta feature existir).
    const lancamento =
      moto.status === 'vendida'
        ? await this.lancamentoDaMoto(userObjectId, motoObjectId, 'venda_moto')
        : null;

    return {
      lancamentoVenda: lancamento
        ? {
            _id: lancamento._id,
            carteiraId: lancamento.carteiraId ?? null,
            categoryId: lancamento.categoryId ?? null,
          }
        : null,
      moto: {
        _id: moto._id,
        modelo: moto.modelo,
        placa: moto.placa,
        ano: moto.ano,
        status: moto.status,
        valorCompra: moto.valorCompra,
        margemDesejada: moto.margemDesejada,
        precoAnunciado: moto.precoAnunciado ?? null,
        valorVenda: valorVenda ?? null,
        dataVenda: moto.dataVenda ?? null,
      },
      custoGastos,
      custoTotal,
      gastosPorCategoria,
      precoSugerido,
      descontoMaximo,
      lucro,
      lucroPercentual,
    };
  }

  async relatorio(userId: string, query: GetRelatorioMotosDto) {
    const userObjectId = this.toObjectId(userId, 'userId');
    const { inicio, fim } = this.intervaloDoMes(query.mes);

    // Uma passada só: para cada moto, os gastos vinculados são somados duas vezes no mesmo
    // $group — o total de sempre (que forma o custoTotal, base do lucro e do capital em
    // estoque) e o recorte do mês pedido.
    const motos = await this.motoModel
      .aggregate<LinhaRelatorio>([
        { $match: { userId: userObjectId } },
        {
          $lookup: {
            from: 'transactions',
            let: { motoId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$motoId', '$$motoId'] },
                  userId: userObjectId,
                  type: TransactionType.EXPENSE,
                  agendado: { $ne: true },
                  ...MotosService.SEM_LANCAMENTO_DA_FICHA,
                },
              },
              {
                $group: {
                  _id: null,
                  gastosTotais: { $sum: SIGNED_VALUE_EXPR },
                  gastosNoMes: {
                    $sum: {
                      $cond: [
                        { $and: [{ $gte: ['$date', inicio] }, { $lte: ['$date', fim] }] },
                        SIGNED_VALUE_EXPR,
                        0,
                      ],
                    },
                  },
                },
              },
            ],
            as: 'gastos',
          },
        },
        {
          $addFields: {
            gastosTotais: { $ifNull: [{ $arrayElemAt: ['$gastos.gastosTotais', 0] }, 0] },
            gastosNoMes: { $ifNull: [{ $arrayElemAt: ['$gastos.gastosNoMes', 0] }, 0] },
          },
        },
        {
          $addFields: {
            custoTotal: { $add: ['$valorCompra', '$gastosTotais'] },
            vendidaNoMes: {
              $and: [
                { $eq: ['$status', 'vendida'] },
                { $gte: ['$dataVenda', inicio] },
                { $lte: ['$dataVenda', fim] },
              ],
            },
          },
        },
        // Entra no relatório o que ainda está em estoque, o que foi vendido no mês e o que
        // consumiu dinheiro no mês (mesmo já vendido antes). É essa união que faz o
        // gastosDoMes abaixo fechar com a soma da coluna de gastos.
        {
          $match: {
            $or: [{ status: 'em_estoque' }, { vendidaNoMes: true }, { gastosNoMes: { $ne: 0 } }],
          },
        },
        {
          $project: {
            modelo: 1,
            placa: 1,
            status: 1,
            valorCompra: 1,
            valorVenda: { $ifNull: ['$valorVenda', null] },
            dataVenda: { $ifNull: ['$dataVenda', null] },
            vendidaNoMes: 1,
            gastosNoMes: { $round: ['$gastosNoMes', 2] },
            custoTotal: { $round: ['$custoTotal', 2] },
            lucro: {
              $cond: [
                '$vendidaNoMes',
                { $round: [{ $subtract: [{ $ifNull: ['$valorVenda', 0] }, '$custoTotal'] }, 2] },
                null,
              ],
            },
          },
        },
        { $sort: { modelo: 1, _id: 1 } },
      ])
      .exec();

    const vendidasNoMes = motos.filter((linha) => linha.vendidaNoMes);

    return {
      mes: query.mes,
      motos,
      totais: {
        // Dinheiro parado no estoque: o que já foi posto em cada moto não vendida, compra
        // mais gastos — não é a soma dos valores de compra.
        capitalEmEstoque: this.arredondar(
          motos.filter((linha) => linha.status === 'em_estoque').reduce((acc, linha) => acc + linha.custoTotal, 0),
        ),
        gastosDoMes: this.arredondar(motos.reduce((acc, linha) => acc + linha.gastosNoMes, 0)),
        lucroDoMes: this.arredondar(vendidasNoMes.reduce((acc, linha) => acc + (linha.lucro ?? 0), 0)),
        quantidadeVendida: vendidasNoMes.length,
      },
    };
  }
}
