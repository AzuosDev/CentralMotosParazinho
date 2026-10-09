import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, ExecutionContext } from '@nestjs/common';
import request from 'supertest';
import { TransactionsModule } from './transactions.module';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Wallet } from '../wallets/schemas/wallet.schema';
import { Transaction, TransactionType } from './schemas/transaction.schema';
import { Moto } from '../motos/schemas/moto.schema';
import { Category } from '../categories/schemas/category.schema';

const FAKE_USER_ID = new Types.ObjectId().toString();

describe('TransactionsController (e2e)', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  let walletModel: Model<Wallet>;
  let transactionModel: Model<Transaction>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const mongoUri = mongod.getUri();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        MongooseModule.forRootAsync({
          useFactory: () => ({ uri: mongoUri }),
        }),
        TransactionsModule,
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
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();

    walletModel = app.get<Model<Wallet>>(getModelToken(Wallet.name));
    transactionModel = app.get<Model<Transaction>>(getModelToken(Transaction.name));
  });

  afterAll(async () => {
    await app.close();
    await mongod.stop();
  });

  it('GET injects a virtual wallet for legacy transactions without carteiraId', async () => {
    await transactionModel.create({
      userId: new Types.ObjectId(FAKE_USER_ID),
      type: TransactionType.EXPENSE,
      value: 50,
      date: new Date('2026-01-10'),
      description: 'Gasto legado sem carteira',
    });

    const res = await request(app.getHttpServer()).get('/api/transactions').expect(200);
    const item = (res.body.data as Array<{ description: string; carteira?: { nome: string; tipo: string } }>).find(
      (t) => t.description === 'Gasto legado sem carteira',
    );
    expect(item).toBeDefined();
    expect(item!.carteira?.tipo).toBe('VIRTUAL');
    expect(item!.carteira?.nome).toBe('Saldo Histórico (Sem Carteira)');
  });

  it('GET does not inject a virtual wallet when carteiraId is present', async () => {
    const wallet = await walletModel.create({ userId: new Types.ObjectId(FAKE_USER_ID), nome: 'Carteira real', saldo: 0 });
    await transactionModel.create({
      userId: new Types.ObjectId(FAKE_USER_ID),
      type: TransactionType.EXPENSE,
      value: 30,
      date: new Date('2026-01-11'),
      description: 'Gasto com carteira',
      carteiraId: wallet._id,
    });

    const res = await request(app.getHttpServer()).get('/api/transactions').expect(200);
    const item = (res.body.data as Array<{ description: string; carteira?: unknown }>).find(
      (t) => t.description === 'Gasto com carteira',
    );
    expect(item).toBeDefined();
    expect(item!.carteira).toBeUndefined();
  });

  it('PATCH /bulk-wallet associates legacy transactions and updates wallet saldo by net impact', async () => {
    const wallet = await walletModel.create({ userId: new Types.ObjectId(FAKE_USER_ID), nome: 'Carteira destino', saldo: 0 });

    const expense = await transactionModel.create({
      userId: new Types.ObjectId(FAKE_USER_ID),
      type: TransactionType.EXPENSE,
      value: 100,
      date: new Date('2026-02-01'),
      description: 'Despesa legada',
    });
    const income = await transactionModel.create({
      userId: new Types.ObjectId(FAKE_USER_ID),
      type: TransactionType.INCOME,
      value: 40,
      date: new Date('2026-02-02'),
      description: 'Receita legada',
    });

    const res = await request(app.getHttpServer())
      .patch('/api/transactions/bulk-wallet')
      .send({ transactionIds: [expense._id.toString(), income._id.toString()], targetWalletId: wallet._id.toString() })
      .expect(200);

    expect(res.body.updatedCount).toBe(2);
    expect(res.body.impact).toBe(40 - 100);

    const updatedExpense = await transactionModel.findById(expense._id).exec();
    const updatedIncome = await transactionModel.findById(income._id).exec();
    expect(updatedExpense!.carteiraId?.toString()).toBe(wallet._id.toString());
    expect(updatedIncome!.carteiraId?.toString()).toBe(wallet._id.toString());

    const updatedWallet = await walletModel.findById(wallet._id).exec();
    expect(updatedWallet!.saldo).toBe(40 - 100);
  });

  it('PATCH /bulk-wallet rejects transactions that already have a wallet', async () => {
    const walletA = await walletModel.create({ userId: new Types.ObjectId(FAKE_USER_ID), nome: 'A', saldo: 0 });
    const walletB = await walletModel.create({ userId: new Types.ObjectId(FAKE_USER_ID), nome: 'B', saldo: 0 });
    const tx = await transactionModel.create({
      userId: new Types.ObjectId(FAKE_USER_ID),
      type: TransactionType.EXPENSE,
      value: 10,
      date: new Date('2026-02-03'),
      carteiraId: walletA._id,
    });

    await request(app.getHttpServer())
      .patch('/api/transactions/bulk-wallet')
      .send({ transactionIds: [tx._id.toString()], targetWalletId: walletB._id.toString() })
      .expect(400);
  });

  it('PATCH /bulk-wallet returns 404 when target wallet does not belong to the user', async () => {
    const otherUserWallet = await walletModel.create({ userId: new Types.ObjectId(), nome: 'De outro usuário', saldo: 0 });
    const tx = await transactionModel.create({
      userId: new Types.ObjectId(FAKE_USER_ID),
      type: TransactionType.EXPENSE,
      value: 10,
      date: new Date('2026-02-04'),
    });

    await request(app.getHttpServer())
      .patch('/api/transactions/bulk-wallet')
      .send({ transactionIds: [tx._id.toString()], targetWalletId: otherUserWallet._id.toString() })
      .expect(404);
  });

  it('GET ?semCategoria=true retorna apenas transações sem categoryId e não lança erro', async () => {
    const categoryId = new Types.ObjectId();
    await transactionModel.create({
      userId: new Types.ObjectId(FAKE_USER_ID),
      type: TransactionType.EXPENSE,
      value: 20,
      date: new Date('2026-03-01'),
      description: 'Com categoria',
      categoryId,
    });
    await transactionModel.create({
      userId: new Types.ObjectId(FAKE_USER_ID),
      type: TransactionType.EXPENSE,
      value: 15,
      date: new Date('2026-03-02'),
      description: 'Sem categoria A',
    });
    await transactionModel.create({
      userId: new Types.ObjectId(FAKE_USER_ID),
      type: TransactionType.EXPENSE,
      value: 25,
      date: new Date('2026-03-03'),
      description: 'Sem categoria B',
    });

    const res = await request(app.getHttpServer())
      .get('/api/transactions?semCategoria=true')
      .expect(200);

    const descriptions = (res.body.data as Array<{ description: string; categoryId?: unknown }>).map((t) => t.description);
    expect(descriptions).toContain('Sem categoria A');
    expect(descriptions).toContain('Sem categoria B');
    expect(descriptions).not.toContain('Com categoria');
    res.body.data.forEach((t: { categoryId?: unknown }) => {
      expect(t.categoryId == null).toBe(true);
    });
  });

  it('POST rejeita lançamento numa carteira arquivada', async () => {
    const carteira = await walletModel.create({
      userId: new Types.ObjectId(FAKE_USER_ID),
      nome: 'Carteira Arquivada',
      saldo: 0,
      arquivadaEm: new Date(),
    });

    await request(app.getHttpServer())
      .post('/api/transactions')
      .send({ type: 'INCOME', value: 50, date: '2026-03-10', carteiraId: carteira._id.toString() })
      .expect(400);
  });

  describe('vínculo com uma moto (motoId)', () => {
    let motoModel: Model<Moto>;
    let categoryId: Types.ObjectId;

    const corpoDespesa = (extra: Record<string, unknown> = {}) => ({
      type: 'EXPENSE',
      value: 350,
      date: '2026-04-10',
      categoryId: categoryId.toString(),
      ...extra,
    });

    beforeAll(async () => {
      motoModel = app.get<Model<Moto>>(getModelToken(Moto.name));
      const categoryModel = app.get<Model<Category>>(getModelToken(Category.name));
      const categoria = await categoryModel.create({
        userId: new Types.ObjectId(FAKE_USER_ID),
        name: 'Peças de moto',
        slug: 'pecas-de-moto',
      });
      categoryId = categoria._id as Types.ObjectId;
    });

    const criarMoto = (userId = FAKE_USER_ID, placa = `M${Date.now().toString().slice(-6)}`) =>
      motoModel.create({
        userId: new Types.ObjectId(userId),
        modelo: 'Honda CG 160',
        ano: 2022,
        placa,
        chassi: `9C2KC2200NR${placa}`,
        cor: 'Preta',
        km: 10000,
        valorCompra: 14000,
        dataCompra: new Date('2026-01-10'),
        margemDesejada: 20,
      });

    it('POST aceita motoId e grava o vínculo', async () => {
      const moto = await criarMoto(FAKE_USER_ID, 'VIN0001');

      const res = await request(app.getHttpServer())
        .post('/api/transactions')
        .send(corpoDespesa({ motoId: moto._id.toString(), description: 'Troca de pneu' }))
        .expect(201);

      expect(res.body.motoId).toBe(moto._id.toString());

      const salva = await transactionModel.findById(res.body._id).exec();
      expect(salva!.motoId?.toString()).toBe(moto._id.toString());
    });

    // Vínculo silenciosamente descartado seria pior que o 400: o gasto existiria e nunca
    // apareceria em nenhum relatório da moto, sem o usuário ter como perceber.
    it('POST recusa motoId de outro usuário', async () => {
      const deOutro = await criarMoto(new Types.ObjectId().toString(), 'VIN0002');

      await request(app.getHttpServer())
        .post('/api/transactions')
        .send(corpoDespesa({ motoId: deOutro._id.toString() }))
        .expect(400);
    });

    it('POST recusa motoId inexistente ou malformado', async () => {
      await request(app.getHttpServer())
        .post('/api/transactions')
        .send(corpoDespesa({ motoId: new Types.ObjectId().toString() }))
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/transactions')
        .send(corpoDespesa({ motoId: 'nao-e-objectid' }))
        .expect(400);
    });

    it('GET ?motoId= devolve só as transações daquela moto', async () => {
      const moto = await criarMoto(FAKE_USER_ID, 'VIN0003');
      await request(app.getHttpServer())
        .post('/api/transactions')
        .send(corpoDespesa({ motoId: moto._id.toString(), description: 'Revisão da VIN0003' }))
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/transactions')
        .send(corpoDespesa({ description: 'Gasto sem moto' }))
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/transactions?motoId=${moto._id.toString()}`)
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.data[0].description).toBe('Revisão da VIN0003');
    });

    it('PATCH :id desvincula com string vazia e revincula com um id', async () => {
      const moto = await criarMoto(FAKE_USER_ID, 'VIN0004');
      const criada = await request(app.getHttpServer())
        .post('/api/transactions')
        .send(corpoDespesa({ motoId: moto._id.toString() }))
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/transactions/${criada.body._id}`)
        .send({ motoId: '' })
        .expect(200);
      expect((await transactionModel.findById(criada.body._id).exec())!.motoId).toBeUndefined();

      await request(app.getHttpServer())
        .patch(`/api/transactions/${criada.body._id}`)
        .send({ motoId: moto._id.toString() })
        .expect(200);
      expect((await transactionModel.findById(criada.body._id).exec())!.motoId?.toString()).toBe(
        moto._id.toString(),
      );
    });

    it('PATCH :id recusa revincular para a moto de outro usuário', async () => {
      const deOutro = await criarMoto(new Types.ObjectId().toString(), 'VIN0005');
      const criada = await request(app.getHttpServer())
        .post('/api/transactions')
        .send(corpoDespesa())
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/transactions/${criada.body._id}`)
        .send({ motoId: deOutro._id.toString() })
        .expect(400);
    });
  });
});
