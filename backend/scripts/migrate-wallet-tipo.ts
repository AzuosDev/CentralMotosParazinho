/**
 * Migração: garante que toda Wallet existente tenha o campo `tipo` gravado como 'conta'.
 *
 * O schema já tem default: 'conta' para tipo, mas isso só é aplicado pelo Mongoose ao
 * hidratar um documento — uma query com match exato (ex: `{ tipo: 'conta' }`) não casa com
 * documentos legados que não têm o campo gravado no banco. Esta migração backfilla o campo
 * de verdade para evitar essa classe de bug (mesma armadilha documentada em
 * pending.service.ts#tipoMatch() para PendingAccount.tipo).
 *
 * Usa a conexão Mongoose da própria aplicação — funciona da mesma forma que o backend.
 *
 * Uso:
 *   npx ts-node scripts/migrate-wallet-tipo.ts              → dry-run (só lista)
 *   npx ts-node scripts/migrate-wallet-tipo.ts --apply      → aplica correções
 */

import 'dotenv/config';
import * as dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']); // DNS público — contorna bloqueio de SRV no DNS local
import mongoose from 'mongoose';

const DRY_RUN = !process.argv.includes('--apply');

const WalletSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  nome: String,
  tipo: String,
}, { collection: 'wallets' });

function sep(char = '─', len = 70) { return char.repeat(len); }

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI não encontrado no .env');

  await mongoose.connect(uri);
  console.log('✔ Conectado ao MongoDB\n');

  const Wallet = mongoose.model('MigWallet', WalletSchema);

  console.log(sep('═'));
  console.log(DRY_RUN
    ? '  MODO DRY-RUN  (passe --apply para aplicar)'
    : '  MODO APPLY  — alterações serão gravadas');
  console.log(sep('═') + '\n');

  const filter = { tipo: { $exists: false } };
  const affected = await Wallet.find(filter).lean();

  console.log(`Wallets sem campo tipo: ${affected.length}\n`);

  if (affected.length === 0) {
    console.log('✔ Nenhuma carteira para corrigir.');
    await mongoose.disconnect();
    return;
  }

  console.log(sep());
  console.log(`  SERÃO CORRIGIDAS: ${affected.length} wallet(s) → tipo: 'conta'`);
  console.log(sep());
  for (const w of affected) {
    console.log(`  Wallet ${w._id}  nome="${w.nome}"  userId=${w.userId}`);
  }
  console.log('');

  if (DRY_RUN) {
    console.log('⚠  Dry-run concluído. Rode com --apply para aplicar.\n');
  } else {
    const result = await Wallet.updateMany(filter, { $set: { tipo: 'conta' } });
    console.log(sep('═'));
    console.log(`  Wallets corrigidas: ${result.modifiedCount}`);
    console.log(sep('═') + '\n');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
