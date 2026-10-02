import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { VitePWA } from "vite-plugin-pwa";
import { SITE_URL, robotsTxt, sitemapXml, indexNowKeyFile } from "./site.config";
import { PUBLIC_PAGES, PUBLIC_PAGE_PATHS, pageFileName } from "./src/content/public-pages";

// Saída do build SSR ("npm run build:prerender"), que exporta renderHome() e
// renderPublicPage().
const PRERENDER_DIR = ".prerender";
const PRERENDER_ENTRY = "entry-prerender.js";

// Shell da SPA, servido em toda rota que não seja "/" nem uma das páginas
// públicas temáticas: /login, /register, /checkout, o dashboard e o resto do
// app — ver os rewrites em vercel.json e as rotas de navegação em src/sw.ts.
const SHELL_FILE = "app.html";

const ROOT_DIV = '<div id="root"></div>';

// Trechos do index.html que o shell precisa alterar. Ficam aqui como constantes
// para o build quebrar alto se alguém mexer no cabeçalho e esquecer do shell.
const ROBOTS_INDEX = '<meta name="robots" content="index, follow" />';
const ROBOTS_NOINDEX = '<meta name="robots" content="noindex, follow" />';
// A linha inteira, com a indentação e a quebra — que é CRLF no index.html.
const CANONICAL_LINE = /[ \t]*<link rel="canonical"[^>]*>\r?\n/;

// Regiões marcadas no index.html que são específicas de "/" e trocadas em cada
// página temática. Ver o comentário dos marcadores no próprio index.html.
const HEAD_REGION = /<!-- meugasto-seo:head -->[\s\S]*?<!-- \/meugasto-seo:head -->/;
const JSONLD_REGION = /<!-- meugasto-seo:jsonld -->[\s\S]*?<!-- \/meugasto-seo:jsonld -->/;

/**
 * Deriva o shell (app.html) do index.html.
 *
 * O shell atende toda rota que não é "/": /login, /register, /checkout, o
 * dashboard e o resto do app, além de /landing, que é cópia da home. Nenhuma
 * delas tem o que fazer num índice de busca, então o shell vai com noindex —
 * o index.html é o único arquivo que pede indexação.
 *
 * O canonical sai junto: numa página noindex, apontar canonical para outra URL
 * é sinal contraditório. O noindex sozinho é a instrução mais clara.
 */
function toShell(html: string): string {
  if (!html.includes(ROBOTS_INDEX)) {
    throw new Error("[meugasto-seo] não achei a meta robots do index.html para gerar o shell.");
  }
  if (!CANONICAL_LINE.test(html)) {
    throw new Error("[meugasto-seo] não achei o canonical do index.html para remover do shell.");
  }

  return html.replace(ROBOTS_INDEX, ROBOTS_NOINDEX).replace(CANONICAL_LINE, "");
}

interface RenderedPublicPage {
  markup: string;
  head: string;
  jsonLd: string;
}

interface PrerenderModule {
  renderHome: () => string;
  renderPublicPage: (path: string) => RenderedPublicPage;
}

/**
 * Carrega o bundle SSR gerado antes do build do cliente. Devolve null (com
 * aviso) se ele não existir, para que um "vite build" avulso ainda produza um
 * index.html válido — só que sem pré-renderização, e sem as páginas temáticas.
 */
async function loadPrerender(): Promise<PrerenderModule | null> {
  const entry = path.resolve(process.cwd(), PRERENDER_DIR, PRERENDER_ENTRY);

  if (!fs.existsSync(entry)) {
    console.warn(
      "[meugasto-seo] " +
        PRERENDER_DIR +
        "/" +
        PRERENDER_ENTRY +
        ' não encontrado: index.html sai sem pré-renderização e as páginas públicas temáticas não são geradas. Use "npm run build".',
    );
    return null;
  }

  return (await import(pathToFileURL(entry).href)) as PrerenderModule;
}

/**
 * Monta o HTML de uma página temática a partir do index.html já transformado
 * pelo Vite — é dele que vêm os <script> e <link> com o hash do build, para que
 * a página carregue o mesmo bundle da SPA.
 */
function toPublicPage(html: string, rendered: RenderedPublicPage, rota: string): string {
  if (!HEAD_REGION.test(html)) {
    throw new Error("[meugasto-seo] não achei os marcadores meugasto-seo:head no index.html.");
  }
  if (!JSONLD_REGION.test(html)) {
    throw new Error("[meugasto-seo] não achei os marcadores meugasto-seo:jsonld no index.html.");
  }
  if (!html.includes(ROOT_DIV)) {
    throw new Error("[meugasto-seo] não achei " + ROOT_DIV + " no index.html: o prerender de " + rota + " não tem onde entrar.");
  }

  return html
    .replace(HEAD_REGION, rendered.head)
    .replace(JSONLD_REGION, rendered.jsonLd)
    .replace(ROOT_DIV, '<div id="root">' + rendered.markup + "</div>");
}

/**
 * Confere que o vercel.json entrega cada página temática como o seu próprio
 * arquivo HTML. Sem o rewrite, a rota cairia no catch-all e receberia o
 * app.html — que é noindex: a página existiria para o usuário e seria invisível
 * para busca, o pior dos dois mundos e difícil de perceber. Por isso o build
 * para aqui em vez de avisar.
 */
