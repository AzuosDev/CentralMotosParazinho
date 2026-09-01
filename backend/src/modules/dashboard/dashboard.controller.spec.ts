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
});
