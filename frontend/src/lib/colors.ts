/*
 * Cores que precisam existir como valor literal em JavaScript, não como token
 * CSS: a cor de uma categoria chega da API como hex e é concatenada com alfa
 * (`${color}22`) para montar o fundo do ícone, o que só funciona com hex.
 * Todo o resto da identidade vive em src/styles.css — não acrescente cor aqui
 * sem que ela precise mesmo ser um literal.
 *
 * A paleta categórica espelha DEFAULT_CATEGORIES em
 * backend/src/modules/categories/data/default-categories.ts (não há pacote de
 * tipos compartilhado entre os dois projetos; ver CLAUDE.md). Se mudar lá,
 * mude aqui.
 */

/**
 * Oito matizes em ordem FIXA. A ordem é o mecanismo de segurança para
 * daltonismo, não enfeite: foi escolhida entre as 272 permutações que passam em
 * todas as travas do validador liderando pelo vermelho da marca (pior par
 * adjacente ΔE 9,2 CVD / 19,3 visão normal). Nunca cicle a lista e nunca
 * invente um nono matiz — o excedente cai em CATEGORY_NEUTRAL.
 *
 * Os passos são os do tema escuro (o padrão do app) e todos limpam 3:1 também
 * sobre o branco, porque cada categoria guarda um único hex para os dois temas.
 */
export const CATEGORY_PALETTE = [
  "#e66767", // 1 vermelho
  "#3987e5", // 2 azul
  "#d95926", // 3 laranja
  "#199e70", // 4 água
  "#9085e9", // 5 violeta
  "#c98500", // 6 amarelo
  "#d55181", // 7 magenta
  "#008300", // 8 verde
] as const;

/** Transferências, saques e categoria desconhecida: não são gasto, então recuam. */
export const CATEGORY_NEUTRAL = "#8a8a8a";

/** Entrada e saída quando a cor precisa ser literal (ilustração, célula de gráfico). */
export const INCOME_HEX = "#2fb85c";
export const EXPENSE_HEX = "#ff3b30";
