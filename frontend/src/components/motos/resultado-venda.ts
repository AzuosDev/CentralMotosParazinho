/**
 * Vocabulário único do resultado de uma venda: lucro, prejuízo ou venda no custo.
 *
 * Quatro telas mostram esse mesmo número (a ficha da moto, a lista de motos, o relatório
 * do mês e o modal de registrar venda) e cada uma decidia a cor sozinha — duas pintavam
 * lucro positivo com o vermelho da marca, a mesma tinta do prejuízo (`accent-brand-ink` e
 * `accent-red-ink` resolvem para #ff3b30 no escuro), então lucrar e perder dinheiro
 * apareciam idênticos. Aqui a direção do número escolhe o tom uma vez só.
 *
 * Verde é "entrou dinheiro" e vermelho é "saiu" — os mesmos tokens semânticos que o resto
 * do app usa em entrada e saída. Vender exatamente pelo custo total não é nenhum dos dois:
 * é branco, o tom de valor normal, porque não houve ganho nem perda a sinalizar.
 */
export type TomDoResultado = "lucro" | "prejuizo" | "no-custo";

export type ResultadoDaVenda = {
  tom: TomDoResultado;
  /** "Lucro" · "Prejuízo" · "Sem lucro" — o sujeito da frase, que cada tela completa. */
  substantivo: string;
  /** "+" no lucro, "−" (sinal de menos de verdade) no prejuízo, nada quando é zero. */
  sinal: string;
  /** Sempre positivo: o sinal e o rótulo já dizem a direção. */
  valorAbsoluto: number;
  /** Cor do número. */
  textoCls: string;
  /** Fundo do painel de destaque. */
  fundoCls: string;
  /** Borda do painel de destaque. */
  bordaCls: string;
  /** O mesmo tom no vocabulário de `StatTile`/`TotalCard`, que já existia antes daqui. */
  tomStat: "income" | "expense" | "neutral";
};

export function resultadoDaVenda(lucro: number | null): ResultadoDaVenda {
  const valor = lucro ?? 0;

  if (valor < 0) {
    return {
      tom: "prejuizo",
      substantivo: "Prejuízo",
      sinal: "−",
      valorAbsoluto: Math.abs(valor),
      textoCls: "text-semantic-expense",
      fundoCls: "bg-semantic-expense/10",
      bordaCls: "border-semantic-expense/40",
      tomStat: "expense",
    };
  }

  if (valor === 0) {
    return {
      tom: "no-custo",
      substantivo: "Sem lucro",
      sinal: "",
      valorAbsoluto: 0,
      textoCls: "text-text-primary",
      fundoCls: "bg-bg-muted",
      bordaCls: "border-border-default",
      tomStat: "neutral",
    };
  }

  return {
    tom: "lucro",
    substantivo: "Lucro",
    sinal: "+",
    valorAbsoluto: valor,
    textoCls: "text-semantic-income",
    fundoCls: "bg-semantic-income/10",
    bordaCls: "border-semantic-income/40",
    tomStat: "income",
  };
}
