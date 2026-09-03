import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, ExecutionContext } from '@nestjs/common';
import request from 'supertest';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { WalletsModule } from '../wallets/wallets.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { PendingModule } from '../pending/pending.module';
import { CartoesModule } from './cartoes.module';
import { CartoesService } from './cartoes.service';
import { Wallet } from '../wallets/schemas/wallet.schema';
import { Transaction } from '../transactions/schemas/transaction.schema';
import { PendingAccount } from '../pending/schemas/pending-account.schema';
import { Fatura } from './schemas/fatura.schema';
import { Category } from '../categories/schemas/category.schema';

const FAKE_USER_ID = new Types.ObjectId().toString();

describe('CartoesController (e2e)', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  let cartoesService: CartoesService;
  let walletModel: Model<Wallet>;
  let transactionModel: Model<Transaction>;
  let pendingModel: Model<PendingAccount>;
  let faturaModel: Model<Fatura>;
  let categoryModel: Model<Category>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const mongoUri = mongod.getUri();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        MongooseModule.forRootAsync({ useFactory: () => ({ uri: mongoUri }) }),
        WalletsModule,
        TransactionsModule,
        PendingModule,
        CartoesModule,
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

    cartoesService = app.get(CartoesService);
    walletModel = app.get<Model<Wallet>>(getModelToken(Wallet.name));
    transactionModel = app.get<Model<Transaction>>(getModelToken(Transaction.name));
    pendingModel = app.get<Model<PendingAccount>>(getModelToken(PendingAccount.name));
    faturaModel = app.get<Model<Fatura>>(getModelToken(Fatura.name));
    categoryModel = app.get<Model<Category>>(getModelToken(Category.name));

    await categoryModel.create({ name: 'Compras', slug: 'compras-teste', isDefault: true, isIncome: false });
    await categoryModel.create({ name: 'Taxas', slug: 'taxas', isDefault: true, isIncome: false });
  });

  afterAll(async () => {
    await app.close();
    await mongod.stop();
  });

  async function criarCartao(overrides: Record<string, unknown> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/wallets')
      .send({
        nome: 'Cartão Teste',
        tipo: 'credito',
        diaFechamento: 10,
        diaVencimento: 17,
        ...overrides,
      })
      .expect(201);
    return res.body as { _id: string };
  }

  async function categoriaId(): Promise<string> {
    const cat = await categoryModel.findOne({ slug: 'compras-teste' }).exec();
    return cat!._id.toString();
  }

  it('compra avulsa antes do fechamento cria fatura lazy, não mexe em saldo de carteira e cresce a conta pendente', async () => {
    const carteira = await request(app.getHttpServer())
      .post('/api/wallets')
      .send({ nome: 'Conta Corrente', saldo: 500 })
      .expect(201);

    const cartao = await criarCartao();
    const catId = await categoriaId();

    const saldoAntes = (
      await request(app.getHttpServer()).get(`/api/wallets/${carteira.body._id}`).expect(200)
    ).body.saldo;

    const tx = await request(app.getHttpServer())
      .post('/api/transactions')
      .send({ type: 'EXPENSE', value: 100, categoryId: catId, date: '2026-09-05', carteiraId: cartao._id })
      .expect(201);

    expect(tx.body.faturaId).toBeDefined();

    const saldoDepois = (
      await request(app.getHttpServer()).get(`/api/wallets/${carteira.body._id}`).expect(200)
    ).body.saldo;
    expect(saldoDepois).toBe(saldoAntes);

    const detalhe = await request(app.getHttpServer()).get(`/api/cartoes/${cartao._id}`).expect(200);
    const fatura = detalhe.body.faturas.find((f: { mesReferencia: string }) => f.mesReferencia === '2026-09');
    expect(fatura).toBeDefined();
    expect(fatura.valorTotal).toBe(100);

    const pending = await pendingModel.findById(fatura.pendingAccountId).exec();
    expect(pending!.value).toBe(100);
    expect(pending!.paid).toBe(false);

    // Segunda compra no mesmo ciclo: fatura cresce, não duplica conta pendente.
    await request(app.getHttpServer())
      .post('/api/transactions')
      .send({ type: 'EXPENSE', value: 50, categoryId: catId, date: '2026-09-06', carteiraId: cartao._id })
      .expect(201);

    const detalhe2 = await request(app.getHttpServer()).get(`/api/cartoes/${cartao._id}`).expect(200);
    const fatura2 = detalhe2.body.faturas.find((f: { mesReferencia: string }) => f.mesReferencia === '2026-09');
    expect(fatura2.valorTotal).toBe(150);
    expect(fatura2.pendingAccountId).toBe(fatura.pendingAccountId);
  });

  it('compra depois do fechamento cai na fatura do ciclo seguinte', async () => {
    const cartao = await criarCartao({ nome: 'Cartão Ciclo' });
    const catId = await categoriaId();

    await request(app.getHttpServer())
      .post('/api/transactions')
      .send({ type: 'EXPENSE', value: 70, categoryId: catId, date: '2026-09-15', carteiraId: cartao._id })
      .expect(201);

    const detalhe = await request(app.getHttpServer()).get(`/api/cartoes/${cartao._id}`).expect(200);
    const faturaSetembro = detalhe.body.faturas.find((f: { mesReferencia: string }) => f.mesReferencia === '2026-09');
    const faturaOutubro = detalhe.body.faturas.find((f: { mesReferencia: string }) => f.mesReferencia === '2026-10');
    expect(faturaSetembro).toBeUndefined();
    expect(faturaOutubro).toBeDefined();
    expect(faturaOutubro.valorTotal).toBe(70);
  });

  it('compra no próprio dia do fechamento fica no ciclo atual, não pula pro seguinte', async () => {
    const cartao = await criarCartao({ nome: 'Cartão Dia do Fechamento', diaFechamento: 10, diaVencimento: 17 });
    const catId = await categoriaId();

    // date === diaFechamento (dia 10): regra é "day > D" pula de ciclo, então o próprio dia
    // do fechamento ainda fica no ciclo atual (cartoes.service.ts#resolverCicloFatura).
    await request(app.getHttpServer())
      .post('/api/transactions')
      .send({ type: 'EXPENSE', value: 90, categoryId: catId, date: '2026-09-10', carteiraId: cartao._id })
      .expect(201);

    const detalhe = await request(app.getHttpServer()).get(`/api/cartoes/${cartao._id}`).expect(200);
    const faturaSetembro = detalhe.body.faturas.find((f: { mesReferencia: string }) => f.mesReferencia === '2026-09');
    const faturaOutubro = detalhe.body.faturas.find((f: { mesReferencia: string }) => f.mesReferencia === '2026-10');
    expect(faturaSetembro).toBeDefined();
    expect(faturaSetembro.valorTotal).toBe(90);
    expect(faturaOutubro).toBeUndefined();
  });

  it('bloqueia compra que ultrapassa o limite e libera com confirmarMesmoAssim', async () => {
    const cartao = await criarCartao({ nome: 'Cartão Limite', limite: 150 });
    const catId = await categoriaId();

    await request(app.getHttpServer())
      .post('/api/transactions')
      .send({ type: 'EXPENSE', value: 100, categoryId: catId, date: '2026-09-05', carteiraId: cartao._id })
      .expect(201);

    const bloqueado = await request(app.getHttpServer())
      .post('/api/transactions')
      .send({ type: 'EXPENSE', value: 100, categoryId: catId, date: '2026-09-06', carteiraId: cartao._id })
      .expect(409);
    expect(bloqueado.body.limiteDisponivel).toBe(50);

    await request(app.getHttpServer())
      .post('/api/transactions')
      .send({
        type: 'EXPENSE', value: 100, categoryId: catId, date: '2026-09-06',
        carteiraId: cartao._id, confirmarMesmoAssim: true,
      })
      .expect(201);

    const cartoesLista = await request(app.getHttpServer()).get('/api/cartoes').expect(200);
    const listado = cartoesLista.body.find((c: { _id: string }) => c._id === cartao._id);
    expect(listado.limiteUsado).toBe(200);
  });

  it('avisa (sem bloquear) ao ultrapassar 80% do limite, e não avisa mais depois de bloquear', async () => {
    const cartao = await criarCartao({ nome: 'Cartão Aviso 80%', limite: 100 });
    const catId = await categoriaId();

    // 75/100 = 75% — abaixo do limiar, sem aviso.
    const semAviso = await request(app.getHttpServer())
      .post('/api/transactions')
      .send({ type: 'EXPENSE', value: 75, categoryId: catId, date: '2026-09-05', carteiraId: cartao._id })
      .expect(201);
    expect(semAviso.body.avisoLimite).toBeNull();

    // 75 + 10 = 85/100 = 85% — acima de 80% mas não estoura: aviso, sem bloquear.
    const comAviso = await request(app.getHttpServer())
      .post('/api/transactions')
      .send({ type: 'EXPENSE', value: 10, categoryId: catId, date: '2026-09-06', carteiraId: cartao._id })
      .expect(201);
    expect(comAviso.body.avisoLimite).toEqual(
      expect.objectContaining({ percentualUsado: 85, excedeLimite: false, avisoProximoLimite: true }),
    );

    // 85 + 50 = 135/100 — estoura: bloqueia (409), a resposta de bloqueio é distinguível do aviso.
    const bloqueado = await request(app.getHttpServer())
      .post('/api/transactions')
      .send({ type: 'EXPENSE', value: 50, categoryId: catId, date: '2026-09-07', carteiraId: cartao._id })
      .expect(409);
    expect(bloqueado.body.limiteDisponivel).toBe(15);
    expect(bloqueado.body.avisoLimite).toBeUndefined();
  });

  it('pagamento total quita a fatura, cria TRANSFER e reduz saldo da carteira pagadora', async () => {
    const pagadora = await request(app.getHttpServer())
      .post('/api/wallets')
      .send({ nome: 'Conta Pagadora', saldo: 1000 })
      .expect(201);

    const cartao = await criarCartao({ nome: 'Cartão Pagamento', carteiraPagamentoId: pagadora.body._id });
    const catId = await categoriaId();

    await request(app.getHttpServer())
      .post('/api/transactions')
      .send({ type: 'EXPENSE', value: 300, categoryId: catId, date: '2026-09-05', carteiraId: cartao._id })
      .expect(201);

    const detalhe = await request(app.getHttpServer()).get(`/api/cartoes/${cartao._id}`).expect(200);
    const fatura = detalhe.body.faturas.find((f: { mesReferencia: string }) => f.mesReferencia === '2026-09');

    await request(app.getHttpServer())
      .post(`/api/cartoes/${cartao._id}/faturas/${fatura._id}/pagar`)
      .send({ valor: 300 })
      .expect(200);

    const faturaPaga = await faturaModel.findById(fatura._id).exec();
    expect(faturaPaga!.status).toBe('paga');
    expect(faturaPaga!.valorPago).toBe(300);

    const pending = await pendingModel.findById(fatura.pendingAccountId).exec();
    expect(pending!.paid).toBe(true);

    const saldoPagadora = (
      await request(app.getHttpServer()).get(`/api/wallets/${pagadora.body._id}`).expect(200)
    ).body.saldo;
    expect(saldoPagadora).toBe(700);

    // Pagar fatura já paga é rejeitado.
    await request(app.getHttpServer())
      .post(`/api/cartoes/${cartao._id}/faturas/${fatura._id}/pagar`)
      .send({ valor: 10 })
      .expect(400);

    // A fatura paga não pode ser liquidada/apagada pelo fluxo genérico de contas pendentes.
    await request(app.getHttpServer())
      .delete(`/api/accounts/${fatura.pendingAccountId}`)
      .expect(400);
  });

  it('pagamento parcial gera saldoRotativoAnterior e cobra juros no fechamento da fatura seguinte', async () => {
    const pagadora = await request(app.getHttpServer())
      .post('/api/wallets')
      .send({ nome: 'Conta Pagadora Rotativo', saldo: 1000 })
      .expect(201);

    const cartao = await criarCartao({
      nome: 'Cartão Rotativo',
      diaFechamento: 5,
      diaVencimento: 12,
      taxaJurosRotativo: 10,
      carteiraPagamentoId: pagadora.body._id,
    });
    const catId = await categoriaId();

    // Compra de julho — fecha em 5/jul.
    await request(app.getHttpServer())
      .post('/api/transactions')
      .send({ type: 'EXPENSE', value: 1000, categoryId: catId, date: '2026-07-01', carteiraId: cartao._id })
      .expect(201);

    const detalhe1 = await request(app.getHttpServer()).get(`/api/cartoes/${cartao._id}`).expect(200);
    const faturaJulho = detalhe1.body.faturas.find((f: { mesReferencia: string }) => f.mesReferencia === '2026-07');
    expect(faturaJulho.valorTotal).toBe(1000);

    // Paga só 400 dos 1000.
    await request(app.getHttpServer())
      .post(`/api/cartoes/${cartao._id}/faturas/${faturaJulho._id}/pagar`)
      .send({ valor: 400 })
      .expect(200);

    const julhoParcial = await faturaModel.findById(faturaJulho._id).exec();
    expect(julhoParcial!.status).toBe('parcial');

    // Compra de agosto — fecha em 5/ago, cria a 2ª fatura.
    await request(app.getHttpServer())
      .post('/api/transactions')
      .send({ type: 'EXPENSE', value: 200, categoryId: catId, date: '2026-08-01', carteiraId: cartao._id })
      .expect(201);

    const detalhe2 = await request(app.getHttpServer()).get(`/api/cartoes/${cartao._id}`).expect(200);
    const faturaAgosto = detalhe2.body.faturas.find((f: { mesReferencia: string }) => f.mesReferencia === '2026-08');

    // Simula o cron rodando depois do fechamento de agosto (05/08).
    await cartoesService.fecharFaturasVencidas(new Date('2026-08-06T12:00:00Z'));

    const faturaAgostoFechada = await faturaModel.findById(faturaAgosto._id).exec();
    expect(faturaAgostoFechada!.status).toBe('fechada');
    expect(faturaAgostoFechada!.saldoRotativoAnterior).toBe(600); // 1000 - 400 pago
    expect(faturaAgostoFechada!.jurosAplicados).toBe(60); // 600 * 10%
    expect(faturaAgostoFechada!.valorTotal).toBe(260); // 200 da compra + 60 de juros

    const pendingAgosto = await pendingModel.findById(faturaAgostoFechada!.pendingAccountId).exec();
    expect(pendingAgosto!.value).toBe(860); // 260 + 600 de rotativo carregado

    // _id vindo de JSON é string — precisa de cast explícito pra filtrar por um campo
    // ObjectId custom (mesma convenção defensiva já usada em todo o resto do backend).
    const jurosTx = await transactionModel
      .findOne({ faturaId: new Types.ObjectId(faturaAgosto._id), description: 'Juros rotativo do cartão' })
      .exec();
    expect(jurosTx).not.toBeNull();
    expect(jurosTx!.value).toBe(60);
  });

  it('estorno depois de fatura paga deixa saldoRotativoAnterior negativo, e o crédito abate a fatura seguinte', async () => {
    const pagadora = await request(app.getHttpServer())
      .post('/api/wallets')
      .send({ nome: 'Conta Pagadora Crédito', saldo: 1000 })
      .expect(201);

    const cartao = await criarCartao({
      nome: 'Cartão Crédito Rotativo',
      diaFechamento: 5,
      diaVencimento: 12,
      taxaJurosRotativo: 10,
      carteiraPagamentoId: pagadora.body._id,
    });
    const catId = await categoriaId();

    // Compra de julho, paga integralmente antes do fechamento — sem pendência nenhuma.
    const compraJulho = await request(app.getHttpServer())
      .post('/api/transactions')
      .send({ type: 'EXPENSE', value: 300, categoryId: catId, date: '2026-07-01', carteiraId: cartao._id })
      .expect(201);

    const detalhe1 = await request(app.getHttpServer()).get(`/api/cartoes/${cartao._id}`).expect(200);
    const faturaJulho = detalhe1.body.faturas.find((f: { mesReferencia: string }) => f.mesReferencia === '2026-07');

    await request(app.getHttpServer())
      .post(`/api/cartoes/${cartao._id}/faturas/${faturaJulho._id}/pagar`)
      .send({ valor: 300 })
      .expect(200);

    const julhoPaga = await faturaModel.findById(faturaJulho._id).exec();
    expect(julhoPaga!.status).toBe('paga');

    // Estorno chega DEPOIS do pagamento: valorTotal de julho recalcula pra 0, mas valorPago
    // continua 300 — julho ficou "pago a mais" (mesmo cenário de uma loja que só processa o
    // reembolso depois que a fatura já foi quitada).
    await request(app.getHttpServer())
      .post(`/api/cartoes/transacoes/${compraJulho.body._id}/estorno`)
      .expect(201);

    const julhoEstornada = await faturaModel.findById(faturaJulho._id).exec();
    expect(julhoEstornada!.valorTotal).toBe(0);
    expect(julhoEstornada!.valorPago).toBe(300); // não mexe em valorPago, só no que ela devia

    // Compra de agosto, pequena — abre a 2ª fatura.
    await request(app.getHttpServer())
      .post('/api/transactions')
      .send({ type: 'EXPENSE', value: 50, categoryId: catId, date: '2026-08-01', carteiraId: cartao._id })
      .expect(201);

    const detalhe2 = await request(app.getHttpServer()).get(`/api/cartoes/${cartao._id}`).expect(200);
    const faturaAgosto = detalhe2.body.faturas.find((f: { mesReferencia: string }) => f.mesReferencia === '2026-08');

    await cartoesService.fecharFaturasVencidas(new Date('2026-08-06T12:00:00Z'));

    const faturaAgostoFechada = await faturaModel.findById(faturaAgosto._id).exec();
    expect(faturaAgostoFechada!.status).toBe('fechada');
    // devidoAnterior (0) - valorPago (300) = -300: o crédito de julho vira saldo negativo em agosto.
    expect(faturaAgostoFechada!.saldoRotativoAnterior).toBe(-300);
    expect(faturaAgostoFechada!.jurosAplicados).toBe(0); // juros só incidem sobre restante > 0
    expect(faturaAgostoFechada!.valorTotal).toBe(50);

    // 50 (compra) + (-300) de crédito = -250: fatura fica credora de fato. Como o schema de
    // PendingAccount não aceita value <= 0, não existe "conta a pagar" real pra mostrar — a
    // correção pós-auditoria remove a PendingAccount em vez de floorar pra 0.01 fictício.
    expect(faturaAgostoFechada!.pendingAccountId).toBeUndefined();
    const pendingAgosto = await pendingModel.findOne({ faturaId: faturaAgostoFechada!._id }).exec();
    expect(pendingAgosto).toBeNull();
  });

  it('parcelamento gera N transações, uma por ciclo, com sobra de arredondamento na primeira', async () => {
    const cartao = await criarCartao({ nome: 'Cartão Parcelado', diaFechamento: 28, diaVencimento: 5 });
    const catId = await categoriaId();

    const res = await request(app.getHttpServer())
      .post('/api/cartoes/parcelamentos')
      .send({
        carteiraId: cartao._id,
        categoryId: catId,
        descricao: 'Notebook',
        valorTotal: 100,
        totalParcelas: 3,
        dataCompra: '2026-09-01',
      })
      .expect(201);

    const transacoes = res.body.transacoes as Array<{ numeroParcela: number; value: number; agendado: boolean }>;
    expect(transacoes).toHaveLength(3);
    const total = transacoes.reduce((s, t) => s + t.value, 0);
    expect(Number(total.toFixed(2))).toBe(100);
    expect(transacoes[0].numeroParcela).toBe(1);
    expect(transacoes[0].agendado).toBe(false); // mês corrente
    expect(transacoes[1].agendado).toBe(true);
    expect(transacoes[2].agendado).toBe(true);

    const parcelamentos = await request(app.getHttpServer()).get(`/api/cartoes/${cartao._id}/parcelamentos`).expect(200);
    expect(parcelamentos.body).toHaveLength(1);
    expect(parcelamentos.body[0].parcelasPagas).toBe(1);
    expect(parcelamentos.body[0].parcelasRestantes).toBe(2);
  });

  it('estorno reduz valorTotal da fatura sem gravar valor negativo em Transaction', async () => {
    const cartao = await criarCartao({ nome: 'Cartão Estorno' });
    const catId = await categoriaId();

    const compra = await request(app.getHttpServer())
      .post('/api/transactions')
      .send({ type: 'EXPENSE', value: 300, categoryId: catId, date: '2026-09-05', carteiraId: cartao._id })
      .expect(201);

    const detalheAntes = await request(app.getHttpServer()).get(`/api/cartoes/${cartao._id}`).expect(200);
    const faturaAntes = detalheAntes.body.faturas.find((f: { mesReferencia: string }) => f.mesReferencia === '2026-09');
    const pendingAntes = await pendingModel.findById(faturaAntes.pendingAccountId).exec();
    expect(pendingAntes!.value).toBe(300);

    const estorno = await request(app.getHttpServer())
      .post(`/api/cartoes/transacoes/${compra.body._id}/estorno`)
      .expect(201);

    expect(estorno.body.value).toBeGreaterThan(0);
    expect(estorno.body.value).toBe(300);
    expect(estorno.body.isEstorno).toBe(true);

    const detalhe = await request(app.getHttpServer()).get(`/api/cartoes/${cartao._id}`).expect(200);
    const fatura = detalhe.body.faturas.find((f: { mesReferencia: string }) => f.mesReferencia === '2026-09');
    expect(fatura.valorTotal).toBe(0);

    // Nada mais é devido (valorTotal 0 + saldoRotativoAnterior 0): a PendingAccount some em
    // vez de mostrar um R$0,01 fictício — o schema nem aceita value <= 0 (min: 0.01).
    expect(fatura.pendingAccountId).toBeUndefined();
    const pendingDepois = await pendingModel.findById(faturaAntes.pendingAccountId).exec();
    expect(pendingDepois).toBeNull();

    // Nova compra no mesmo ciclo traz o total de volta ao positivo: a conta a pagar é
    // recriada (não paga), com o valor certo.
    await request(app.getHttpServer())
      .post('/api/transactions')
      .send({ type: 'EXPENSE', value: 45, categoryId: catId, date: '2026-09-06', carteiraId: cartao._id })
      .expect(201);

    const detalheRecriada = await request(app.getHttpServer()).get(`/api/cartoes/${cartao._id}`).expect(200);
    const faturaRecriada = detalheRecriada.body.faturas.find((f: { mesReferencia: string }) => f.mesReferencia === '2026-09');
    expect(faturaRecriada.valorTotal).toBe(45);
    expect(faturaRecriada.pendingAccountId).toBeDefined();

    const pendingRecriada = await pendingModel.findById(faturaRecriada.pendingAccountId).exec();
    expect(pendingRecriada!.value).toBe(45);
    expect(pendingRecriada!.paid).toBe(false);
  });

  it('estornar a mesma compra duas vezes é rejeitado (não dá pra estornar infinitamente)', async () => {
    const cartao = await criarCartao({ nome: 'Cartão Estorno Duplo' });
    const catId = await categoriaId();

    const compra = await request(app.getHttpServer())
      .post('/api/transactions')
      .send({ type: 'EXPENSE', value: 200, categoryId: catId, date: '2026-09-05', carteiraId: cartao._id })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/cartoes/transacoes/${compra.body._id}/estorno`)
      .expect(201);

    // Segunda tentativa de estornar a MESMA compra original é recusada — sem esse guard,
    // cada chamada criava mais um estorno e derrubava valorTotal/Goal indefinidamente.
    await request(app.getHttpServer())
      .post(`/api/cartoes/transacoes/${compra.body._id}/estorno`)
      .expect(400);

    const estornos = await transactionModel.find({ estornoDeTransacaoId: new Types.ObjectId(compra.body._id) }).exec();
    expect(estornos).toHaveLength(1);
  });

  it('vincular-conta-pendente converte uma PendingAccount parcelada existente em Parcelamento do cartão', async () => {
    const cartao = await criarCartao({ nome: 'Cartão Migração', diaFechamento: 28, diaVencimento: 5 });

    const criada = await request(app.getHttpServer())
      .post('/api/accounts')
      .send({
        title: 'Geladeira',
        value: 500,
        dueDate: '2026-01-01',
        categoria: 'Casa',
        formatoPagamento: 'Cartão de Crédito',
        isParcelada: true,
        parcelas: { totalParcelas: 5, dataInicio: '2026-01-01', dataFim: '2026-05-01' },
      })
      .expect(201);

    const grupoParceladoId = criada.body[0].grupoParceladoId as string;
    const primeiraParcelaId = criada.body[0]._id as string;

    const res = await request(app.getHttpServer())
      .post('/api/cartoes/vincular-conta-pendente')
      .send({
        pendingAccountId: primeiraParcelaId,
        carteiraId: cartao._id,
        parcelasJaPagas: 2,
        parcelasRestantes: 3,
      })
      .expect(201);

    expect(res.body.parcelamento.totalParcelas).toBe(5);
    expect(res.body.parcelamento.valorTotal).toBe(500);

    const restantes = await request(app.getHttpServer()).get(`/api/cartoes/${cartao._id}/parcelamentos`).expect(200);
    expect(restantes.body).toHaveLength(1);
    expect(restantes.body[0].transacoes).toHaveLength(3);
    expect(restantes.body[0].transacoes[0].numeroParcela).toBe(3);
    expect(restantes.body[0].transacoes[2].numeroParcela).toBe(5);

    // O grupo antigo de contas pendentes desaparece por completo.
    await request(app.getHttpServer()).get(`/api/accounts/group/${grupoParceladoId}`).expect(200, []);
  });

  it('preview-fatura mostra em qual fatura uma compra cairia, sem criar nada', async () => {
    const cartao = await criarCartao({ nome: 'Cartão Preview', diaFechamento: 20, diaVencimento: 27 });

    // Antes do fechamento: cai no ciclo do próprio mês, fatura ainda não existe (faturaId null).
    const antes = await request(app.getHttpServer())
      .get(`/api/cartoes/${cartao._id}/preview-fatura`)
      .query({ data: '2026-09-10' })
      .expect(200);
    expect(antes.body.mesReferencia).toBe('2026-09');
    expect(antes.body.faturaId).toBeNull();

    // Depois do fechamento: cai no ciclo seguinte.
    const depois = await request(app.getHttpServer())
      .get(`/api/cartoes/${cartao._id}/preview-fatura`)
      .query({ data: '2026-09-25' })
      .expect(200);
    expect(depois.body.mesReferencia).toBe('2026-10');

    // Nenhuma fatura foi criada pela preview (é read-only).
    const detalhe = await request(app.getHttpServer()).get(`/api/cartoes/${cartao._id}`).expect(200);
    expect(detalhe.body.faturas).toHaveLength(0);

    // Depois de uma compra real, o preview passa a apontar o faturaId existente.
    const catId = await categoriaId();
    await request(app.getHttpServer())
      .post('/api/transactions')
      .send({ type: 'EXPENSE', value: 20, categoryId: catId, date: '2026-09-10', carteiraId: cartao._id })
      .expect(201);
    const antesComFatura = await request(app.getHttpServer())
      .get(`/api/cartoes/${cartao._id}/preview-fatura`)
      .query({ data: '2026-09-11' })
      .expect(200);
    expect(antesComFatura.body.faturaId).not.toBeNull();
  });

  it('GET /api/cartoes/faturas/:faturaId/cartao resolve o cartão dono da fatura', async () => {
    const cartao = await criarCartao({ nome: 'Cartão Resolver Fatura' });
    const catId = await categoriaId();

    await request(app.getHttpServer())
      .post('/api/transactions')
      .send({ type: 'EXPENSE', value: 40, categoryId: catId, date: '2026-09-05', carteiraId: cartao._id })
      .expect(201);

    const detalhe = await request(app.getHttpServer()).get(`/api/cartoes/${cartao._id}`).expect(200);
    const fatura = detalhe.body.faturas[0];

    const res = await request(app.getHttpServer()).get(`/api/cartoes/faturas/${fatura._id}/cartao`).expect(200);
    expect(res.body.cartaoId).toBe(cartao._id);

    await request(app.getHttpServer()).get(`/api/cartoes/faturas/${new Types.ObjectId().toString()}/cartao`).expect(404);
  });

  it('GET /api/cartoes/:id 404 quando o id não é um cartão de crédito', async () => {
    const carteiraComum = await request(app.getHttpServer())
      .post('/api/wallets')
      .send({ nome: 'Conta Não-Cartão' })
      .expect(201);

    await request(app.getHttpServer()).get(`/api/cartoes/${carteiraComum.body._id}`).expect(404);
  });

  it('POST /api/wallets/:id/arquivar bloqueia cartão com fatura não paga', async () => {
    const cartao = await criarCartao({ nome: 'Cartão Não Arquiva Fatura Aberta' });
    const catId = await categoriaId();

    await request(app.getHttpServer())
      .post('/api/transactions')
      .send({ type: 'EXPENSE', value: 80, categoryId: catId, date: '2026-09-05', carteiraId: cartao._id })
      .expect(201);

    await request(app.getHttpServer()).post(`/api/wallets/${cartao._id}/arquivar`).expect(400);
  });

  it('POST /api/wallets/:id/arquivar bloqueia cartão com parcelas futuras pendentes', async () => {
    const cartao = await criarCartao({ nome: 'Cartão Não Arquiva Parcelado', diaFechamento: 28, diaVencimento: 5 });
    const catId = await categoriaId();

    await request(app.getHttpServer())
      .post('/api/cartoes/parcelamentos')
      .send({
        carteiraId: cartao._id,
        categoryId: catId,
        descricao: 'Geladeira',
        valorTotal: 300,
        totalParcelas: 3,
        dataCompra: '2026-09-01',
      })
      .expect(201);

    await request(app.getHttpServer()).post(`/api/wallets/${cartao._id}/arquivar`).expect(400);
  });

  it('POST /api/wallets/:id/arquivar funciona com o cartão quitado: some de GET /api/cartoes, GET detalhe continua e bloqueia nova compra', async () => {
    const pagadora = await request(app.getHttpServer())
      .post('/api/wallets')
      .send({ nome: 'Conta Pagadora Pra Arquivar', saldo: 500 })
      .expect(201);

    const cartao = await criarCartao({ nome: 'Cartão Quitado Pra Arquivar', carteiraPagamentoId: pagadora.body._id });
    const catId = await categoriaId();

    await request(app.getHttpServer())
      .post('/api/transactions')
      .send({ type: 'EXPENSE', value: 60, categoryId: catId, date: '2026-09-05', carteiraId: cartao._id })
      .expect(201);

    const detalhe = await request(app.getHttpServer()).get(`/api/cartoes/${cartao._id}`).expect(200);
    const fatura = detalhe.body.faturas.find((f: { mesReferencia: string }) => f.mesReferencia === '2026-09');

    await request(app.getHttpServer())
      .post(`/api/cartoes/${cartao._id}/faturas/${fatura._id}/pagar`)
      .send({ valor: 60 })
      .expect(200);

    await request(app.getHttpServer()).post(`/api/wallets/${cartao._id}/arquivar`).expect(201);

    const lista = await request(app.getHttpServer()).get('/api/cartoes').expect(200);
    expect((lista.body as Array<{ _id: string }>).some((c) => c._id === cartao._id)).toBe(false);

    // Histórico continua navegável — arquivar não é excluir.
    const detalheDepois = await request(app.getHttpServer()).get(`/api/cartoes/${cartao._id}`).expect(200);
    expect(detalheDepois.body.faturas).toHaveLength(1);

    // Cartão arquivado não aceita nova compra.
    await request(app.getHttpServer())
      .post('/api/transactions')
      .send({ type: 'EXPENSE', value: 20, categoryId: catId, date: '2026-09-06', carteiraId: cartao._id })
      .expect(400);
  });
});
