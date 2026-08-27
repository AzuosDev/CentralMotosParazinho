/**
 * Migração: corrige Transactions antigas sem categoryId geradas pelo bug em
 * createSettlementTransaction (categoria da Conta não era herdada).
 *
 * Usa a conexão Mongoose da própria aplicação — funciona da mesma forma que o backend.
 *
 * Uso:
 *   npx ts-node scripts/migrate-category.ts              → dry-run (só lista)
 *   npx ts-node scripts/migrate-category.ts --apply      → aplica correções
 */

import 'dotenv/config';
import * as dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']); // DNS público — contorna bloqueio de SRV no DNS local
import mongoose, { Model, Types } from 'mongoose';

const DRY_RUN = !process.argv.includes('--apply');

// Schemas (mínimo necessário para a migração)

const TransactionSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  type: String,
  value: Number,
  categoryId: mongoose.Schema.Types.ObjectId,
  carteiraId: mongoose.Schema.Types.ObjectId,
  description: String,
  date: Date,
  pendingAccountId: mongoose.Schema.Types.ObjectId,
}, { collection: 'transactions' });

const PendingAccountSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  title: String,
  value: Number,
  dueDate: Date,
  paid: Boolean,
  categoria: String,
  categoryId: mongoose.Schema.Types.ObjectId,
  tipo: String,
}, { collection: 'pendingaccounts' });

const CategorySchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  name: String,
  isIncome: Boolean,
}, { collection: 'categories' });

// Lógica de resolução (espelho de pending.service.ts)

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Transporte': [
    'moto', 'carro', 'bike', 'bicicleta', 'ônibus', 'onibus', 'taxi', 'táxi',
    'uber', '99', 'cabify', 'combustível', 'combustivel', 'gasolina', 'etanol',
    'diesel', 'pedágio', 'pedagio', 'estacionamento', 'bros', 'fan', 'cg',
    'honda', 'yamaha', 'kawasaki', 'suzuki', 'ducati', 'bmw', 'ford', 'gol',
    'civic', 'corolla', 'fiat', 'volkswagen', 'chevrolet', 'hyundai', 'renault',
    'metrô', 'metro', 'trem', 'viação', 'viacão', 'transporte', 'veículo',
  ],
  'Alimentação': [
    'restaurante', 'lanche', 'mercado', 'supermercado', 'pizza', 'hamburguer',
    'hambúrguer', 'açaí', 'acai', 'refeição', 'refeicao', 'almoço', 'almoco',
    'jantar', 'café', 'cafe', 'padaria', 'ifood', 'rappi', 'delivery', 'comida',
    'feira', 'hortifruti', 'churrasco', 'sushi', 'lanchonete', 'mcdonald',
    'burger king', 'subway', 'habib', 'japonês', 'japonesa', 'bar',
  ],
  'Saúde': [
    'médico', 'medico', 'farmácia', 'farmacia', 'remédio', 'remedio', 'consulta',
    'dentista', 'hospital', 'plano', 'unimed', 'amil', 'bradesco saude', 'academia',
    'clínica', 'clinica', 'exame', 'laboratorio', 'laboratório', 'cirurgia',
    'fisioterapia', 'psicólogo', 'psicologo', 'psiquiatra', 'terapia', 'saúde',
    'saude', 'vacina', 'drogaria', 'drogasil', 'ultrafarma',
  ],
  'Educação': [
    'escola', 'faculdade', 'curso', 'livro', 'material', 'mensalidade',
    'universidade', 'colégio', 'colegio', 'aula', 'apostila', 'udemy', 'alura',
    'estudo', 'educação', 'educacao', 'senai', 'senac', 'idioma', 'inglês', 'ingles',
    'espanhol', 'vestibular', 'concurso', 'pós', 'pos', 'mba', 'graduação',
  ],
  'Lazer': [
    'cinema', 'show', 'festa', 'viagem', 'hotel', 'streaming', 'netflix', 'spotify',
    'amazon prime', 'disney', 'hbo', 'jogo', 'game', 'esporte', 'teatro', 'museu',
    'parque', 'steam', 'playstation', 'xbox', 'nintendo', 'ingresso', 'balada',
    'clube', 'piscina', 'praia', 'hospedagem', 'airbnb', 'booking',
  ],
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveByKeyword(text: string): string | null {
  const lower = text.toLowerCase().trim();
  for (const [cat, kws] of Object.entries(CATEGORY_KEYWORDS)) {
    if (kws.some((kw) => lower.includes(kw) || kw.includes(lower))) return cat;
  }
  return null;
}

async function findCategory(
  Category: Model<any>,
  categoriaText: string,
  isReceber: boolean,
  userId: Types.ObjectId,
) {
  if (!categoriaText || categoriaText.toLowerCase() === 'outro') return null;

  // 1. Busca exata
  let cat = await Category.findOne({
    name: { $regex: new RegExp(`^${escapeRegex(categoriaText)}$`, 'i') },
    isIncome: isReceber,
    $or: [{ userId: null }, { userId: userId }],
  }).lean();

  if (cat) return cat;

  // 2. Fallback por palavras-chave (só PAGAR)
  if (!isReceber) {
    const mapped = resolveByKeyword(categoriaText);
    if (mapped) {
      cat = await Category.findOne({
        name: { $regex: new RegExp(`^${escapeRegex(mapped)}$`, 'i') },
        isIncome: false,
        $or: [{ userId: null }, { userId: userId }],
      }).lean();
      if (cat) return cat;
    }
  }

  return null;
}

function sep(char = '─', len = 70) { return char.repeat(len); }

