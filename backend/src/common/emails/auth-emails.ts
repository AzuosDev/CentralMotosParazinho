import { BRAND } from './email-brand';
import { logoAttachment } from './email-logo';
import { EmailLayoutOptions, renderEmailLayout, renderEmailText } from './email-layout';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
  cid: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
  /** Imagens inline (Content-ID) referenciadas pelo HTML. */
  attachments: EmailAttachment[];
}

function firstName(name?: string) {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0];
}

function greetingFor(name?: string) {
  const first = firstName(name);
  return first ? `Olá, ${first}!` : 'Olá!';
}

function render(options: EmailLayoutOptions): RenderedEmail {
  return {
    subject: options.subject,
    text: renderEmailText(options),
    html: renderEmailLayout(options),
    attachments: [logoAttachment()],
  };
}

/** Email de confirmação de cadastro. */
export function verificationEmail(params: { verifyUrl: string; baseUrl: string; name?: string }): RenderedEmail {
  return render({
    subject: `Confirme seu email · ${BRAND.product}`,
    preheader: `Falta um passo para ativar sua conta no ${BRAND.product}.`,
    eyebrow: 'Confirmação de conta',
    heading: 'Confirme seu email',
    greeting: greetingFor(params.name),
    paragraphs: [
      `Sua conta no ${BRAND.product} foi criada. Para ativá-la e começar a registrar seus gastos, ganhos e metas, confirme que este endereço de email é seu.`,
    ],
    ctaLabel: 'Confirmar meu email',
    ctaUrl: params.verifyUrl,
    metaNote: 'Este link é de uso único e vale apenas para este endereço de email.',
    notice: {
      title: 'Não foi você?',
      body: `Se você não criou uma conta no ${BRAND.product}, ignore este email. Sem esta confirmação, nenhuma conta é ativada com o seu endereço.`,
    },
    baseUrl: params.baseUrl,
  });
}

/** Email de redefinição de senha. */
export function passwordResetEmail(params: {
  resetUrl: string;
  baseUrl: string;
  name?: string;
  /** Validade do link, em minutos (padrão: 60). */
  expiresInMinutes?: number;
}): RenderedEmail {
  const minutes = params.expiresInMinutes ?? 60;
  const hours = Math.round(minutes / 60);
  const validity =
    minutes >= 60 ? `${hours} ${hours === 1 ? 'hora' : 'horas'}` : `${minutes} minutos`;

  return render({
    subject: `Redefinição de senha · ${BRAND.product}`,
    preheader: `Crie uma nova senha para sua conta ${BRAND.product}. O link expira em ${validity}.`,
    eyebrow: 'Segurança da conta',
    heading: 'Redefinir sua senha',
    greeting: greetingFor(params.name),
    paragraphs: [
      `Recebemos um pedido para redefinir a senha da conta ${BRAND.product} vinculada a este email. Toque no botão abaixo para criar uma nova senha.`,
    ],
    ctaLabel: 'Criar nova senha',
    ctaUrl: params.resetUrl,
    metaNote: `Por segurança, este link expira em ${validity} e só pode ser usado uma vez.`,
    notice: {
      title: 'Não foi você?',
      body: 'Ignore este email: sua senha atual continua valendo e nada muda enquanto o link não for usado. Se estes pedidos se repetirem, troque sua senha e fale com o suporte.',
    },
    baseUrl: params.baseUrl,
  });
}
