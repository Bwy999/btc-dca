"use strict";

const SW_BUILD = "27.12.8-20261121";
const CACHE_NAME = "btc-intelligence-v" + SW_BUILD.replace(/\./g, "-");
const CACHE_PREFIX = "btc-site:" + self.registration.scope + ":";
const SCOPED_CACHE = CACHE_PREFIX + CACHE_NAME;
// 带内容哈希的静态资源。文件内容不变，文件名就不变，更新时无需重新下载。
const ASSETS = /*ASSETS*/[
  "./assets/app.02bac4c6b8.css",
  "./assets/lightweight-charts.682f74d8c4.js",
  "./assets/seed-cycle.5a6f45f52a.js",
  "./assets/app.55e8f7df82.js",
  "./assets/insight.67c8b7276d.js",
  "./assets/ext-bundle.dde1fb2048.js",
]/*END*/;
// 按需下载的资源（英文对照表）：不预缓存，但版本切换时不删除
const OPTIONAL_ASSETS = /*OPTIONAL*/["./assets/i18n-en.3d4cc58f98.js"]/*OEND*/;
const ASSET_CACHE = CACHE_PREFIX + "assets";
const CORE = [
  "./",
  "./index.html",
  "./ahr999.html",
  "./old-coins.html",
  "./dca.html",
  "./apple-touch-icon.png",
  "./manifest.webmanifest",
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
    const missing = [];
    for (const url of ASSETS) {
      if (!(await assetCache.match(url))) missing.push(url);
    }
    // 并发池预缓存（每次最多 6 个），兼顾弱网速度与完整性
    let idx = 0;
    const workers = Array.from({ length: Math.min(6, missing.length) }, async () => {
      while (idx < missing.length) {
        const url = missing[idx++];
        const res = await fetch(new Request(url, { cache: "reload" }));
        if (!res.ok) throw new Error("Asset missing: " + url);
        await assetCache.put(url, res);
      }
    });
    await Promise.all(workers);
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
      const keep = new Set(ASSETS.concat(OPTIONAL_ASSETS).map((u) => new URL(u, self.registration.scope).href));
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
    if (response?.type === "opaqueredirect") return response;
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
  // 放行 /v28 与 /v28/*（含不带末尾斜杠时的 301 跳转），不交由 V27 首页兜底
  if (/\/v28(\/|$)/.test(url.pathname)) return;

  if (url.searchParams.has("_btc_update") || url.pathname.endsWith("/sw.js")) {
    event.respondWith(fetch(new Request(request, {cache:"no-store"})));
    return;
  }

  // 预先计算的数据（data/*.json）：优先取网络上的最新版本；只有合法 JSON（v === 1）才写入缓存，
  // HTTP 错误、返回网页或损坏的 JSON 时继续使用最近一份有效缓存（V26.4.5）
  if (url.pathname.includes("/data/")) {
    event.respondWith((async () => {
      const key = new Request(url.origin + url.pathname);
      const c = await caches.open(SCOPED_CACHE).catch(() => null);
      const cached = async () => (c ? await c.match(key).catch(() => null) : null);
      try {
        const res = await fetch(new Request(request, {cache:"no-store"}));
        if (res.ok) {
          let valid = false;
          try { const j = JSON.parse(await res.clone().text()); valid = !!j && typeof j === "object" && j.v === 1; } catch (_) {}
          if (valid) { if (c) try { await c.put(key, res.clone()); } catch (_) {} return res; }
        }
        const hit = await cached();
        return hit || res;
      } catch (_) {
        const hit = await cached();
        return hit || Response.error();
      }
    })());
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
    if (url.pathname.includes("/v28/")) {
      event.respondWith(networkFirst(request, null));
      return;
    }
    const fallback = url.pathname.endsWith("/dca.html")
      ? "./dca.html"
      : url.pathname.endsWith("/ahr999.html")
        ? "./ahr999.html"
        : url.pathname.endsWith("/old-coins.html")
          ? "./old-coins.html"
          : "./index.html";
    event.respondWith(networkFirst(request, fallback));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, event));
});
