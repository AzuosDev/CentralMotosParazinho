import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ExecutionContext } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { Model, Types } from 'mongoose';
import { InsightsModule } from './insights.module';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Transaction, TransactionDocument, TransactionType } from '../transactions/schemas/transaction.schema';
import { Goal, GoalDocument } from '../goals/schemas/goal.schema';
import { Category, CategoryDocument } from '../categories/schemas/category.schema';
import { PendingAccount, PendingAccountDocument } from '../pending/schemas/pending-account.schema';
import { Wallet, WalletDocument } from '../wallets/schemas/wallet.schema';

const FAKE_USER_ID = new Types.ObjectId().toString();

function monthsAgo(n: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

function txn(overrides: Partial<Record<string, unknown>>) {
  return {
    userId: new Types.ObjectId(FAKE_USER_ID),
    type: TransactionType.EXPENSE,
    value: 100,
    date: new Date('2026-01-15'),
    ...overrides,
  };
}

function pendingDoc(overrides: Partial<Record<string, unknown>>) {
  return {
    userId: new Types.ObjectId(FAKE_USER_ID),
    title: 'Conta',
    value: 100,
    dueDate: new Date('2026-01-15'),
    paid: false,
    isParcelada: false,
    isRecorrente: false,
    ...overrides,
  };
}

describe('InsightsController - annual-summary (e2e)', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  let transactionModel: Model<TransactionDocument>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        MongooseModule.forRootAsync({ useFactory: () => ({ uri: mongod.getUri() }) }),
        InsightsModule,
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
    await app.init();

    transactionModel = app.get<Model<TransactionDocument>>(getModelToken(Transaction.name));
  }, 60000);

  afterAll(async () => {
    await app.close();
    await mongod.stop();
  });

  afterEach(async () => {
    await transactionModel.deleteMany({});
  });

  it('calcula a média mensal usando só os meses com transações reais, não sempre 12', async () => {
    // 2026: só janeiro, março e junho têm lançamentos (3 meses com dado)
    await transactionModel.insertMany([
      txn({ type: TransactionType.INCOME, value: 3000, date: new Date('2026-01-10') }),
      txn({ type: TransactionType.EXPENSE, value: 900, date: new Date('2026-01-20') }),
      txn({ type: TransactionType.INCOME, value: 3000, date: new Date('2026-03-10') }),
      txn({ type: TransactionType.EXPENSE, value: 900, date: new Date('2026-03-20') }),
      txn({ type: TransactionType.INCOME, value: 3000, date: new Date('2026-06-10') }),
      txn({ type: TransactionType.EXPENSE, value: 900, date: new Date('2026-06-20') }),
    ]);

    const res = await request(app.getHttpServer())
      .get('/api/insights/annual-summary')
      .query({ year: 2026 })
      .expect(200);

    expect(res.body.current.monthsWithData).toBe(3);
    expect(res.body.current.totalIncome).toBe(9000);
    expect(res.body.current.totalExpense).toBe(2700);
    // Média deve dividir por 3 (meses com dado), não por 12.
    expect(res.body.current.avgMonthlyIncome).toBe(3000);
    expect(res.body.current.avgMonthlyExpense).toBe(900);
  });

  it('trata ausência de dado no ano anterior sem gerar Infinity/NaN na variação ano-a-ano', async () => {
    // Só há lançamentos em 2026; 2025 (ano anterior) fica totalmente vazio.
    await transactionModel.insertMany([
      txn({ type: TransactionType.INCOME, value: 4000, date: new Date('2026-02-10') }),
      txn({ type: TransactionType.EXPENSE, value: 1000, date: new Date('2026-02-15'), categoryId: new Types.ObjectId() }),
    ]);

    const res = await request(app.getHttpServer())
      .get('/api/insights/annual-summary')
      .query({ year: 2026 })
      .expect(200);

    expect(res.body.previous.monthsWithData).toBe(0);
    expect(res.body.previous.avgMonthlyIncome).toBe(0);
    expect(res.body.yoyChange.incomePct).toBeNull();
    expect(res.body.yoyChange.expensePct).toBeNull();
    expect(res.body.yoyChange.balancePct).toBeNull();

    for (const category of res.body.topCategories) {
      expect(category.yoyPct).toBeNull();
      expect(Number.isFinite(category.yoyPct)).toBe(false);
    }
  });

  it('degrada graciosamente (200 + narrative null) quando ANTHROPIC_API_KEY não está configurada', async () => {
    await transactionModel.insertMany([
      txn({ type: TransactionType.INCOME, value: 2000, date: new Date('2026-04-10') }),
    ]);

    const res = await request(app.getHttpServer())
      .get('/api/insights/annual-summary')
      .query({ year: 2026 })
      .expect(200);

    expect(res.body.narrative).toBeNull();
    expect(res.body.narrativeUnavailable).toBe(true);
    // Os números calculados continuam disponíveis mesmo sem narrativa da IA.
    expect(res.body.current.totalIncome).toBe(2000);
  });
});

