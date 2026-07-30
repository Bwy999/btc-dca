const CACHE="btc-terminal-v21.7.2";
const SHELL=["./","./index.html","./apple-touch-icon.png"];

self.addEventListener("install",e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()).catch(()=>self.skipWaiting()));
});

self.addEventListener("activate",e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

self.addEventListener("fetch",e=>{
  const req=e.request;
  if(req.method!=="GET")return;
  const url=new URL(req.url);
  if(url.origin!==location.origin)return;
  if(url.searchParams.has("_head")||url.searchParams.has("_build"))return;

  e.respondWith(
    fetch(req).then(r=>{
      if(r&&r.ok){const cp=r.clone();caches.open(CACHE).then(c=>c.put(req,cp)).catch(()=>{})}
      return r;
    }).catch(()=>caches.match(req).then(r=>r||caches.match("./index.html")))
  );
});
