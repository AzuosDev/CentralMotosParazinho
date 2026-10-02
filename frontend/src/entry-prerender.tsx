/*
 * Entrada usada só no build: renderiza as páginas públicas para HTML estático,
 * que o plugin meugasto-seo (vite.config.ts) injeta dentro de <div id="root">.
 * Nada aqui vai para o bundle do navegador.
 *
 * São duas saídas:
 *
 *  - renderHome(): a landing, que vira o index.html. O <head> dela é o do
 *    próprio index.html, escrito à mão lá.
 *  - renderPublicPage(path): cada página temática, que vira o seu próprio
 *    arquivo HTML. Aqui o <head> é gerado também, porque title, description,
 *    canonical e JSON-LD mudam por rota — e é esse HTML que o robô de busca lê,
 *    já que a SPA não tem SSR em tempo de requisição.
 *
 * É renderToStaticMarkup, e não renderToString, porque o app monta com
 * createRoot e não com hydrateRoot (ver src/main.tsx): o React descarta esta
 * marcação e renderiza do zero. Ela existe para o robô que não executa JS e
 * para o primeiro paint. Se um dia o app passar a hidratar, troque para
 * renderToString — senão a hidratação acusa mismatch.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";

import { LandingPage } from "./pages/LandingPage";
import { PUBLIC_PAGE_COMPONENTS } from "./pages/publicas";
import { findPublicPage, pageJsonLd, type PublicPage } from "./content/public-pages";
import { siteUrl } from "../site.config";

/*
 * Só a página, sem os providers de main.tsx: nem a landing nem as páginas
 * temáticas consomem contexto (tema, auth, query), e todo acesso ao DOM delas
 * está dentro de useEffect, que não roda no servidor. O StaticRouter existe
 * porque os <Link> do cabeçalho, dos CTAs e dos links internos precisam de um
 * Router por perto.
 */
export function renderHome(): string {
  return renderToStaticMarkup(
    <StaticRouter location="/">
      <LandingPage />
    </StaticRouter>,
  );
}

/** Mantido como alias de renderHome para não quebrar chamada antiga. */
export const render = renderHome;

/** Escapa texto para dentro de um atributo HTML com aspas duplas. */
function attr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * JSON-LD como texto seguro para ir dentro de <script>: `<` escapado em <
 * para que nenhum valor possa fechar a tag.
 */
function jsonLdScript(page: PublicPage): string {
  const json = JSON.stringify(pageJsonLd(page, siteUrl), null, 2).replaceAll("<", "\\u003c");
  return `<script type="application/ld+json">\n${json}\n    </script>`;
}

/*
 * O <head> de uma página temática. Espelha as mesmas tags do index.html — é
 * de propósito: o que o robô recebe numa página pública não deve ser menos
 * completo do que o que ele recebe na home. A imagem continua sendo o ícone
 * quadrado do PWA, a única imagem de marca que existe, e por isso o card do X
 * segue "summary".
 */
function headFor(page: PublicPage): string {
  const canonical = siteUrl(page.path);
  const title = attr(page.title);
  const description = attr(page.description);

  return [
    `<title>${attr(page.title)}</title>`,
    `<meta name="description" content="${description}" />`,
    `<meta name="robots" content="index, follow" />`,
    `<link rel="canonical" href="${canonical}" />`,
    ``,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="MeuGasto" />`,
    `<meta property="og:locale" content="pt_BR" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:image" content="${siteUrl("/pwa-512x512.png")}" />`,
    `<meta property="og:image:width" content="512" />`,
    `<meta property="og:image:height" content="512" />`,
    `<meta property="og:image:alt" content="MeuGasto" />`,
    ``,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${siteUrl("/pwa-512x512.png")}" />`,
  ].join("\n    ");
}

export interface RenderedPublicPage {
  /** Conteúdo para dentro de <div id="root">. */
  markup: string;
  /** Tags de <head> específicas da rota. */
  head: string;
  /** O <script type="application/ld+json"> da rota. */
  jsonLd: string;
}

export function renderPublicPage(path: string): RenderedPublicPage {
  const page = findPublicPage(path);
  if (!page) throw new Error(`[prerender] rota pública desconhecida: ${path}`);

  const Pagina = PUBLIC_PAGE_COMPONENTS[page.id];

  return {
    markup: renderToStaticMarkup(
      <StaticRouter location={path}>
        <Pagina />
      </StaticRouter>,
    ),
    head: headFor(page),
    jsonLd: jsonLdScript(page),
  };
}
