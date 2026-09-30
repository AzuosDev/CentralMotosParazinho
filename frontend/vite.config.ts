import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { VitePWA } from "vite-plugin-pwa";
import { SITE_URL, robotsTxt, sitemapXml } from "./site.config";

/*
 * SEO: o index.html é o único HTML que o robô recebe (SPA sem SSR), então
 * canonical, Open Graph e JSON-LD moram lá, com o marcador __SITE_URL__ no
 * lugar do domínio. Aqui o marcador vira o valor real, e robots.txt/sitemap.xml
 * saem do mesmo site.config.ts — um domínio só, num lugar só.
 */
function seoPlugin(): Plugin {
  const files: Record<string, { body: string; type: string }> = {
    "/robots.txt": { body: robotsTxt(), type: "text/plain; charset=utf-8" },
    "/sitemap.xml": { body: sitemapXml(), type: "application/xml; charset=utf-8" },
  };

  return {
    name: "meugasto-seo",
    transformIndexHtml(html) {
      return html.replaceAll("__SITE_URL__", SITE_URL);
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
  };
}

export default defineConfig(() => ({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
  },
  plugins: [
    react(),
    seoPlugin(),
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
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-query": ["@tanstack/react-query"],
          "vendor-charts": ["recharts"],
        },
      },
    },
  },
}));