describe('InsightsController - annual-aggregates (e2e)', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  let transactionModel: Model<TransactionDocument>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        MongooseModule.forRootAsync({ useFactory: () => ({ uri: mongod.getUri() }) }),
        InsightsModule,
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
    await app.init();

    transactionModel = app.get<Model<TransactionDocument>>(getModelToken(Transaction.name));
  }, 60000);

  afterAll(async () => {
    await app.close();
    await mongod.stop();
  });

  afterEach(async () => {
    await transactionModel.deleteMany({});
  });

  it('funciona isoladamente (sem IA) e devolve os mesmos números que annual-summary usa por baixo, sem narrative', async () => {
    await transactionModel.insertMany([
      txn({ type: TransactionType.INCOME, value: 3000, date: new Date('2026-01-10') }),
      txn({ type: TransactionType.EXPENSE, value: 900, date: new Date('2026-01-20') }),
    ]);

    const res = await request(app.getHttpServer())
      .get('/api/insights/annual-aggregates')
      .query({ year: 2026 })
      .expect(200);

    expect(res.body.current.totalIncome).toBe(3000);
    expect(res.body.current.totalExpense).toBe(900);
    expect(res.body.current.monthsWithData).toBe(1);
    expect(res.body.narrative).toBeUndefined();
    expect(res.body.narrativeUnavailable).toBeUndefined();
    expect(res.body.noData).toBeUndefined();
  });

  it('usa o ano corrente quando nenhum year é passado', async () => {
    const res = await request(app.getHttpServer()).get('/api/insights/annual-aggregates').expect(200);

    expect(res.body.year).toBe(new Date().getFullYear());
  });
});

describe('InsightsController - cashflow (e2e)', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  let transactionModel: Model<TransactionDocument>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        MongooseModule.forRootAsync({ useFactory: () => ({ uri: mongod.getUri() }) }),
        InsightsModule,
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
    await app.init();

    transactionModel = app.get<Model<TransactionDocument>>(getModelToken(Transaction.name));
  }, 60000);

  afterAll(async () => {
    await app.close();
    await mongod.stop();
  });

  afterEach(async () => {
    await transactionModel.deleteMany({});
  });

  it('period=year agrega por mês e preenche meses sem transação com zero', async () => {
    await transactionModel.insertMany([
      txn({ type: TransactionType.INCOME, value: 3000, date: new Date('2026-01-10') }),
      txn({ type: TransactionType.EXPENSE, value: 900, date: new Date('2026-01-20') }),
      txn({ type: TransactionType.INCOME, value: 3500, date: new Date('2026-06-05') }),
      txn({ type: TransactionType.EXPENSE, value: 1100, date: new Date('2026-06-25') }),
    ]);

    const res = await request(app.getHttpServer())
      .get('/api/insights/cashflow')
      .query({ period: 'year', year: 2026 })
      .expect(200);

    expect(res.body.granularity).toBe('month');
    expect(res.body.points).toHaveLength(12);
    expect(res.body.points[0]).toMatchObject({ income: 3000, expense: 900 });
    expect(res.body.points[5]).toMatchObject({ income: 3500, expense: 1100 });
    // Fevereiro (índice 1) não tem transação nenhuma — precisa vir zerado, não ausente.
    expect(res.body.points[1]).toMatchObject({ income: 0, expense: 0 });
    expect(res.body.totals).toEqual({ income: 6500, expense: 2000, balance: 4500 });
  });

  it('period=month gera um bucket por dia, incluindo dias sem transação', async () => {
    // Fevereiro de 2026 (não bissexto) tem 28 dias.
    await transactionModel.insertMany([
      txn({ type: TransactionType.EXPENSE, value: 50, date: new Date('2026-02-05') }),
    ]);

    const res = await request(app.getHttpServer())
      .get('/api/insights/cashflow')
      .query({ period: 'month', year: 2026, month: 2 })
      .expect(200);

    expect(res.body.granularity).toBe('day');
    expect(res.body.points).toHaveLength(28);
    expect(res.body.points[4]).toMatchObject({ income: 0, expense: 50 });
    expect(res.body.points[0]).toMatchObject({ income: 0, expense: 0 });
  });

  it('period=custom sem from/to retorna 400 em vez de quebrar', async () => {
    await request(app.getHttpServer())
      .get('/api/insights/cashflow')
      .query({ period: 'custom' })
      .expect(400);
  });
});

