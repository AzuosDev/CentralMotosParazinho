import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, ExecutionContext } from '@nestjs/common';
import request from 'supertest';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User, UserDocument } from '../users/schemas/user.schema';
import { BillingModule } from './billing.module';

const USER_ID = new Types.ObjectId();
const OUTRO_ID = new Types.ObjectId();
const DIA = 24 * 60 * 60 * 1000;

const mockGuard = {
  canActivate: (context: ExecutionContext) => {
    const req = context.switchToHttp().getRequest<{ user: { _id: Types.ObjectId; email: string } }>();
    req.user = { _id: USER_ID, email: 'cliente@teste.com' };
    return true;
  },
};

// "API do Asaas" em memória: cada teste define os pagamentos que existem lá.
type Pagamento = {
  id: string; status: string; customer: string; externalReference?: string; dueDate: string;
  value?: number; billingType?: string; description?: string; deleted?: boolean;
};
let pagamentos: Pagamento[] = [];
let criados: unknown[] = [];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const fetchMock = jest.fn((input: string | URL, init?: RequestInit) => {
  const url = new URL(input.toString());
  const path = url.pathname.replace(/^\/v3/, '');
  const method = init?.method ?? 'GET';

  if (path === '/customers' && method === 'POST') return json({ id: 'cus_novo' });
  if (path.startsWith('/customers/') && method === 'PUT') return json({ id: path.split('/')[2] });

  if (path === '/payments' && method === 'GET') {
    const q = url.searchParams;
    const data = pagamentos.filter((p) =>
      (!q.get('customer') || p.customer === q.get('customer')) &&
      (!q.get('status') || p.status === q.get('status')) &&
      (!q.get('externalReference') || p.externalReference === q.get('externalReference')));
    return json({ data, hasMore: false });
  }
  if (path === '/payments' && method === 'POST') {
    const body = JSON.parse(init!.body as string);
    criados.push(body);
    const novo = { id: `pay_${criados.length}`, status: 'PENDING', ...body };
    pagamentos.push(novo);
    return json(novo);
  }
  const qr = path.match(/^\/payments\/([^/]+)\/pixQrCode$/);
  if (qr) return json({ encodedImage: 'BASE64', payload: `copia-e-cola-${qr[1]}`, expirationDate: '2026-12-31 23:59:59' });
  const one = path.match(/^\/payments\/([^/]+)$/);
  if (one) {
    const p = pagamentos.find((x) => x.id === one[1]);
    return p ? json(p) : json({ errors: [{ description: 'not found' }] }, 404);
  }
  return json({ errors: [{ description: `rota não simulada ${method} ${path}` }] }, 404);
});

