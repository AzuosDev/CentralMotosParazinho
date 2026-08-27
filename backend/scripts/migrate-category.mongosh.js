// Script de migração, rode no mongosh (MongoDB Compass > mongosh)
//
//  DRY-RUN (só lista):  DRY_RUN = true   (padrão)
//  APPLY   (escreve):   DRY_RUN = false

const DRY_RUN = true; // mude para false para aplicar

// Lógica de resolução (espelho de pending.service.ts)

const CATEGORY_KEYWORDS = {
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

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveByKeyword(text) {
  const lower = text.toLowerCase().trim();
  for (const [cat, kws] of Object.entries(CATEGORY_KEYWORDS)) {
    if (kws.some(kw => lower.includes(kw) || kw.includes(lower))) return cat;
  }
  return null;
}

function findCategory(categoriaText, isReceber, userId) {
  if (!categoriaText || categoriaText.toLowerCase() === 'outro') return null;
  const userOid = ObjectId(userId.toString());

  // 1. Busca exata
  let cat = db.categories.findOne({
    name: { $regex: new RegExp('^' + escapeRegex(categoriaText) + '$', 'i') },
    isIncome: isReceber,
    $or: [{ userId: null }, { userId: userOid }],
  });
  if (cat) return cat;

  // 2. Fallback por palavras-chave (só PAGAR)
  if (!isReceber) {
    const mapped = resolveByKeyword(categoriaText);
    if (mapped) {
      cat = db.categories.findOne({
        name: { $regex: new RegExp('^' + escapeRegex(mapped) + '$', 'i') },
        isIncome: false,
        $or: [{ userId: null }, { userId: userOid }],
      });
      if (cat) return cat;
    }
  }
  return null;
}

// Execução

print('\n' + '═'.repeat(70));
print(DRY_RUN
  ? '  MODO DRY-RUN  (mude DRY_RUN = false para aplicar)'
  : '  MODO APPLY  — alterações serão gravadas no banco');
print('═'.repeat(70) + '\n');

const affected = db.transactions.find({
  pendingAccountId: { $exists: true, $ne: null },
  $or: [{ categoryId: null }, { categoryId: { $exists: false } }],
}).toArray();

print(`Transactions com pendingAccountId e sem categoryId: ${affected.length}\n`);

const wouldFix = [];
const noResolution = [];
const pendingNotFound = [];
const noCategoriaOnPending = [];

for (const tx of affected) {
  const pending = db.pendingaccounts.findOne({ _id: tx.pendingAccountId });

  if (!pending) { pendingNotFound.push(tx); continue; }

  if (!pending.categoria || pending.categoria.toLowerCase() === 'outro') {
    noCategoriaOnPending.push({ tx, pending }); continue;
  }

  const isReceber = pending.tipo === 'RECEBER';
  const cat = findCategory(pending.categoria, isReceber, pending.userId);

  if (!cat) { noResolution.push({ tx, pending }); continue; }

  wouldFix.push({ tx, pending, cat });
}

// Relatório

print('─'.repeat(70));
print(`  SERÃO CORRIGIDAS: ${wouldFix.length} transaction(s)`);
print('─'.repeat(70));
for (const { tx, pending, cat } of wouldFix) {
  print(`  TX  : ${tx._id}`);
  print(`    Descrição   : ${tx.description || '(sem descrição)'}`);
  print(`    Conta       : ${pending.title}  (categoria: "${pending.categoria}")`);
  print(`    categoryId  : null → ${cat._id}  (${cat.name})`);
  if (!pending.categoryId) print(`    PendingAccount também será atualizado`);
  print('');
}

if (noResolution.length) {
  print('─'.repeat(70));
  print(`  SEM RESOLUÇÃO: ${noResolution.length} transaction(s)  (categoria não encontrada no banco)`);
  print('─'.repeat(70));
  for (const { tx, pending } of noResolution) {
    print(`  TX  : ${tx._id}   conta: "${pending.title}"   categoria: "${pending.categoria}"   userId: ${pending.userId}`);
  }
  print('');
}

if (pendingNotFound.length) {
  print('─'.repeat(70));
  print(`  PENDINGACCOUNT NÃO ENCONTRADO: ${pendingNotFound.length}`);
  print('─'.repeat(70));
  for (const tx of pendingNotFound) print(`  TX  : ${tx._id}   pendingAccountId: ${tx.pendingAccountId}`);
  print('');
}

if (noCategoriaOnPending.length) {
  print('─'.repeat(70));
  print(`  CONTA SEM CATEGORIA (vazio/Outro): ${noCategoriaOnPending.length}  — ignoradas`);
  print('─'.repeat(70));
  for (const { tx, pending } of noCategoriaOnPending) {
    print(`  TX  : ${tx._id}   conta: "${pending.title}"   categoria: "${pending.categoria || '(vazio)'}"`);
  }
  print('');
}

print('═'.repeat(70));
print('  RESUMO FINAL');
print('═'.repeat(70));
print(`  Serão corrigidas        : ${wouldFix.length}`);
print(`  Sem resolução           : ${noResolution.length}`);
print(`  PendingAccount ausente  : ${pendingNotFound.length}`);
print(`  Conta sem categoria     : ${noCategoriaOnPending.length}`);
print('');

// Aplicação

if (DRY_RUN) {
  print('⚠  Dry-run concluído. Mude DRY_RUN = false para aplicar.\n');
} else {
  print('Aplicando correções...\n');
  let txFixed = 0;
  let pendingFixed = 0;

  for (const { tx, pending, cat } of wouldFix) {
    print(`[BEFORE] TX ${tx._id}: categoryId=${tx.categoryId ?? 'null'}`);
    db.transactions.updateOne({ _id: tx._id }, { $set: { categoryId: cat._id } });
    txFixed++;
    print(`[AFTER ] TX ${tx._id}: categoryId=${cat._id}  (${cat.name})`);

    if (!pending.categoryId) {
      print(`[BEFORE] Pending ${pending._id}: categoryId=${pending.categoryId ?? 'null'}`);
      db.pendingaccounts.updateOne({ _id: pending._id }, { $set: { categoryId: cat._id } });
      pendingFixed++;
      print(`[AFTER ] Pending ${pending._id}: categoryId=${cat._id}  (${cat.name})`);
    }
    print('');
  }

  print('═'.repeat(70));
  print(`  Transactions corrigidas     : ${txFixed}`);
  print(`  PendingAccounts atualizados : ${pendingFixed}`);
  print(`  Sem resolução (intocados)   : ${noResolution.length}`);
  print('');
}
