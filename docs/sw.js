'use strict';
const CACHE="neon-energy-atlas-r-66934c1595aa842e";
const FILES=["./", "./version.json", "./app.js", "./assets/apple-touch-icon.png", "./assets/icon-192.png", "./assets/icon-512.png", "./assets/icon-maskable.png", "./assets/icon.svg", "./assets/qr.png", "./assets/qr.svg", "./data/countries.json", "./data/datacenters.json", "./data/nuclear.json", "./data/world.json", "./index.html", "./manifest.webmanifest", "./style.css", "./vendor/MarkerCluster.css", "./vendor/d3.min.js", "./vendor/leaflet.css", "./vendor/leaflet.js", "./vendor/leaflet.markercluster.js", "./vendor/topojson-client.min.js"];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)));});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{for(const key of await caches.keys()){if(key.startsWith('neon-energy-atlas-')&&key!==CACHE)await caches.delete(key);}await self.clients.claim();})());});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(new URL(self.registration.scope).pathname))return;
  event.respondWith((async()=>{
    const cached=await caches.match(event.request,{ignoreSearch:true});
    if(cached)return cached;
    try{return await fetch(event.request);}catch(e){if(event.request.mode==='navigate')return caches.match('./index.html');throw e;}
  })());
});
