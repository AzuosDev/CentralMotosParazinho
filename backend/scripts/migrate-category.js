#!/usr/bin/env node
/**
 * Migração: corrige Transactions antigas sem categoryId que foram geradas
 * pelo bug em createSettlementTransaction (categoria da Conta não era herdada).
 *
 * Uso:
 *   node scripts/migrate-category.js              → dry-run (apenas lista)
 *   node scripts/migrate-category.js --apply      → aplica as correções
 *
 * Variáveis de ambiente:
 *   MONGO_URI  → sobrescreve a URI padrão do .env
 */

const { MongoClient, ObjectId } = require('mongodb');

// Configuração

const MONGO_URI =
  process.env.MONGO_URI ||
  'mongodb+srv://ContaCerta:Z0NOyIXsfOAwqP2v@cluster0.sv2qh74.mongodb.net/ContaCerta?appName=Cluster0';

const DB_NAME = 'ContaCerta';
const DRY_RUN = !process.argv.includes('--apply');

// Lógica de resolução de categoria (espelho fiel de pending.service.ts)

const CATEGORY_KEYWORDS = {
  Transporte: [
    'moto', 'carro', 'bike', 'bicicleta', 'ônibus', 'onibus', 'taxi', 'táxi',
    'uber', '99', 'cabify', 'combustível', 'combustivel', 'gasolina', 'etanol',
    'diesel', 'pedágio', 'pedagio', 'estacionamento', 'bros', 'fan', 'cg',
    'honda', 'yamaha', 'kawasaki', 'suzuki', 'ducati', 'bmw', 'ford', 'gol',
    'civic', 'corolla', 'fiat', 'volkswagen', 'chevrolet', 'hyundai', 'renault',
    'metrô', 'metro', 'trem', 'ônibus', 'viação', 'viacão', 'transporte', 'veículo',
  ],
  Alimentação: [
    'restaurante', 'lanche', 'mercado', 'supermercado', 'pizza', 'hamburguer',
    'hambúrguer', 'açaí', 'acai', 'refeição', 'refeicao', 'almoço', 'almoco',
    'jantar', 'café', 'cafe', 'padaria', 'ifood', 'rappi', 'delivery', 'comida',
    'feira', 'hortifruti', 'churrasco', 'sushi', 'lanchonete', 'mcdonald',
    'burger king', 'subway', 'habib', 'china', 'japonês', 'japonesa', 'bar',
  ],
  Saúde: [
    'médico', 'medico', 'farmácia', 'farmacia', 'remédio', 'remedio', 'consulta',
    'dentista', 'hospital', 'plano', 'unimed', 'amil', 'bradesco saude', 'academia',
    'clínica', 'clinica', 'exame', 'laboratorio', 'laboratório', 'cirurgia',
    'fisioterapia', 'psicólogo', 'psicologo', 'psiquiatra', 'terapia', 'saúde',
    'saude', 'vacina', 'drogaria', 'drogasil', 'ultrafarma',
  ],
  Educação: [
    'escola', 'faculdade', 'curso', 'livro', 'material', 'mensalidade',
    'universidade', 'colégio', 'colegio', 'aula', 'apostila', 'udemy', 'alura',
    'estudo', 'educação', 'educacao', 'senai', 'senac', 'idioma', 'inglês', 'ingles',
    'espanhol', 'vestibular', 'concurso', 'pós', 'pos', 'mba', 'graduação',
  ],
  Lazer: [
    'cinema', 'show', 'festa', 'viagem', 'hotel', 'streaming', 'netflix', 'spotify',
    'amazon prime', 'disney', 'hbo', 'jogo', 'game', 'esporte', 'teatro', 'museu',
    'parque', 'steam', 'playstation', 'xbox', 'nintendo', 'ingresso', 'balada',
    'clube', 'piscina', 'praia', 'viagem', 'hospedagem', 'airbnb', 'booking',
  ],
};

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveByKeyword(categoriaText) {
  const lower = categoriaText.toLowerCase().trim();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw) || kw.includes(lower))) {
      return category;
    }
  }
  return null;
}