describe('InsightsController - goals-progress (e2e)', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  let transactionModel: Model<TransactionDocument>;
  let goalModel: Model<GoalDocument>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        MongooseModule.forRootAsync({ useFactory: () => ({ uri: mongod.getUri() }) }),
        InsightsModule,
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
    await app.init();

    transactionModel = app.get<Model<TransactionDocument>>(getModelToken(Transaction.name));
    goalModel = app.get<Model<GoalDocument>>(getModelToken(Goal.name));
  }, 60000);

  afterAll(async () => {
    await app.close();
    await mongod.stop();
  });

  afterEach(async () => {
    await transactionModel.deleteMany({});
    await goalModel.deleteMany({});
  });

  it('calcula o ritmo médio só com EXPENSE na categoria vinculada (ignora INCOME na mesma categoria)', async () => {
    const linkedCategoryId = new Types.ObjectId();

    await goalModel.create({
      userId: new Types.ObjectId(FAKE_USER_ID),
      name: 'Viagem',
      targetValue: 1000,
      currentValue: 600,
      deadline: daysFromNow(60),
      completed: false,
      linkedCategoryId,
    });

    await transactionModel.insertMany([
      txn({ type: TransactionType.EXPENSE, value: 100, categoryId: linkedCategoryId, date: monthsAgo(1) }),
      txn({ type: TransactionType.EXPENSE, value: 200, categoryId: linkedCategoryId, date: monthsAgo(2) }),
      // INCOME na mesma categoria não deve contar como contribuição.
      txn({ type: TransactionType.INCOME, value: 5000, categoryId: linkedCategoryId, date: monthsAgo(1) }),
    ]);

    const res = await request(app.getHttpServer()).get('/api/insights/goals-progress').expect(200);

    expect(res.body).toHaveLength(1);
    const goal = res.body[0];
    expect(goal.pace.avgMonthlyContribution).toBe(150);
    expect(goal.pace.monthsRemaining).toBe(2);
    expect(goal.pace.requiredMonthlyContribution).toBe(200);
    expect(goal.pace.onTrack).toBe(false);
  });

  it('meta sem deadline retorna monthsRemaining/requiredMonthlyContribution nulos, sem NaN/Infinity', async () => {
    const linkedCategoryId = new Types.ObjectId();

    await goalModel.create({
      userId: new Types.ObjectId(FAKE_USER_ID),
      name: 'Reserva de emergência',
      targetValue: 5000,
      currentValue: 100,
      completed: false,
      linkedCategoryId,
    });

    const res = await request(app.getHttpServer()).get('/api/insights/goals-progress').expect(200);

    const goal = res.body[0];
    expect(goal.pace.monthsRemaining).toBeNull();
    expect(goal.pace.requiredMonthlyContribution).toBeNull();
    expect(goal.pace.onTrack).toBeNull();
    expect(Number.isFinite(goal.pace.avgMonthlyContribution)).toBe(true);
  });

  it('com período (Relatório Personalizado), rebaseia as janelas de 12/6 meses pro FIM do período — não pra "agora" real', async () => {
    const linkedCategoryId = new Types.ObjectId();

    await goalModel.create({
      userId: new Types.ObjectId(FAKE_USER_ID),
      name: 'Viagem',
      targetValue: 1000,
      currentValue: 100,
      // 89 dias de 2026-01-31 até 2026-04-30 => ceil(89/30) = 3 meses.
      deadline: new Date('2026-04-30'),
      completed: false,
      linkedCategoryId,
    });

    await transactionModel.insertMany([
      // Dentro do período (jan/2026): deve contar como contribuição.
      txn({ type: TransactionType.EXPENSE, value: 100, categoryId: linkedCategoryId, date: new Date('2026-01-15') }),
      // Depois do fim do período escolhido: NÃO deve contar, mesmo que já tenha acontecido de verdade.
      txn({ type: TransactionType.EXPENSE, value: 900, categoryId: linkedCategoryId, date: new Date('2026-03-01') }),
    ]);

    const res = await request(app.getHttpServer())
      .get('/api/insights/goals-progress')
      .query({ period: 'month', year: 2026, month: 1 })
      .expect(200);

    const goal = res.body[0];
    // Só a contribuição de janeiro conta — a de março (depois do fim do período) fica de fora.
    expect(goal.pace.avgMonthlyContribution).toBe(100);
    // monthsRemaining calculado a partir do FIM do período (2026-01-31), não da data real de hoje.
    expect(goal.pace.monthsRemaining).toBe(3);
    expect(goal.pace.requiredMonthlyContribution).toBe(300);
    expect(goal.pace.onTrack).toBe(false);

    const janBucket = goal.monthlyContributions.find((point: { month: string; amount: number }) => point.month === '2026-01');
    expect(janBucket.amount).toBe(100);
    // Nenhum bucket do gráfico (12 meses terminando em jan/2026) deve conter a contribuição de março.
    const totalCharted = goal.monthlyContributions.reduce((sum: number, point: { amount: number }) => sum + point.amount, 0);
    expect(totalCharted).toBe(100);
  });
});