describe('BillingController', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  let userModel: Model<UserDocument>;
  const fetchOriginal = global.fetch;

  beforeAll(async () => {
    process.env.ASAAS_API_KEY = '$aact_hmlg_teste';
    process.env.ASAAS_URL = 'https://sandbox.asaas.com/api/v3';
    process.env.ASAAS_WEBHOOK_TOKEN = 'segredo-webhook';
    global.fetch = fetchMock as unknown as typeof fetch;

    mongod = await MongoMemoryServer.create();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        MongooseModule.forRootAsync({ useFactory: () => ({ uri: mongod.getUri() }) }),
        BillingModule,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    userModel = moduleFixture.get(getModelToken(User.name));
  });

  afterAll(async () => {
    global.fetch = fetchOriginal;
    delete process.env.ASAAS_API_KEY;
    delete process.env.ASAAS_URL;
    delete process.env.ASAAS_WEBHOOK_TOKEN;
    await app.close();
    await mongod.stop();
  });

  beforeEach(async () => {
    pagamentos = [];
    criados = [];
    fetchMock.mockClear();
    await userModel.deleteMany({});
    await userModel.create({
      _id: USER_ID, email: 'cliente@teste.com', password: 'x', asaasCustomerId: 'cus_1', cpfCnpj: '12345678909',
    });
    await userModel.create({ _id: OUTRO_ID, email: 'outro@teste.com', password: 'x', asaasCustomerId: 'cus_2' });
  });

  const http = () => request(app.getHttpServer());

  it('GET /config: informa só a presença das chaves', async () => {
    const res = await http().get('/api/billing/config').expect(200);
    expect(res.body).toEqual({ pix: true, cartao: false });
  });

  it('GET /faturas: lista as cobranças do usuário com status traduzido, sem as de outros', async () => {
    pagamentos = [
      { id: 'pay_a', status: 'RECEIVED', customer: 'cus_1', dueDate: '2026-08-10', value: 29.9, billingType: 'PIX' },
      { id: 'pay_b', status: 'PENDING', customer: 'cus_1', dueDate: '2026-10-20', value: 29.9, billingType: 'PIX' },
      { id: 'pay_c', status: 'OVERDUE', customer: 'cus_1', dueDate: '2026-09-10', value: 29.9, billingType: 'PIX' },
      { id: 'pay_d', status: 'PENDING', customer: 'cus_1', dueDate: '2026-07-01', billingType: 'PIX', deleted: true },
      { id: 'pay_x', status: 'PENDING', customer: 'cus_2', dueDate: '2026-10-20', billingType: 'PIX' },
    ];
    const res = await http().get('/api/billing/faturas').expect(200);
    expect(res.body.map((f: { id: string; status: string; podePagarPix: boolean }) => [f.id, f.status, f.podePagarPix])).toEqual([
      ['pay_b', 'pendente', true],
      ['pay_c', 'vencida', true],
      ['pay_a', 'paga', false],
    ]);
  });

  it('GET /faturas: usuário que nunca pagou recebe lista vazia sem chamar o Asaas', async () => {
    await userModel.updateOne({ _id: USER_ID }, { asaasCustomerId: null });
    const res = await http().get('/api/billing/faturas').expect(200);
    expect(res.body).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('GET /faturas/:id/pix: devolve QR e copia e cola de fatura própria em aberto', async () => {
    pagamentos = [{ id: 'pay_b', status: 'OVERDUE', customer: 'cus_1', dueDate: '2026-10-01', billingType: 'PIX' }];
    const res = await http().get('/api/billing/faturas/pay_b/pix').expect(200);
    expect(res.body).toMatchObject({ id: 'pay_b', qrCodeImage: 'BASE64', copiaECola: 'copia-e-cola-pay_b' });
  });

  it('GET /faturas/:id/pix: recusa fatura de outro usuário e fatura já paga', async () => {
    pagamentos = [
      { id: 'pay_x', status: 'PENDING', customer: 'cus_2', dueDate: '2026-10-01', billingType: 'PIX' },
      { id: 'pay_a', status: 'RECEIVED', customer: 'cus_1', dueDate: '2026-10-01', billingType: 'PIX' },
    ];
    await http().get('/api/billing/faturas/pay_x/pix').expect(404);
    await http().get('/api/billing/faturas/pay_a/pix').expect(400);
  });

  it('POST /checkout pix: reaproveita a cobrança pendente do mesmo plano em vez de criar outra', async () => {
    const body = { plan: 'basico', cycle: 'monthly', method: 'pix', cpfCnpj: '123.456.789-09' };
    const r1 = await http().post('/api/billing/checkout').send(body).expect(201);
    const r2 = await http().post('/api/billing/checkout').send(body).expect(201);
    expect(criados).toHaveLength(1);
    expect(r2.body.pixData.id).toBe(r1.body.pixData.id);
  });

  it('webhook: token errado é rejeitado e não ativa nada', async () => {
    pagamentos = [{ id: 'pay_1', status: 'RECEIVED', customer: 'cus_1', dueDate: '2026-10-01', externalReference: `${USER_ID}__basico__monthly` }];
    await http().post('/api/billing/webhook/asaas')
      .set('asaas-access-token', 'errado')
      .send({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1' } })
      .expect(401);
    const u = await userModel.findById(USER_ID).lean();
    expect(u?.subscriptionStatus).toBeNull();
  });

  it('webhook: corpo forjado não ativa — o status vem da API do Asaas, não do corpo', async () => {
    pagamentos = [{ id: 'pay_1', status: 'PENDING', customer: 'cus_1', dueDate: '2026-10-01', externalReference: `${USER_ID}__basico__annual` }];
    await http().post('/api/billing/webhook/asaas')
      .set('asaas-access-token', 'segredo-webhook')
      .send({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1', status: 'RECEIVED', externalReference: `${USER_ID}__basico__annual` } })
      .expect(201);
    const u = await userModel.findById(USER_ID).lean();
    expect(u?.subscriptionStatus).toBeNull();
  });

  it('webhook + polling do mesmo pagamento renovam uma vez só, somando ao prazo vigente', async () => {
    const vigenteAte = new Date(Date.now() + 10 * DIA);
    await userModel.updateOne({ _id: USER_ID }, { subscriptionStatus: 'active', subscriptionExpiresAt: vigenteAte });
    pagamentos = [{ id: 'pay_1', status: 'CONFIRMED', customer: 'cus_1', dueDate: '2026-10-01', externalReference: `${USER_ID}__basico__monthly` }];

    await http().post('/api/billing/webhook/asaas')
      .set('asaas-access-token', 'segredo-webhook')
      .send({ event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_1' } })
      .expect(201);
    const status = await http().get('/api/billing/pix/pay_1/status').expect(200);
    expect(status.body).toEqual({ paid: true });

    const u = await userModel.findById(USER_ID).lean();
    expect(u?.subscriptionExpiresAt?.getTime()).toBe(vigenteAte.getTime() + 30 * DIA);
    expect(u?.asaasPagamentosAplicados).toEqual(['pay_1']);
  });

  it('GET /pix/:id/status: não revela pagamento de outro usuário', async () => {
    pagamentos = [{ id: 'pay_x', status: 'RECEIVED', customer: 'cus_2', dueDate: '2026-10-01', externalReference: `${OUTRO_ID}__basico__monthly` }];
    await http().get('/api/billing/pix/pay_x/status').expect(404);
    const outro = await userModel.findById(OUTRO_ID).lean();
    expect(outro?.subscriptionStatus).toBeNull();
  });

  it('GET /diagnostico: restrito ao admin', async () => {
    await http().get('/api/billing/diagnostico').expect(403);
  });
});