// Main

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI não encontrado no .env');

  await mongoose.connect(uri);
  console.log('✔ Conectado ao MongoDB\n');

  const Transaction = mongoose.model('MigTx', TransactionSchema);
  const PendingAccount = mongoose.model('MigPending', PendingAccountSchema);
  const Category = mongoose.model('MigCategory', CategorySchema);

  console.log(sep('═'));
  console.log(DRY_RUN
    ? '  MODO DRY-RUN  (passe --apply para aplicar)'
    : '  MODO APPLY  — alterações serão gravadas');
  console.log(sep('═') + '\n');

  const affected = await Transaction.find({
    pendingAccountId: { $exists: true, $ne: null },
    $or: [{ categoryId: null }, { categoryId: { $exists: false } }],
  }).lean();

  console.log(`Transactions com pendingAccountId e sem categoryId: ${affected.length}\n`);

  if (affected.length === 0) {
    console.log('✔ Nenhuma transação para corrigir.');
    await mongoose.disconnect();
    return;
  }

  const wouldFix: any[] = [];
  const noResolution: any[] = [];
  const pendingNotFound: any[] = [];
  const noCategoriaOnPending: any[] = [];

  for (const tx of affected) {
    const pending = await PendingAccount.findOne({ _id: tx.pendingAccountId }).lean();

    if (!pending) { pendingNotFound.push(tx); continue; }

    if (!pending.categoria || pending.categoria.toLowerCase() === 'outro') {
      noCategoriaOnPending.push({ tx, pending }); continue;
    }

    const isReceber = pending.tipo === 'RECEBER';
    const cat = await findCategory(Category, pending.categoria, isReceber, pending.userId as Types.ObjectId);

    if (!cat) { noResolution.push({ tx, pending }); continue; }

    wouldFix.push({ tx, pending, cat });
  }

  // Relatório

  console.log(sep());
  console.log(`  SERÃO CORRIGIDAS: ${wouldFix.length} transaction(s)`);
  console.log(sep());
  for (const { tx, pending, cat } of wouldFix) {
    console.log(`  TX  : ${tx._id}`);
    console.log(`    Descrição : ${tx.description || '(sem descrição)'}`);
    console.log(`    Conta     : ${pending.title}  (categoria: "${pending.categoria}")`);
    console.log(`    Fix       : categoryId null → ${cat._id}  (${cat.name})`);
    if (!pending.categoryId) console.log(`    Pending também será atualizado (sem categoryId)`);
    console.log('');
  }

  if (noResolution.length) {
    console.log(sep());
    console.log(`  SEM RESOLUÇÃO: ${noResolution.length}  (categoria não encontrada no banco)`);
    console.log(sep());
    for (const { tx, pending } of noResolution) {
      console.log(`  TX  : ${tx._id}`);
      console.log(`    Conta : "${pending.title}"   categoria: "${pending.categoria}"   userId: ${pending.userId}`);
      console.log('');
    }
  }

  if (pendingNotFound.length) {
    console.log(sep());
    console.log(`  PENDINGACCOUNT NÃO ENCONTRADO: ${pendingNotFound.length}`);
    console.log(sep());
    for (const tx of pendingNotFound) {
      console.log(`  TX  : ${tx._id}   pendingAccountId: ${tx.pendingAccountId}`);
    }
    console.log('');
  }

  if (noCategoriaOnPending.length) {
    console.log(sep());
    console.log(`  CONTA SEM CAMPO CATEGORIA: ${noCategoriaOnPending.length}  — ignoradas`);
    console.log(sep());
    for (const { tx, pending } of noCategoriaOnPending) {
      console.log(`  TX  : ${tx._id}   conta: "${pending.title}"   categoria: "${pending.categoria || '(vazio)'}"`);
    }
    console.log('');
  }

  console.log(sep('═'));
  console.log('  RESUMO FINAL');
  console.log(sep('═'));
  console.log(`  Serão corrigidas        : ${wouldFix.length}`);
  console.log(`  Sem resolução           : ${noResolution.length}`);
  console.log(`  PendingAccount ausente  : ${pendingNotFound.length}`);
  console.log(`  Conta sem categoria     : ${noCategoriaOnPending.length}`);
  console.log('');

  // Aplicação

  if (DRY_RUN) {
    console.log('⚠  Dry-run concluído. Rode com --apply para aplicar.\n');
  } else {
    console.log('Aplicando correções...\n');
    let txFixed = 0;
    let pendingFixed = 0;

    for (const { tx, pending, cat } of wouldFix) {
      console.log(`[BEFORE] TX ${tx._id}: categoryId=${tx.categoryId ?? 'null'}`);
      await Transaction.updateOne({ _id: tx._id }, { $set: { categoryId: cat._id } });
      txFixed++;
      console.log(`[AFTER ] TX ${tx._id}: categoryId=${cat._id}  (${cat.name})`);

      if (!pending.categoryId) {
        console.log(`[BEFORE] Pending ${pending._id}: categoryId=${pending.categoryId ?? 'null'}`);
        await PendingAccount.updateOne({ _id: pending._id }, { $set: { categoryId: cat._id } });
        pendingFixed++;
        console.log(`[AFTER ] Pending ${pending._id}: categoryId=${cat._id}  (${cat.name})`);
      }
      console.log('');
    }

    console.log(sep('═'));
    console.log(`  Transactions corrigidas     : ${txFixed}`);
    console.log(`  PendingAccounts atualizados : ${pendingFixed}`);
    console.log(`  Sem resolução (intocados)   : ${noResolution.length}`);
    console.log('');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