/**
 * Resolve a categoria de uma conta pelo nome textual.
 * Retorna o documento Category do banco ou null se não encontrado.
 */
async function resolveCategory(db, categoriaText, isReceber, userId) {
  if (!categoriaText || categoriaText.toLowerCase() === 'outro') return null;

  const categories = db.collection('categories');
  const userOid = new ObjectId(userId);

  // 1. Busca exata (case-insensitive, nome escapado)
  let category = await categories.findOne({
    name: { $regex: new RegExp(`^${escapeRegex(categoriaText)}$`, 'i') },
    isIncome: isReceber,
    $or: [{ userId: null }, { userId: userOid }],
  });

  if (category) return category;

  // 2. Só para PAGAR: tenta mapeamento por palavras-chave
  if (!isReceber) {
    const mapped = resolveByKeyword(categoriaText);
    if (mapped) {
      category = await categories.findOne({
        name: { $regex: new RegExp(`^${escapeRegex(mapped)}$`, 'i') },
        isIncome: false,
        $or: [{ userId: null }, { userId: userOid }],
      });
      if (category) return category;
    }
  }

  return null;
}

// Relatório de log

function separator(char = '─', len = 70) {
  return char.repeat(len);
}

function fmt(date) {
  return date ? new Date(date).toLocaleDateString('pt-BR') : 'N/A';
}

// Main

