"use strict";

const SW_BUILD = "26.2.2-20261010";
const CACHE_NAME = "btc-intelligence-v26-2-2-20261010";
const CACHE_PREFIX = "btc-site:" + self.registration.scope + ":";
const SCOPED_CACHE = CACHE_PREFIX + CACHE_NAME;
// 带内容哈希的静态资源。文件内容不变，文件名就不变，更新时无需重新下载。
const ASSETS = /*ASSETS*/[
  "./assets/app.9175cb74a2.css",
  "./assets/lightweight-charts.682f74d8c4.js",
  "./assets/seed-cycle.5a6f45f52a.js",
  "./assets/app.e33d3ddda6.js",
  "./assets/ext-1.70c40104f9.js",
  "./assets/ext-2.b79b59fafd.js",
  "./assets/ext-3.2b40ad0eca.js",
  "./assets/ext-4.fff1702e6f.js",
  "./assets/ext-5.65add82144.js",
  "./assets/ext-6.768208e945.js",
  "./assets/ext-7.8f5b902cbd.js",
  "./assets/ext-8.15eeb9601c.js",
  "./assets/ext-9.2d6ec46993.js",
  "./assets/ext-10.4ba957689e.js",
  "./assets/ext-11.4080454237.js",
  "./assets/ext-12.de1fcc1f56.js",
  "./assets/ext-13.e50f1b7249.js",
  "./assets/ext-14.482521f5c5.js",
  "./assets/ext-15.cef25ca042.js",
  "./assets/ext-16.f53708b46c.js",
  "./assets/ext-17.0e3a4a939f.js",
]/*END*/;
const ASSET_CACHE = CACHE_PREFIX + "assets";
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
    // 新版本用到的资源必须全部就绪，否则保留旧版本，避免页面引用缺失文件。
    const assetCache = await caches.open(ASSET_CACHE);
    for (const url of ASSETS) {
      if (await assetCache.match(url)) continue;
      const res = await fetch(new Request(url, { cache: "reload" }));
      if (!res.ok) throw new Error("Asset missing: " + url);
      await assetCache.put(url, res);
    }
    // An existing client keeps its worker until the user explicitly confirms.
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Only clean our own scope. Legacy/ledger/other-site caches are not ours to delete.
    const obsolete = keys.filter((key) => key !== SCOPED_CACHE && key !== ASSET_CACHE && key.startsWith(CACHE_PREFIX));
    await Promise.allSettled(obsolete.map((key) => caches.delete(key)));
    // 资源缓存只删除当前版本不再使用的文件
    try {
      const assetCache = await caches.open(ASSET_CACHE);
      const keep = new Set(ASSETS.map((u) => new URL(u, self.registration.scope).href));
      for (const req of await assetCache.keys()) if (!keep.has(req.url)) await assetCache.delete(req);
    } catch (_) {}
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

  if (url.pathname.includes("/assets/")) {
    event.respondWith((async () => {
      const assetCache = await caches.open(ASSET_CACHE).catch(() => null);
      const hit = assetCache ? await assetCache.match(request).catch(() => null) : null;
      if (hit) return hit;
      const res = await fetch(request);
      if (res.ok && assetCache) try { await assetCache.put(request, res.clone()); } catch (_) {}
      return res;
    })());
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
