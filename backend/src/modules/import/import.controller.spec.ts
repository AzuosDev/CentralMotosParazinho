import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, ExecutionContext } from '@nestjs/common';
import request from 'supertest';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ImportModule } from './import.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { WalletsModule } from '../wallets/wallets.module';
import { CategoriesModule } from '../categories/categories.module';
import { Transaction, TransactionType } from '../transactions/schemas/transaction.schema';
import { Wallet } from '../wallets/schemas/wallet.schema';
import { ImportBatch } from './schemas/import-batch.schema';
import { CartoesModule } from '../cartoes/cartoes.module';
import { Fatura } from '../cartoes/schemas/fatura.schema';

const FAKE_USER_ID = new Types.ObjectId().toString();

// OFX com transações no padrão PIX real (nome de pessoa após DD/MM HH:MM)
const PIX_OFX = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:UTF-8
CHARSET:NONE
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
  <BANKMSGSRSV1>
    <STMTTRNRS>
      <STMTRS>
        <BANKTRANLIST>
          <STMTTRN>
            <TRNTYPE>DEBIT</TRNTYPE>
            <DTPOSTED>20260610000000[-3:BRT]</DTPOSTED>
            <TRNAMT>-200.00</TRNAMT>
            <FITID>PIX-OUT-001</FITID>
            <NAME>Pix Enviado</NAME>
            <MEMO>10/06 14:30 Jose da Silva</MEMO>
          </STMTTRN>
          <STMTTRN>
            <TRNTYPE>CREDIT</TRNTYPE>
            <DTPOSTED>20260611000000[-3:BRT]</DTPOSTED>
            <TRNAMT>500.00</TRNAMT>
            <FITID>PIX-IN-001</FITID>
            <NAME>Pix Recebido</NAME>
            <MEMO>11/06 09:00 Maria Oliveira</MEMO>
          </STMTTRN>
        </BANKTRANLIST>
      </STMTRS>
    </STMTTRNRS>
  </BANKMSGSRSV1>
</OFX>`;

// Minimal valid OFX content (BB format)
const SAMPLE_OFX = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:UTF-8
CHARSET:NONE
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
  <BANKMSGSRSV1>
    <STMTTRNRS>
      <STMTRS>
        <BANKTRANLIST>
          <STMTTRN>
            <TRNTYPE>DEBIT</TRNTYPE>
            <DTPOSTED>20260601000000[-3:BRT]</DTPOSTED>
            <TRNAMT>-30.00</TRNAMT>
            <FITID>TEST-001</FITID>
            <NAME>Pix - Enviado</NAME>
            <MEMO>01/06 PADARIA CENTRAL</MEMO>
          </STMTTRN>
          <STMTTRN>
            <TRNTYPE>CREDIT</TRNTYPE>
            <DTPOSTED>20260602000000[-3:BRT]</DTPOSTED>
            <TRNAMT>1800.00</TRNAMT>
            <FITID>TEST-002</FITID>
            <NAME>Transferência recebida</NAME>
            <MEMO>02/06 SALARIO EMPRESA XYZ</MEMO>
          </STMTTRN>
          <STMTTRN>
            <TRNTYPE>DEBIT</TRNTYPE>
            <DTPOSTED>00021130000000[-3:BRT]</DTPOSTED>
            <TRNAMT>-0.14</TRNAMT>
            <FITID></FITID>
            <NAME>Saldo do dia</NAME>
            <MEMO></MEMO>
          </STMTTRN>
        </BANKTRANLIST>
      </STMTRS>
    </STMTTRNRS>
  </BANKMSGSRSV1>
</OFX>`;

// OFX 1.x SGML — sem tags de fechamento nos campos nem em <STMTTRN> (formato real de bancos BR)
const SGML_OFX = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:UTF-8
CHARSET:NONE
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<DTSTART>20260601
<DTEND>20260630
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260610000000[-3:BRT]
<TRNAMT>-75.50
<FITID>SGML-001
<NAME>Uber do Brasil
<MEMO>UBER *TRIP
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260615000000[-3:BRT]
<TRNAMT>3000.00
<FITID>SGML-002
<NAME>Empresa XYZ Ltda
<MEMO>SALARIO JUNHO
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

