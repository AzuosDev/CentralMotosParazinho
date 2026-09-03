const BANK_ICONS: Record<string, string> = {
  nubank: "💜",
  "banco inter": "🟠",
  inter: "🟠",
  "itaú unibanco": "🟠",
  itaú: "🟠",
  itau: "🟠",
  bradesco: "🔴",
  santander: "🔴",
  "caixa econômica": "🏛️",
  "caixa economica": "🏛️",
  caixa: "🏛️",
  "banco do brasil": "🟡",
  "c6 bank": "⬛",
  "xp investimentos": "📈",
  "xp inc": "📈",
  picpay: "💚",
  "mercado pago": "💛",
  pagbank: "🔵",
  pagseguro: "🔵",
  "btg pactual": "⚫",
  btg: "⚫",
  sicredi: "🌱",
  sicoob: "🤝",
  neon: "🔷",
  next: "💙",
  wise: "🌊",
  revolut: "⚪",
  stone: "🟩",
  bs2: "🔵",
  safra: "🏦",
  avenue: "🇺🇸",
  nomad: "✈️",
  rico: "💰",
  clear: "💎",
  warren: "💼",
  original: "🟢",
};

const BANK_DOMAINS: Record<string, string> = {
  nubank: "nubank.com.br",
  "banco inter": "bancointer.com.br",
  inter: "bancointer.com.br",
  "itaú unibanco": "itau.com.br",
  itaú: "itau.com.br",
  itau: "itau.com.br",
  bradesco: "bradesco.com.br",
  santander: "santander.com.br",
  "caixa econômica": "caixa.gov.br",
  "caixa economica": "caixa.gov.br",
  caixa: "caixa.gov.br",
  "banco do brasil": "bb.com.br",
  "c6 bank": "c6bank.com.br",
  "xp investimentos": "xpi.com.br",
  picpay: "picpay.com",
  "mercado pago": "mercadopago.com.br",
  pagbank: "pagseguro.com.br",
  pagseguro: "pagseguro.com.br",
  "btg pactual": "btgpactual.com",
  btg: "btgpactual.com",
  sicredi: "sicredi.com.br",
  sicoob: "sicoob.com.br",
  neon: "neon.com.br",
  next: "next.me",
  wise: "wise.com",
  revolut: "revolut.com",
  stone: "stone.com.br",
  bs2: "bs2.com",
  safra: "safra.com.br",
  avenue: "avenue.us",
  nomad: "nomadglobal.com",
  rico: "rico.com.vc",
  clear: "clear.com.br",
  warren: "warren.com.br",
  original: "original.com.br",
};

export function getBankLogoUrl(nome: string): string | null {
  const s = nome.toLowerCase().trim();
  if (!s) return null;
  const match = Object.entries(BANK_DOMAINS)
    .filter(([k]) => s.includes(k))
    .sort((a, b) => b[0].length - a[0].length)[0];
  if (!match) return null;
  return `https://www.google.com/s2/favicons?domain=${match[1]}&sz=64`;
}

export function detectBankIcon(nome: string): string | null {
  const s = nome.toLowerCase().trim();
  if (!s) return null;
  const match = Object.entries(BANK_ICONS)
    .filter(([k]) => s.includes(k))
    .sort((a, b) => b[0].length - a[0].length)[0];
  return match?.[1] ?? null;
}

export function getWalletIcon(wallet: { nome: string; icone?: string }): string {
  // O ícone é um campo próprio, deliberadamente escolhido (via seleção de banco ou
  // digitado) — uma vez salvo, não deve mudar sozinho só porque o nome foi editado
  // depois. Só recorre ao nome quando não existe NENHUM ícone salvo (carteira antiga
  // sem o campo, por exemplo).
  if (wallet.icone) return wallet.icone;
  return detectBankIcon(wallet.nome) ?? "🏦";
}
