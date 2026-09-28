import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, ExecutionContext } from '@nestjs/common';
import request from 'supertest';
import { WalletsModule } from './wallets.module';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Wallet } from './schemas/wallet.schema';
import { Transaction, TransactionType } from '../transactions/schemas/transaction.schema';

const FAKE_USER_ID = new Types.ObjectId().toString();

describe('WalletsController (e2e)', () => {
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
        WalletsModule,
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

  it('GET does not include a virtual wallet when there is no legacy balance', async () => {
    await walletModel.create({ userId: new Types.ObjectId(FAKE_USER_ID), nome: 'Carteira única', saldo: 0 });

    const res = await request(app.getHttpServer()).get('/api/wallets').expect(200);
    expect((res.body as Array<{ tipo?: string }>).some((w) => w.tipo === 'VIRTUAL')).toBe(false);
  });

  it('GET includes a virtual wallet aggregating legacy transactions without carteiraId', async () => {
    await transactionModel.create({
      userId: new Types.ObjectId(FAKE_USER_ID),
      type: TransactionType.EXPENSE,
      value: 80,
      date: new Date('2026-03-01'),
    });
    await transactionModel.create({
      userId: new Types.ObjectId(FAKE_USER_ID),
      type: TransactionType.INCOME,
      value: 30,
      date: new Date('2026-03-02'),
    });

    const res = await request(app.getHttpServer()).get('/api/wallets').expect(200);
    const legacy = (res.body as Array<{ _id: string; tipo?: string; saldo: number }>).find((w) => w.tipo === 'VIRTUAL');
    expect(legacy).toBeDefined();
    expect(legacy!._id).toBe('legacy-wallet');
    expect(legacy!.saldo).toBe(30 - 80);
  });

  it('GET omits the virtual wallet once its net legacy balance returns to zero', async () => {
    // Estado herdado do teste anterior: saldo legado líquido de -50 (30 receita - 80
    // despesa) para FAKE_USER_ID. Uma receita extra de 50 zera o líquido.
    await transactionModel.create({
      userId: new Types.ObjectId(FAKE_USER_ID),
      type: TransactionType.INCOME,
      value: 50,
      date: new Date('2026-03-03'),
    });

    const res = await request(app.getHttpServer()).get('/api/wallets').expect(200);
    expect((res.body as Array<{ tipo?: string }>).some((w) => w.tipo === 'VIRTUAL')).toBe(false);
  });

  it('GET buckets a transaction with carteiraId stored as an empty string into the legacy wallet', async () => {
    // Estado herdado: saldo legado líquido zerado pelo teste anterior. Inserção via
    // driver nativo porque o Mongoose rejeitaria "" como ObjectId inválido no cast de
    // escrita, mas um deploy antigo/externo pode ter gravado isso direto no banco.
    await transactionModel.collection.insertOne({
      userId: new Types.ObjectId(FAKE_USER_ID),
      type: TransactionType.EXPENSE,
      value: 40,
      date: new Date('2026-04-01'),
      carteiraId: '',
    } as never);
    await transactionModel.create({
      userId: new Types.ObjectId(FAKE_USER_ID),
      type: TransactionType.INCOME,
      value: 10,
      date: new Date('2026-04-02'),
    });

    const res = await request(app.getHttpServer()).get('/api/wallets').expect(200);
    const legacy = (res.body as Array<{ tipo?: string; saldo: number }>).find((w) => w.tipo === 'VIRTUAL');
    expect(legacy).toBeDefined();
    expect(legacy!.saldo).toBe(10 - 40);
  });

  it('GET buckets a transaction whose carteiraId points to a wallet the user no longer owns', async () => {
    // Estado herdado do teste anterior: saldo legado líquido de -30.
    const orphanWalletId = new Types.ObjectId();
    await transactionModel.create({
      userId: new Types.ObjectId(FAKE_USER_ID),
      type: TransactionType.EXPENSE,
      value: 15,
      date: new Date('2026-04-03'),
      carteiraId: orphanWalletId,
    });

    const res = await request(app.getHttpServer()).get('/api/wallets').expect(200);
    const legacy = (res.body as Array<{ tipo?: string; saldo: number }>).find((w) => w.tipo === 'VIRTUAL');
    expect(legacy).toBeDefined();
    expect(legacy!.saldo).toBe(-30 - 15);
    const orphanEntry = (res.body as Array<{ _id: string }>).find((w) => w._id === orphanWalletId.toString());
    expect(orphanEntry).toBeUndefined();
  });

  it('POST creates a wallet with tipo=credito and the credit-specific fields', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/wallets')
      .send({
        nome: 'Cartão Nubank',
        tipo: 'credito',
        limite: 5000,
        diaFechamento: 10,
        diaVencimento: 17,
        taxaJurosRotativo: 12.5,
        bandeira: 'Mastercard',
        ultimosDigitos: '4242',
      })
      .expect(201);

    expect(res.body.tipo).toBe('credito');
    expect(res.body.limite).toBe(5000);
    expect(res.body.diaFechamento).toBe(10);
    expect(res.body.diaVencimento).toBe(17);
    expect(res.body.taxaJurosRotativo).toBe(12.5);
    expect(res.body.bandeira).toBe('Mastercard');
    expect(res.body.ultimosDigitos).toBe('4242');
  });

  it('GET /api/wallets does not include credit-card wallets', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/wallets')
      .send({ nome: 'Cartão Excluído da Lista', tipo: 'credito', limite: 1000, diaFechamento: 5, diaVencimento: 12 })
      .expect(201);

    const res = await request(app.getHttpServer()).get('/api/wallets').expect(200);
    const found = (res.body as Array<{ _id: string }>).find((w) => w._id === created.body._id);
    expect(found).toBeUndefined();
  });

  it('GET /api/wallets?incluirCartoes=true includes credit-card wallets alongside the rest', async () => {
    const cartao = await request(app.getHttpServer())
      .post('/api/wallets')
      .send({ nome: 'Cartão Incluído no Seletor', tipo: 'credito', limite: 1000, diaFechamento: 5, diaVencimento: 12 })
      .expect(201);
    const conta = await request(app.getHttpServer())
      .post('/api/wallets')
      .send({ nome: 'Conta do Seletor', saldo: 100 })
      .expect(201);

    const semParam = await request(app.getHttpServer()).get('/api/wallets').expect(200);
    expect((semParam.body as Array<{ _id: string }>).some((w) => w._id === cartao.body._id)).toBe(false);

    const comParam = await request(app.getHttpServer()).get('/api/wallets').query({ incluirCartoes: 'true' }).expect(200);
    const ids = (comParam.body as Array<{ _id: string; tipo?: string }>).map((w) => w._id);
    expect(ids).toContain(cartao.body._id);
    expect(ids).toContain(conta.body._id);
    const cartaoNaLista = (comParam.body as Array<{ _id: string; tipo?: string }>).find((w) => w._id === cartao.body._id);
    expect(cartaoNaLista!.tipo).toBe('credito');
  });

  it('GET /api/wallets/:id returns 404 for a credit-card wallet', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/wallets')
      .send({ nome: 'Cartão 404', tipo: 'credito', limite: 1000, diaFechamento: 5, diaVencimento: 12 })
      .expect(201);

    await request(app.getHttpServer()).get(`/api/wallets/${created.body._id}`).expect(404);
  });

  it('default wallet creation still defaults tipo to conta', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/wallets')
      .send({ nome: 'Carteira Padrão' })
      .expect(201);

    expect(created.body.tipo).toBe('conta');
  });

  it('PATCH {nome} numa carteira tipo=conta não passa a exigir campos de cartão (regressão do @ValidateIf)', async () => {
    // A condição do @ValidateIf (tipo !== 'conta' && tipo !== 'dinheiro') é verdadeira quando
    // `tipo` não vem no PATCH — mas todo campo exclusivo de cartão também tem @IsOptional(),
    // e o class-validator faz AND das duas condições, então ausência do campo nunca vira
    // obrigatoriedade. Este teste trava esse comportamento.
    const created = await request(app.getHttpServer())
      .post('/api/wallets')
      .send({ nome: 'Conta Corrente', tipo: 'conta', saldo: 100 })
      .expect(201);

    const patched = await request(app.getHttpServer())
      .patch(`/api/wallets/${created.body._id}`)
      .send({ nome: 'Conta Corrente Renomeada' })
      .expect(200);

    expect(patched.body.nome).toBe('Conta Corrente Renomeada');
  });

  it('POST /:id/arquivar tira a carteira de GET /api/wallets (listagem/patrimônio) mas GET /:id continua funcionando', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/wallets')
      .send({ nome: 'Carteira Pra Arquivar', saldo: 250 })
      .expect(201);

    const listaAntes = await request(app.getHttpServer()).get('/api/wallets').expect(200);
    expect((listaAntes.body as Array<{ _id: string }>).some((w) => w._id === created.body._id)).toBe(true);

    const arquivada = await request(app.getHttpServer())
      .post(`/api/wallets/${created.body._id}/arquivar`)
      .expect(201);
    expect(arquivada.body.arquivadaEm).toBeDefined();

    const listaDepois = await request(app.getHttpServer()).get('/api/wallets').expect(200);
    expect((listaDepois.body as Array<{ _id: string }>).some((w) => w._id === created.body._id)).toBe(false);

    // Histórico continua acessível por id — arquivar não é excluir.
    const detalhe = await request(app.getHttpServer()).get(`/api/wallets/${created.body._id}`).expect(200);
    expect(detalhe.body.saldo).toBe(250);

    // Arquivar de novo é rejeitado.
    await request(app.getHttpServer()).post(`/api/wallets/${created.body._id}/arquivar`).expect(400);
  });

  it('POST /:id/desarquivar faz a carteira voltar a aparecer em GET /api/wallets', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/wallets')
      .send({ nome: 'Carteira Vai e Volta' })
      .expect(201);

    await request(app.getHttpServer()).post(`/api/wallets/${created.body._id}/arquivar`).expect(201);
    const desarquivada = await request(app.getHttpServer())
      .post(`/api/wallets/${created.body._id}/desarquivar`)
      .expect(201);
    expect(desarquivada.body.arquivadaEm).toBeUndefined();

    const lista = await request(app.getHttpServer()).get('/api/wallets').expect(200);
    expect((lista.body as Array<{ _id: string }>).some((w) => w._id === created.body._id)).toBe(true);
  });
});
