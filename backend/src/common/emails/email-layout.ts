import { BRAND, COLORS, DISPLAY_FONT_STACK, FONT_STACK, escapeHtml } from './email-brand';
import { LOGO_CID } from './email-logo';

export interface EmailNotice {
  title: string;
  body: string;
}

export interface EmailLayoutOptions {
  /** Assunto/título do documento. */
  subject: string;
  /** Texto de pré-visualização (inbox preview), oculto no corpo. */
  preheader: string;
  /** Rótulo pequeno acima do título. */
  eyebrow: string;
  /** Título principal. */
  heading: string;
  /** Saudação ("Olá, Ana!"). */
  greeting: string;
  /** Parágrafos do corpo, em texto puro (são escapados). */
  paragraphs: string[];
  ctaLabel: string;
  ctaUrl: string;
  /** Linha de contexto abaixo do botão (validade, uso único etc.). */
  metaNote?: string;
  /** Bloco de aviso de segurança. */
  notice: EmailNotice;
  /** URL base do app (usada no logo e nos links do rodapé). */
  baseUrl: string;
}

const CONTAINER_WIDTH = 600;

/**
 * Layout base dos emails transacionais: tabelas + CSS inline (compatível com
 * Gmail, Apple Mail, Outlook desktop/web e clientes mobile), com media queries
 * para leitura confortável no celular.
 */
