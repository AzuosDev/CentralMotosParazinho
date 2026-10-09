import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, ExecutionContext } from '@nestjs/common';
import request from 'supertest';
import { MotosModule } from './motos.module';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Moto } from './schemas/moto.schema';

const FAKE_USER_ID = new Types.ObjectId().toString();
const OUTRO_USER_ID = new Types.ObjectId().toString();

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
  });

  afterAll(async () => {
    await app.close();
    await mongod.stop();
  });

  beforeEach(async () => {
    await motoModel.deleteMany({}).exec();
  });

  it('POST cria a moto em estoque, normaliza a placa e calcula o preco sugerido', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/motos')
      .send({ ...motoBase, placa: 'abc-1d23' })
      .expect(201);

    expect(res.body.status).toBe('em_estoque');
    expect(res.body.placa).toBe('ABC1D23');
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
    const criada = await request(app.getHttpServer()).post('/api/motos').send(motoBase).expect(201);
    await request(app.getHttpServer())
      .post('/api/motos')
      .send({ ...motoBase, placa: 'XYZ9W88', chassi: '9C2KC2200NR000002' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/motos/${criada.body._id}/vender`)
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

  it('PATCH :id/vender marca como vendida e calcula o lucro', async () => {
    const criada = await request(app.getHttpServer()).post('/api/motos').send(motoBase).expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/api/motos/${criada.body._id}/vender`)
      .send({ valorVenda: 17500, dataVenda: '2026-03-05' })
      .expect(200);

    expect(res.body.status).toBe('vendida');
    expect(res.body.valorVenda).toBe(17500);
    expect(res.body.lucro).toBe(3500);
  });

  it('PATCH :id/vender recusa vender duas vezes', async () => {
    const criada = await request(app.getHttpServer()).post('/api/motos').send(motoBase).expect(201);
    const venda = { valorVenda: 17500, dataVenda: '2026-03-05' };

    await request(app.getHttpServer()).patch(`/api/motos/${criada.body._id}/vender`).send(venda).expect(200);
    await request(app.getHttpServer()).patch(`/api/motos/${criada.body._id}/vender`).send(venda).expect(400);
  });

  it('PATCH :id/vender recusa data de venda anterior a compra', async () => {
    const criada = await request(app.getHttpServer()).post('/api/motos').send(motoBase).expect(201);

    await request(app.getHttpServer())
      .patch(`/api/motos/${criada.body._id}/vender`)
      .send({ valorVenda: 17500, dataVenda: '2025-12-01' })
      .expect(400);
  });

  it('PATCH :id edita os dados e recusa status no corpo', async () => {
    const criada = await request(app.getHttpServer()).post('/api/motos').send(motoBase).expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/api/motos/${criada.body._id}`)
      .send({ km: 13500, precoAnunciado: 16500 })
      .expect(200);

    expect(res.body.km).toBe(13500);
    expect(res.body.precoAnunciado).toBe(16500);

    await request(app.getHttpServer())
      .patch(`/api/motos/${criada.body._id}`)
      .send({ status: 'vendida' })
      .expect(400);
  });

  it('DELETE remove a moto e recusa a de outro usuario', async () => {
    const criada = await request(app.getHttpServer()).post('/api/motos').send(motoBase).expect(201);
    await request(app.getHttpServer()).delete(`/api/motos/${criada.body._id}`).expect(200);
    await request(app.getHttpServer()).get(`/api/motos/${criada.body._id}`).expect(404);

    const deOutro = await motoModel.create({
      ...motoBase,
      userId: new Types.ObjectId(OUTRO_USER_ID),
      dataCompra: new Date(motoBase.dataCompra),
    });
    await request(app.getHttpServer()).delete(`/api/motos/${deOutro._id}`).expect(404);
    expect(await motoModel.exists({ _id: deOutro._id })).toBeTruthy();
  });

  it('DELETE bloqueia quando existe transacao vinculada a moto', async () => {
    const criada = await request(app.getHttpServer()).post('/api/motos').send(motoBase).expect(201);

    // `motoId` ainda nao e um campo declarado em Transaction (a vinculacao e de outro
    // modulo). Inserindo direto na colecao, o guard de remove() e exercitado de verdade.
    await motoModel.db.collection('transactions').insertOne({
      userId: new Types.ObjectId(FAKE_USER_ID),
      motoId: new Types.ObjectId(criada.body._id),
      type: 'EXPENSE',
      value: 500,
      date: new Date('2026-02-01'),
    });

    const res = await request(app.getHttpServer()).delete(`/api/motos/${criada.body._id}`).expect(400);
    expect(res.body.message).toContain('transações vinculadas');
    expect(await motoModel.exists({ _id: criada.body._id })).toBeTruthy();

    await motoModel.db.collection('transactions').deleteMany({});
  });

  it('rejeita um id malformado', async () => {
    await request(app.getHttpServer()).get('/api/motos/nao-e-objectid').expect(400);
  });
});