describe('InsightsController - expenses-breakdown (e2e)', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  let transactionModel: Model<TransactionDocument>;
  let categoryModel: Model<CategoryDocument>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        MongooseModule.forRootAsync({ useFactory: () => ({ uri: mongod.getUri() }) }),
        InsightsModule,
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
    await app.init();

    transactionModel = app.get<Model<TransactionDocument>>(getModelToken(Transaction.name));
    categoryModel = app.get<Model<CategoryDocument>>(getModelToken(Category.name));
  }, 60000);

  afterAll(async () => {
    await app.close();
    await mongod.stop();
  });

  afterEach(async () => {
    await transactionModel.deleteMany({});
    await categoryModel.deleteMany({});
  });

  it('agrupa por categoria e joga o restante em "Outros" quando há mais de 5 categorias', async () => {
    const names = ['Alimentação', 'Transporte', 'Lazer', 'Saúde', 'Educação', 'Compras'];
    const categories = await categoryModel.create(
      names.map((name) => ({ name, slug: name.toLowerCase(), isDefault: false, isIncome: false })),
    );
    const totals = [600, 500, 400, 300, 200, 100];

    await transactionModel.insertMany(
      categories.map((category, index) =>
        txn({ categoryId: category._id, value: totals[index], date: new Date('2026-03-10') }),
      ),
    );

    const res = await request(app.getHttpServer())
      .get('/api/insights/expenses-breakdown')
      .query({ period: 'year', year: 2026 })
      .expect(200);

    expect(res.body.byCategory).toHaveLength(6);
    expect(res.body.byCategory[0]).toMatchObject({ name: 'Alimentação', total: 600 });
    expect(res.body.byCategory[0].percentOfExpenses).toBeCloseTo((600 / 2100) * 100, 1);

    // Top 5 nomeadas + "Outros" pra Compras (a 6ª, menor categoria).
    expect(res.body.evolutionSeries).toHaveLength(6);
    expect(res.body.evolutionSeries).toContain('Outros');
    expect(res.body.evolution).toHaveLength(12);

    const marchBucket = res.body.evolution[2];
    expect(marchBucket.values['Outros']).toBe(100);
    expect(marchBucket.values['Alimentação']).toBe(600);
  });

  it('topCategoryTrend compara a maior categoria de gasto do mês atual com o mês anterior', async () => {
    const category = await categoryModel.create({ name: 'Mercado', slug: 'mercado', isDefault: false, isIncome: false });
    const smallCategory = await categoryModel.create({ name: 'Lazer', slug: 'lazer-2', isDefault: false, isIncome: false });

    await transactionModel.insertMany([
      txn({ categoryId: category._id, value: 300, date: monthsAgo(0) }),
      txn({ categoryId: category._id, value: 200, date: monthsAgo(1) }),
      txn({ categoryId: smallCategory._id, value: 10, date: monthsAgo(0) }),
    ]);

    const res = await request(app.getHttpServer()).get('/api/insights/expenses-breakdown').expect(200);

    expect(res.body.topCategoryTrend).toMatchObject({ name: 'Mercado', currentMonthTotal: 300, previousMonthTotal: 200, momPct: 50 });
  });
});

