"use strict";

const CACHE_NAME="btc-intelligence-v24-5-7-pwa-safe-top-hardened-20260824";
const CORE=[
  "./",
  "./index.html",
  "./ahr999.html",
  "./dca.html",
  "./floor.json",
  "./apple-touch-icon.png"
];

self.addEventListener("install",event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    await Promise.allSettled(CORE.map(url=>cache.add(new Request(url,{cache:"reload"}))));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key!==CACHE_NAME && (
      key.startsWith("btc-intelligence-") || key.startsWith("btc-dca-ledger-")
    )).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

async function networkFirst(request,fallbackUrl){
  const cache=await caches.open(CACHE_NAME);
  try{
    const response=await fetch(request);
    if(response&&response.ok)cache.put(request,response.clone());
    return response;
  }catch(error){
    return (await cache.match(request)) ||
           (fallbackUrl && await cache.match(fallbackUrl)) ||
           Response.error();
  }
}

self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET")return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;

  if(request.mode==="navigate"){
    const fallback=
      url.pathname.endsWith("/dca.html") ? "./dca.html" :
      url.pathname.endsWith("/ahr999.html") ? "./ahr999.html" :
      "./index.html";
    event.respondWith(networkFirst(request,fallback));
    return;
  }

  if(url.pathname.endsWith("/floor.json")){
    event.respondWith(networkFirst(request,"./floor.json"));
    return;
  }

  event.respondWith((async()=>{
    const cache=await caches.open(CACHE_NAME);
    const cached=await cache.match(request);
    const update=fetch(request).then(response=>{
      if(response&&response.ok)cache.put(request,response.clone());
      return response;
    }).catch(()=>null);
    return cached || (await update) || Response.error();
  })());
});
