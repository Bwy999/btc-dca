"use strict";

const SW_BUILD = "25.1.24-20261002";
const CACHE_NAME = "btc-intelligence-v25-1-24-ste-copy-20261002";
const CACHE_PREFIX = "btc-site:" + self.registration.scope + ":";
const SCOPED_CACHE = CACHE_PREFIX + CACHE_NAME;
const CORE = [
  "./",
  "./index.html",
  "./ahr999.html",
  "./dca.html",
  "./apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SCOPED_CACHE);
    const page = await fetch(new Request("./index.html", {cache:"no-store"}));
    if (!page.ok || !(await page.clone().text()).includes('const BUILD_ID="' + SW_BUILD + '"')) {
      throw new Error("Page and worker builds differ; keep existing worker");
    }
    await cache.put("./index.html", page.clone());
    await cache.put("./", page);
    await Promise.allSettled(CORE.slice(2).map((url) => cache.add(new Request(url, { cache: "reload" }))));
    // An existing client keeps its worker until the user explicitly confirms.
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Only clean our own scope. Legacy/ledger/other-site caches are not ours to delete.
    const obsolete = keys.filter((key) => key !== SCOPED_CACHE && key.startsWith(CACHE_PREFIX));
    await Promise.allSettled(obsolete.map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "BTC_GET_VERSION") {
    event.ports?.[0]?.postMessage({build:SW_BUILD,cache:SCOPED_CACHE});
  }
  if (event.data?.type === "BTC_ACTIVATE_UPDATE" && event.data.build === SW_BUILD) {
    event.waitUntil(self.skipWaiting());
  }
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(SCOPED_CACHE).catch(() => null);
  try {
    const response = await fetch(request);
    if (!response?.ok) throw new Error(`HTTP ${response?.status || 0}`);
    if(cache)try { await cache.put(request, response.clone()); } catch (_) {}
    return response;
  } catch {
    return (cache ? await cache.match(request).catch(() => null) : null)
      || (cache && fallbackUrl ? await cache.match(fallbackUrl).catch(() => null) : null)
      || Response.error();
  }
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(SCOPED_CACHE).catch(() => null);
  const cached = cache ? await cache.match(request).catch(() => null) : null;
  const update = fetch(request).then(async (response) => {
    if (!response?.ok) return null;
    if(cache)try { await cache.put(request, response.clone()); } catch (_) {}
    return response;
  }).catch(() => null);
  event.waitUntil(update);
  return cached || await update || Response.error();
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.searchParams.has("_btc_update") || url.pathname.endsWith("/sw.js")) {
    event.respondWith(fetch(new Request(request, {cache:"no-store"})));
    return;
  }

  if (request.mode === "navigate") {
    const fallback = url.pathname.endsWith("/dca.html")
      ? "./dca.html"
      : url.pathname.endsWith("/ahr999.html")
        ? "./ahr999.html"
        : "./index.html";
    event.respondWith(networkFirst(request, fallback));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, event));
});
