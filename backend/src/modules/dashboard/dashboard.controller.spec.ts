import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, ExecutionContext } from '@nestjs/common';
import request from 'supertest';
import { DashboardModule } from './dashboard.module';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PendingAccount } from '../pending/schemas/pending-account.schema';
import { Transaction, TransactionType } from '../transactions/schemas/transaction.schema';
import { Category } from '../categories/schemas/category.schema';

const FAKE_USER_ID = new Types.ObjectId().toString();

describe('DashboardController (e2e)', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  let pendingModel: Model<PendingAccount>;
  let transactionModel: Model<Transaction>;
  let categoryModel: Model<Category>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const mongoUri = mongod.getUri();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        MongooseModule.forRootAsync({
          useFactory: () => ({ uri: mongoUri }),
        }),
        DashboardModule,
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

    pendingModel = app.get<Model<PendingAccount>>(getModelToken(PendingAccount.name));
    transactionModel = app.get<Model<Transaction>>(getModelToken(Transaction.name));
    categoryModel = app.get<Model<Category>>(getModelToken(Category.name));
  });

  afterAll(async () => {
    await app.close();
    await mongod.stop();
  });

  it('GET includes a legacy unpaid account (no tipo field in storage) in the pendingAccounts widget', async () => {
    // Mesmo cenário de pending.controller.spec.ts: documento gravado antes do campo
    // `tipo` existir, inserido via driver nativo para não receber o default do Mongoose.
    const legacyId = new Types.ObjectId();
    await pendingModel.collection.insertOne({
      _id: legacyId,
      userId: new Types.ObjectId(FAKE_USER_ID),
      title: 'Conta legada sem tipo',
      value: 75,
      dueDate: new Date('2026-06-05'),
      paid: false,
      isParcelada: false,
      isRecorrente: false,
      categoria: 'Outro',
      formatoPagamento: 'Outro',
    });

    const res = await request(app.getHttpServer())
      .get('/api/dashboard')
      .query({ month: 6, year: 2026 })
      .expect(200);

    const items = res.body.pendingAccounts.items as Array<{ _id: string }>;
    expect(items.some((item) => item._id === legacyId.toString())).toBe(true);
  });

  it('estorno de compra no cartão (isEstorno) é subtraído de expensesByCategory e totalExpenses, não somado', async () => {
    const cat = await categoryModel.create({ name: 'Roupas Teste', slug: 'roupas-teste-dashboard', isDefault: true, isIncome: false });
    const userObjectId = new Types.ObjectId(FAKE_USER_ID);

    await transactionModel.create({
      userId: userObjectId,
      type: TransactionType.EXPENSE,
      value: 100,
      categoryId: cat._id,
      date: new Date('2026-05-10'),
      carteiraId: new Types.ObjectId(),
      faturaId: new Types.ObjectId(),
    });
    await transactionModel.create({
      userId: userObjectId,
      type: TransactionType.EXPENSE,
      value: 100,
      categoryId: cat._id,
      date: new Date('2026-05-11'),
      carteiraId: new Types.ObjectId(),
      faturaId: new Types.ObjectId(),
      isEstorno: true,
    });

    const res = await request(app.getHttpServer())
      .get('/api/dashboard')
      .query({ month: 5, year: 2026 })
      .expect(200);

    const categoria = (res.body.expensesByCategory as Array<{ categoryId: string; total: number }>).find(
      (c) => c.categoryId === cat._id.toString(),
    );
    // Compra de 100 + estorno de 100 = líquido zero, não deve aparecer com total 200.
    expect(categoria?.total ?? 0).toBe(0);
  });

  it('compra no cartão (faturaId setado) não reduz o Saldo/gráfico, mas conta ao lado como despesa no cartão', async () => {
    const userObjectId = new Types.ObjectId(FAKE_USER_ID);

    // Dentro do período cumulativo (>= 01/06/2026): é exatamente o cenário real que gerou o
    // bug — uma parcela de cartão já vencida entrando como "saída" no Saldo, mesmo sendo
    // dívida ainda não paga (wallets.service.ts já ignora isso pra saldo de carteira/patrimônio).
    await transactionModel.create({
      userId: userObjectId,
      type: TransactionType.EXPENSE,
      value: 233.1,
      date: new Date('2026-06-10'),
      carteiraId: new Types.ObjectId(),
      faturaId: new Types.ObjectId(),
    });
    // Despesa "normal" (sem cartão) no mesmo mês, pra confirmar que essa continua contando.
    await transactionModel.create({
      userId: userObjectId,
      type: TransactionType.EXPENSE,
      value: 50,
      date: new Date('2026-06-15'),
      carteiraId: new Types.ObjectId(),
    });

    const res = await request(app.getHttpServer())
      .get('/api/dashboard')
      .query({ month: 6, year: 2026 })
      .expect(200);

    expect(res.body.totalExpense).toBe(50);
    expect(res.body.balance).toBe(-50);
    const junho = (res.body.monthlyEvolution as Array<{ month: number; expenses: number }>).find((m) => m.month === 6);
    expect(junho?.expenses).toBe(50);
  });

  it('pagamento de fatura (TRANSFER com faturaId) conta como Saída/gráfico no mês em que foi pago, não a compra em si', async () => {
    const userObjectId = new Types.ObjectId(FAKE_USER_ID);
    const faturaObjectId = new Types.ObjectId();

    // Compra no cartão em julho: não deve contar (é dívida, não saída ainda).
    await transactionModel.create({
      userId: userObjectId,
      type: TransactionType.EXPENSE,
      value: 300,
      date: new Date('2026-07-05'),
      carteiraId: new Types.ObjectId(),
      faturaId: faturaObjectId,
    });
    // Pagamento dessa fatura em agosto (mesmo formato de CartoesService#pagar): TRANSFER com
    // faturaId setado, sem carteiraDestinoId. Esse é o dinheiro saindo de verdade.
    await transactionModel.create({
      userId: userObjectId,
      type: TransactionType.TRANSFER,
      value: 300,
      date: new Date('2026-08-10'),
      carteiraId: new Types.ObjectId(),
      faturaId: faturaObjectId,
    });

    const resJulho = await request(app.getHttpServer())
      .get('/api/dashboard')
      .query({ month: 7, year: 2026 })
      .expect(200);
    expect(resJulho.body.totalExpense).toBe(0);

    const resAgosto = await request(app.getHttpServer())
      .get('/api/dashboard')
      .query({ month: 8, year: 2026 })
      .expect(200);
    expect(resAgosto.body.totalExpense).toBe(300);
    const agosto = (resAgosto.body.monthlyEvolution as Array<{ month: number; expenses: number }>).find((m) => m.month === 8);
    expect(agosto?.expenses).toBe(300);
  });

  it('Saldo do Dashboard bate com a soma de "Carteiras" (saldo inicial + tudo desde sempre, não só o período selecionado)', async () => {
    const walletRes = await request(app.getHttpServer())
      .post('/api/wallets')
      .send({ nome: 'Banco Teste Dashboard', saldo: 100 })
      .expect(201);

    const userObjectId = new Types.ObjectId(FAKE_USER_ID);
    const walletObjectId = new Types.ObjectId(walletRes.body._id);

    // Receita de janeiro — bem antes do mês consultado no Dashboard (setembro) — precisa
    // contar mesmo assim: Saldo não é "desde o início do período selecionado", é o total
    // atual, igual à soma de Carteiras.
    await transactionModel.create({
      userId: userObjectId,
      type: TransactionType.INCOME,
      value: 300,
      date: new Date('2026-01-10'),
      carteiraId: walletObjectId,
    });

    const walletsRes = await request(app.getHttpServer()).get('/api/wallets').expect(200);
    const somaCarteiras = (walletsRes.body as Array<{ saldo: number }>).reduce((s, w) => s + w.saldo, 0);
    const carteiraCriada = (walletsRes.body as Array<{ _id: string; saldo: number }>).find(
      (w) => w._id === walletRes.body._id,
    );
    // saldoInicial (100) + receita de janeiro (300) só para a carteira criada aqui — não
    // afirma nada sobre o total somado, que pode carregar resíduo (positivo ou negativo) de
    // outros testes deste arquivo (mesmo banco compartilhado).
    expect(carteiraCriada?.saldo).toBe(400);

    const dashRes = await request(app.getHttpServer())
      .get('/api/dashboard')
      .query({ month: 9, year: 2026 })
      .expect(200);

    expect(dashRes.body.balance).toBe(Number(somaCarteiras.toFixed(2)));
  });
});