describe('InsightsController - income-breakdown (e2e)', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  let transactionModel: Model<TransactionDocument>;
  let categoryModel: Model<CategoryDocument>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        MongooseModule.forRootAsync({ useFactory: () => ({ uri: mongod.getUri() }) }),
        InsightsModule,
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
    await app.init();

    transactionModel = app.get<Model<TransactionDocument>>(getModelToken(Transaction.name));
    categoryModel = app.get<Model<CategoryDocument>>(getModelToken(Category.name));
  }, 60000);

  afterAll(async () => {
    await app.close();
    await mongod.stop();
  });

  afterEach(async () => {
    await transactionModel.deleteMany({});
    await categoryModel.deleteMany({});
  });

  it('bySource agrupa renda por categoria e calcula percentOfIncome', async () => {
    const salario = await categoryModel.create({ name: 'Salário', slug: 'salario', isDefault: false, isIncome: true });
    const freela = await categoryModel.create({ name: 'Freelance', slug: 'freelance', isDefault: false, isIncome: true });

    await transactionModel.insertMany([
      txn({ type: TransactionType.INCOME, categoryId: salario._id, value: 3000, date: new Date('2026-05-05') }),
      txn({ type: TransactionType.INCOME, categoryId: freela._id, value: 1000, date: new Date('2026-05-10') }),
    ]);

    const res = await request(app.getHttpServer())
      .get('/api/insights/income-breakdown')
      .query({ period: 'year', year: 2026 })
      .expect(200);

    expect(res.body.bySource).toHaveLength(2);
    expect(res.body.bySource[0]).toMatchObject({ name: 'Salário', total: 3000, percentOfIncome: 75 });
    expect(res.body.bySource[1]).toMatchObject({ name: 'Freelance', total: 1000, percentOfIncome: 25 });
  });

  it('consistency vem null com menos de 3 meses de histórico de renda', async () => {
    await transactionModel.insertMany([
      txn({ type: TransactionType.INCOME, value: 2000, date: monthsAgo(0) }),
    ]);

    const res = await request(app.getHttpServer()).get('/api/insights/income-breakdown').expect(200);

    expect(res.body.monthlyConsistency).toHaveLength(12);
    expect(res.body.consistency).toBeNull();
  });

  it('consistency calcula variação sem NaN/Infinity com 3+ meses de histórico', async () => {
    await transactionModel.insertMany([
      txn({ type: TransactionType.INCOME, value: 2000, date: monthsAgo(0) }),
      txn({ type: TransactionType.INCOME, value: 1000, date: monthsAgo(1) }),
      txn({ type: TransactionType.INCOME, value: 1000, date: monthsAgo(2) }),
    ]);

    const res = await request(app.getHttpServer()).get('/api/insights/income-breakdown').expect(200);

    expect(res.body.consistency).toMatchObject({ monthsWithData: 3, avgIncome: 1000, currentMonthTotal: 2000, variationPct: 100 });
    expect(Number.isFinite(res.body.consistency.variationPct)).toBe(true);
  });
});

