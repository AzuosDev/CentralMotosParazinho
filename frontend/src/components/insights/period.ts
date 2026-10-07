import type { PeriodQuery } from "../../types/insights";

/**
 * O "custom" (intervalo livre de datas) que a API aceita não está exposto aqui
 * — só mês/trimestre/ano. Para adicioná-lo, mande `from`/`to` em periodParams.
 */
export type PeriodFilter = {
  period: "month" | "quarter" | "year";
  month: number;
  quarter: number;
  year: number;
};

export const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function defaultPeriodFilter(): PeriodFilter {
  const now = new Date();
  const month = now.getMonth() + 1;

  return {
    period: "month",
    month,
    quarter: Math.floor((month - 1) / 3) + 1,
    year: now.getFullYear(),
  };
}

/**
 * Só as chaves que o período escolhido usa. Mandar as outras não quebraria a
 * validação (todas existem no DTO), mas entrariam na queryKey e provocariam
 * refetch ao mexer num seletor que nem está visível.
 */
export function periodParams(filter: PeriodFilter): PeriodQuery {
  if (filter.period === "month") {
    return { period: "month", month: filter.month, year: filter.year };
  }

  if (filter.period === "quarter") {
    return { period: "quarter", quarter: filter.quarter, year: filter.year };
  }

  return { period: "year", year: filter.year };
}

export function periodLabel(filter: PeriodFilter): string {
  if (filter.period === "month") {
    return `${MONTH_NAMES[filter.month - 1]} de ${filter.year}`;
  }

  if (filter.period === "quarter") {
    return `${filter.quarter}º trimestre de ${filter.year}`;
  }

  return String(filter.year);
}
