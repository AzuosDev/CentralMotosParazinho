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
  tipo: 'bug' | 'sugestao';
  mensagem: string;
  fromEmail: string;
  baseUrl: string;
}): RenderedEmail {
  const label = tipoLabel[params.tipo];
  const replyUrl = `mailto:${params.fromEmail}?subject=${encodeURIComponent(`Re: sua mensagem no ${BRAND.product}`)}`;

  return render({
    subject: `${label} · ${params.fromEmail}`,
    preheader: params.mensagem.slice(0, 120),
    eyebrow: 'FAQ · Fale com o suporte',
    heading: label,
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
