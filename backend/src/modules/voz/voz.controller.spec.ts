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
import { Moto } from '../motos/schemas/moto.schema';
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
  let motoModel: Model<Moto>;
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
    motoModel = moduleFixture.get(getModelToken(Moto.name));

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

  it('gasto "em espécie" sem carteira de dinheiro fica sem carteira (não cai na conta padrão)', async () => {
    respostaIa = (prompt) => ({
      lancamentos: [
        { tipo: 'gasto', valor: 20, descricao: 'Comida', categoria: refDe(prompt, 'Mercado'), carteira: refDe(prompt, 'Nubank') },
        // IA errou e pôs a conta bancária num gasto que foi em espécie
        { tipo: 'gasto', valor: 20, descricao: 'Comida', categoria: refDe(prompt, 'Mercado'), carteira: refDe(prompt, 'Nubank'), pagamento: 'dinheiro' },
        { tipo: 'gasto', valor: 20, descricao: 'Comida', categoria: refDe(prompt, 'Mercado'), carteira: null, pagamento: 'dinheiro' },
      ],
    });

    const res = await request(app.getHttpServer())
      .post('/api/voz/interpretar')
      .send({ texto: '20 de comida no Nubank, 20 em espécie e mais 20 em dinheiro' })
      .expect(201);

    expect(res.body.itens).toEqual([
      expect.objectContaining({ carteiraId: contaId, formaPagamento: null }),
      expect.objectContaining({ carteiraId: null, formaPagamento: 'dinheiro' }),
      expect.objectContaining({ carteiraId: null, formaPagamento: 'dinheiro' }),
    ]);
  });

  it('gasto "em espécie" vai para a única carteira de dinheiro, mesmo sem a IA indicar', async () => {
    const dinheiro = await walletModel.create({ userId: new Types.ObjectId(FAKE_USER_ID), nome: 'Bolso', tipo: 'dinheiro' });
    try {
      respostaIa = (prompt) => ({
        lancamentos: [
          { tipo: 'gasto', valor: 20, descricao: 'Comida', categoria: refDe(prompt, 'Mercado'), carteira: refDe(prompt, 'Nubank'), pagamento: 'dinheiro' },
          { tipo: 'gasto', valor: 15, descricao: 'Pão', categoria: refDe(prompt, 'Mercado'), carteira: null, pagamento: 'credito' },
        ],
      });

      const res = await request(app.getHttpServer()).post('/api/voz/interpretar').send({ texto: 'x' }).expect(201);

      expect(res.body.itens).toEqual([
        expect.objectContaining({ carteiraId: String(dinheiro._id), formaPagamento: 'dinheiro' }),
        expect.objectContaining({ carteiraId: cartaoId, formaPagamento: 'credito' }),
      ]);
    } finally {
      await walletModel.deleteOne({ _id: dinheiro._id });
    }
  });

  it('carteira do tipo conta com nome de dinheiro físico conta como dinheiro em espécie', async () => {
    const especie = await walletModel.create({ userId: new Types.ObjectId(FAKE_USER_ID), nome: 'Dinheiro', tipo: 'conta' });
    try {
      let promptVisto = '';
      respostaIa = (prompt) => {
        promptVisto = prompt;
        return {
          lancamentos: [
            { tipo: 'gasto', valor: 20, descricao: 'Comida', categoria: refDe(prompt, 'Mercado'), carteira: refDe(prompt, 'Dinheiro'), pagamento: 'dinheiro' },
            { tipo: 'gasto', valor: 20, descricao: 'Comida', categoria: refDe(prompt, 'Mercado'), carteira: null, pagamento: 'dinheiro' },
          ],
        };
      };

      const res = await request(app.getHttpServer()).post('/api/voz/interpretar').send({ texto: 'x' }).expect(201);

      expect(promptVisto).toMatch(/w\d+=Dinheiro \(dinheiro em espécie\)/);
      expect(res.body.itens.map((i: { carteiraId: string }) => i.carteiraId)).toEqual([String(especie._id), String(especie._id)]);
    } finally {
      await walletModel.deleteOne({ _id: especie._id });
    }
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
  describe('gasto de moto x gasto geral', () => {
    const userId = new Types.ObjectId(FAKE_USER_ID);
    const fichaMoto = (modelo: string, placa: string, cor: string) => ({
      userId,
      modelo,
      ano: 2022,
      placa,
      chassi: `CHASSI${placa}`,
      cor,
      km: 10000,
      valorCompra: 10000,
      dataCompra: new Date('2026-09-01'),
      margemDesejada: 20,
    });

    afterEach(async () => {
      await motoModel.deleteMany({});
    });

    it('sem moto em estoque, todo gasto é geral e o prompt não fala de moto', async () => {
      let promptVisto = '';
      respostaIa = (prompt) => {
        promptVisto = prompt;
        return { lancamentos: [{ tipo: 'gasto', valor: 20, categoria: refDe(prompt, 'Mercado'), destino: 'moto', moto: 'm1' }] };
      };

      const res = await request(app.getHttpServer()).post('/api/voz/interpretar').send({ texto: 'x' }).expect(201);

      expect(promptVisto).not.toContain('Motos em estoque');
      expect(res.body.itens[0]).toMatchObject({ destino: 'geral', motoId: null });
    });

    it('lista as motos do pátio e revalida destino e moto da IA', async () => {
      const [, fazer] = await motoModel.create([
        fichaMoto('Honda CG 160', 'ABC1D23', 'vermelha'),
        fichaMoto('Yamaha Fazer 250', 'XYZ9K87', 'preta'),
      ]);
      await motoModel.create({ ...fichaMoto('Honda Biz', 'VEN1D00', 'azul'), status: 'vendida', valorVenda: 12000, dataVenda: new Date() });

      let promptVisto = '';
      respostaIa = (prompt) => {
        promptVisto = prompt;
        const ref = (placa: string) => prompt.match(new RegExp(`(m\\d+)=[^;]*placa ${placa}`))![1];
        return {
          lancamentos: [
            // "gastei 20 reais da nubank": não dá para saber
            { tipo: 'gasto', valor: 20, categoria: refDe(prompt, 'Mercado'), carteira: refDe(prompt, 'Nubank'), destino: null },
            { tipo: 'gasto', valor: 300, categoria: refDe(prompt, 'Mercado'), destino: 'moto', moto: ref('XYZ9K87') },
            { tipo: 'gasto', valor: 35, categoria: refDe(prompt, 'Mercado'), destino: 'geral' },
            // disse que é de moto, mas não qual (há duas no pátio)
            { tipo: 'gasto', valor: 80, categoria: refDe(prompt, 'Mercado'), destino: 'moto', moto: null },
            // moto inventada e ganho com moto
            { tipo: 'gasto', valor: 10, categoria: refDe(prompt, 'Mercado'), destino: 'moto', moto: 'm99' },
            { tipo: 'ganho', valor: 50, categoria: refDe(prompt, 'Salário'), destino: 'moto', moto: ref('ABC1D23') },
          ],
        };
      };

      const res = await request(app.getHttpServer()).post('/api/voz/interpretar').send({ texto: 'x' }).expect(201);

      expect(promptVisto).toMatch(/m\d+=Honda CG 160 2022 vermelha placa ABC1D23/);
      expect(promptVisto).not.toContain('Biz');
      expect(res.body.itens.map((i: { destino: string; motoId: string }) => [i.destino, i.motoId])).toEqual([
        [null, null],
        ['moto', String(fazer._id)],
        ['geral', null],
        ['moto', null],
        ['moto', null],
        [null, null],
      ]);
    });

    it('com uma moto só no pátio, "gasto de moto" já vem com ela', async () => {
      const [cg] = await motoModel.create([fichaMoto('Honda CG 160', 'ABC1D23', 'vermelha')]);
      respostaIa = (prompt) => ({
        lancamentos: [{ tipo: 'gasto', valor: 90, descricao: 'Óleo', categoria: refDe(prompt, 'Mercado'), destino: 'moto' }],
      });

      const res = await request(app.getHttpServer()).post('/api/voz/interpretar').send({ texto: 'troquei o óleo da moto, 90' }).expect(201);

      expect(res.body.itens[0]).toMatchObject({ destino: 'moto', motoId: String(cg._id) });
    });

    it('confirma o gasto vinculado à moto e recusa moto em compra parcelada', async () => {
      const [cg] = await motoModel.create([fichaMoto('Honda CG 160', 'ABC1D23', 'vermelha')]);
      const res = await request(app.getHttpServer())
        .post('/api/voz/confirmar')
        .send({
          itens: [
            { type: 'EXPENSE', value: 90, description: 'Óleo', date: '2026-10-01', categoryId: mercadoId, carteiraId: contaId, motoId: String(cg._id) },
            { type: 'EXPENSE', value: 900, description: 'Pneu', date: '2026-10-01', categoryId: mercadoId, carteiraId: cartaoId, parcelas: 3, motoId: String(cg._id) },
            { type: 'EXPENSE', value: 10, description: 'Moto alheia', date: '2026-10-01', categoryId: mercadoId, carteiraId: contaId, motoId: String(new Types.ObjectId()) },
          ],
        })
        .expect(201);

      expect(res.body.resultados.map((r: { ok: boolean }) => r.ok)).toEqual([true, false, false]);
      const salvas = await transactionModel.find().lean();
      expect(salvas).toHaveLength(1);
      expect(String(salvas[0].motoId)).toBe(String(cg._id));
    });
  });
});