export function renderEmailLayout(options: EmailLayoutOptions) {
  const {
    subject,
    preheader,
    eyebrow,
    heading,
    greeting,
    paragraphs,
    ctaLabel,
    ctaUrl,
    metaNote,
    notice,
    baseUrl,
  } = options;

  const safeCtaUrl = escapeHtml(ctaUrl);
  const year = new Date().getFullYear();

  const bodyParagraphs = paragraphs
    .map(
      (paragraph) => `
              <p class="sm-text brand-muted" style="margin:0 0 16px;font-family:${FONT_STACK};font-size:16px;line-height:26px;color:${COLORS.textSecondary};">
                ${escapeHtml(paragraph)}
              </p>`,
    )
    .join('');

  const metaRow = metaNote
    ? `
          <tr>
            <td class="sm-px" style="padding:16px 40px 0;">
              <p style="margin:0;font-family:${FONT_STACK};font-size:13px;line-height:20px;color:${COLORS.textMuted};">
                ${escapeHtml(metaNote)}
              </p>
            </td>
          </tr>`
    : '';

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no" />
  <meta name="color-scheme" content="dark light" />
  <meta name="supported-color-schemes" content="dark light" />
  <title>${escapeHtml(subject)}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style type="text/css">
    html, body { margin:0 !important; padding:0 !important; width:100% !important; background-color:${COLORS.bgBase}; }
    body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; border-collapse:collapse !important; }
    img { border:0; height:auto; line-height:100%; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
    a { color:${COLORS.accentLime}; }
    a[x-apple-data-detectors] { color:inherit !important; text-decoration:none !important; font-size:inherit !important; font-family:inherit !important; font-weight:inherit !important; line-height:inherit !important; }

    @media only screen and (max-width:620px) {
      .sm-full { width:100% !important; max-width:100% !important; }
      .sm-px { padding-left:22px !important; padding-right:22px !important; }
      .sm-py { padding-top:28px !important; padding-bottom:28px !important; }
      .sm-h1 { font-size:24px !important; line-height:32px !important; }
      .sm-text { font-size:15px !important; line-height:24px !important; }
      .sm-btn { display:block !important; width:auto !important; box-sizing:border-box !important; padding-left:20px !important; padding-right:20px !important; text-align:center !important; }
      .sm-stack { display:block !important; width:100% !important; text-align:left !important; }
      .sm-stack table { float:none !important; margin:0 !important; }
      .sm-gap { padding-top:16px !important; }
    }

    /* Clientes que forçam dark mode (Outlook.com): preserva a paleta da marca */
    [data-ogsc] .brand-shell { background-color:${COLORS.bgBase} !important; }
    [data-ogsc] .brand-card { background-color:${COLORS.bgCard} !important; }
    [data-ogsc] .brand-title { color:${COLORS.textPrimary} !important; }
    [data-ogsc] .brand-muted { color:${COLORS.textSecondary} !important; }
  </style>
</head>
<body class="brand-shell" style="margin:0;padding:0;width:100%;background-color:${COLORS.bgBase};">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${COLORS.bgBase};">
    ${escapeHtml(preheader)}
  </div>
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
    &#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;
  </div>

  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${COLORS.bgBase}" class="brand-shell" style="background-color:${COLORS.bgBase};">
    <tr>
      <td align="center" style="padding:32px 16px 40px;">

        <!-- Cabeçalho -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="${CONTAINER_WIDTH}" class="sm-full" style="width:${CONTAINER_WIDTH}px;max-width:${CONTAINER_WIDTH}px;">
          <tr>
            <td align="left" style="padding:0 4px 18px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td valign="middle" width="40" bgcolor="${COLORS.bgMuted}" style="width:40px;height:40px;background-color:${COLORS.bgMuted};border-radius:12px;text-align:center;">
                    <img src="cid:${LOGO_CID}" width="40" height="40" alt="" style="display:block;width:40px;height:40px;border-radius:12px;border:0;outline:none;" />
                  </td>
                  <td width="12" style="width:12px;font-size:0;line-height:0;">&nbsp;</td>
                  <td valign="middle" class="brand-title" style="font-family:${DISPLAY_FONT_STACK};font-size:20px;font-weight:700;letter-spacing:-0.4px;color:${COLORS.textPrimary};">
                    ${BRAND.product}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Card principal -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="${CONTAINER_WIDTH}" class="sm-full brand-card" bgcolor="${COLORS.bgCard}" style="width:${CONTAINER_WIDTH}px;max-width:${CONTAINER_WIDTH}px;background-color:${COLORS.bgCard};border:1px solid ${COLORS.border};border-radius:16px;">
          <tr>
            <td style="height:4px;line-height:4px;font-size:0;background-color:${COLORS.accentLime};border-radius:16px 16px 0 0;">&nbsp;</td>
          </tr>
          <tr>
            <td class="sm-px sm-py" style="padding:40px 40px 8px;">
              <p style="margin:0 0 10px;font-family:${FONT_STACK};font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${COLORS.accentLime};">
                ${escapeHtml(eyebrow)}
              </p>
              <h1 class="sm-h1 brand-title" style="margin:0 0 18px;font-family:${DISPLAY_FONT_STACK};font-size:30px;line-height:38px;font-weight:700;letter-spacing:-0.6px;color:${COLORS.textPrimary};">
                ${escapeHtml(heading)}
              </h1>
              <p class="sm-text brand-muted" style="margin:0 0 16px;font-family:${FONT_STACK};font-size:16px;line-height:26px;color:${COLORS.textSecondary};">
                ${escapeHtml(greeting)}
              </p>${bodyParagraphs}
            </td>
          </tr>

          <!-- Botão principal -->
          <tr>
            <td class="sm-px" align="left" style="padding:14px 40px 0;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeCtaUrl}" style="height:52px;v-text-anchor:middle;width:300px;" arcsize="24%" stroke="f" fillcolor="${COLORS.accentLime}">
                <w:anchorlock/>
                <center style="color:${COLORS.bgBase};font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${escapeHtml(ctaLabel)}</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-->
              <a href="${safeCtaUrl}" class="sm-btn" style="display:inline-block;padding:16px 32px;background-color:${COLORS.accentLime};color:${COLORS.bgBase};font-family:${FONT_STACK};font-size:16px;font-weight:700;line-height:20px;text-decoration:none;border-radius:12px;">
                ${escapeHtml(ctaLabel)}
              </a>
              <!--<![endif]-->
            </td>
          </tr>${metaRow}

          <!-- Link alternativo -->
          <tr>
            <td class="sm-px" style="padding:24px 40px 0;">
              <p style="margin:0 0 8px;font-family:${FONT_STACK};font-size:13px;line-height:20px;color:${COLORS.textMuted};">
                O botão não funcionou? Copie e cole este endereço no seu navegador:
              </p>
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${COLORS.bgMuted}" style="background-color:${COLORS.bgMuted};border:1px solid ${COLORS.bgOverlay};border-radius:12px;">
                <tr>
                  <td style="padding:14px 16px;font-family:${FONT_STACK};font-size:13px;line-height:20px;word-break:break-all;">
                    <a href="${safeCtaUrl}" style="color:${COLORS.accentLime};text-decoration:none;word-break:break-all;">${safeCtaUrl}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Aviso de segurança -->
          <tr>
            <td class="sm-px" style="padding:24px 40px 40px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${COLORS.accentLimeSoft}" style="background-color:${COLORS.accentLimeSoft};border-radius:12px;">
                <tr>
                  <td width="4" bgcolor="${COLORS.accentLime}" style="width:4px;background-color:${COLORS.accentLime};font-size:0;line-height:0;border-radius:12px 0 0 12px;">&nbsp;</td>
                  <td style="padding:16px 18px;">
                    <p class="brand-title" style="margin:0 0 6px;font-family:${FONT_STACK};font-size:14px;font-weight:700;color:${COLORS.textPrimary};">
                      ${escapeHtml(notice.title)}
                    </p>
                    <p class="brand-muted" style="margin:0;font-family:${FONT_STACK};font-size:14px;line-height:22px;color:${COLORS.textSecondary};">
                      ${escapeHtml(notice.body)}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

${renderFooter(baseUrl, year)}

      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderFooter(baseUrl: string, year: number) {
  const safeBaseUrl = escapeHtml(baseUrl);
  const displayUrl = safeBaseUrl.replace(/^https?:\/\//, '');
  const whatsappUrl = `https://wa.me/${BRAND.supportWhatsappNumber}`;

  return `        <!-- Rodapé -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="${CONTAINER_WIDTH}" class="sm-full" style="width:${CONTAINER_WIDTH}px;max-width:${CONTAINER_WIDTH}px;">
          <tr>
            <td style="padding:28px 8px 0;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td class="sm-stack" align="left" valign="top">
                    <p class="brand-title" style="margin:0 0 4px;font-family:${DISPLAY_FONT_STACK};font-size:16px;font-weight:700;letter-spacing:-0.2px;color:${COLORS.textPrimary};">
                      ${BRAND.company}
                    </p>
                    <p style="margin:0;font-family:${FONT_STACK};font-size:13px;line-height:20px;color:${COLORS.textMuted};">
                      ${BRAND.companyTagline}<br />${BRAND.product} · ${BRAND.productTagline}
                    </p>
                  </td>
                  <td class="sm-stack sm-gap" align="right" valign="top">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="right">
                      <tr>
                        <td bgcolor="${COLORS.bgMuted}" style="background-color:${COLORS.bgMuted};border:1px solid ${COLORS.bgOverlay};border-radius:999px;">
                          <a href="${BRAND.instagramUrl}" style="display:inline-block;padding:10px 18px;font-family:${FONT_STACK};font-size:13px;font-weight:600;color:${COLORS.accentLime};text-decoration:none;white-space:nowrap;">
                            Instagram · ${BRAND.instagramHandle}
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 8px 0;">
              <div style="height:1px;line-height:1px;font-size:0;background-color:${COLORS.border};">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td align="left" style="padding:18px 8px 0;">
              <p style="margin:0 0 10px;font-family:${FONT_STACK};font-size:13px;line-height:22px;color:${COLORS.textSecondary};">
                Precisa de ajuda?
                <a href="mailto:${BRAND.supportEmail}" style="color:${COLORS.accentLime};text-decoration:none;">${BRAND.supportEmail}</a>
                &nbsp;·&nbsp;
                <a href="${whatsappUrl}" style="color:${COLORS.accentLime};text-decoration:none;white-space:nowrap;">WhatsApp ${BRAND.supportWhatsappDisplay}</a>
              </p>
              <p style="margin:0 0 10px;font-family:${FONT_STACK};font-size:12px;line-height:20px;color:${COLORS.textMuted};">
                Este é um email automático de segurança da sua conta ${BRAND.product}. Não é necessário responder.
                Nunca pedimos sua senha, código de verificação ou dados de cartão por email.
              </p>
              <p style="margin:0;font-family:${FONT_STACK};font-size:12px;line-height:20px;color:${COLORS.textMuted};">
                © ${year} ${BRAND.company}. Todos os direitos reservados. ·
                <a href="${safeBaseUrl}" style="color:${COLORS.textSecondary};text-decoration:underline;">${displayUrl}</a>
              </p>
            </td>
          </tr>
        </table>`;
}

/** Versão em texto puro (multipart), para clientes sem HTML e entregabilidade. */
export function renderEmailText(options: EmailLayoutOptions) {
  const { heading, greeting, paragraphs, ctaLabel, ctaUrl, metaNote, notice, baseUrl } = options;
  const year = new Date().getFullYear();

  return [
    `${BRAND.product} · ${heading}`,
    '',
    greeting,
    '',
    ...paragraphs,
    '',
    `${ctaLabel}:`,
    ctaUrl,
    ...(metaNote ? ['', metaNote] : []),
    '',
    `${notice.title} ${notice.body}`,
    '',
    '---',
    `${BRAND.company} · ${BRAND.companyTagline}`,
    `Instagram: ${BRAND.instagramUrl} (${BRAND.instagramHandle})`,
    `Suporte: ${BRAND.supportEmail} · WhatsApp ${BRAND.supportWhatsappDisplay}`,
    baseUrl,
    `© ${year} ${BRAND.company}. Email automático, não responda.`,
  ].join('\n');
}
