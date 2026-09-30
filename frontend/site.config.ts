/*
 * Fonte única do domínio público do MeuGasto e dos artefatos de SEO derivados dele.
 *
 * O domínio só aparece aqui: o plugin `meugasto-seo` (vite.config.ts) troca o
 * marcador __SITE_URL__ no index.html e gera robots.txt e sitemap.xml a partir
 * destas funções. Para migrar para um domínio próprio, troque SITE_URL e
 * refaça o build — nada mais precisa mudar.
 */

/** Sem barra no final; use `siteUrl("/caminho")` para montar URLs. */
export const SITE_URL = "https://meugasto.vercel.app";

export function siteUrl(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/*
 * Rotas públicas que entram no sitemap. Só entra aqui página que um visitante
 * deslogado consegue ver e que queremos indexada — nada de /dashboard, /faq,
 * /checkout ou qualquer rota atrás do PrivateRoute.
 *
 * "/" é a própria landing (RootRoute renderiza LandingPage para quem não está
 * logado); "/landing" continua existindo como rota, mas aponta canonical para
 * "/" e por isso fica de fora daqui.
 *
 * `lastmod` é a data da última mudança de conteúdo da landing — atualize à mão
 * quando o texto mudar, em vez de usar a data do build (todo deploy viraria
 * "conteúdo novo" e o sinal perde o valor).
 */
const PUBLIC_ROUTES: { path: string; lastmod: string; changefreq: string; priority: string }[] = [
  { path: "/", lastmod: "2026-09-30", changefreq: "monthly", priority: "1.0" },
];

export function robotsTxt(): string {
  return [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${siteUrl("/sitemap.xml")}`,
    "",
  ].join("\n");
}

export function sitemapXml(): string {
  const urls = PUBLIC_ROUTES.map(
    ({ path, lastmod, changefreq, priority }) =>
      [
        "  <url>",
        `    <loc>${siteUrl(path)}</loc>`,
        `    <lastmod>${lastmod}</lastmod>`,
        `    <changefreq>${changefreq}</changefreq>`,
        `    <priority>${priority}</priority>`,
        "  </url>",
      ].join("\n"),
  ).join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    "</urlset>",
    "",
  ].join("\n");
}
