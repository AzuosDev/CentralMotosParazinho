import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Moto, MotoDocument } from './schemas/moto.schema';
import { Transaction, TransactionDocument } from '../transactions/schemas/transaction.schema';
import { CreateMotoDto } from './dto/create-moto.dto';
import { UpdateMotoDto } from './dto/update-moto.dto';
import { VenderMotoDto } from './dto/vender-moto.dto';
import { GetMotosDto } from './dto/get-motos.dto';

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

  // Guarda a placa num formato só: maiúsculas, sem hífen nem espaço. Sem isso "ABC-1D23" e
  // "abc1d23" viram duas motos diferentes e o índice único por usuário não pega a duplicata.
  private normalizarPlaca(placa: string) {
    return placa.replace(/[\s-]/g, '').toUpperCase();
  }

  private normalizarChassi(chassi: string) {
    return chassi.replace(/[\s-]/g, '').toUpperCase();
  }

  // margemDesejada é percentual sobre valorCompra. Exposto na leitura para a tela não ter
  // que repetir a conta, e mantido fora do documento para não desatualizar quando o
  // valorCompra ou a margem forem editados.
  private comCamposCalculados(moto: MotoDocument) {
    const obj = moto.toObject();
    const precoSugerido = moto.valorCompra * (1 + moto.margemDesejada / 100);
    const lucro = typeof moto.valorVenda === 'number' ? moto.valorVenda - moto.valorCompra : null;

    return {
      ...obj,
      precoSugerido: Math.round(precoSugerido * 100) / 100,
      lucro: lucro === null ? null : Math.round(lucro * 100) / 100,
    };
  }

  private async garantirPlacaLivre(userObjectId: Types.ObjectId, placa: string, ignorarId?: Types.ObjectId) {
    const filtro: FilterQuery<MotoDocument> = { userId: userObjectId, placa };
    if (ignorarId) filtro._id = { $ne: ignorarId };

    const existente = await this.motoModel.exists(filtro);
    if (existente) throw new ConflictException(`Já existe uma moto cadastrada com a placa ${placa}.`);
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

    return this.comCamposCalculados(moto);
  }

  async findAll(userId: string, query: GetMotosDto) {
    const filtro: FilterQuery<MotoDocument> = { userId: this.toObjectId(userId, 'userId') };
    if (query.status) filtro.status = query.status;

    const motos = await this.motoModel.find(filtro).sort({ dataCompra: -1, _id: -1 }).exec();
    return motos.map((moto) => this.comCamposCalculados(moto));
  }

  async findOne(userId: string, id: string) {
    const moto = await this.motoModel.findOne({
      _id: this.toObjectId(id, 'id'),
      userId: this.toObjectId(userId, 'userId'),
    }).exec();

    if (!moto) throw new NotFoundException('Moto não encontrada');
    return this.comCamposCalculados(moto);
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
    return this.comCamposCalculados(moto);
  }

  async vender(userId: string, id: string, dto: VenderMotoDto) {
    const moto = await this.motoModel.findOne({
      _id: this.toObjectId(id, 'id'),
      userId: this.toObjectId(userId, 'userId'),
    }).exec();

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
    return this.comCamposCalculados(moto);
  }

  async remove(userId: string, id: string) {
    const motoObjectId = this.toObjectId(id, 'id');
    const userObjectId = this.toObjectId(userId, 'userId');

    // Mesmo contrato de WalletsService#remove: uma moto com histórico financeiro não é
    // excluída, porque apagá-la deixaria as transações apontando para um documento que não
    // existe mais. `motoId` ainda não é um campo de Transaction — este filtro já fica no
    // lugar para o dia em que a vinculação entrar, e por ora casa zero documentos
    // (strictQuery é false no Mongoose 7, então a condição vai para o Mongo em vez de ser
    // descartada do filtro).
    const vinculada = await this.transactionModel.exists({ userId: userObjectId, motoId: motoObjectId });
    if (vinculada) {
      throw new BadRequestException('Não é possível excluir uma moto que possui transações vinculadas.');
    }

    const moto = await this.motoModel.findOneAndDelete({ _id: motoObjectId, userId: userObjectId }).exec();
    if (!moto) throw new NotFoundException('Moto não encontrada');

    return { deleted: true };
  }
}
