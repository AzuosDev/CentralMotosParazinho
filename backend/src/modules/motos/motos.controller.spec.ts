import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, ExecutionContext } from '@nestjs/common';
import request from 'supertest';
import { MotosModule } from './motos.module';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Moto } from './schemas/moto.schema';
import { Transaction, TransactionType } from '../transactions/schemas/transaction.schema';

const FAKE_USER_ID = new Types.ObjectId().toString();
const OUTRO_USER_ID = new Types.ObjectId().toString();

const CATEGORIA_PECAS = new Types.ObjectId();
const CATEGORIA_MAO_DE_OBRA = new Types.ObjectId();

const motoBase = {
  modelo: 'Honda CG 160 Titan',
  ano: 2022,
  placa: 'ABC1D23',
  chassi: '9C2KC2200NR000001',
  cor: 'Vermelha',
  km: 12000,
  valorCompra: 14000,
  dataCompra: '2026-01-10',
  margemDesejada: 20,
};

describe('MotosController (e2e)', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  let motoModel: Model<Moto>;
  let transactionModel: Model<Transaction>;

  // MotosModule não registra o model de Category (o resumo resolve o nome por $lookup na
  // coleção, não pelo model), então as categorias de teste vão direto na coleção.
  const semearCategorias = async () => {
    await motoModel.db.collection('categories').insertMany([
      { _id: CATEGORIA_PECAS, name: 'Peças', slug: 'pecas', isDefault: true },
      { _id: CATEGORIA_MAO_DE_OBRA, name: 'Mão de obra', slug: 'mao-de-obra', isDefault: true },
    ]);
  };

  const gasto = (motoId: string, value: number, date: string, extra: Record<string, unknown> = {}) =>
    transactionModel.create({
      userId: new Types.ObjectId(FAKE_USER_ID),
      type: TransactionType.EXPENSE,
      value,
      date: new Date(date),
      motoId: new Types.ObjectId(motoId),
      ...extra,
    });

  const criarMoto = async (overrides: Record<string, unknown> = {}) => {
    const res = await request(app.getHttpServer())
      .post('/api/motos')
      .send({ ...motoBase, ...overrides })
      .expect(201);
    return res.body;
  };

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const mongoUri = mongod.getUri();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        MongooseModule.forRootAsync({ useFactory: () => ({ uri: mongoUri }) }),
        MotosModule,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = { _id: new Types.ObjectId(FAKE_USER_ID) };
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    motoModel = app.get<Model<Moto>>(getModelToken(Moto.name));
    transactionModel = app.get<Model<Transaction>>(getModelToken(Transaction.name));
  });

  afterAll(async () => {
    await app.close();
    await mongod.stop();
  });

  beforeEach(async () => {
    await motoModel.deleteMany({}).exec();
    await transactionModel.deleteMany({}).exec();
    await motoModel.db.collection('categories').deleteMany({});
    await semearCategorias();
  });

  it('POST cria a moto em estoque, normaliza a placa e calcula o preco sugerido', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/motos')
      .send({ ...motoBase, placa: 'abc-1d23' })
      .expect(201);

    expect(res.body.status).toBe('em_estoque');
    expect(res.body.placa).toBe('ABC1D23');
    expect(res.body.custoGastos).toBe(0);
    expect(res.body.custoTotal).toBe(14000);
    expect(res.body.precoSugerido).toBe(16800);
    expect(res.body.lucro).toBeNull();
  });

  it('POST recusa a segunda moto com a mesma placa do mesmo usuario', async () => {
    await request(app.getHttpServer()).post('/api/motos').send(motoBase).expect(201);
    await request(app.getHttpServer()).post('/api/motos').send({ ...motoBase, placa: 'ABC-1D23' }).expect(409);
  });

  it('POST recusa payload sem os campos obrigatorios', async () => {
    const { modelo: _modelo, ...semModelo } = motoBase;
    await request(app.getHttpServer()).post('/api/motos').send(semModelo).expect(400);
  });

  it('GET filtra por status', async () => {
    const criada = await criarMoto();
    await criarMoto({ placa: 'XYZ9W88', chassi: '9C2KC2200NR000002' });

    await request(app.getHttpServer())
      .patch(`/api/motos/${criada._id}/vender`)
      .send({ valorVenda: 17000, dataVenda: '2026-03-05' })
      .expect(200);

    const estoque = await request(app.getHttpServer()).get('/api/motos?status=em_estoque').expect(200);
    expect(estoque.body).toHaveLength(1);
    expect(estoque.body[0].placa).toBe('XYZ9W88');

    const vendidas = await request(app.getHttpServer()).get('/api/motos?status=vendida').expect(200);
    expect(vendidas.body).toHaveLength(1);
    expect(vendidas.body[0].valorVenda).toBe(17000);

    const todas = await request(app.getHttpServer()).get('/api/motos').expect(200);
    expect(todas.body).toHaveLength(2);
  });

  it('GET recusa um status fora do enum', async () => {
    await request(app.getHttpServer()).get('/api/motos?status=sucata').expect(400);
  });

  it('GET :id nao devolve a moto de outro usuario', async () => {
    const deOutro = await motoModel.create({
      ...motoBase,
      userId: new Types.ObjectId(OUTRO_USER_ID),
      dataCompra: new Date(motoBase.dataCompra),
    });

    await request(app.getHttpServer()).get(`/api/motos/${deOutro._id}`).expect(404);
    const lista = await request(app.getHttpServer()).get('/api/motos').expect(200);
    expect(lista.body).toHaveLength(0);
  });

  // O precoSugerido da listagem tem que ser o mesmo número do resumo: se a listagem usasse
  // só o valorCompra como base, a mesma moto apareceria com dois preços na mesma tela.
  it('GET reflete os gastos vinculados no custoTotal e no precoSugerido', async () => {
    const criada = await criarMoto();
    await gasto(criada._id, 1000, '2026-02-01', { categoryId: CATEGORIA_PECAS });

    const lista = await request(app.getHttpServer()).get('/api/motos').expect(200);
    expect(lista.body[0].custoGastos).toBe(1000);
    expect(lista.body[0].custoTotal).toBe(15000);
    expect(lista.body[0].precoSugerido).toBe(18000);

    const resumo = await request(app.getHttpServer()).get(`/api/motos/${criada._id}/resumo`).expect(200);
    expect(resumo.body.precoSugerido).toBe(lista.body[0].precoSugerido);
  });

  it('PATCH :id/vender marca como vendida e calcula o lucro', async () => {
    const criada = await criarMoto();

    const res = await request(app.getHttpServer())
      .patch(`/api/motos/${criada._id}/vender`)
      .send({ valorVenda: 17500, dataVenda: '2026-03-05' })
      .expect(200);

    expect(res.body.status).toBe('vendida');
    expect(res.body.valorVenda).toBe(17500);
    expect(res.body.lucro).toBe(3500);
  });

  it('PATCH :id/vender recusa vender duas vezes', async () => {
    const criada = await criarMoto();
    const venda = { valorVenda: 17500, dataVenda: '2026-03-05' };

    await request(app.getHttpServer()).patch(`/api/motos/${criada._id}/vender`).send(venda).expect(200);
    await request(app.getHttpServer()).patch(`/api/motos/${criada._id}/vender`).send(venda).expect(400);
  });

  it('PATCH :id/vender recusa data de venda anterior a compra', async () => {
    const criada = await criarMoto();

    await request(app.getHttpServer())
      .patch(`/api/motos/${criada._id}/vender`)
      .send({ valorVenda: 17500, dataVenda: '2025-12-01' })
      .expect(400);
  });

  it('PATCH :id edita os dados e recusa status no corpo', async () => {
    const criada = await criarMoto();

    const res = await request(app.getHttpServer())
      .patch(`/api/motos/${criada._id}`)
      .send({ km: 13500, precoAnunciado: 16500 })
      .expect(200);

    expect(res.body.km).toBe(13500);
    expect(res.body.precoAnunciado).toBe(16500);

    await request(app.getHttpServer())
      .patch(`/api/motos/${criada._id}`)
      .send({ status: 'vendida' })
      .expect(400);
  });

  it('DELETE remove a moto e recusa a de outro usuario', async () => {
    const criada = await criarMoto();
    await request(app.getHttpServer()).delete(`/api/motos/${criada._id}`).expect(200);
    await request(app.getHttpServer()).get(`/api/motos/${criada._id}`).expect(404);

    const deOutro = await motoModel.create({
      ...motoBase,
      userId: new Types.ObjectId(OUTRO_USER_ID),
      dataCompra: new Date(motoBase.dataCompra),
    });
    await request(app.getHttpServer()).delete(`/api/motos/${deOutro._id}`).expect(404);
    expect(await motoModel.exists({ _id: deOutro._id })).toBeTruthy();
  });

  it('DELETE bloqueia quando existe transacao vinculada a moto', async () => {
    const criada = await criarMoto();
    await gasto(criada._id, 500, '2026-02-01', { categoryId: CATEGORIA_PECAS });

    const res = await request(app.getHttpServer()).delete(`/api/motos/${criada._id}`).expect(400);
    expect(res.body.message).toContain('transações vinculadas');
    expect(await motoModel.exists({ _id: criada._id })).toBeTruthy();
  });

  it('rejeita um id malformado', async () => {
    await request(app.getHttpServer()).get('/api/motos/nao-e-objectid').expect(400);
  });

  describe('GET :id/resumo', () => {
    it('soma os gastos, detalha por categoria e calcula o desconto maximo', async () => {
      const criada = await criarMoto();
      await gasto(criada._id, 800, '2026-02-01', { categoryId: CATEGORIA_PECAS });
      await gasto(criada._id, 200, '2026-02-05', { categoryId: CATEGORIA_PECAS });
      await gasto(criada._id, 500, '2026-02-10', { categoryId: CATEGORIA_MAO_DE_OBRA });

      const res = await request(app.getHttpServer()).get(`/api/motos/${criada._id}/resumo`).expect(200);

      expect(res.body.custoGastos).toBe(1500);
      expect(res.body.custoTotal).toBe(15500);
      expect(res.body.precoSugerido).toBe(18600);
      // Sem precoAnunciado a referência é o preço sugerido, então o desconto é a margem.
      expect(res.body.descontoMaximo).toBe(3100);
      expect(res.body.lucro).toBeNull();
      expect(res.body.lucroPercentual).toBeNull();

      expect(res.body.gastosPorCategoria).toEqual([
        { categoryId: CATEGORIA_PECAS.toString(), categoria: 'Peças', total: 1000 },
        { categoryId: CATEGORIA_MAO_DE_OBRA.toString(), categoria: 'Mão de obra', total: 500 },
      ]);
      const somaDetalhe = res.body.gastosPorCategoria.reduce(
        (acc: number, linha: { total: number }) => acc + linha.total,
        0,
      );
      expect(somaDetalhe).toBe(res.body.custoGastos);
    });

    it('usa o precoAnunciado como referencia do desconto maximo quando existe', async () => {
      const criada = await criarMoto({ precoAnunciado: 19000 });
      await gasto(criada._id, 1500, '2026-02-01', { categoryId: CATEGORIA_PECAS });

      const res = await request(app.getHttpServer()).get(`/api/motos/${criada._id}/resumo`).expect(200);

      expect(res.body.custoTotal).toBe(15500);
      expect(res.body.descontoMaximo).toBe(3500);
    });

    it('calcula lucro e lucroPercentual sobre o custo total, nao sobre o valor de compra', async () => {
      const criada = await criarMoto();
      await gasto(criada._id, 1500, '2026-02-01', { categoryId: CATEGORIA_PECAS });
      await request(app.getHttpServer())
        .patch(`/api/motos/${criada._id}/vender`)
        .send({ valorVenda: 19000, dataVenda: '2026-03-05' })
        .expect(200);

      const res = await request(app.getHttpServer()).get(`/api/motos/${criada._id}/resumo`).expect(200);

      expect(res.body.custoTotal).toBe(15500);
      expect(res.body.lucro).toBe(3500);
      // 3500 / 15500 — sobre o valorCompra daria 25%, que é o número errado.
      expect(res.body.lucroPercentual).toBe(22.58);
    });

    it('desconta estorno, ignora gasto agendado e ignora transacao que nao e despesa', async () => {
      const criada = await criarMoto();
      await gasto(criada._id, 1000, '2026-02-01', { categoryId: CATEGORIA_PECAS });
      await gasto(criada._id, 300, '2026-02-02', { categoryId: CATEGORIA_PECAS, isEstorno: true });
      await gasto(criada._id, 400, '2027-01-01', { categoryId: CATEGORIA_PECAS, agendado: true });
      await transactionModel.create({
        userId: new Types.ObjectId(FAKE_USER_ID),
        type: TransactionType.INCOME,
        value: 900,
        date: new Date('2026-02-03'),
        motoId: new Types.ObjectId(criada._id),
      });

      const res = await request(app.getHttpServer()).get(`/api/motos/${criada._id}/resumo`).expect(200);

      expect(res.body.custoGastos).toBe(700);
      expect(res.body.custoTotal).toBe(14700);
    });

    it('nao soma gasto de outro usuario vinculado a mesma moto', async () => {
      const criada = await criarMoto();
      await transactionModel.create({
        userId: new Types.ObjectId(OUTRO_USER_ID),
        type: TransactionType.EXPENSE,
        value: 5000,
        date: new Date('2026-02-01'),
        motoId: new Types.ObjectId(criada._id),
        categoryId: CATEGORIA_PECAS,
      });

      const res = await request(app.getHttpServer()).get(`/api/motos/${criada._id}/resumo`).expect(200);
      expect(res.body.custoGastos).toBe(0);
    });

    it('devolve 404 para a moto de outro usuario', async () => {
      const deOutro = await motoModel.create({
        ...motoBase,
        userId: new Types.ObjectId(OUTRO_USER_ID),
        dataCompra: new Date(motoBase.dataCompra),
      });

      await request(app.getHttpServer()).get(`/api/motos/${deOutro._id}/resumo`).expect(404);
    });
  });

  describe('GET /relatorio', () => {
    it('devolve os gastos do mes por moto e fecha os totais', async () => {
      const emEstoque = await criarMoto({ modelo: 'A CG 160', placa: 'AAA1A11', chassi: '9C2KC2200NR000010' });
      await gasto(emEstoque._id, 500, '2026-03-04', { categoryId: CATEGORIA_PECAS });
      await gasto(emEstoque._id, 200, '2026-02-04', { categoryId: CATEGORIA_PECAS });

      const vendidaNoMes = await criarMoto({ modelo: 'B Fan 160', placa: 'BBB2B22', chassi: '9C2KC2200NR000011' });
      await gasto(vendidaNoMes._id, 1000, '2026-03-06', { categoryId: CATEGORIA_MAO_DE_OBRA });
      await request(app.getHttpServer())
        .patch(`/api/motos/${vendidaNoMes._id}/vender`)
        .send({ valorVenda: 18000, dataVenda: '2026-03-20' })
        .expect(200);

      // Vendida em janeiro e sem gasto em março: fica fora do relatório de março.
      const vendidaAntes = await criarMoto({ modelo: 'C Biz 125', placa: 'CCC3C33', chassi: '9C2KC2200NR000012' });
      await request(app.getHttpServer())
        .patch(`/api/motos/${vendidaAntes._id}/vender`)
        .send({ valorVenda: 11000, dataVenda: '2026-01-20' })
        .expect(200);

      const res = await request(app.getHttpServer()).get('/api/motos/relatorio?mes=2026-03').expect(200);

      expect(res.body.mes).toBe('2026-03');
      expect(res.body.motos).toHaveLength(2);

      const [a, b] = res.body.motos;
      expect(a.placa).toBe('AAA1A11');
      expect(a.status).toBe('em_estoque');
      expect(a.gastosNoMes).toBe(500);
      // custoTotal usa todos os gastos (500 de março + 200 de fevereiro), não só o do mês.
      expect(a.custoTotal).toBe(14700);
      expect(a.lucro).toBeNull();

      expect(b.placa).toBe('BBB2B22');
      expect(b.status).toBe('vendida');
      expect(b.vendidaNoMes).toBe(true);
      expect(b.gastosNoMes).toBe(1000);
      expect(b.custoTotal).toBe(15000);
      expect(b.lucro).toBe(3000);

      expect(res.body.totais).toEqual({
        capitalEmEstoque: 14700,
        gastosDoMes: 1500,
        lucroDoMes: 3000,
        quantidadeVendida: 1,
      });
    });

    it('inclui moto vendida antes do mes se ela consumiu dinheiro no mes', async () => {
      const criada = await criarMoto();
      await request(app.getHttpServer())
        .patch(`/api/motos/${criada._id}/vender`)
        .send({ valorVenda: 17000, dataVenda: '2026-01-20' })
        .expect(200);
      await gasto(criada._id, 250, '2026-03-02', { categoryId: CATEGORIA_PECAS });

      const res = await request(app.getHttpServer()).get('/api/motos/relatorio?mes=2026-03').expect(200);

      expect(res.body.motos).toHaveLength(1);
      expect(res.body.motos[0].gastosNoMes).toBe(250);
      // Vendida fora do mês: não entra no lucro nem na contagem de vendas de março.
      expect(res.body.motos[0].lucro).toBeNull();
      expect(res.body.totais.lucroDoMes).toBe(0);
      expect(res.body.totais.quantidadeVendida).toBe(0);
      expect(res.body.totais.capitalEmEstoque).toBe(0);
      expect(res.body.totais.gastosDoMes).toBe(250);
    });

    it('devolve totais zerados quando o mes nao tem movimento nem estoque', async () => {
      const res = await request(app.getHttpServer()).get('/api/motos/relatorio?mes=2026-07').expect(200);

      expect(res.body.motos).toEqual([]);
      expect(res.body.totais).toEqual({
        capitalEmEstoque: 0,
        gastosDoMes: 0,
        lucroDoMes: 0,
        quantidadeVendida: 0,
      });
    });

    it('recusa mes ausente ou fora do formato AAAA-MM', async () => {
      await request(app.getHttpServer()).get('/api/motos/relatorio').expect(400);
      await request(app.getHttpServer()).get('/api/motos/relatorio?mes=2026-13').expect(400);
      await request(app.getHttpServer()).get('/api/motos/relatorio?mes=03-2026').expect(400);
    });

    it('nao inclui a moto de outro usuario', async () => {
      await motoModel.create({
        ...motoBase,
        userId: new Types.ObjectId(OUTRO_USER_ID),
        dataCompra: new Date(motoBase.dataCompra),
      });

      const res = await request(app.getHttpServer()).get('/api/motos/relatorio?mes=2026-01').expect(200);
      expect(res.body.motos).toEqual([]);
      expect(res.body.totais.capitalEmEstoque).toBe(0);
    });
  });
});
