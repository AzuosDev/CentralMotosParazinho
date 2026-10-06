/**
 * Ícone da Central Motos embutido no email (frontend/public/pwa-192x192.png).
 *
 * É anexado como imagem inline (Content-ID) em vez de link remoto: clientes de
 * email bloqueiam imagens externas por padrão e a pasta estática do frontend
 * pode não estar publicada, o que deixava o logo quebrado no cabeçalho.
 */
export const LOGO_CID = 'central-motos-logo';
export const LOGO_FILENAME = 'central-motos.png';
export const LOGO_CONTENT_TYPE = 'image/png';

export const LOGO_PNG_BASE64 =
  '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';

export function logoAttachment() {
  return {
    filename: LOGO_FILENAME,
    content: Buffer.from(LOGO_PNG_BASE64, 'base64'),
    contentType: LOGO_CONTENT_TYPE,
    cid: LOGO_CID,
  };
}
