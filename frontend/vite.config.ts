import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { VitePWA } from "vite-plugin-pwa";
import { SITE_URL, robotsTxt, sitemapXml } from "./site.config";

// Saída do build SSR ("npm run build:prerender"), que exporta render().
const PRERENDER_DIR = ".prerender";
const PRERENDER_ENTRY = "entry-prerender.js";

// Shell da SPA, servido em toda rota que não seja "/". Só o "/" recebe o HTML
// pré-renderizado da landing — ver os rewrites em vercel.json e as rotas de
// navegação em src/sw.ts.
const SHELL_FILE = "app.html";

const ROOT_DIV = '<div id="root"></div>';

/**
 * Renderiza a landing para HTML usando o bundle SSR gerado antes do build do
 * cliente. Devolve null (com aviso) se o bundle não existir, para que um
 * "vite build" avulso ainda produza um index.html válido — só que sem
 * pré-renderização.
 */
async function renderLanding(): Promise<string | null> {
  const entry = path.resolve(process.cwd(), PRERENDER_DIR, PRERENDER_ENTRY);

  if (!fs.existsSync(entry)) {
    console.warn(
      "[meugasto-seo] " +
        PRERENDER_DIR +
        "/" +
        PRERENDER_ENTRY +
        ' não encontrado: index.html sai sem pré-renderização. Use "npm run build".',
    );
    return null;
  }

  const { render } = (await import(pathToFileURL(entry).href)) as { render: () => string };
  return render();
}

/*
 * SEO: o index.html é o único HTML que o robô recebe (SPA sem SSR), então
 * canonical, Open Graph e JSON-LD moram lá, com o marcador __SITE_URL__ no
 * lugar do domínio. Aqui o marcador vira o valor real, e robots.txt/sitemap.xml
 * saem do mesmo site.config.ts — um domínio só, num lugar só.
 */
function seoPlugin(isBuild: boolean): Plugin {
  const files: Record<string, { body: string; type: string }> = {
    "/robots.txt": { body: robotsTxt(), type: "text/plain; charset=utf-8" },
    "/sitemap.xml": { body: sitemapXml(), type: "application/xml; charset=utf-8" },
  };

  // Guardado no transformIndexHtml e gravado como app.html no writeBundle.
  let shell: string | null = null;

  return {
    name: "meugasto-seo",
    async transformIndexHtml(html) {
      const withDomain = html.replaceAll("__SITE_URL__", SITE_URL);

      // Em dev não há prerender: o Vite serve o index.html cru e o React monta
      // tudo, como sempre.
      if (!isBuild) return withDomain;

      shell = withDomain;

      const markup = await renderLanding();
      if (!markup) return withDomain;

      if (!withDomain.includes(ROOT_DIV)) {
        throw new Error("[meugasto-seo] não achei " + ROOT_DIV + " no index.html: o prerender não tem onde entrar.");
      }

      return withDomain.replace(ROOT_DIV, '<div id="root">' + markup + "</div>");
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
    },
    // Gravado aqui, e não via emitFile, para garantir que o arquivo já esteja
    // em disco quando o vite-plugin-pwa varrer o dist no closeBundle: o service
    // worker faz createHandlerBoundToURL("app.html") e quebra se o arquivo não
    // estiver no precache.
    writeBundle(options) {
      if (!isBuild || !shell) return;
      const dir = options.dir ?? "dist";
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, SHELL_FILE), shell);
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
