// Lançamento por voz: tipos do contrato com /api/voz e regras puras do rascunho (sem React),
// para poderem ser testadas isoladamente.

export type TipoLancamentoVoz = "EXPENSE" | "INCOME" | "TRANSFER";
export type FormaPagamentoVoz = "dinheiro" | "credito";
// Gasto de uma moto do estoque (entra no custo dela) ou despesa geral. Só em gasto.
export type DestinoGastoVoz = "moto" | "geral";

// Espelha RascunhoVoz de backend/src/modules/voz/voz.service.ts.
export type RascunhoVoz = {
  type: TipoLancamentoVoz;
  value: number | null;
  description: string;
  date: string;
  categoryId: string | null;
  carteiraId: string | null;
  carteiraDestinoId: string | null;
  parcelas: number;
  // Forma de pagamento dita na fala ("em espécie", "no crédito"), mesmo sem carteira que combine.
  formaPagamento: FormaPagamentoVoz | null;
  // null = a fala não deixou claro se foi moto ou geral; o usuário escolhe na revisão.
  destino: DestinoGastoVoz | null;
  motoId: string | null;
};

export type InterpretacaoVoz = {
  transcricao: string;
  itens: RascunhoVoz[];
};

export type ResultadoConfirmacaoVoz =
  | { indice: number; ok: true; avisoLimite?: { avisoProximoLimite?: boolean; percentualUsado?: number } }
  | { indice: number; ok: false; mensagem: string; limiteExcedido?: boolean };

// Linha editável na tela de revisão: o rascunho + estado de UI.
export type LinhaVoz = RascunhoVoz & {
  chave: string;
  erro?: string;
  limiteExcedido?: boolean;
  confirmarMesmoAssim?: boolean;
};

// Mesma regra de VozService#carregarContexto: "Nova Carteira" não pergunta o tipo, então uma
// carteira "Dinheiro"/"Bolso" do tipo conta também conta como dinheiro físico.
const NOME_DE_DINHEIRO_FISICO = /\b(dinheiro|esp[eé]cie|cash|bolso|f[ií]sic[oa])\b/i;

export function ehCarteiraDinheiro(w: { tipo?: string; nome: string }): boolean {
  return w.tipo === "dinheiro" || (w.tipo !== "credito" && NOME_DE_DINHEIRO_FISICO.test(w.nome));
}

let contador = 0;
export function novaChave() {
  contador += 1;
  return `voz-${Date.now()}-${contador}`;
}

export function paraLinhas(itens: RascunhoVoz[]): LinhaVoz[] {
  return itens.map((item) => ({ ...item, chave: novaChave() }));
}

/** Compra parcelada no cartão vira Parcelamento, que não guarda o vínculo com a moto. */
export function motoIgnoradaNoParcelado(linha: RascunhoVoz, isCartao: (id: string | null) => boolean): boolean {
  return linha.type === "EXPENSE" && linha.destino === "moto" && isCartao(linha.carteiraId) && linha.parcelas >= 2;
}

/**
 * O que ainda falta para a linha poder ser salva — vazio quando está pronta. `temMotos`:
 * só quem tem moto em estoque precisa dizer se o gasto foi de moto ou geral.
 */
export function pendenciasDaLinha(
  linha: RascunhoVoz,
  isCartao: (id: string | null) => boolean,
  temMotos = false,
): string[] {
  const faltas: string[] = [];
  if (!linha.value || linha.value <= 0) faltas.push("valor");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(linha.date)) faltas.push("data");
  if (linha.type === "TRANSFER") {
    if (!linha.carteiraId) faltas.push("carteira de origem");
    if (!linha.carteiraDestinoId) faltas.push("carteira de destino");
    if (linha.carteiraId && linha.carteiraId === linha.carteiraDestinoId) faltas.push("carteiras diferentes");
    return faltas;
  }
  if (!linha.carteiraId) faltas.push("carteira");
  if (linha.type === "INCOME" && isCartao(linha.carteiraId)) faltas.push("carteira (ganho não entra em cartão)");
  if (linha.type === "EXPENSE" && !linha.categoryId) faltas.push("categoria");
  if (linha.type === "EXPENSE" && temMotos) {
    if (!linha.destino) faltas.push("moto ou geral");
    else if (linha.destino === "moto" && !linha.motoId) faltas.push("moto");
    else if (motoIgnoradaNoParcelado(linha, isCartao)) faltas.push("moto em compra parcelada");
  }
  return faltas;
}

/** Corpo de POST /api/voz/confirmar para uma linha pronta. */
export function paraPayload(linha: LinhaVoz, isCartao: (id: string | null) => boolean) {
  const base = {
    type: linha.type,
    value: linha.value ?? 0,
    description: linha.description.trim() || undefined,
    date: linha.date,
  };
  if (linha.type === "TRANSFER") {
    return { ...base, carteiraId: linha.carteiraId ?? undefined, carteiraDestinoId: linha.carteiraDestinoId ?? undefined };
  }
  const cartao = linha.type === "EXPENSE" && isCartao(linha.carteiraId);
  return {
    ...base,
    categoryId: linha.categoryId ?? undefined,
    carteiraId: linha.carteiraId ?? undefined,
    motoId: linha.type === "EXPENSE" && linha.destino === "moto" && linha.motoId ? linha.motoId : undefined,
    parcelas: cartao && linha.parcelas >= 2 ? linha.parcelas : undefined,
    confirmarMesmoAssim: cartao && linha.confirmarMesmoAssim ? true : undefined,
  };
}

/** "Hoje", "Ontem", "Amanhã" ou "12/10" — o chip de data da tela de confirmação. */
export function rotuloData(data: string, hoje: string): string {
  const dia = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;
  const diff = dia(data) - dia(hoje);
  if (diff === 0) return "Hoje";
  if (diff === -1) return "Ontem";
  if (diff === 1) return "Amanhã";
  const [ano, mes, d] = data.split("-");
  return ano === hoje.slice(0, 4) ? `${d}/${mes}` : `${d}/${mes}/${ano}`;
}

// Mantém a ordem do navegador: Safari/iOS só grava mp4; Chrome/Firefox/Android preferem webm/ogg.
const MIME_PREFERIDOS = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"];

export function escolherMimeType(isSupported: (mime: string) => boolean): string | undefined {
  return MIME_PREFERIDOS.find((mime) => isSupported(mime));
}

export function extensaoDoMime(mime: string): string {
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

const CHAVE_CARTEIRA_PADRAO = "meugasto:voz:carteira-padrao";

export function lerCarteiraPadrao(): string | null {
  try {
    return localStorage.getItem(CHAVE_CARTEIRA_PADRAO);
  } catch {
    return null;
  }
}

export function salvarCarteiraPadrao(id: string | null) {
  try {
    if (id) localStorage.setItem(CHAVE_CARTEIRA_PADRAO, id);
    else localStorage.removeItem(CHAVE_CARTEIRA_PADRAO);
  } catch {
    // modo privado/armazenamento bloqueado: só perde a conveniência
  }
}

/**
 * Por que o microfone não está disponível, ou null se está. O caso mais comum não é o
 * navegador: getUserMedia só existe em contexto seguro (HTTPS ou localhost), então abrir o
 * dev server pelo IP da rede (http://192.168.x.x:5173, ex. no celular) esconde a API.
 */
export function motivoSemVoz(): string | null {
  if (vozSuportada()) return null;
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return "O microfone só funciona em páginas HTTPS (ou em localhost). Abra o app por um endereço https:// para falar.";
  }
  return "Este navegador não permite gravar áudio.";
}

export function vozSuportada(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}
