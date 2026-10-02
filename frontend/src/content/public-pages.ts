/*
 * Fonte única das páginas públicas temáticas do MeuGasto.
 *
 * Tudo que descreve uma dessas páginas fora do seu próprio texto mora aqui:
 * caminho, title, description, H1, rótulo do breadcrumb e páginas
 * relacionadas. Quem consome:
 *
 *  - site.config.ts       → sitemap.xml e a notificação do IndexNow;
 *  - src/entry-prerender  → o <head> e o HTML estático de cada rota no build;
 *  - src/hooks/useSeo     → o mesmo <head> em navegação interna (SPA);
 *  - src/sw.ts            → a rota de navegação que serve o HTML certo offline;
 *  - vite.config.ts       → confere os rewrites do vercel.json contra esta lista.
 *
 * Este módulo é TypeScript puro de propósito: ele é importado pelo service
 * worker e pela configuração do Vite, onde não existe React nem DOM. E não
 * importa site.config.ts — é o contrário, para não fechar um ciclo; as funções
 * que precisam de URL absoluta recebem o montador de URL por parâmetro.
 */

/** Slug de cada página, usado como chave em `relacionadas`. */
export type PublicPageId =
  | "controle-financeiro-pessoal"
  | "controle-de-gastos"
  | "controle-de-cartao"
  | "controle-de-contas"
  | "metas-financeiras"
  | "importar-extrato-ofx"
  | "sobre-o-meugasto";

export interface PublicPage {
  id: PublicPageId;
  /** Caminho da rota, com barra inicial. É também o canonical (sem barra final). */
  path: string;
  /** <title> e og:title. Único entre as páginas — há teste garantindo. */
  title: string;
  /** meta description e og:description. Única entre as páginas. */
  description: string;
  /** O único <h1> da página. */
  h1: string;
  /** Último item do breadcrumb, e rótulo nos links internos. */
  breadcrumb: string;
  /** Uma linha sobre o que a página cobre, usada nos cards de link interno. */
  resumo: string;
  /** Páginas relacionadas, na ordem em que aparecem no fim do conteúdo. */
  relacionadas: PublicPageId[];
  /**
   * Data da última mudança de conteúdo, para o sitemap. Atualize à mão quando
   * o texto da página mudar — a data do build faria todo deploy parecer
   * conteúdo novo e o sinal perderia valor.
   */
  lastmod: string;
  /**
   * Tipo do nó de página no JSON-LD. "AboutPage" só em /sobre-o-meugasto, que
   * é de fato a página sobre a entidade; as outras são WebPage comum.
   */
  schemaType?: "WebPage" | "AboutPage";
}

const CONTENT_DATE = "2026-10-02";

export const PUBLIC_PAGES: PublicPage[] = [
  {
    id: "controle-financeiro-pessoal",
    path: "/controle-financeiro-pessoal",
    title: "Controle Financeiro Pessoal | MeuGasto",
    description:
      "O MeuGasto é um aplicativo de controle financeiro pessoal: saldo das carteiras, cartão de crédito, contas a pagar e metas em um só lugar, sem conectar ao banco.",
    h1: "Controle financeiro pessoal em um só lugar",
    breadcrumb: "Controle Financeiro Pessoal",
    resumo:
      "O que é controle financeiro pessoal e como o MeuGasto organiza carteiras, cartão, contas e metas.",
    relacionadas: [
      "controle-de-gastos",
      "controle-de-cartao",
      "controle-de-contas",
      "metas-financeiras",
      "sobre-o-meugasto",
    ],
    lastmod: CONTENT_DATE,
  },
  {
    id: "controle-de-gastos",
    path: "/controle-de-gastos",
    title: "Controle de Gastos Pessoais | MeuGasto",
    description:
      "Lance seus gastos por categoria, acompanhe o total de cada mês e veja para onde o dinheiro foi. No MeuGasto você digita os lançamentos ou importa o extrato em OFX.",
    h1: "Controle seus gastos com mais clareza",
    breadcrumb: "Controle de Gastos",
    resumo: "Lançamento de despesas, categorias e o acompanhamento de quanto saiu em cada mês.",
    relacionadas: ["controle-financeiro-pessoal", "importar-extrato-ofx", "controle-de-cartao"],
    lastmod: CONTENT_DATE,
  },
  {
    id: "controle-de-cartao",
    path: "/controle-de-cartao",
    title: "Controle de Cartão e Parcelas | MeuGasto",
    description:
      "Acompanhe a fatura de cada mês, parcelamentos que se espalham pelos ciclos, pagamento parcial e estorno — e veja o que é saldo e o que é dívida do cartão.",
    h1: "Controle de cartão, faturas e parcelas",
    breadcrumb: "Controle de Cartão",
    resumo: "Faturas por ciclo, parcelamentos, pagamento parcial, estorno e a dívida separada do saldo.",
    relacionadas: ["controle-financeiro-pessoal", "controle-de-gastos", "controle-de-contas"],
    lastmod: CONTENT_DATE,
  },
  {
    id: "controle-de-contas",
    path: "/controle-de-contas",
    title: "Controle de Contas a Pagar | MeuGasto",
    description:
      "Cadastre contas a pagar e a receber com vencimento, recorrência e parcelas. O MeuGasto avisa o que vence hoje e o que já passou do prazo.",
    h1: "Organize suas contas a pagar",
    breadcrumb: "Controle de Contas",
    resumo: "Vencimentos, contas recorrentes, contas a receber e o aviso do que está vencendo.",
    relacionadas: ["controle-financeiro-pessoal", "metas-financeiras"],
    lastmod: CONTENT_DATE,
  },
  {
    id: "metas-financeiras",
    path: "/metas-financeiras",
    title: "Metas Financeiras Pessoais | MeuGasto",
    description:
      "Defina quanto quer juntar, com prazo ou sem prazo, e acompanhe o progresso. Ao vincular uma categoria, os lançamentos dela somam na meta sozinhos.",
    h1: "Acompanhe suas metas financeiras",
    breadcrumb: "Metas Financeiras",
    resumo: "Valor-alvo, prazo, progresso e a categoria vinculada que alimenta a meta automaticamente.",
    relacionadas: ["controle-financeiro-pessoal", "controle-de-gastos"],
    lastmod: CONTENT_DATE,
  },
  {
    id: "importar-extrato-ofx",
    path: "/importar-extrato-ofx",
    title: "Importar Extrato OFX e Organizar Gastos | MeuGasto",
    description:
      "O que é um arquivo OFX e como o MeuGasto importa o extrato do seu banco sugerindo categoria e ignorando o que já estava lançado, sem conectar diretamente ao banco.",
    h1: "Importe seu extrato OFX e organize seus lançamentos",
    breadcrumb: "Importar Extrato OFX",
    resumo: "O que é OFX, como a importação funciona e por que ela não conecta ao banco.",
    relacionadas: ["controle-de-gastos", "controle-financeiro-pessoal"],
    lastmod: CONTENT_DATE,
  },
  {
    id: "sobre-o-meugasto",
    path: "/sobre-o-meugasto",
    title: "Sobre o MeuGasto | Controle Financeiro Pessoal",
    description:
      "O MeuGasto é um aplicativo de controle financeiro pessoal desenvolvido pela Azuos Dev. Veja qual problema ele resolve, para quem foi feito e o que tem dentro.",
    h1: "Sobre o MeuGasto",
    breadcrumb: "Sobre o MeuGasto",
    resumo: "O que é o MeuGasto, qual problema resolve e quem desenvolve o produto.",
    relacionadas: [
      "controle-financeiro-pessoal",
      "controle-de-gastos",
      "controle-de-cartao",
      "controle-de-contas",
      "metas-financeiras",
      "importar-extrato-ofx",
    ],
    lastmod: CONTENT_DATE,
    schemaType: "AboutPage",
  },
];

