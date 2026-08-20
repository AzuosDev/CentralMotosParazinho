/**
 * Identidade visual e dados institucionais usados nos emails transacionais.
 * Espelha os design tokens do app (frontend/tailwind.config.ts).
 */
export const BRAND = {
  product: 'MeuGasto',
  productTagline: 'Controle de gastos, orçamentos e metas.',
  company: 'Azuos Dev',
  companyTagline: 'Desenvolvimento de software e produtos digitais.',
  instagramUrl: 'https://instagram.com/azuos.dev',
  instagramHandle: '@azuos.dev',
  supportEmail: 'udawgs.org@gmail.com',
  supportWhatsappNumber: '5588996784110',
  supportWhatsappDisplay: '(88) 9 9678-4110',
} as const;

/** Design tokens (dark finance) aplicados inline no HTML dos emails. */
export const COLORS = {
  bgBase: '#0A0A0A',
  bgCard: '#141414',
  bgMuted: '#1C1C1C',
  bgOverlay: '#232323',
  accentLime: '#A3E635',
  accentLimeSoft: '#1B2410',
  textPrimary: '#FFFFFF',
  textSecondary: '#9CA3AF',
  textMuted: '#6B7280',
  border: '#232323',
} as const;

export const FONT_STACK =
  "'DM Sans','Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif";

export const DISPLAY_FONT_STACK =
  "Syne,'DM Sans','Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif";

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
