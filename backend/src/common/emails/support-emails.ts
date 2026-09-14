import { BRAND } from './email-brand';
import { logoAttachment } from './email-logo';
import { RenderedEmail } from './auth-emails';
import { EmailLayoutOptions, renderEmailLayout, renderEmailText } from './email-layout';

function render(options: EmailLayoutOptions): RenderedEmail {
  return {
    subject: options.subject,
    text: renderEmailText(options),
    html: renderEmailLayout(options),
    attachments: [logoAttachment()],
  };
}

const tipoLabel: Record<'bug' | 'sugestao', string> = {
  bug: 'Relato de erro',
  sugestao: 'Sugestão',
};

/** Email interno avisando que um usuário mandou uma mensagem pelo FAQ (bug ou sugestão). */
export function supportMessageEmail(params: {
  titulo: string;
  tipo: 'bug' | 'sugestao';
  mensagem: string;
  fromEmail: string;
  baseUrl: string;
}): RenderedEmail {
  const label = tipoLabel[params.tipo];
  const replyUrl = `mailto:${params.fromEmail}?subject=${encodeURIComponent(`Re: sua mensagem no ${BRAND.product}`)}`;

  return render({
    subject: `${params.titulo} · ${label}`,
    preheader: params.mensagem.slice(0, 120),
    eyebrow: `FAQ · ${label}`,
    heading: params.titulo,
    greeting: 'Olá!',
    paragraphs: [
      `Você recebeu uma nova mensagem pelo formulário de ajuda do ${BRAND.product}.`,
      params.mensagem,
    ],
    ctaLabel: 'Responder por email',
    ctaUrl: replyUrl,
    notice: {
      title: 'Enviado por',
      body: params.fromEmail,
    },
    baseUrl: params.baseUrl,
  });
}

/** Aviso pro usuário de que o suporte respondeu a conversa dele no FAQ. */
export function supportReplyToUserEmail(params: {
  mensagem: string;
  baseUrl: string;
}): RenderedEmail {
  return render({
    subject: `${BRAND.company} respondeu sua mensagem`,
    preheader: params.mensagem.slice(0, 120),
    eyebrow: 'FAQ · Fale com o suporte',
    heading: 'Você tem uma resposta',
    greeting: 'Olá!',
    paragraphs: [
      `O suporte do ${BRAND.product} respondeu sua mensagem:`,
      params.mensagem,
    ],
    ctaLabel: 'Ver conversa completa',
    ctaUrl: `${params.baseUrl}/faq`,
    notice: {
      title: 'Respondido por',
      body: BRAND.company,
    },
    baseUrl: params.baseUrl,
  });
}

/** Aviso interno de que um usuário respondeu de volta numa conversa já aberta. */
export function supportReplyToAdminEmail(params: {
  mensagem: string;
  fromEmail: string;
  baseUrl: string;
}): RenderedEmail {
  const replyUrl = `mailto:${params.fromEmail}?subject=${encodeURIComponent(`Re: sua mensagem no ${BRAND.product}`)}`;

  return render({
    subject: `Nova resposta na conversa · ${params.fromEmail}`,
    preheader: params.mensagem.slice(0, 120),
    eyebrow: 'FAQ · Fale com o suporte',
    heading: 'Nova resposta do usuário',
    greeting: 'Olá!',
    paragraphs: [
      `${params.fromEmail} respondeu numa conversa do formulário de ajuda do ${BRAND.product}.`,
      params.mensagem,
    ],
    ctaLabel: 'Responder por email',
    ctaUrl: replyUrl,
    notice: {
      title: 'Enviado por',
      body: params.fromEmail,
    },
    baseUrl: params.baseUrl,
  });
}
