/// <reference lib="webworker" />

// Courtesy of https://dev.to/100lvlmaster/create-a-pwa-with-sveltekit-svelte-a36
import { build, files, version } from '$service-worker';
import { handleRequestsWith } from 'worker-request-response';
import type {
  CheckStatusRequest,
  QueryDownloadsRequest,
  ServiceWorkerRequest,
} from '$lib/shared/lib';

const worker = self as unknown as ServiceWorkerGlobalScope;
const cacheName = `cache-${version}`;

// `build` is an array of all the files generated by the bundler,
// `files` is an array of everything in the `static` directory
const toCache = build.concat(files);
const staticAssets = new Set(toCache);

worker.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(cacheName)
      .then((cache) => cache.addAll(toCache))
      .then(() => worker.skipWaiting())
  );
});

worker.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      // delete old caches
      await Promise.all(keys.filter((key) => key !== cacheName).map((key) => caches.delete(key)));

      await worker.clients.claim();
    })
  );
});

/**
 * Fetch the asset from the network and store it in the cache.
 * Fall back to the cache if the user is offline.
 */
async function fetchAndCache(request: Request) {
  const cache = await caches.open(`offline-${version}`);
  const isAudio = request.url.endsWith('.mp3');
  if (isAudio) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
  }
  const shouldCache = new URL(request.url).searchParams.get('download') === 'true';

  try {
    const response = await fetch(request);
    if (!isAudio || shouldCache) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const response = await cache.match(request);
    if (response) return response;

    throw err;
  }
}

worker.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || event.request.headers.has('range')) return;

  const url = new URL(event.request.url);

  // don't try to handle e.g. data: URIs
  const isHttp = url.protocol.startsWith('http');
  const isDevServerRequest =
    url.hostname === self.location.hostname && url.port !== self.location.port;
  const isStaticAsset = url.host === self.location.host && staticAssets.has(url.pathname);
  const skipBecauseUncached = event.request.cache === 'only-if-cached' && !isStaticAsset;

  if (isHttp && !isDevServerRequest && !skipBecauseUncached) {
    event.respondWith(
      (async () => {
        // always serve static files and bundler-generated assets from cache.
        // if your application has other URLs with data that will never change,
        // set this variable to true for them and they will only be fetched once.
        const cachedAsset = isStaticAsset && (await caches.match(event.request));

        return cachedAsset || fetchAndCache(event.request);
      })()
    );
  }
});

async function isFilenameInCache(event: MessageEvent<CheckStatusRequest>): Promise<boolean> {
  const cache = await caches.open(`offline-${version}`);
  const cacheKeys = await cache.keys();
  return cacheKeys.some((request) => request.url.startsWith(event.data.payload));
}

async function getCachedEpisodes(_event: MessageEvent<QueryDownloadsRequest>): Promise<string[]> {
  const cache = await caches.open(`offline-${version}`);
  const cacheKeys = await cache.keys();
  const urls = cacheKeys.map((request) => request.url);
  return urls.filter((url) => new URL(url).pathname.endsWith('.mp3'));
}

self.addEventListener('message', (e: MessageEvent<{ payload: ServiceWorkerRequest }>) => {
  // TODO: figure out how to type this properly to use an object mapping instead
  switch (e.data.payload.type) {
    case 'check-download-status':
      return handleRequestsWith(isFilenameInCache)(e);
    case 'query-downloaded-episodes':
      return handleRequestsWith(getCachedEpisodes)(e);
    default:
      console.error('Unrecognized message:', e.data);
  }
});