describe('ImportController (e2e)', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  let transactionModel: Model<Transaction>;
  let walletModel: Model<Wallet>;
  let importBatchModel: Model<ImportBatch>;
  let faturaModel: Model<Fatura>;
  let walletId: string;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        MongooseModule.forRootAsync({ useFactory: () => ({ uri: mongod.getUri() }) }),
        ImportModule,
        TransactionsModule,
        WalletsModule,
        CategoriesModule,
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
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    transactionModel = app.get<Model<Transaction>>(getModelToken(Transaction.name));
    walletModel = app.get<Model<Wallet>>(getModelToken(Wallet.name));
    importBatchModel = app.get<Model<ImportBatch>>(getModelToken(ImportBatch.name));
    faturaModel = app.get<Model<Fatura>>(getModelToken(Fatura.name));

    const wallet = await walletModel.create({
      userId: new Types.ObjectId(FAKE_USER_ID),
      nome: 'Banco do Brasil',
      saldo: 0,
    });
    walletId = wallet._id.toString();
  });

  afterAll(async () => {
    await app.close();
    await mongod.stop();
  });

  afterEach(async () => {
    await transactionModel.deleteMany({ userId: new Types.ObjectId(FAKE_USER_ID) });
    await importBatchModel.deleteMany({ userId: new Types.ObjectId(FAKE_USER_ID) });
  });

  it('preview: filtra "Saldo do dia" (data inválida) e retorna 2 candidatos', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/import/ofx/preview')
      .field('carteiraId', walletId)
      .attach('file', Buffer.from(SAMPLE_OFX), { filename: 'extrato.ofx', contentType: 'application/octet-stream' })
      .expect(201);

    const candidates: Array<{ type: string; value: number; fitId: string; description: string }> = res.body;
    expect(candidates).toHaveLength(2);
  });

  it('preview: sinal correto — TRNTYPE DEBIT → EXPENSE, CREDIT → INCOME', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/import/ofx/preview')
      .field('carteiraId', walletId)
      .attach('file', Buffer.from(SAMPLE_OFX), { filename: 'extrato.ofx', contentType: 'application/octet-stream' })
      .expect(201);

    const candidates: Array<{ type: string; value: number }> = res.body;
    const debit = candidates.find((c) => c.value === 30.00);
    const credit = candidates.find((c) => c.value === 1800.00);

    expect(debit?.type).toBe(TransactionType.EXPENSE);
    expect(credit?.type).toBe(TransactionType.INCOME);
  });

  it('preview: OFX 1.x SGML sem tags de fechamento retorna transações corretamente', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/import/ofx/preview')
      .field('carteiraId', walletId)
      .attach('file', Buffer.from(SGML_OFX), { filename: 'extrato_sgml.ofx', contentType: 'application/octet-stream' })
      .expect(201);

    const candidates: Array<{ type: string; value: number; fitId: string }> = res.body;
    expect(candidates).toHaveLength(2);
    const expense = candidates.find((c) => c.fitId === 'SGML-001');
    const income = candidates.find((c) => c.fitId === 'SGML-002');
    expect(expense?.type).toBe(TransactionType.EXPENSE);
    expect(expense?.value).toBeCloseTo(75.5);
    expect(income?.type).toBe(TransactionType.INCOME);
    expect(income?.value).toBeCloseTo(3000);
  });

  it('confirm: importa 2 transações e atualiza saldo da carteira', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/import/ofx/confirm')
      .send({
        carteiraId: walletId,
        transactions: [
          { fitId: 'TEST-001', date: '2026-06-01', value: 30.00, type: TransactionType.EXPENSE, description: 'Padaria Central' },
          { fitId: 'TEST-002', date: '2026-06-02', value: 1800.00, type: TransactionType.INCOME, description: 'Salario' },
        ],
      })
      .expect(201);

    expect(res.body).toEqual(expect.objectContaining({ imported: 2, skipped: 0 }));

    const wallet = await walletModel.findById(walletId);
    // INCOME 1800 - EXPENSE 30 = 1770
    expect(wallet!.saldo).toBe(1770);
  });

  it('confirm: reimportar o mesmo arquivo não duplica transações (dedup por fitId)', async () => {
    const payload = {
      carteiraId: walletId,
      transactions: [
        { fitId: 'DEDUP-001', date: '2026-06-01', value: 50.00, type: TransactionType.EXPENSE, description: 'Teste dedup' },
      ],
    };

    // Primeira importação
    const first = await request(app.getHttpServer())
      .post('/api/import/ofx/confirm')
      .send(payload)
      .expect(201);
    expect(first.body).toEqual(expect.objectContaining({ imported: 1, skipped: 0 }));

    // Segunda importação com mesmo fitId → deve pular
    const second = await request(app.getHttpServer())
      .post('/api/import/ofx/confirm')
      .send(payload)
      .expect(201);
    expect(second.body).toEqual(expect.objectContaining({ imported: 0, skipped: 1 }));

    // Confirma que só existe 1 transação no banco
    const count = await transactionModel.countDocuments({
      userId: new Types.ObjectId(FAKE_USER_ID),
      fitId: 'DEDUP-001',
    });
    expect(count).toBe(1);
  });

  it('preview: sugere categoria Transferências para padrão PIX DD/MM HH:MM Nome', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/import/ofx/preview')
      .field('carteiraId', walletId)
      .attach('file', Buffer.from(PIX_OFX), { filename: 'pix.ofx', contentType: 'application/octet-stream' })
      .expect(201);

    const candidates: Array<{ type: string; suggestedCategoryName: string | null }> = res.body;
    expect(candidates).toHaveLength(2);

    const sent = candidates.find((c) => c.type === 'EXPENSE');
    const received = candidates.find((c) => c.type === 'INCOME');

    expect(sent?.suggestedCategoryName).toBe('Transferências');
    expect(received?.suggestedCategoryName).toBe('Transferências Recebidas');
  });

  it('confirm: retorna batchId não-nulo quando ao menos uma transação é importada', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/import/ofx/confirm')
      .send({
        carteiraId: walletId,
        transactions: [
          { fitId: 'BATCHID-001', date: '2026-06-01', value: 50.00, type: TransactionType.EXPENSE, description: 'Batch id test' },
        ],
      })
      .expect(201);

    expect(res.body.batchId).toBeDefined();
    expect(typeof res.body.batchId).toBe('string');
    expect(res.body.batchId).not.toBeNull();
  });

  it('DELETE /batches/:batchId: remove todas as transações do lote e reverte saldo da carteira', async () => {
    // Captura saldo antes do import para comparação relativa
    const walletBefore = await walletModel.findById(walletId);
    const saldoBefore = walletBefore!.saldo;

    // Importa: EXPENSE 100 (−100 no saldo) + INCOME 300 (+300 no saldo) = +200 líquido
    const confirmRes = await request(app.getHttpServer())
      .post('/api/import/ofx/confirm')
      .send({
        carteiraId: walletId,
        transactions: [
          { fitId: 'UNDO-EXP', date: '2026-06-01', value: 100.00, type: TransactionType.EXPENSE, description: 'Desfazer despesa' },
          { fitId: 'UNDO-INC', date: '2026-06-02', value: 300.00, type: TransactionType.INCOME, description: 'Desfazer receita' },
        ],
      })
      .expect(201);

    const { batchId } = confirmRes.body as { batchId: string };
    expect(batchId).toBeDefined();

    const walletAfterImport = await walletModel.findById(walletId);
    expect(walletAfterImport!.saldo).toBe(saldoBefore + 200); // +300 INCOME - 100 EXPENSE

    // Desfaz o lote
    const deleteRes = await request(app.getHttpServer())
      .delete(`/api/import/batches/${batchId}`)
      .expect(200);

    expect(deleteRes.body).toEqual({ removed: 2 });

    // Saldo revertido ao estado anterior
    const walletAfterUndo = await walletModel.findById(walletId);
    expect(walletAfterUndo!.saldo).toBe(saldoBefore);

    // Transações deletadas do banco
    const count = await transactionModel.countDocuments({
      userId: new Types.ObjectId(FAKE_USER_ID),
      fitId: { $in: ['UNDO-EXP', 'UNDO-INC'] },
    });
    expect(count).toBe(0);

    // ImportBatch também deletado
    const batchCount = await importBatchModel.countDocuments({
      userId: new Types.ObjectId(FAKE_USER_ID),
    });
    expect(batchCount).toBe(0);
  });

  it('confirm → undo → reimportar: não deve bloquear por duplicata após desfazer lote', async () => {
    const transactions = [
      { fitId: 'REIMPORT-001', date: '2026-06-01', value: 50.00, type: TransactionType.EXPENSE, description: 'Reimport despesa' },
      { fitId: 'REIMPORT-002', date: '2026-06-02', value: 100.00, type: TransactionType.INCOME, description: 'Reimport receita' },
    ];

    // 1. Confirmar importação inicial
    const firstConfirm = await request(app.getHttpServer())
      .post('/api/import/ofx/confirm')
      .send({ carteiraId: walletId, transactions })
      .expect(201);
    const { batchId } = firstConfirm.body as { batchId: string };
    expect(batchId).toBeDefined();

    // 2. Desfazer
    const undoRes = await request(app.getHttpServer())
      .delete(`/api/import/batches/${batchId}`)
      .expect(200);
    expect(undoRes.body).toEqual({ removed: 2 });

    // 3. fitIds devem ter sido removidos do banco
    const remaining = await transactionModel.countDocuments({
      userId: new Types.ObjectId(FAKE_USER_ID),
      fitId: { $in: ['REIMPORT-001', 'REIMPORT-002'] },
    });
    expect(remaining).toBe(0);

    // 4. Reimportar — deve importar 2 (sem pular por duplicata)
    const secondConfirm = await request(app.getHttpServer())
      .post('/api/import/ofx/confirm')
      .send({ carteiraId: walletId, transactions })
      .expect(201);
    expect(secondConfirm.body).toEqual(expect.objectContaining({ imported: 2, skipped: 0 }));
  });

  it('preview: marca alreadyImported=true para fitId já existente no banco', async () => {
    // Cria transação com fitId TEST-001 no banco
    await transactionModel.create({
      userId: new Types.ObjectId(FAKE_USER_ID),
      type: TransactionType.EXPENSE,
      value: 30,
      date: new Date('2026-06-01'),
      carteiraId: new Types.ObjectId(walletId),
      fitId: 'TEST-001',
    });

    const res = await request(app.getHttpServer())
      .post('/api/import/ofx/preview')
      .field('carteiraId', walletId)
      .attach('file', Buffer.from(SAMPLE_OFX), { filename: 'extrato.ofx', contentType: 'application/octet-stream' })
      .expect(201);

    const candidates: Array<{ fitId: string; alreadyImported: boolean }> = res.body;
    const existing = candidates.find((c) => c.fitId === 'TEST-001');
    expect(existing?.alreadyImported).toBe(true);

    const other = candidates.find((c) => c.fitId === 'TEST-002');
    expect(other?.alreadyImported).toBe(false);
  });

  it('confirm: importar extrato de fatura contra um cartão de crédito cria fatura via faturaId, sem tocar em saldo', async () => {
    const cartao = await walletModel.create({
      userId: new Types.ObjectId(FAKE_USER_ID),
      nome: 'Cartão Importado',
      tipo: 'credito',
      diaFechamento: 20,
      diaVencimento: 27,
    });

    const res = await request(app.getHttpServer())
      .post('/api/import/ofx/confirm')
      .send({
        carteiraId: cartao._id.toString(),
        transactions: [
          { fitId: 'CARTAO-001', date: '2026-06-01', value: 30.0, type: TransactionType.EXPENSE, description: 'Padaria Central' },
        ],
      })
      .expect(201);

    expect(res.body).toEqual(expect.objectContaining({ imported: 1, skipped: 0 }));

    const tx = await transactionModel.findOne({ userId: new Types.ObjectId(FAKE_USER_ID), fitId: 'CARTAO-001' }).exec();
    expect(tx).not.toBeNull();
    expect(tx!.faturaId).toBeDefined();

    const fatura = await faturaModel.findById(tx!.faturaId).exec();
    expect(fatura).not.toBeNull();
    expect(fatura!.valorTotal).toBe(30);

    // Cartão não recebeu $inc de saldo (compra no crédito não mexe em saldo de carteira).
    const cartaoAposImport = await walletModel.findById(cartao._id).exec();
    expect(cartaoAposImport!.saldo).toBe(0);
  });
});
