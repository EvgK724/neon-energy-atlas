'use strict';
const CACHE="neon-energy-atlas-r-5ce8aeb247b40439",FILES=["./", "./version.json", "./app.js", "./assets/apple-touch-icon.png", "./assets/icon-192.png", "./assets/icon-512.png", "./assets/icon-maskable.png", "./assets/icon.svg", "./assets/qr.png", "./assets/qr.svg", "./data/alerts.json", "./data/countries.json", "./data/world.json", "./index.html", "./manifest.webmanifest", "./metrics.js", "./push-config.json", "./push.js", "./style.css", "./vendor/MarkerCluster.css", "./vendor/d3.min.js", "./vendor/leaflet.css", "./vendor/leaflet.js", "./vendor/leaflet.markercluster.js", "./vendor/topojson-client.min.js"];
self.addEventListener('install',event=>event.waitUntil((async()=>{await(await caches.open(CACHE)).addAll(FILES);await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('neon-energy-atlas-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url),scope=new URL(self.registration.scope);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(scope.pathname))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE),key=new Request(url.origin+url.pathname),cached=await cache.match(key);
  const live=/\/(data\/countries\.json|push-config\.json|version\.json)$/.test(url.pathname)||event.request.mode==='navigate'||/\.(js|css)$/.test(url.pathname);
  if(!live&&cached)return cached;
  try{const response=await fetch(event.request,{cache:'no-cache'});if(!response.ok)throw Error('HTTP '+response.status);
   if(url.pathname.endsWith('/data/countries.json')){const p=await response.clone().json();if(p.schema!==2||!p.meta?.revision||!p.countries||!p.world)throw Error('Invalid data snapshot');}
   await cache.put(key,response.clone());return response;
  }catch(error){if(cached)return cached;if(event.request.mode==='navigate'){const page=await cache.match(new URL('index.html',scope).href);if(page)return page;}throw error;}
 })());
});
self.addEventListener('push',event=>event.waitUntil((async()=>{
 let payload={};try{payload=event.data?.json()||{};}catch{}
 await self.registration.showNotification(payload.title||'Энергия мира',{body:payload.body||'В атласе появились новые данные.',icon:new URL('assets/icon-192.png',self.registration.scope).href,badge:new URL('assets/icon-192.png',self.registration.scope).href,tag:payload.id||'atlas-update',data:{url:new URL('?view=updates',self.registration.scope).href},renotify:false});
})()));
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const target=new URL('?view=updates',self.registration.scope).href;const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of windows){if(client.url.startsWith(self.registration.scope)){await client.focus();client.postMessage({type:'OPEN_UPDATES'});return;}}await self.clients.openWindow(target);})());});
