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
import { Parcelamento } from './schemas/parcelamento.schema';
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
  let parcelamentoModel: Model<Parcelamento>;
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
    parcelamentoModel = app.get<Model<Parcelamento>>(getModelToken(Parcelamento.name));
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

  it('pagar fatura com affectsBalance:false marca como paga sem criar transferência nem exigir carteira pagadora', async () => {
    const pagadora = await request(app.getHttpServer())
      .post('/api/wallets')
      .send({ nome: 'Conta Não Afetada', saldo: 1000 })
      .expect(201);

    // Sem carteiraPagamentoId padrão no cartão — se affectsBalance:false não bastasse pra
    // dispensar a carteira pagadora, isto já falharia com 400.
    const cartao = await criarCartao({ nome: 'Cartão Retroativo Pago' });
    const catId = await categoriaId();

    await request(app.getHttpServer())
      .post('/api/transactions')
      .send({ type: 'EXPENSE', value: 150, categoryId: catId, date: '2026-09-05', carteiraId: cartao._id })
      .expect(201);

    const detalhe = await request(app.getHttpServer()).get(`/api/cartoes/${cartao._id}`).expect(200);
    const fatura = detalhe.body.faturas.find((f: { mesReferencia: string }) => f.mesReferencia === '2026-09');

    await request(app.getHttpServer())
      .post(`/api/cartoes/${cartao._id}/faturas/${fatura._id}/pagar`)
      .send({ valor: 150, affectsBalance: false })
      .expect(200);

    const faturaPaga = await faturaModel.findById(fatura._id).exec();
    expect(faturaPaga!.status).toBe('paga');
    expect(faturaPaga!.valorPago).toBe(150);

    const pending = await pendingModel.findById(fatura.pendingAccountId).exec();
    expect(pending!.paid).toBe(true);

    // Nenhuma transferência criada, saldo da carteira intacto.
    const transferencias = await transactionModel.find({ faturaId: new Types.ObjectId(fatura._id), type: 'TRANSFER' }).exec();
    expect(transferencias).toHaveLength(0);
    const saldoPagadora = (
      await request(app.getHttpServer()).get(`/api/wallets/${pagadora.body._id}`).expect(200)
    ).body.saldo;
    expect(saldoPagadora).toBe(1000);
  });

  it('excluir parcelamento remove as transações, recalcula a fatura e é bloqueado se já houve pagamento', async () => {
    const cartao = await criarCartao({ nome: 'Cartão Errado', diaFechamento: 20, diaVencimento: 27 });
    const catId = await categoriaId();

    await request(app.getHttpServer())
      .post('/api/cartoes/parcelamentos')
      .send({ carteiraId: cartao._id, categoryId: catId, descricao: 'Compra errada', valorTotal: 500, totalParcelas: 5, dataCompra: '2026-09-05' })
      .expect(201);

    const detalhe = await request(app.getHttpServer()).get(`/api/cartoes/${cartao._id}`).expect(200);
    const faturaSetembro = detalhe.body.faturas.find((f: { mesReferencia: string }) => f.mesReferencia === '2026-09');
    expect(faturaSetembro.valorTotal).toBe(100);

    const parcelamentos = await request(app.getHttpServer()).get(`/api/cartoes/${cartao._id}/parcelamentos`).expect(200);
    const parcelamentoId = parcelamentos.body[0]._id as string;

    await request(app.getHttpServer())
      .delete(`/api/cartoes/${cartao._id}/parcelamentos/${parcelamentoId}`)
      .expect(200);

    const parcelamentoRemovido = await parcelamentoModel.findById(parcelamentoId).exec();
    expect(parcelamentoRemovido).toBeNull();
    const transacoesRestantes = await transactionModel.find({ parcelamentoId: new Types.ObjectId(parcelamentoId) }).exec();
    expect(transacoesRestantes).toHaveLength(0);

    // As 5 faturas que essa compra parcelada tinha criado (set/out/nov/dez/jan) somem por
    // completo, não só zeram — sem isso, a aba Faturas ficava com meses "Aberta" vazios pra
    // sempre depois de excluir a compra que os tinha criado.
    const detalheDepois = await request(app.getHttpServer()).get(`/api/cartoes/${cartao._id}`).expect(200);
    for (const mes of ['2026-09', '2026-10', '2026-11', '2026-12', '2027-01']) {
      expect(detalheDepois.body.faturas.find((f: { mesReferencia: string }) => f.mesReferencia === mes)).toBeUndefined();
    }

    // Bloqueia excluir se a fatura já teve pagamento — cria outro parcelamento e paga a fatura.
    await request(app.getHttpServer())
      .post('/api/cartoes/parcelamentos')
      .send({ carteiraId: cartao._id, categoryId: catId, descricao: 'Compra paga', valorTotal: 200, totalParcelas: 2, dataCompra: '2026-09-05' })
      .expect(201);

    const detalhe2 = await request(app.getHttpServer()).get(`/api/cartoes/${cartao._id}`).expect(200);
    const fatura2 = detalhe2.body.faturas.find((f: { mesReferencia: string }) => f.mesReferencia === '2026-09');

    await request(app.getHttpServer())
      .post(`/api/cartoes/${cartao._id}/faturas/${fatura2._id}/pagar`)
      .send({ valor: fatura2.valorTotal, affectsBalance: false })
      .expect(200);

    const parcelamentos2 = await request(app.getHttpServer()).get(`/api/cartoes/${cartao._id}/parcelamentos`).expect(200);
    const parcelamentoPagoId = parcelamentos2.body.find((p: { descricao: string }) => p.descricao === 'Compra paga')._id;

    await request(app.getHttpServer())
      .delete(`/api/cartoes/${cartao._id}/parcelamentos/${parcelamentoPagoId}`)
      .expect(400);

    // Desfazer o pagamento da fatura é o único jeito de sair desse estado — depois disso a
    // exclusão passa a funcionar normalmente.
    await request(app.getHttpServer())
      .post(`/api/cartoes/${cartao._id}/faturas/${fatura2._id}/desfazer-pagamento`)
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/cartoes/${cartao._id}/parcelamentos/${parcelamentoPagoId}`)
      .expect(200);

    const parcelamentoPagoRemovido = await parcelamentoModel.findById(parcelamentoPagoId).exec();
    expect(parcelamentoPagoRemovido).toBeNull();
  });

  it('desfazer pagamento remove a transferência criada, restaura o saldo da carteira pagadora e reabre a pendência', async () => {
    const pagadora = await request(app.getHttpServer())
      .post('/api/wallets')
      .send({ nome: 'Conta Pagadora Desfazer', saldo: 1000 })
      .expect(201);

    const cartao = await criarCartao({ nome: 'Cartão Desfazer Pagamento', carteiraPagamentoId: pagadora.body._id });
    const catId = await categoriaId();

    await request(app.getHttpServer())
      .post('/api/transactions')
      .send({ type: 'EXPENSE', value: 150, categoryId: catId, date: '2026-09-05', carteiraId: cartao._id })
      .expect(201);

    const detalhe = await request(app.getHttpServer()).get(`/api/cartoes/${cartao._id}`).expect(200);
    const fatura = detalhe.body.faturas.find((f: { mesReferencia: string }) => f.mesReferencia === '2026-09');

    await request(app.getHttpServer())
      .post(`/api/cartoes/${cartao._id}/faturas/${fatura._id}/pagar`)
      .send({ valor: 150 })
      .expect(200);

    const saldoAposPagar = (await request(app.getHttpServer()).get(`/api/wallets/${pagadora.body._id}`).expect(200)).body.saldo;
    expect(saldoAposPagar).toBe(850);

    // Uma fatura sem pagamento nenhum não pode ser "desfeita".
    const outraFatura = await request(app.getHttpServer())
      .post('/api/cartoes/parcelamentos')
      .send({ carteiraId: cartao._id, categoryId: catId, descricao: 'Outra', valorTotal: 20, totalParcelas: 2, dataCompra: '2026-10-05' })
      .expect(201);
    const faturaOutubroId = (outraFatura.body.transacoes as Array<{ faturaId: string }>)[0].faturaId;
    await request(app.getHttpServer())
      .post(`/api/cartoes/${cartao._id}/faturas/${faturaOutubroId}/desfazer-pagamento`)
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/cartoes/${cartao._id}/faturas/${fatura._id}/desfazer-pagamento`)
      .expect(200);

    const faturaDesfeita = await faturaModel.findById(fatura._id).exec();
    expect(faturaDesfeita!.valorPago).toBe(0);
    expect(faturaDesfeita!.status).not.toBe('paga');

    const pendingDesfeito = await pendingModel.findById(fatura.pendingAccountId).exec();
    expect(pendingDesfeito!.paid).toBe(false);

    const transferencias = await transactionModel.find({ faturaId: new Types.ObjectId(fatura._id), type: 'TRANSFER' }).exec();
    expect(transferencias).toHaveLength(0);

    const saldoRestaurado = (await request(app.getHttpServer()).get(`/api/wallets/${pagadora.body._id}`).expect(200)).body.saldo;
    expect(saldoRestaurado).toBe(1000);
  });

  it('compra nova numa fatura já paga tira a conta de "paga" e ela volta a aparecer em Contas a Pagar', async () => {
    const cartao = await criarCartao({ nome: 'Cartão Recarga Pós-Pago' });
    const catId = await categoriaId();

    await request(app.getHttpServer())
      .post('/api/transactions')
      .send({ type: 'EXPENSE', value: 100, categoryId: catId, date: '2026-09-05', carteiraId: cartao._id })
      .expect(201);

    const detalhe1 = await request(app.getHttpServer()).get(`/api/cartoes/${cartao._id}`).expect(200);
    const fatura = detalhe1.body.faturas.find((f: { mesReferencia: string }) => f.mesReferencia === '2026-09');

    await request(app.getHttpServer())
      .post(`/api/cartoes/${cartao._id}/faturas/${fatura._id}/pagar`)
      .send({ valor: 100, affectsBalance: false })
      .expect(200);

    const faturaPaga = await faturaModel.findById(fatura._id).exec();
    expect(faturaPaga!.status).toBe('paga');
    const pendingPago = await pendingModel.findById(fatura.pendingAccountId).exec();
    expect(pendingPago!.paid).toBe(true);

    // Compra nova no MESMO ciclo, depois da fatura já ter sido dada como paga — o valor
    // devido volta a ser positivo (100 pago, 20 novo = 20 em aberto).
    await request(app.getHttpServer())
      .post('/api/transactions')
      .send({ type: 'EXPENSE', value: 20, categoryId: catId, date: '2026-08-23', carteiraId: cartao._id })
      .expect(201);

    const faturaDepois = await faturaModel.findById(fatura._id).exec();
    expect(faturaDepois!.valorTotal).toBe(120);
    expect(faturaDepois!.valorPago).toBe(100);
    expect(faturaDepois!.status).toBe('parcial');

    const pendingDepois = await pendingModel.findById(fatura.pendingAccountId).exec();
    expect(pendingDepois!.paid).toBe(false);
    // pending.value é sempre o total devido da fatura (valorTotal + saldoRotativoAnterior),
    // não o "restante" líquido de valorPago — mesma convenção de quando a conta é criada.
    expect(pendingDepois!.value).toBe(120);

    // É exatamente essa PendingAccount que precisa reaparecer em Contas a Pagar filtrado
    // por não pagas — antes desta correção ela continuava paid:true e sumia da lista.
    const contas = await request(app.getHttpServer())
      .get('/api/accounts')
      .query({ tipo: 'PAGAR', paid: 'false' })
      .expect(200);
    expect((contas.body as Array<{ _id: string }>).some((c) => c._id === fatura.pendingAccountId)).toBe(true);
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
    // Fatura ficou totalmente vazia (valorTotal 0, nunca paga, sem rotativo/juros) — some por
    // completo em vez de continuar exposta como uma fatura "Aberta" fantasma sem nenhuma
    // transação. A PendingAccount some junto, em vez de mostrar um R$0,01 fictício (o schema
    // nem aceita value <= 0, min: 0.01).
    expect(fatura).toBeUndefined();
    const pendingDepois = await pendingModel.findById(faturaAntes.pendingAccountId).exec();
    expect(pendingDepois).toBeNull();
    expect(await faturaModel.findById(faturaAntes._id).exec()).toBeNull();

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

  it('vincular-conta-pendente de uma conta avulsa antiga cai na fatura do mês original, não na de hoje', async () => {
    // Conta pendente comum (não parcelada) registrada meses atrás, só agora vinculada ao
    // cartão — regressão do bug em que toda parcela vinculada virava "hoje", perdendo a
    // data de quando a compra de fato aconteceu.
    const cartao = await criarCartao({ nome: 'Cartão Retroativo', diaFechamento: 28, diaVencimento: 5 });

    const criada = await request(app.getHttpServer())
      .post('/api/accounts')
      .send({ title: 'Farmácia de março', value: 120, dueDate: '2026-03-10', categoria: 'Saúde' })
      .expect(201);

    const pendingId = Array.isArray(criada.body) ? criada.body[0]._id : criada.body._id;
    await request(app.getHttpServer())
      .post('/api/cartoes/vincular-conta-pendente')
      .send({
        pendingAccountId: pendingId,
        carteiraId: cartao._id,
        parcelasJaPagas: 0,
        parcelasRestantes: 1,
      })
      .expect(201);

    const detalhe = await request(app.getHttpServer()).get(`/api/cartoes/${cartao._id}`).expect(200);
    const faturaMarco = detalhe.body.faturas.find((f: { mesReferencia: string }) => f.mesReferencia === '2026-03');
    const faturaHoje = detalhe.body.faturas.find((f: { mesReferencia: string }) => f.mesReferencia !== '2026-03');
    expect(faturaMarco).toBeDefined();
    expect(faturaMarco.valorTotal).toBe(120);
    expect(faturaHoje).toBeUndefined();
  });

  it('vincular-conta-pendente parcelada não desloca a parcela pro mês seguinte quando o vencimento cai depois do fechamento', async () => {
    // dataInicio de uma conta pendente é sempre uma data de VENCIMENTO (quando a parcela 1
    // vence), nunca uma data de compra — mas se essa data cair depois do dia de fechamento
    // do cartão, tratá-la como "data de compra" (regra normal de resolverFaturaParaCompra)
    // empurrava a parcela pra fatura do mês seguinte por engano, um mês a mais do que o
    // vencimento real já indicava.
    const cartao = await criarCartao({ nome: 'Cartão Vencimento Após Fechamento', diaFechamento: 3, diaVencimento: 16 });
    const catId = await categoriaId();

    // Parcela 1 vence 10/05 (dia 10, depois do fechamento dia 3) — 4 parcelas (1-4) já
    // pagas fora do app, restam 6 (5-10). Parcela 5 vence 10/09.
    const criada = await request(app.getHttpServer())
      .post('/api/accounts')
      .send({
        title: 'Samsung a56',
        value: 2331,
        dueDate: '2026-05-10',
        categoryId: catId,
        isParcelada: true,
        parcelas: { totalParcelas: 10, dataInicio: '2026-05-10' },
      })
      .expect(201);

    const primeiraParcelaId = criada.body[0]._id as string;

    await request(app.getHttpServer())
      .post('/api/cartoes/vincular-conta-pendente')
      .send({
        pendingAccountId: primeiraParcelaId,
        carteiraId: cartao._id,
        parcelasJaPagas: 4,
        parcelasRestantes: 6,
      })
      .expect(201);

    const detalhe = await request(app.getHttpServer()).get(`/api/cartoes/${cartao._id}`).expect(200);
    const faturaSetembro = detalhe.body.faturas.find((f: { mesReferencia: string }) => f.mesReferencia === '2026-09');
    const faturaOutubro = detalhe.body.faturas.find((f: { mesReferencia: string }) => f.mesReferencia === '2026-10');
    expect(faturaSetembro).toBeDefined();
    expect(faturaOutubro).toBeDefined();

    const parcelamentos = await request(app.getHttpServer()).get(`/api/cartoes/${cartao._id}/parcelamentos`).expect(200);
    const transacoes = parcelamentos.body[0].transacoes as Array<{ numeroParcela: number; date: string }>;
    const parcela5 = transacoes.find((t) => t.numeroParcela === 5)!;
    const parcela6 = transacoes.find((t) => t.numeroParcela === 6)!;

    // Parcela 5 (vence 10/09) cai na fatura de setembro, não outubro.
    const faturaSetembroTxs = await transactionModel.find({ faturaId: new Types.ObjectId(faturaSetembro._id) }).exec();
    expect(faturaSetembroTxs.some((t) => t.numeroParcela === 5)).toBe(true);
    const faturaOutubroTxs = await transactionModel.find({ faturaId: new Types.ObjectId(faturaOutubro._id) }).exec();
    expect(faturaOutubroTxs.some((t) => t.numeroParcela === 6)).toBe(true);
    expect(parcela5.date.slice(0, 10)).toBe('2026-09-10');
    expect(parcela6.date.slice(0, 10)).toBe('2026-10-10');
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

  it('vincular-recorrente cobra na hora se o vencimento deste mês já passou (não espera o cron)', async () => {
    // Sem cobrança imediata, o usuário só veria a assinatura entrar na fatura no dia
    // seguinte via cron — e só se CRON_NOTIFICATIONS estivesse ligado, o que nem está no
    // ambiente local. Vinculando depois que o vencimento do mês já passou, a cobrança tem
    // que acontecer no mesmo request de vincular.
    const cartao = await criarCartao({ nome: 'Cartão Vínculo Imediato', diaFechamento: 20, diaVencimento: 27 });
    const catId = await categoriaId();

    const criada = await request(app.getHttpServer())
      .post('/api/accounts')
      .send({
        title: 'Disney+',
        value: 33,
        dueDate: '2026-08-10',
        categoryId: catId,
        isRecorrente: true,
        // dataTermino em setembro pra não ser varrida pelo cron de outubro do teste
        // seguinte — os testes deste arquivo compartilham o mesmo banco (sem limpeza
        // entre `it()`s), e cobrarRecorrentesVinculados varre TODOS os moldes vinculados.
        recorrencia: { periodoRecorrencia: 'Mensal', dataTermino: '2026-09-30' },
      })
      .expect(201);
    const templateId = criada.body._id as string;

    await cartoesService.vincularRecorrente(
      FAKE_USER_ID,
      { templateId, carteiraId: cartao._id },
      new Date('2026-09-10T12:00:00Z'),
    );

    const detalhe = await request(app.getHttpServer()).get(`/api/cartoes/${cartao._id}`).expect(200);
    const faturaSetembro = detalhe.body.faturas.find((f: { mesReferencia: string }) => f.mesReferencia === '2026-09');
    expect(faturaSetembro).toBeDefined();
    expect(faturaSetembro.valorTotal).toBe(33);

    const instanciaSetembro = await pendingModel.findOne({ recorrenciaTemplateId: templateId }).exec();
    expect(instanciaSetembro).not.toBeNull();
    expect(instanciaSetembro!.paid).toBe(true);

    // O cron rodando no mesmo mês depois não duplica a cobrança já feita no vincular.
    const cobrados = await cartoesService.cobrarRecorrentesVinculados(new Date('2026-09-15T12:00:00Z'));
    expect(cobrados).toBe(0);
    const instancias = await pendingModel.find({ recorrenciaTemplateId: templateId }).exec();
    expect(instancias).toHaveLength(1);
  });

  it('vincular-recorrente + cron cobra a assinatura automaticamente todo mês, sem duplicar', async () => {
    const cartao = await criarCartao({ nome: 'Cartão Assinatura', diaFechamento: 20, diaVencimento: 27 });
    const catId = await categoriaId();

    const criada = await request(app.getHttpServer())
      .post('/api/accounts')
      .send({
        title: 'Netflix',
        value: 50,
        dueDate: '2026-08-10',
        categoryId: catId,
        isRecorrente: true,
        recorrencia: { periodoRecorrencia: 'Mensal' },
      })
      .expect(201);
    const templateId = criada.body._id as string;

    await request(app.getHttpServer())
      .post('/api/cartoes/vincular-recorrente')
      .send({ templateId, carteiraId: cartao._id })
      .expect(201);

    // Simula o cron rodando em setembro: dia 10 já passou o vencimento projetado do mês,
    // dentro do ciclo de fechamento dia 20 → cai na fatura de setembro.
    const cobradosSetembro = await cartoesService.cobrarRecorrentesVinculados(new Date('2026-09-10T12:00:00Z'));
    expect(cobradosSetembro).toBe(1);

    const detalhe = await request(app.getHttpServer()).get(`/api/cartoes/${cartao._id}`).expect(200);
    const faturaSetembro = detalhe.body.faturas.find((f: { mesReferencia: string }) => f.mesReferencia === '2026-09');
    expect(faturaSetembro).toBeDefined();
    expect(faturaSetembro.valorTotal).toBe(50);

    const instanciaSetembro = await pendingModel.findOne({ recorrenciaTemplateId: templateId }).exec();
    expect(instanciaSetembro).not.toBeNull();
    expect(instanciaSetembro!.paid).toBe(true);
    expect(instanciaSetembro!.faturaId?.toString()).toBe(faturaSetembro._id);

    // Rodar de novo no mesmo mês não duplica a cobrança.
    const cobradosDeNovo = await cartoesService.cobrarRecorrentesVinculados(new Date('2026-09-15T12:00:00Z'));
    expect(cobradosDeNovo).toBe(0);
    const instancias = await pendingModel.find({ recorrenciaTemplateId: templateId }).exec();
    expect(instancias).toHaveLength(1);
    const transacoesNetflix = await transactionModel.find({ faturaId: new Types.ObjectId(faturaSetembro._id) }).exec();
    expect(transacoesNetflix).toHaveLength(1);

    // Mês seguinte: nova cobrança, fatura diferente.
    const cobradosOutubro = await cartoesService.cobrarRecorrentesVinculados(new Date('2026-10-11T12:00:00Z'));
    expect(cobradosOutubro).toBe(1);
    const detalhe2 = await request(app.getHttpServer()).get(`/api/cartoes/${cartao._id}`).expect(200);
    const faturaOutubro = detalhe2.body.faturas.find((f: { mesReferencia: string }) => f.mesReferencia === '2026-10');
    expect(faturaOutubro.valorTotal).toBe(50);
  });

  it('pay-month de uma conta recorrente com carteiraId de cartão cai na fatura, não vira Transaction solta', async () => {
    const cartao = await criarCartao({ nome: 'Cartão Pagar Recorrente', diaFechamento: 20, diaVencimento: 27 });
    const catId = await categoriaId();

    const criada = await request(app.getHttpServer())
      .post('/api/accounts')
      .send({
        title: 'Spotify',
        value: 25,
        dueDate: '2026-09-05',
        categoryId: catId,
        isRecorrente: true,
        recorrencia: { periodoRecorrencia: 'Mensal' },
      })
      .expect(201);
    const templateId = criada.body._id as string;

    const pago = await request(app.getHttpServer())
      .post(`/api/accounts/${templateId}/pay-month`)
      .send({ month: 9, year: 2026, carteiraId: cartao._id })
      .expect(200);
    expect(pago.body.faturaId).toBeDefined();
    expect(pago.body.paid).toBe(true);

    // Não criou uma Transaction solta com pendingAccountId — foi pra fatura, igual
    // qualquer outra compra no cartão.
    const transacaoSolta = await transactionModel.findOne({ pendingAccountId: pago.body._id }).exec();
    expect(transacaoSolta).toBeNull();

    const detalhe = await request(app.getHttpServer()).get(`/api/cartoes/${cartao._id}`).expect(200);
    const fatura = detalhe.body.faturas.find((f: { mesReferencia: string }) => f.mesReferencia === '2026-09');
    expect(fatura.valorTotal).toBe(25);
  });

  it('PATCH marca uma conta avulsa como paga com carteiraId de cartão e ela cai na fatura', async () => {
    const cartao = await criarCartao({ nome: 'Cartão Conta Avulsa', diaFechamento: 20, diaVencimento: 27 });
    const catId = await categoriaId();

    const criada = await request(app.getHttpServer())
      .post('/api/accounts')
      .send({ title: 'Farmácia', value: 80, dueDate: '2026-09-08', categoryId: catId })
      .expect(201);
    const pendingId = criada.body._id as string;

    const paga = await request(app.getHttpServer())
      .patch(`/api/accounts/${pendingId}`)
      .send({ paid: true, carteiraId: cartao._id })
      .expect(200);
    expect(paga.body.faturaId).toBeDefined();

    const transacaoSolta = await transactionModel.findOne({ pendingAccountId: pendingId }).exec();
    expect(transacaoSolta).toBeNull();

    const detalhe = await request(app.getHttpServer()).get(`/api/cartoes/${cartao._id}`).expect(200);
    const fatura = detalhe.body.faturas.find((f: { mesReferencia: string }) => f.mesReferencia === '2026-09');
    expect(fatura.valorTotal).toBe(80);
  });
});