describe('InsightsController - accounts-overview (e2e)', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  let pendingModel: Model<PendingAccountDocument>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        MongooseModule.forRootAsync({ useFactory: () => ({ uri: mongod.getUri() }) }),
        InsightsModule,
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
    await app.init();

    pendingModel = app.get<Model<PendingAccountDocument>>(getModelToken(PendingAccount.name));
  }, 60000);

  afterAll(async () => {
    await app.close();
    await mongod.stop();
  });

  afterEach(async () => {
    await pendingModel.deleteMany({});
  });

  it('separa pago vs. pendente, conta atraso e vencendo essa semana, ignorando moldes recorrentes (isRecorrente:true)', async () => {
    await pendingModel.insertMany([
      pendingDoc({ title: 'Paga', value: 100, paid: true, dueDate: monthsAgo(1) }),
      pendingDoc({ title: 'Pendente futura', value: 200, paid: false, dueDate: daysFromNow(10) }),
      pendingDoc({ title: 'Atrasada', value: 50, paid: false, dueDate: daysFromNow(-5) }),
      pendingDoc({ title: 'Vencendo essa semana', value: 30, paid: false, dueDate: daysFromNow(3) }),
      // Molde recorrente: não é dinheiro real devido, não deve entrar em nenhuma contagem.
      pendingDoc({ title: 'Molde', value: 9999, paid: false, isRecorrente: true, dueDate: daysFromNow(-100) }),
    ]);

    const res = await request(app.getHttpServer()).get('/api/insights/accounts-overview').expect(200);

    expect(res.body.paidVsPending).toEqual({ paidCount: 1, paidValue: 100, pendingCount: 3, pendingValue: 280 });
    expect(res.body.overdue).toEqual({ count: 1, value: 50 });
    expect(res.body.dueThisWeek).toEqual({ count: 1, value: 30 });
  });

  it('lista parcelamentos em andamento com progresso e ignora grupo já totalmente pago', async () => {
    await pendingModel.insertMany([
      pendingDoc({
        title: 'Notebook',
        value: 100,
        paid: true,
        numeroParcela: 1,
        grupoParceladoId: 'g1',
        isParcelada: true,
        dueDate: monthsAgo(1),
        parcelas: { totalParcelas: 3, valorParcela: 100, qtdParcelasPagas: 1, parcelasPagas: [1], dataInicio: monthsAgo(1), dataFim: daysFromNow(60) },
      }),
      pendingDoc({
        title: 'Notebook',
        value: 100,
        paid: false,
        numeroParcela: 2,
        grupoParceladoId: 'g1',
        isParcelada: true,
        dueDate: daysFromNow(10),
        parcelas: { totalParcelas: 3, valorParcela: 100, qtdParcelasPagas: 1, parcelasPagas: [1], dataInicio: monthsAgo(1), dataFim: daysFromNow(60) },
      }),
      pendingDoc({
        title: 'Notebook',
        value: 100,
        paid: false,
        numeroParcela: 3,
        grupoParceladoId: 'g1',
        isParcelada: true,
        dueDate: daysFromNow(40),
        parcelas: { totalParcelas: 3, valorParcela: 100, qtdParcelasPagas: 1, parcelasPagas: [1], dataInicio: monthsAgo(1), dataFim: daysFromNow(60) },
      }),
      // Grupo totalmente pago: não deve aparecer como "em andamento".
      pendingDoc({
        title: 'TV',
        value: 200,
        paid: true,
        numeroParcela: 1,
        grupoParceladoId: 'g2',
        isParcelada: true,
        parcelas: { totalParcelas: 1, valorParcela: 200, qtdParcelasPagas: 1, parcelasPagas: [1], dataInicio: monthsAgo(2), dataFim: monthsAgo(2) },
      }),
    ]);

    const res = await request(app.getHttpServer()).get('/api/insights/accounts-overview').expect(200);

    expect(res.body.installmentsInProgress).toHaveLength(1);
    expect(res.body.installmentsInProgress[0]).toMatchObject({
      id: 'g1',
      title: 'Notebook',
      totalParcelas: 3,
      paidParcelas: 1,
      valorParcela: 100,
    });
  });

  it('conta só recorrentes ativas (sem dataTermino ou com dataTermino futura)', async () => {
    await pendingModel.insertMany([
      pendingDoc({ title: 'Ativa', isRecorrente: true, recorrencia: { periodoRecorrencia: 'Mensal' } }),
      pendingDoc({
        title: 'Encerrada',
        isRecorrente: true,
        recorrencia: { periodoRecorrencia: 'Mensal', dataTermino: monthsAgo(1) },
      }),
    ]);

    const res = await request(app.getHttpServer()).get('/api/insights/accounts-overview').expect(200);

    expect(res.body.activeRecurringCount).toBe(1);
  });
});

