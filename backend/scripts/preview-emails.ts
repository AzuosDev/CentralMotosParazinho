/**
 * Gera uma prévia local dos emails transacionais (cadastro e redefinição de senha)
 * para conferir o visual no navegador antes de disparar de verdade.
 *
 * Uso:
 *   npm run email:preview
 *   → escreve backend/tmp/email-preview/*.html (abra no navegador,
 *     e use o modo responsivo do DevTools para checar o mobile)
 */
import * as fs from 'fs';
import * as path from 'path';
import { passwordResetEmail, verificationEmail } from '../src/common/emails/auth-emails';
import { LOGO_CID, LOGO_PNG_BASE64 } from '../src/common/emails/email-logo';

const baseUrl = process.env.FRONTEND_URL?.replace(/\/$/, '') || 'http://localhost:5173';
const outDir = path.resolve(__dirname, '..', 'tmp', 'email-preview');

const samples = [
  {
    file: 'cadastro.html',
    email: verificationEmail({
      verifyUrl: `${baseUrl}/verify-email?token=exemplo-token-de-confirmacao`,
      baseUrl,
      name: 'Ana Paula',
    }),
  },
  {
    file: 'redefinir-senha.html',
    email: passwordResetEmail({
      resetUrl: `${baseUrl}/reset-password?token=exemplo-token-de-redefinicao`,
      baseUrl,
      name: 'Ana Paula',
    }),
  },
];

fs.mkdirSync(outDir, { recursive: true });

/** No navegador não existe `cid:` — troca pelo data URI só na prévia. */
function inlineLogoForBrowser(html: string) {
  return html.replace(`cid:${LOGO_CID}`, `data:image/png;base64,${LOGO_PNG_BASE64}`);
}

for (const { file, email } of samples) {
  fs.writeFileSync(path.join(outDir, file), inlineLogoForBrowser(email.html), 'utf8');
  fs.writeFileSync(path.join(outDir, file.replace(/\.html$/, '.txt')), email.text, 'utf8');
  console.log(`${email.subject}\n  → ${path.join(outDir, file)}`);
}