async function main() {
  console.log(separator('═'));
  console.log(DRY_RUN
    ? '  MODO DRY-RUN  (passe --apply para aplicar as alterações)'
    : '  MODO APPLY  — alterações serão gravadas no banco');
  console.log(separator('═'));
  console.log();

  const client = new MongoClient(MONGO_URI);
  await client.connect();
  console.log('✔ Conectado ao MongoDB\n');

  const db = client.db(DB_NAME);
  const transactions = db.collection('transactions');
  const pendingAccounts = db.collection('pendingaccounts');

  // Busca todas as Transactions com pendingAccountId preenchido e categoryId ausente/null
  const affected = await transactions
    .find({
      pendingAccountId: { $exists: true, $ne: null },
      $or: [{ categoryId: null }, { categoryId: { $exists: false } }],
    })
    .toArray();

  console.log(`Transactions com pendingAccountId e sem categoryId: ${affected.length}\n`);

  if (affected.length === 0) {
    console.log('✔ Nenhuma transação para corrigir.');
    await client.close();
    return;
  }

  const results = {
    wouldFix: [],
    noResolution: [],
    pendingNotFound: [],
    noCategoriaOnPending: [],
  };

  for (const tx of affected) {
    const pending = await pendingAccounts.findOne({ _id: tx.pendingAccountId });

    if (!pending) {
      results.pendingNotFound.push({ tx });
      continue;
    }

    if (!pending.categoria || pending.categoria.toLowerCase() === 'outro') {
      results.noCategoriaOnPending.push({ tx, pending });
      continue;
    }

    const isReceber = pending.tipo === 'RECEBER';
    const category = await resolveCategory(db, pending.categoria, isReceber, pending.userId.toString());

    if (!category) {
      results.noResolution.push({ tx, pending, categoriaText: pending.categoria });
      continue;
    }

    results.wouldFix.push({ tx, pending, category });
  }

  // Relatório de dry-run

  console.log(separator());
  console.log(`  SERÃO CORRIGIDAS: ${results.wouldFix.length} transaction(s)`);
  console.log(separator());

  for (const { tx, pending, category } of results.wouldFix) {
    console.log(`  TX  : ${tx._id}`);
    console.log(`    Descrição   : ${tx.description || '(sem descrição)'}`);
    console.log(`    Data        : ${fmt(tx.date)}`);
    console.log(`    Valor       : R$ ${(tx.value || 0).toFixed(2)}`);
    console.log(`    Conta       : ${pending.title} (${pending.categoria})`);
    console.log(`    categoryId  : null → ${category._id}  (${category.name})`);
    const pendingMissingCat = !pending.categoryId;
    if (pendingMissingCat) {
      console.log(`    PendingAccount também será atualizado (sem categoryId)`);
    }
    console.log();
  }

  if (results.noResolution.length > 0) {
    console.log(separator());
    console.log(`  SEM RESOLUÇÃO: ${results.noResolution.length} transaction(s)`);
    console.log('  (categoria não encontrada no banco — pode ter sido renomeada/deletada)');
    console.log(separator());
    for (const { tx, pending, categoriaText } of results.noResolution) {
      console.log(`  TX  : ${tx._id}`);
      console.log(`    Conta       : ${pending.title}`);
      console.log(`    categoria   : "${categoriaText}"  (não encontrada no banco)`);
      console.log(`    Tipo        : ${pending.tipo || 'PAGAR'}`);
      console.log(`    userId      : ${pending.userId}`);
      console.log();
    }
  }

  if (results.pendingNotFound.length > 0) {
    console.log(separator());
    console.log(`  PENDINGACCOUNT NÃO ENCONTRADO: ${results.pendingNotFound.length} transaction(s)`);
    console.log(separator());
    for (const { tx } of results.pendingNotFound) {
      console.log(`  TX  : ${tx._id}  → pendingAccountId: ${tx.pendingAccountId}`);
    }
    console.log();
  }

  if (results.noCategoriaOnPending.length > 0) {
    console.log(separator());
    console.log(`  SEM CATEGORIA NA CONTA (campo vazio/Outro): ${results.noCategoriaOnPending.length} transaction(s)`);
    console.log('  (sem informação suficiente para resolver — ignorado)');
    console.log(separator());
    for (const { tx, pending } of results.noCategoriaOnPending) {
      console.log(`  TX  : ${tx._id}  → conta: "${pending.title}"  categoria: "${pending.categoria || '(vazio)'}"`);
    }
    console.log();
  }

  console.log(separator('═'));
  console.log(`  RESUMO FINAL`);
  console.log(separator('═'));
  console.log(`  Serão corrigidas         : ${results.wouldFix.length}`);
  console.log(`  Sem resolução de categ.  : ${results.noResolution.length}`);
  console.log(`  PendingAccount ausente   : ${results.pendingNotFound.length}`);
  console.log(`  Conta sem categoria      : ${results.noCategoriaOnPending.length}`);
  console.log();

  // Aplicação (apenas com --apply)

  if (DRY_RUN) {
    console.log('⚠  Dry-run concluído. Nenhuma alteração feita.');
    console.log('   Rode com --apply para aplicar as correções acima.\n');
    await client.close();
    return;
  }

  console.log('Aplicando correções...\n');
  let txFixed = 0;
  let pendingFixed = 0;

  for (const { tx, pending, category } of results.wouldFix) {
    // Log do estado anterior (backup implícito)
    console.log(`[BEFORE] TX ${tx._id}: categoryId=${tx.categoryId ?? 'null'}`);
    console.log(`[BEFORE] Pending ${pending._id}: categoryId=${pending.categoryId ?? 'null'}`);

    // Atualiza a Transaction
    await transactions.updateOne(
      { _id: tx._id },
      { $set: { categoryId: category._id } },
    );
    txFixed++;
    console.log(`[AFTER ] TX ${tx._id}: categoryId=${category._id}  (${category.name})`);

    // Atualiza o PendingAccount se também não tiver categoryId
    if (!pending.categoryId) {
      await pendingAccounts.updateOne(
        { _id: pending._id },
        { $set: { categoryId: category._id } },
      );
      pendingFixed++;
      console.log(`[AFTER ] Pending ${pending._id}: categoryId=${category._id}  (${category.name})`);
    }
    console.log();
  }

  console.log(separator('═'));
  console.log(`  APLICAÇÃO CONCLUÍDA`);
  console.log(separator('═'));
  console.log(`  Transactions corrigidas        : ${txFixed}`);
  console.log(`  PendingAccounts atualizados    : ${pendingFixed}`);
  console.log(`  Sem resolução (não alterados)  : ${results.noResolution.length}`);
  console.log();

  await client.close();
}

main().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
