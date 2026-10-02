/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core';
import {
  precacheAndRoute,
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

import { PUBLIC_PAGES, pageFileName } from './content/public-pages';

declare const self: ServiceWorkerGlobalScope;

// Assume o controle imediatamente sem esperar o reload do usuário
self.skipWaiting();
clientsClaim();

// __WB_MANIFEST é substituído pelo vite-plugin-pwa com a lista de assets do build
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// "/" é a única rota com HTML pré-renderizado (a landing), e é esse arquivo
// que ela recebe também offline.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    allowlist: [/^\/$/],
  }),
);

// Cada página pública temática tem o seu próprio HTML pré-renderizado, com o
// conteúdo e o <head> dela (ver o plugin meugasto-seo em vite.config.ts). Elas
// são registradas antes do shell porque a primeira rota que casa é a que vale:
// cair no app.html aqui mostraria uma tela vazia até o React montar, e offline
// não mostraria nada.
for (const page of PUBLIC_PAGES) {
  registerRoute(
    new NavigationRoute(createHandlerBoundToURL(pageFileName(page)), {
      allowlist: [new RegExp(`^${page.path}/?$`)],
    }),
  );
}

// Todas as outras rotas caem no shell vazio, e não no index.html: o React
// Router cuida do resto. Servir o index.html aqui pintaria a landing inteira
// antes de o React trocar pelo conteúdo certo em cada deep link.
//
// A denylist são os arquivos de verdade que moram em public/ e que alguém pode
// abrir direto na barra de endereços: devolver HTML no lugar deles quebraria a
// leitura. Os robôs de busca não passam por service worker, mas os arquivos de
// verificação entram aqui do mesmo jeito para o que a gente vê no navegador
// bater com o que o Bing e o Google recebem.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('app.html'), {
    denylist: [
      /^\/api\//,
      /^\/robots\.txt$/,
      /^\/sitemap\.xml$/,
      /^\/BingSiteAuth\.xml$/,
      /^\/google[0-9a-f]+\.html$/,
      /^\/[0-9a-f]{32}\.txt$/, // chave do IndexNow
    ],
  }),
);

// API: network first, tenta rede, usa cache quando offline (TTL 24h, até 150 entradas)
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-responses',
    networkTimeoutSeconds: 10,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 }),
    ],
  }),
);