/** Nome do arquivo HTML pré-renderizado da rota, na raiz do dist. */
export function pageFileName(page: Pick<PublicPage, "path">): string {
  return `${page.path.replace(/^\//, "")}.html`;
}

export function findPublicPage(path: string): PublicPage | undefined {
  return PUBLIC_PAGES.find((page) => page.path === path);
}

export function publicPage(id: PublicPageId): PublicPage {
  const page = PUBLIC_PAGES.find((candidate) => candidate.id === id);
  if (!page) throw new Error(`[public-pages] página desconhecida: ${id}`);
  return page;
}

/** Caminhos das páginas temáticas, na ordem de PUBLIC_PAGES. */
export const PUBLIC_PAGE_PATHS: string[] = PUBLIC_PAGES.map((page) => page.path);

/*
 * JSON-LD de uma página temática.
 *
 * Só descreve o que está visível: a própria página (WebPage/AboutPage), a
 * trilha que o breadcrumb mostra na tela e as entidades que já existem no
 * @graph da home — o site, a Azuos Dev e o aplicativo — repetidas aqui em
 * forma mínima, com os mesmos @id, para que cada página seja legível sozinha.
 * Nada de nota, número de usuários, prêmio ou preço: preço é assunto da home,
 * que é onde os valores aparecem de fato na tela.
 */
export function pageJsonLd(page: PublicPage, absolute: (path: string) => string): unknown {
  const pageUrl = absolute(page.path);
  const home = absolute("/");

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${home}#website`,
        name: "MeuGasto",
        url: home,
        inLanguage: "pt-BR",
        publisher: { "@id": `${home}#azuos` },
      },
      {
        "@type": "Organization",
        "@id": `${home}#azuos`,
        name: "Azuos Dev",
        url: "https://azuos-dev.vercel.app/",
      },
      {
        "@type": ["SoftwareApplication", "WebApplication"],
        "@id": `${home}#app`,
        name: "MeuGasto",
        url: home,
        applicationCategory: "FinanceApplication",
        applicationSubCategory: "Controle financeiro pessoal",
        operatingSystem: "Web",
        inLanguage: "pt-BR",
        publisher: { "@id": `${home}#azuos` },
      },
      {
        "@type": page.schemaType ?? "WebPage",
        "@id": `${pageUrl}#webpage`,
        url: pageUrl,
        name: page.title,
        description: page.description,
        inLanguage: "pt-BR",
        isPartOf: { "@id": `${home}#website` },
        about: { "@id": `${home}#app` },
        breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${pageUrl}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Início", item: home },
          { "@type": "ListItem", position: 2, name: page.breadcrumb, item: pageUrl },
        ],
      },
    ],
  };
}
