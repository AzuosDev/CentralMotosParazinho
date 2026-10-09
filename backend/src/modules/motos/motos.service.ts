import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Moto, MotoDocument } from './schemas/moto.schema';
import { Transaction, TransactionDocument, TransactionType } from '../transactions/schemas/transaction.schema';
import { SIGNED_VALUE_EXPR } from '../transactions/transaction-aggregation.util';
import { CreateMotoDto } from './dto/create-moto.dto';
import { UpdateMotoDto } from './dto/update-moto.dto';
import { VenderMotoDto } from './dto/vender-moto.dto';
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

@Injectable()
export class MotosService {
  constructor(
    @InjectModel(Moto.name) private motoModel: Model<MotoDocument>,
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
  ) {}

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

    // Moto recém-criada não tem gasto vinculado: custoGastos é 0 sem precisar consultar.
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
    return this.umaMotoCalculada(moto, userObjectId);
  }

  async vender(userId: string, id: string, dto: VenderMotoDto) {
    const userObjectId = this.toObjectId(userId, 'userId');
    const moto = await this.motoModel.findOne({ _id: this.toObjectId(id, 'id'), userId: userObjectId }).exec();

    if (!moto) throw new NotFoundException('Moto não encontrada');
    if (moto.status === 'vendida') throw new BadRequestException('Esta moto já está marcada como vendida.');

    const dataVenda = new Date(dto.dataVenda);
    if (dataVenda < moto.dataCompra) {
      throw new BadRequestException('A data da venda não pode ser anterior à data da compra.');
    }

    moto.status = 'vendida';
    moto.valorVenda = dto.valorVenda;
    moto.dataVenda = dataVenda;

    await moto.save();
    return this.umaMotoCalculada(moto, userObjectId);
  }

  async remove(userId: string, id: string) {
    const motoObjectId = this.toObjectId(id, 'id');
    const userObjectId = this.toObjectId(userId, 'userId');

    // Mesmo contrato de WalletsService#remove: uma moto com histórico financeiro não é
    // excluída, porque apagá-la deixaria as transações apontando para um documento que não
    // existe mais. Desvincule ou exclua as transações antes.
    const vinculada = await this.transactionModel.exists({ userId: userObjectId, motoId: motoObjectId });
    if (vinculada) {
      throw new BadRequestException('Não é possível excluir uma moto que possui transações vinculadas.');
    }

    const moto = await this.motoModel.findOneAndDelete({ _id: motoObjectId, userId: userObjectId }).exec();
    if (!moto) throw new NotFoundException('Moto não encontrada');

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

    return {
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
