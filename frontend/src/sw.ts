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

declare const self: ServiceWorkerGlobalScope;

// Assume o controle imediatamente sem esperar o reload do usuário
self.skipWaiting();
clientsClaim();

// __WB_MANIFEST é substituído pelo vite-plugin-pwa com a lista de assets do build
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Toda rota que não seja /api cai no index.html (React Router cuida do resto)
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//],
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