function checkVercelRewrites(): void {
  const file = path.resolve(process.cwd(), "vercel.json");
  if (!fs.existsSync(file)) {
    throw new Error("[meugasto-seo] vercel.json não encontrado.");
  }

  const config = JSON.parse(fs.readFileSync(file, "utf8")) as {
    rewrites?: { source: string; destination: string }[];
  };
  const rewrites = config.rewrites ?? [];

  const faltando = PUBLIC_PAGES.filter((page) => {
    const destino = `/${pageFileName(page)}`;
    return !rewrites.some((rule) => rule.source === page.path && rule.destination === destino);
  });

  if (faltando.length > 0) {
    throw new Error(
      "[meugasto-seo] vercel.json sem rewrite para: " +
        faltando.map((page) => `${page.path} -> /${pageFileName(page)}`).join(", "),
    );
  }

  // O catch-all tem de ser a última regra, senão ele engole as anteriores.
  const catchAll = rewrites.findIndex((rule) => rule.source === "/(.*)");
  if (catchAll !== -1 && catchAll !== rewrites.length - 1) {
    throw new Error('[meugasto-seo] o rewrite "/(.*)" do vercel.json precisa ser o último.');
  }
}

/*
 * SEO: o index.html é o único HTML que o robô recebe (SPA sem SSR), então
 * canonical, Open Graph e JSON-LD moram lá, com o marcador __SITE_URL__ no
 * lugar do domínio. Aqui o marcador vira o valor real, e robots.txt/sitemap.xml
 * saem do mesmo site.config.ts — um domínio só, num lugar só.
 */
function seoPlugin(isBuild: boolean): Plugin {
  const keyFile = indexNowKeyFile();

  const files: Record<string, { body: string; type: string }> = {
    "/robots.txt": { body: robotsTxt(), type: "text/plain; charset=utf-8" },
    "/sitemap.xml": { body: sitemapXml(), type: "application/xml; charset=utf-8" },
    [`/${keyFile.name}`]: { body: keyFile.body, type: "text/plain; charset=utf-8" },
  };

  // Preenchidos no transformIndexHtml e gravados em disco no writeBundle:
  // o shell da SPA e um HTML por página pública temática.
  let shell: string | null = null;
  const paginas = new Map<string, string>();

  return {
    name: "meugasto-seo",
    async transformIndexHtml(html) {
      const withDomain = html
        .replaceAll("__SITE_URL__", SITE_URL)
        .replaceAll("__PUBLIC_PATHS__", JSON.stringify(PUBLIC_PAGE_PATHS));

      // Em dev não há prerender: o Vite serve o index.html cru e o React monta
      // tudo, como sempre. As rotas temáticas funcionam pelo React Router.
      if (!isBuild) return withDomain;

      checkVercelRewrites();

      shell = toShell(withDomain);

      const prerender = await loadPrerender();
      if (!prerender) return withDomain;

      // Cada página temática sai do index.html transformado, antes de ele
      // receber a marcação da landing.
      for (const page of PUBLIC_PAGES) {
        paginas.set(
          pageFileName(page),
          toPublicPage(withDomain, prerender.renderPublicPage(page.path), page.path),
        );
      }

      if (!withDomain.includes(ROOT_DIV)) {
        throw new Error("[meugasto-seo] não achei " + ROOT_DIV + " no index.html: o prerender não tem onde entrar.");
      }

      return withDomain.replace(ROOT_DIV, '<div id="root">' + prerender.renderHome() + "</div>");
    },
    // Em dev os dois arquivos não existem em public/, então são servidos daqui
    // para dar pra conferir localmente exatamente o que vai pro ar.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = files[(req.url ?? "").split("?")[0]];
        if (!file) return next();
        res.setHeader("Content-Type", file.type);
        res.end(file.body);
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "robots.txt", source: files["/robots.txt"].body });
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: files["/sitemap.xml"].body });
      this.emitFile({ type: "asset", fileName: keyFile.name, source: keyFile.body });
    },
    // Gravados aqui, e não via emitFile, para garantir que os arquivos já
    // estejam em disco quando o vite-plugin-pwa varrer o dist no closeBundle: o
    // service worker faz createHandlerBoundToURL() para o app.html e para cada
    // página temática, e quebra se o arquivo não estiver no precache.
    writeBundle(options) {
      if (!isBuild) return;
      const dir = options.dir ?? "dist";
      fs.mkdirSync(dir, { recursive: true });

      if (shell) fs.writeFileSync(path.join(dir, SHELL_FILE), shell);
      for (const [file, html] of paginas) {
        fs.writeFileSync(path.join(dir, file), html);
      }
    },
  };
}

export default defineConfig(({ command, isSsrBuild }) => ({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
  },
  plugins: [
    react(),
    seoPlugin(command === "build" && !isSsrBuild),
    // O build SSR só existe para gerar o HTML da landing: não tem index.html
    // nem assets para precachear, então o PWA fica de fora dele.
    ...(isSsrBuild
      ? []
      : [
          VitePWA({
            registerType: "autoUpdate",
            strategies: "injectManifest",
            srcDir: "src",
            filename: "sw.ts",
            includeAssets: ["favicon.svg", "manifest.json", "icons/*.svg"],
            manifest: false,
            injectManifest: {
              globPatterns: ["**/*.{js,css,html,svg,ico,woff,woff2}"],
            },
            devOptions: {
              enabled: true,
              type: "module",
            },
          }),
        ]),
    ...(process.env.ANALYZE === "true"
      ? [visualizer({ open: true, filename: "dist/stats.html" })]
      : []),
  ],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: isSsrBuild
        ? {}
        : {
            manualChunks: {
              "vendor-react": ["react", "react-dom", "react-router-dom"],
              "vendor-query": ["@tanstack/react-query"],
              "vendor-charts": ["recharts"],
            },
          },
    },
  },
}));
