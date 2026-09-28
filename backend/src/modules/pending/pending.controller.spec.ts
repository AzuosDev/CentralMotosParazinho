import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, ExecutionContext } from '@nestjs/common';
import request from 'supertest';
import { PendingModule } from './pending.module';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Category } from '../categories/schemas/category.schema';
import { Transaction } from '../transactions/schemas/transaction.schema';
import { PendingAccount } from './schemas/pending-account.schema';

const FAKE_USER_ID = new Types.ObjectId().toString();

describe('PendingController (e2e)', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const mongoUri = mongod.getUri();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        MongooseModule.forRootAsync({
          useFactory: () => ({ uri: mongoUri }),
        }),
        PendingModule,
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
  });

  afterAll(async () => {
    await app.close();
    await mongod.stop();
  });

  const basePayload = {
    title: 'Compra teste',
    value: 1000,
    dueDate: '2026-12-31',
    categoria: 'Alimentação',
    formatoPagamento: 'Cartão de Crédito',
  };

  it('POST creates pending with calculated valorParcela', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/accounts')
      .send({
        ...basePayload,
        isParcelada: true,
        parcelas: {
          totalParcelas: 4,
          dataInicio: '2026-01-01',
          dataFim: '2026-04-01',
        },
      })
      .expect(201);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].parcelas.valorParcela).toBe(250); // 1000/4
    expect(res.body[0].isParcelada).toBe(true);
  });

  it('POST returns 400 when isParcelada true without parcelas', async () => {
    await request(app.getHttpServer())
      .post('/api/accounts')
      .send({ ...basePayload, isParcelada: true })
      .expect(400);
  });

  it('PATCH updates isRecorrente false -> true requires recorrencia', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/accounts')
      .send({ ...basePayload, isRecorrente: false })
      .expect(201);
    const id = (create.body as { _id: string })._id;
    await request(app.getHttpServer())
      .patch(`/api/accounts/${id}`)
      .send({ isRecorrente: true })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/accounts/${id}`)
      .send({ isRecorrente: true, recorrencia: { periodoRecorrencia: 'Mensal', dataProxima: '2026-02-01' } })
      .expect(200);
  });

  it('GET filters by tipo (PAGAR vs RECEBER)', async () => {
    await request(app.getHttpServer())
      .post('/api/accounts')
      .send({ ...basePayload, title: 'Conta a receber teste', tipo: 'RECEBER' })
      .expect(201);

    const pagarRes = await request(app.getHttpServer())
      .get('/api/accounts')
      .query({ tipo: 'PAGAR' })
      .expect(200);
    expect(
      (pagarRes.body as Array<{ title: string }>).some((item) => item.title === 'Conta a receber teste'),
    ).toBe(false);

    const receberRes = await request(app.getHttpServer())
      .get('/api/accounts')
      .query({ tipo: 'RECEBER' })
      .expect(200);
    expect(
      (receberRes.body as Array<{ title: string }>).some((item) => item.title === 'Conta a receber teste'),
    ).toBe(true);
  });

  it('GET projects recurring PAGAR/RECEBER for the whole target month regardless of today', async () => {
    // Template vence todo dia 5, criado em janeiro/2026.
    await request(app.getHttpServer())
      .post('/api/accounts')
      .send({
        ...basePayload,
        title: 'Aluguel recorrente',
        dueDate: '2026-01-05',
        isRecorrente: true,
        tipo: 'PAGAR',
        recorrencia: { periodoRecorrencia: 'Mensal', dataProxima: '2026-01-05' },
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/accounts')
      .send({
        ...basePayload,
        title: 'Salário recorrente',
        dueDate: '2026-01-05',
        isRecorrente: true,
        tipo: 'RECEBER',
        recorrencia: { periodoRecorrencia: 'Mensal', dataProxima: '2026-01-05' },
      })
      .expect(201);

    // Consulta o mês 06/2026 (independentemente de qual seja o dia "hoje" no relógio do servidor,
    // a conta deve aparecer o mês inteiro, não só no dia 5).
    const pagarRes = await request(app.getHttpServer())
      .get('/api/accounts')
      .query({ tipo: 'PAGAR', month: 6, year: 2026 })
      .expect(200);
    const aluguel = (pagarRes.body as Array<{ title: string; dueDate: string }>).find(
      (item) => item.title === 'Aluguel recorrente',
    );
    expect(aluguel).toBeDefined();
    expect(new Date(aluguel!.dueDate).getUTCDate()).toBe(5);
    expect(new Date(aluguel!.dueDate).getUTCMonth()).toBe(5); // 0-indexed: junho

    const receberRes = await request(app.getHttpServer())
      .get('/api/accounts')
      .query({ tipo: 'RECEBER', month: 6, year: 2026 })
      .expect(200);
    const salario = (receberRes.body as Array<{ title: string; dueDate: string }>).find(
      (item) => item.title === 'Salário recorrente',
    );
    expect(salario).toBeDefined();
    expect(new Date(salario!.dueDate).getUTCDate()).toBe(5);
  });

  it('PATCH paid=true on a RECEBER account creates an INCOME transaction with category fallback', async () => {
    const categoryModel = app.get<Model<Category>>(getModelToken(Category.name));
    const transactionModel = app.get<Model<Transaction>>(getModelToken(Transaction.name));

    const incomeCategory = await categoryModel.create({
      name: 'Salário Teste',
      slug: 'salario-teste',
      isIncome: true,
      isDefault: true,
    });

    const create = await request(app.getHttpServer())
      .post('/api/accounts')
      .send({
        ...basePayload,
        title: 'Recebimento de cliente',
        tipo: 'RECEBER',
        categoria: 'Categoria Que Não Existe',
      })
      .expect(201);
    const id = (create.body as { _id: string })._id;

    await request(app.getHttpServer())
      .patch(`/api/accounts/${id}`)
      .send({ paid: true })
      .expect(200);

    const tx = await transactionModel.findOne({ pendingAccountId: new Types.ObjectId(id) }).exec();
    expect(tx).not.toBeNull();
    expect(tx!.type).toBe('INCOME');
    expect(tx!.categoryId?.toString()).toBe(incomeCategory._id.toString());
  });

  it('DELETE /:templateId/month removes a RECEBER recurring item from that month for good', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/accounts')
      .send({
        ...basePayload,
        title: 'Mensalidade recorrente RECEBER',
        dueDate: '2026-02-10',
        isRecorrente: true,
        tipo: 'RECEBER',
        recorrencia: { periodoRecorrencia: 'Mensal', dataProxima: '2026-02-10' },
      })
      .expect(201);
    const templateId = (create.body as { _id: string })._id;

    // Antes de pular: a conta deve aparecer na projeção de julho/2026.
    const beforeSkip = await request(app.getHttpServer())
      .get('/api/accounts')
      .query({ tipo: 'RECEBER', month: 7, year: 2026 })
      .expect(200);
    expect(
      (beforeSkip.body as Array<{ title: string }>).some(
        (item) => item.title === 'Mensalidade recorrente RECEBER',
      ),
    ).toBe(true);

    // Exclui apenas o mês de julho/2026.
    await request(app.getHttpServer())
      .delete(`/api/accounts/${templateId}/month`)
      .query({ month: 7, year: 2026 })
      .expect(200);

    // Depois de pular: não pode mais aparecer nem ser somada ao total de julho/2026.
    const afterSkip = await request(app.getHttpServer())
      .get('/api/accounts')
      .query({ tipo: 'RECEBER', month: 7, year: 2026 })
      .expect(200);
    const stillThere = (afterSkip.body as Array<{ title: string }>).some(
      (item) => item.title === 'Mensalidade recorrente RECEBER',
    );
    expect(stillThere).toBe(false);

    // Outros meses continuam projetando normalmente (só julho foi pulado).
    const otherMonth = await request(app.getHttpServer())
      .get('/api/accounts')
      .query({ tipo: 'RECEBER', month: 8, year: 2026 })
      .expect(200);
    expect(
      (otherMonth.body as Array<{ title: string }>).some(
        (item) => item.title === 'Mensalidade recorrente RECEBER',
      ),
    ).toBe(true);
  });

  it('GET injects a virtual wallet for legacy accounts without carteiraId', async () => {
    await request(app.getHttpServer())
      .post('/api/accounts')
      .send({ ...basePayload, title: 'Conta legada sem carteira' })
      .expect(201);

    const res = await request(app.getHttpServer()).get('/api/accounts').expect(200);
    const item = (res.body as Array<{ title: string; carteira?: { nome: string; tipo: string } }>).find(
      (i) => i.title === 'Conta legada sem carteira',
    );
    expect(item).toBeDefined();
    expect(item!.carteira?.tipo).toBe('VIRTUAL');
  });

  it('GET keeps projecting a recurring PAGAR template into months well after its creation month', async () => {
    await request(app.getHttpServer())
      .post('/api/accounts')
      .send({
        ...basePayload,
        title: 'Assinatura criada em junho',
        dueDate: '2026-06-10',
        isRecorrente: true,
        tipo: 'PAGAR',
        recorrencia: { periodoRecorrencia: 'Mensal', dataProxima: '2026-06-10' },
      })
      .expect(201);

    for (const { month, year } of [
      { month: 7, year: 2026 },
      { month: 9, year: 2026 },
      { month: 12, year: 2026 },
    ]) {
      const res = await request(app.getHttpServer())
        .get('/api/accounts')
        .query({ tipo: 'PAGAR', month, year })
        .expect(200);
      const found = (res.body as Array<{ title: string }>).some(
        (item) => item.title === 'Assinatura criada em junho',
      );
      expect(found).toBe(true);
    }
  });

  it('GET ?tipo=PAGAR still returns a legacy paid account that has no tipo field in storage', async () => {
    // Simula um documento criado por um deploy antigo (anterior ao campo `tipo`):
    // inserção via driver nativo, sem passar pelo Mongoose, para garantir que o campo
    // realmente não existe no BSON gravado (o default do schema só age na leitura).
    const pendingModel = app.get<Model<PendingAccount>>(getModelToken(PendingAccount.name));
    const legacyId = new Types.ObjectId();
    await pendingModel.collection.insertOne({
      _id: legacyId,
      userId: new Types.ObjectId(FAKE_USER_ID),
      title: 'Conta paga no deploy antigo',
      value: 100,
      dueDate: new Date('2026-05-10'),
      paid: true,
      paidAt: new Date('2026-05-10'),
      isParcelada: false,
      isRecorrente: false,
      categoria: 'Outro',
      formatoPagamento: 'Outro',
      // sem `tipo` e sem `carteiraId` — exatamente como um documento pré-feature.
    });

    const res = await request(app.getHttpServer())
      .get('/api/accounts')
      .query({ tipo: 'PAGAR', month: 5, year: 2026 })
      .expect(200);

    const legacy = (res.body as Array<{ _id: string; paid: boolean; carteira?: { tipo: string } }>).find(
      (item) => item._id === legacyId.toString(),
    );
    expect(legacy).toBeDefined();
    expect(legacy!.paid).toBe(true);
    expect(legacy!.carteira?.tipo).toBe('VIRTUAL');
  });

  it('PATCH persists a date change on an installment account (parcelas was being silently ignored)', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/accounts')
      .send({
        ...basePayload,
        title: 'Compra parcelada teste',
        isParcelada: true,
        parcelas: { totalParcelas: 3, dataInicio: '2026-01-10', dataFim: '2026-03-10' },
      })
      .expect(201);
    const firstInstallment = (create.body as Array<{ _id: string; numeroParcela: number }>).find(
      (item) => item.numeroParcela === 1,
    )!;

    const patchRes = await request(app.getHttpServer())
      .patch(`/api/accounts/${firstInstallment._id}`)
      .send({
        title: 'Compra parcelada teste',
        value: 1000,
        dueDate: '2026-01-10',
        isParcelada: true,
        tipo: 'PAGAR',
        parcelas: { totalParcelas: 3, dataInicio: '2026-02-15', dataFim: '2026-04-15', valorParcela: 333.33 },
      })
      .expect(200);

    expect(new Date(patchRes.body.parcelas.dataInicio).toISOString().slice(0, 10)).toBe('2026-02-15');
    expect(new Date(patchRes.body.parcelas.dataFim).toISOString().slice(0, 10)).toBe('2026-04-15');
    // 1ª parcela: o próprio vencimento acompanha a nova data de início do grupo.
    expect(new Date(patchRes.body.dueDate).toISOString().slice(0, 10)).toBe('2026-02-15');

    const reread = await request(app.getHttpServer())
      .get('/api/accounts')
      .query({})
      .expect(200);
    const persisted = (reread.body as Array<{ _id: string; parcelas?: { dataInicio: string } }>).find(
      (item) => item._id === firstInstallment._id,
    );
    expect(persisted?.parcelas?.dataInicio.slice(0, 10)).toBe('2026-02-15');
  });

  it('PATCH paid=false on a paid single account reverts status and removes the settlement transaction', async () => {
    const transactionModel = app.get<Model<Transaction>>(getModelToken(Transaction.name));

    const create = await request(app.getHttpServer())
      .post('/api/accounts')
      .send({ ...basePayload, title: 'Conta para desmarcar', dueDate: '2026-11-01' })
      .expect(201);
    const id = (create.body as { _id: string })._id;

    await request(app.getHttpServer())
      .patch(`/api/accounts/${id}`)
      .send({ paid: true })
      .expect(200);

    const txBefore = await transactionModel.findOne({ pendingAccountId: new Types.ObjectId(id) }).exec();
    expect(txBefore).not.toBeNull();

    const unpayRes = await request(app.getHttpServer())
      .patch(`/api/accounts/${id}`)
      .send({ paid: false })
      .expect(200);

    expect(unpayRes.body.paid).toBe(false);
    expect(unpayRes.body.paidAt).toBeUndefined();

    const txAfter = await transactionModel.findOne({ pendingAccountId: new Types.ObjectId(id) }).exec();
    expect(txAfter).toBeNull();
  });

  it('PATCH paid=false on a specific installment does not affect other installments', async () => {
    const transactionModel = app.get<Model<Transaction>>(getModelToken(Transaction.name));

    const create = await request(app.getHttpServer())
      .post('/api/accounts')
      .send({
        ...basePayload,
        title: 'Parcelada para desmarcar',
        isParcelada: true,
        parcelas: { totalParcelas: 3, dataInicio: '2026-08-01', dataFim: '2026-10-01' },
      })
      .expect(201);

    const installments = create.body as Array<{ _id: string; numeroParcela: number }>;
    const p1 = installments.find((i) => i.numeroParcela === 1)!;
    const p2 = installments.find((i) => i.numeroParcela === 2)!;
    const p3 = installments.find((i) => i.numeroParcela === 3)!;

    await request(app.getHttpServer()).patch(`/api/accounts/${p1._id}`).send({ paid: true }).expect(200);
    await request(app.getHttpServer()).patch(`/api/accounts/${p2._id}`).send({ paid: true }).expect(200);

    const unpayRes = await request(app.getHttpServer())
      .patch(`/api/accounts/${p2._id}`)
      .send({ paid: false })
      .expect(200);

    expect(unpayRes.body.paid).toBe(false);
    expect(unpayRes.body.parcelas?.parcelasPagas).not.toContain(2);
    expect(unpayRes.body.parcelas?.qtdParcelasPagas).toBe(1);

    // A transação da parcela 2 deve ter sido removida, mas a da parcela 1 não.
    const txP2 = await transactionModel.findOne({ pendingAccountId: new Types.ObjectId(p2._id) }).exec();
    expect(txP2).toBeNull();
    const txP1 = await transactionModel.findOne({ pendingAccountId: new Types.ObjectId(p1._id) }).exec();
    expect(txP1).not.toBeNull();

    // Parcela 1 permanece paga e parcela 3 permanece não paga.
    const listRes = await request(app.getHttpServer()).get('/api/accounts').expect(200);
    const all = listRes.body as Array<{ _id: string; paid: boolean }>;
    expect(all.find((i) => i._id === p1._id)?.paid).toBe(true);
    expect(all.find((i) => i._id === p3._id)?.paid).toBe(false);
  });

  it('PATCH paid=false on an already-unpaid account returns 400', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/accounts')
      .send({ ...basePayload, title: 'Conta não paga para erro 400', dueDate: '2026-11-05' })
      .expect(201);
    const id = (create.body as { _id: string })._id;

    await request(app.getHttpServer())
      .patch(`/api/accounts/${id}`)
      .send({ paid: false })
      .expect(400);
  });

  it('PATCH paid=true on affectsBalance=false account does not create a transaction; unpay is safe', async () => {
    const transactionModel = app.get<Model<Transaction>>(getModelToken(Transaction.name));

    const create = await request(app.getHttpServer())
      .post('/api/accounts')
      .send({ ...basePayload, title: 'Conta sem impacto no saldo', dueDate: '2026-11-10', affectsBalance: false })
      .expect(201);
    const id = (create.body as { _id: string })._id;

    await request(app.getHttpServer())
      .patch(`/api/accounts/${id}`)
      .send({ paid: true })
      .expect(200);

    const tx = await transactionModel.findOne({ pendingAccountId: new Types.ObjectId(id) }).exec();
    expect(tx).toBeNull();

    const unpayRes = await request(app.getHttpServer())
      .patch(`/api/accounts/${id}`)
      .send({ paid: false })
      .expect(200);
    expect(unpayRes.body.paid).toBe(false);
  });

  it('POST parcelada com affectsBalance:false — parcelas retroativas herdam false, futuras/atual forçam true', async () => {
    // Hoje: 2026-07-01. Parcelas: mai/jun (retroativas) + jul/ago/set (atual+futuro).
    const res = await request(app.getHttpServer())
      .post('/api/accounts')
      .send({
        ...basePayload,
        title: 'Parcelada retroativa parcial',
        dueDate: '2026-05-01', // frontend sempre envia dueDate = dataInicio para parcelada
        isParcelada: true,
        affectsBalance: false,
        parcelas: { totalParcelas: 5, dataInicio: '2026-05-01', dataFim: '2026-09-01' },
      })
      .expect(201);

    const installments = res.body as Array<{ numeroParcela: number; dueDate: string; affectsBalance: boolean }>;
    expect(installments).toHaveLength(5);

    const byNum = (n: number) => installments.find((i) => i.numeroParcela === n)!;

    // Parcelas retroativas: maio e junho
    expect(byNum(1).affectsBalance).toBe(false);
    expect(byNum(2).affectsBalance).toBe(false);

    // Parcela do mês atual (julho) e futuras: sempre true independente do dto
    expect(byNum(3).affectsBalance).toBe(true);
    expect(byNum(4).affectsBalance).toBe(true);
    expect(byNum(5).affectsBalance).toBe(true);
  });

  it('PATCH on a later installment updates group metadata but not its own dueDate', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/accounts')
      .send({
        ...basePayload,
        title: 'Compra parcelada teste 2',
        isParcelada: true,
        parcelas: { totalParcelas: 2, dataInicio: '2026-05-01', dataFim: '2026-06-01' },
      })
      .expect(201);
    const second = (create.body as Array<{ _id: string; numeroParcela: number; dueDate: string }>).find(
      (item) => item.numeroParcela === 2,
    )!;

    const patchRes = await request(app.getHttpServer())
      .patch(`/api/accounts/${second._id}`)
      .send({
        title: 'Compra parcelada teste 2',
        value: 500,
        dueDate: second.dueDate,
        isParcelada: true,
        tipo: 'PAGAR',
        parcelas: { totalParcelas: 2, dataInicio: '2026-07-01', dataFim: '2026-08-01', valorParcela: 250 },
      })
      .expect(200);

    expect(new Date(patchRes.body.parcelas.dataInicio).toISOString().slice(0, 10)).toBe('2026-07-01');
    expect(new Date(patchRes.body.dueDate).toISOString().slice(0, 10)).toBe(
      new Date(second.dueDate).toISOString().slice(0, 10),
    );
  });

  it('conta recorrente sem dataTermino aparece em todos os meses futuros indefinidamente', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/accounts')
      .send({
        ...basePayload,
        title: 'Aluguel recorrente',
        dueDate: '2026-07-10',
        isRecorrente: true,
        recorrencia: { periodoRecorrencia: 'Mensal' },
      })
      .expect(201);
    const id = (create.body as { _id: string })._id;

    // Aparece no mês de início (julho/2026)
    const jul = await request(app.getHttpServer()).get('/api/accounts?month=7&year=2026').expect(200);
    expect((jul.body as Array<{ _id?: string; templateId?: string }>).some(
      (i) => i._id === id || i.templateId === id,
    )).toBe(true);

    // Aparece 12 meses depois (julho/2027) — sem dataTermino, não para nunca
    const jul27 = await request(app.getHttpServer()).get('/api/accounts?month=7&year=2027').expect(200);
    expect((jul27.body as Array<{ _id?: string; templateId?: string }>).some(
      (i) => i._id === id || i.templateId === id,
    )).toBe(true);

    // NÃO aparece antes do mês de início (junho/2026)
    const jun = await request(app.getHttpServer()).get('/api/accounts?month=6&year=2026').expect(200);
    expect((jun.body as Array<{ _id?: string; templateId?: string }>).some(
      (i) => i._id === id || i.templateId === id,
    )).toBe(false);
  });

  it('conta recorrente com dataTermino para de aparecer após a data definida', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/accounts')
      .send({
        ...basePayload,
        title: 'Assinatura finita',
        dueDate: '2026-07-10',
        isRecorrente: true,
        recorrencia: {
          periodoRecorrencia: 'Mensal',
          dataTermino: '2026-09-10', // termina em setembro/2026
        },
      })
      .expect(201);
    const id = (create.body as { _id: string })._id;

    // Aparece em julho, agosto e setembro (dentro do prazo)
    for (const [month, year] of [[7, 2026], [8, 2026], [9, 2026]]) {
      const res = await request(app.getHttpServer())
        .get(`/api/accounts?month=${month}&year=${year}`)
        .expect(200);
      expect((res.body as Array<{ _id?: string; templateId?: string }>).some(
        (i) => i._id === id || i.templateId === id,
      )).toBe(true);
    }

    // NÃO aparece em outubro/2026 (após dataTermino)
    const out = await request(app.getHttpServer()).get('/api/accounts?month=10&year=2026').expect(200);
    expect((out.body as Array<{ _id?: string; templateId?: string }>).some(
      (i) => i._id === id || i.templateId === id,
    )).toBe(false);
  });

  it('PATCH paid=true herda categoryId diretamente (caminho principal — contas novas)', async () => {
    const categoryModel = app.get<Model<Category>>(getModelToken(Category.name));
    const transactionModel = app.get<Model<Transaction>>(getModelToken(Transaction.name));

    const cat = await categoryModel.create({
      name: 'Alimentação Teste',
      slug: 'alimentacao-teste',
      isIncome: false,
      isDefault: true,
    });

    const create = await request(app.getHttpServer())
      .post('/api/accounts')
      .send({
        ...basePayload,
        title: 'Conta com categoryId',
        dueDate: '2026-10-01',
        categoryId: cat._id.toString(),
        categoria: 'Alimentação Teste',
      })
      .expect(201);
    const id = (create.body as { _id: string })._id;

    await request(app.getHttpServer())
      .patch(`/api/accounts/${id}`)
      .send({ paid: true })
      .expect(200);

    const tx = await transactionModel.findOne({ pendingAccountId: new Types.ObjectId(id) }).exec();
    expect(tx).not.toBeNull();
    expect(tx!.categoryId?.toString()).toBe(cat._id.toString());
  });

  it('PATCH paid=true resolve categoria via fallback de nome quando categoryId é ausente (contas antigas)', async () => {
    const categoryModel = app.get<Model<Category>>(getModelToken(Category.name));
    const transactionModel = app.get<Model<Transaction>>(getModelToken(Transaction.name));
    const pendingModel = app.get<Model<PendingAccount>>(getModelToken(PendingAccount.name));

    const cat = await categoryModel.create({
      name: 'Transporte Legado',
      slug: 'transporte-legado',
      isIncome: false,
      isDefault: true,
    });

    // Insere via driver nativo para simular conta antiga (sem categoryId)
    const legacyId = new Types.ObjectId();
    await pendingModel.collection.insertOne({
      _id: legacyId,
      userId: new Types.ObjectId(FAKE_USER_ID),
      title: 'Conta legada sem categoryId',
      value: 50,
      dueDate: new Date('2026-10-15'),
      paid: false,
      isParcelada: false,
      isRecorrente: false,
      categoria: 'Transporte Legado',
      tipo: 'PAGAR',
      affectsBalance: true,
    });

    await request(app.getHttpServer())
      .patch(`/api/accounts/${legacyId.toString()}`)
      .send({ paid: true })
      .expect(200);

    const tx = await transactionModel.findOne({ pendingAccountId: legacyId }).exec();
    expect(tx).not.toBeNull();
    expect(tx!.categoryId?.toString()).toBe(cat._id.toString());
  });

  it('PATCH paid=true fallback com nome contendo caracteres especiais de regex não quebra', async () => {
    const categoryModel = app.get<Model<Category>>(getModelToken(Category.name));
    const transactionModel = app.get<Model<Transaction>>(getModelToken(Transaction.name));
    const pendingModel = app.get<Model<PendingAccount>>(getModelToken(PendingAccount.name));

    const cat = await categoryModel.create({
      name: 'Taxas (IOF+JCP)',
      slug: 'taxas-iof-jcp',
      isIncome: false,
      isDefault: true,
    });

    const legacyId = new Types.ObjectId();
    await pendingModel.collection.insertOne({
      _id: legacyId,
      userId: new Types.ObjectId(FAKE_USER_ID),
      title: 'Conta com nome especial',
      value: 20,
      dueDate: new Date('2026-10-20'),
      paid: false,
      isParcelada: false,
      isRecorrente: false,
      categoria: 'Taxas (IOF+JCP)',
      tipo: 'PAGAR',
      affectsBalance: true,
    });

    await request(app.getHttpServer())
      .patch(`/api/accounts/${legacyId.toString()}`)
      .send({ paid: true })
      .expect(200);

    const tx = await transactionModel.findOne({ pendingAccountId: legacyId }).exec();
    expect(tx).not.toBeNull();
    expect(tx!.categoryId?.toString()).toBe(cat._id.toString());
  });

  it('PATCH paid=true numa conta que é fatura de cartão é rejeitado', async () => {
    const pendingModel = app.get<Model<PendingAccount>>(getModelToken(PendingAccount.name));

    const fatura = await pendingModel.create({
      userId: new Types.ObjectId(FAKE_USER_ID),
      title: 'Fatura Nubank',
      value: 300,
      dueDate: new Date('2026-11-10'),
      paid: false,
      isParcelada: false,
      isRecorrente: false,
      tipo: 'PAGAR',
      faturaId: new Types.ObjectId(),
    });

    await request(app.getHttpServer())
      .patch(`/api/accounts/${fatura._id.toString()}`)
      .send({ paid: true })
      .expect(400);
  });

  it('DELETE numa conta que é fatura de cartão é rejeitado', async () => {
    const pendingModel = app.get<Model<PendingAccount>>(getModelToken(PendingAccount.name));

    const fatura = await pendingModel.create({
      userId: new Types.ObjectId(FAKE_USER_ID),
      title: 'Fatura Itaú',
      value: 300,
      dueDate: new Date('2026-11-10'),
      paid: false,
      isParcelada: false,
      isRecorrente: false,
      tipo: 'PAGAR',
      faturaId: new Types.ObjectId(),
    });

    await request(app.getHttpServer())
      .delete(`/api/accounts/${fatura._id.toString()}`)
      .expect(400);
  });
});
