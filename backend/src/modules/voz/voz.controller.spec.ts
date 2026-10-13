import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { VozModule } from './voz.module';
import { GroqClient } from './groq.client';
import { Category } from '../categories/schemas/category.schema';
import { Wallet } from '../wallets/schemas/wallet.schema';
import { Transaction, TransactionType } from '../transactions/schemas/transaction.schema';

const FAKE_USER_ID = new Types.ObjectId().toString();

// Acha o código curto ("c3", "w1") que o serviço deu a um nome no prompt — o fake responde
// como a IA responderia, sem depender da ordem em que categorias/carteiras foram listadas.
function refDe(prompt: string, nome: string): string {
  const m = prompt.match(new RegExp(`([cw]\\d+)=${nome}`));
  if (!m) throw new Error(`"${nome}" não está no prompt`);
  return m[1];
}

describe('VozController (e2e)', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  let transactionModel: Model<Transaction>;
  let walletModel: Model<Wallet>;
  let categoryModel: Model<Category>;
  let respostaIa: (prompt: string) => unknown;
  let ultimoTexto: string | null;
  const fakeGroq = {
    configurado: true,
    transcrever: jest.fn(async () => 'gastei 45 e 90 no mercado'),
    completarJson: jest.fn(async (sistema: string, usuario: string) => {
      ultimoTexto = usuario;
      return respostaIa(sistema);
    }),
  };

  let contaId: string;
  let cartaoId: string;
  let mercadoId: string;
  let salarioId: string;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [MongooseModule.forRootAsync({ useFactory: () => ({ uri: mongod.getUri() }) }), VozModule],
    })
      .overrideProvider(GroqClient)
      .useValue(fakeGroq)
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = { _id: new Types.ObjectId(FAKE_USER_ID) };
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    transactionModel = moduleFixture.get(getModelToken(Transaction.name));
    walletModel = moduleFixture.get(getModelToken(Wallet.name));
    categoryModel = moduleFixture.get(getModelToken(Category.name));

    const userId = new Types.ObjectId(FAKE_USER_ID);
    const [conta, cartao] = await walletModel.create([
      { userId, nome: 'Nubank', tipo: 'conta' },
      { userId, nome: 'Inter', tipo: 'credito', limite: 5000, diaFechamento: 5, diaVencimento: 12 },
    ]);
    contaId = String(conta._id);
    cartaoId = String(cartao._id);
    const [mercado, salario] = await categoryModel.create([
      { userId: null, name: 'Mercado', slug: 'supermercado', isDefault: true },
      { userId: null, name: 'Salário', slug: 'salario', isDefault: true, isIncome: true },
    ]);
    mercadoId = String(mercado._id);
    salarioId = String(salario._id);
  }, 60000);

  afterAll(async () => {
    await app.close();
    await mongod.stop();
  });

  beforeEach(async () => {
    await transactionModel.deleteMany({});
    jest.clearAllMocks();
    ultimoTexto = null;
  });

  it('interpreta vários lançamentos de uma fala e troca os códigos da IA pelos IDs reais', async () => {
    respostaIa = (prompt) => ({
      lancamentos: [
        { tipo: 'gasto', valor: 45.9, descricao: 'mercado', data: '2026-10-11', categoria: refDe(prompt, 'Mercado'), carteira: null, parcelas: 1 },
        { tipo: 'ganho', valor: '1200', descricao: 'Salário', data: 'ontem', categoria: refDe(prompt, 'Salário'), carteira: null },
        { tipo: 'gasto', valor: 3000, descricao: 'TV', categoria: refDe(prompt, 'Mercado'), carteira: refDe(prompt, 'Inter'), parcelas: 10 },
      ],
    });

    const res = await request(app.getHttpServer())
      .post('/api/voz/interpretar')
      .send({ texto: 'gastei 45,90 no mercado ontem, recebi 1200 de salário e comprei uma TV de 3000 em 10x no Inter', hoje: '2026-10-12' })
      .expect(201);

    expect(ultimoTexto).toContain('mercado');
    expect(res.body.itens).toEqual([
      expect.objectContaining({ type: 'EXPENSE', value: 45.9, description: 'Mercado', date: '2026-10-11', categoryId: mercadoId, carteiraId: contaId, parcelas: 1 }),
      // data inválida da IA cai em "hoje"; carteira única (não-cartão) vira o padrão
      expect.objectContaining({ type: 'INCOME', value: 1200, date: '2026-10-12', categoryId: salarioId, carteiraId: contaId }),
      expect.objectContaining({ type: 'EXPENSE', value: 3000, carteiraId: cartaoId, parcelas: 10 }),
    ]);
    expect(await transactionModel.countDocuments()).toBe(0);
  });

  it('descarta referência inventada e categoria incoerente com o tipo', async () => {
    respostaIa = (prompt) => ({
      lancamentos: [
        { tipo: 'gasto', valor: 20, descricao: 'Pão', categoria: 'c999', carteira: 'w999' },
        { tipo: 'ganho', valor: 50, descricao: 'Venda', categoria: refDe(prompt, 'Mercado'), carteira: refDe(prompt, 'Inter') },
        { tipo: 'gasto', valor: null, descricao: '' },
      ],
    });

    const res = await request(app.getHttpServer()).post('/api/voz/interpretar').send({ texto: 'qualquer coisa' }).expect(201);

    expect(res.body.itens).toHaveLength(2);
    expect(res.body.itens[0]).toMatchObject({ categoryId: null, carteiraId: contaId });
    // ganho nunca vai para cartão de crédito; categoria de gasto num ganho é descartada
    expect(res.body.itens[1]).toMatchObject({ type: 'INCOME', categoryId: null, carteiraId: contaId });
  });

  it('transcreve o áudio antes de interpretar', async () => {
    respostaIa = () => ({ lancamentos: [] });

    const res = await request(app.getHttpServer())
      .post('/api/voz/interpretar')
      .attach('audio', Buffer.from('fake-audio'), { filename: 'gravacao.webm', contentType: 'audio/webm' })
      .expect(201);

    expect(fakeGroq.transcrever).toHaveBeenCalledWith(expect.any(Buffer), 'audio/webm', expect.stringContaining('Nubank'));
    expect(res.body).toEqual({ transcricao: 'gastei 45 e 90 no mercado', itens: [] });
  });

  it('recusa pedido sem áudio e sem texto', async () => {
    await request(app.getHttpServer()).post('/api/voz/interpretar').send({}).expect(400);
  });

  it('confirma o lote item a item: salva os válidos e devolve o erro dos que falharam', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/voz/confirmar')
      .send({
        itens: [
          { type: 'EXPENSE', value: 45.9, description: 'Mercado', date: '2026-10-01', categoryId: mercadoId, carteiraId: contaId },
          { type: 'EXPENSE', value: 10, description: 'Sem categoria', date: '2026-10-01', carteiraId: contaId },
          { type: 'INCOME', value: 1200, description: 'Salário', date: '2026-10-01', categoryId: salarioId, carteiraId: contaId },
        ],
      })
      .expect(201);

    expect(res.body.resultados).toEqual([
      { indice: 0, ok: true },
      { indice: 1, ok: false, mensagem: 'Escolha uma categoria para o gasto.' },
      { indice: 2, ok: true },
    ]);
    const salvas = await transactionModel.find().sort({ value: 1 }).lean();
    expect(salvas.map((t) => [t.type, t.value])).toEqual([
      [TransactionType.EXPENSE, 45.9],
      [TransactionType.INCOME, 1200],
    ]);
  });

  it('compra no cartão em várias parcelas vira parcelamento', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/voz/confirmar')
      .send({
        itens: [{ type: 'EXPENSE', value: 300, description: 'Fone', date: '2026-10-01', categoryId: mercadoId, carteiraId: cartaoId, parcelas: 3 }],
      })
      .expect(201);

    expect(res.body.resultados[0]).toMatchObject({ indice: 0, ok: true });
    const parcelas = await transactionModel.find({ carteiraId: new Types.ObjectId(cartaoId) }).lean();
    expect(parcelas).toHaveLength(3);
    expect(parcelas.every((p) => p.totalParcelas === 3)).toBe(true);
  });

  it('ganho não pode ir para cartão de crédito', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/voz/confirmar')
      .send({ itens: [{ type: 'INCOME', value: 50, date: '2026-10-01', carteiraId: cartaoId }] })
      .expect(201);

    expect(res.body.resultados[0]).toMatchObject({ ok: false });
    expect(await transactionModel.countDocuments()).toBe(0);
  });
});
