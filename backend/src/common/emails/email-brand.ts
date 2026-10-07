/**
 * Identidade visual e dados institucionais usados nos emails transacionais.
 * Espelha os design tokens do app (frontend/tailwind.config.ts).
 */
export const BRAND = {
  product: 'Central Motos',
  productTagline: 'Gastos, contas, cartões e metas em um só lugar.',
  company: 'Azuos Dev',
  companyTagline: 'Desenvolvimento de software e produtos digitais.',
  instagramUrl: 'https://instagram.com/azuos.dev',
  instagramHandle: '@azuos.dev',
  supportEmail: 'azuos.org@gmail.com',
  supportWhatsappNumber: '5588996784110',
  supportWhatsappDisplay: '(88) 9 9678-4110',
} as const;

/**
 * Design tokens da Central Motos aplicados inline no HTML dos emails.
 * Espelham frontend/src/styles.css (tema escuro) — se mudar lá, mude aqui.
 *
 * accentBrand é preenchimento (sempre com texto branco por cima: 5,0:1);
 * accentBrandInk é o vermelho que serve de TEXTO sobre o card escuro, porque
 * o #E10600 puro dá só 3,9:1 ali e sumiria num link.
 */
export const COLORS = {
  bgBase: '#050505',
  bgCard: '#0D0D0D',
  bgMuted: '#1A1A1A',
  bgOverlay: '#262626',
  accentBrand: '#E10600',
  accentBrandInk: '#FF3B30',
  accentBrandSoft: '#2A0A08',
  textPrimary: '#FFFFFF',
  textSecondary: '#A3A3A3',
  textMuted: '#7A7A7A',
  border: '#333333',
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