describe('InsightsController - wallets-evolution (e2e)', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  let transactionModel: Model<TransactionDocument>;
  let walletModel: Model<WalletDocument>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        MongooseModule.forRootAsync({ useFactory: () => ({ uri: mongod.getUri() }) }),
        InsightsModule,
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
    await app.init();

    transactionModel = app.get<Model<TransactionDocument>>(getModelToken(Transaction.name));
    walletModel = app.get<Model<WalletDocument>>(getModelToken(Wallet.name));
  }, 60000);

  afterAll(async () => {
    await app.close();
    await mongod.stop();
  });

  afterEach(async () => {
    await transactionModel.deleteMany({});
    await walletModel.deleteMany({});
  });

  it('calcula saldo cumulativo por mês reaproveitando a fórmula de wallets.service (saldo + net + créditos de transferência)', async () => {
    const wallet = await walletModel.create({ userId: new Types.ObjectId(FAKE_USER_ID), nome: 'Carteira A', saldo: 500 });
    const outraCarteira = await walletModel.create({ userId: new Types.ObjectId(FAKE_USER_ID), nome: 'Carteira B', saldo: 0 });

    await transactionModel.insertMany([
      txn({ type: TransactionType.INCOME, value: 200, carteiraId: wallet._id, date: monthsAgo(2) }),
      txn({ type: TransactionType.EXPENSE, value: 100, carteiraId: wallet._id, date: monthsAgo(1) }),
      txn({
        type: TransactionType.TRANSFER,
        value: 50,
        carteiraId: outraCarteira._id,
        carteiraDestinoId: wallet._id,
        date: monthsAgo(0),
      }),
    ]);

    const res = await request(app.getHttpServer()).get('/api/insights/wallets-evolution').expect(200);

    const walletResult = res.body.find((w: { id: string }) => w.id === wallet._id.toString());
    expect(walletResult.points).toHaveLength(12);
    // 500 (saldo inicial) + 200 (entrada) - 100 (saída) + 50 (crédito de transferência) = 650
    expect(walletResult.currentBalance).toBe(650);
    expect(walletResult.points[11].balance).toBe(650);
  });

  it('com período (Relatório Personalizado), rebaseia o bucketing de 12 meses pro FIM do período — ignora movimentos depois dele', async () => {
    const wallet = await walletModel.create({ userId: new Types.ObjectId(FAKE_USER_ID), nome: 'Carteira A', saldo: 500 });

    await transactionModel.insertMany([
      // Dentro do período (jan/2026): deve contar.
      txn({ type: TransactionType.INCOME, value: 200, carteiraId: wallet._id, date: new Date('2026-01-10') }),
      txn({ type: TransactionType.EXPENSE, value: 100, carteiraId: wallet._id, date: new Date('2026-01-20') }),
      // Depois do fim do período escolhido: não deve entrar no saldo do relatório.
      txn({ type: TransactionType.INCOME, value: 1000, carteiraId: wallet._id, date: new Date('2026-03-01') }),
    ]);

    const res = await request(app.getHttpServer())
      .get('/api/insights/wallets-evolution')
      .query({ period: 'month', year: 2026, month: 1 })
      .expect(200);

    const walletResult = res.body.find((w: { id: string }) => w.id === wallet._id.toString());
    expect(walletResult.points).toHaveLength(12);
    // 500 (saldo inicial) + 200 (entrada) - 100 (saída) = 600 — sem a entrada de março.
    expect(walletResult.currentBalance).toBe(600);
    expect(walletResult.points[11].balance).toBe(600);
  });
});
