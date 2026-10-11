#!/usr/bin/env python3
"""Version the static PWA; data refreshes network-first with offline fallback."""
from pathlib import Path
import hashlib,json,datetime
root=Path(__file__).resolve().parent.parent;docs=root/'docs'
files=sorted(p for p in docs.rglob('*') if p.is_file() and p.name not in {'sw.js','version.json','.DS_Store'})
h=hashlib.sha256()
for p in files:h.update(str(p.relative_to(docs)).encode());h.update(p.read_bytes())
version='r-'+h.hexdigest()[:16]
(docs/'version.json').write_text(json.dumps({'version':version,'date':datetime.datetime.now(datetime.timezone.utc).date().isoformat(),'qrTarget':'https://evgk724.github.io/neon-energy-atlas/'},ensure_ascii=False,indent=2)+'\n')
paths=['./','./version.json']+['./'+str(p.relative_to(docs)) for p in files if p.suffix in {'.html','.css','.js','.json','.webmanifest','.png','.svg'}]
sw="""'use strict';
const CACHE=__CACHE__,FILES=__FILES__;
self.addEventListener('install',event=>event.waitUntil((async()=>{await(await caches.open(CACHE)).addAll(FILES);await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('neon-energy-atlas-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url),scope=new URL(self.registration.scope);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(scope.pathname))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE),key=new Request(url.origin+url.pathname),cached=await cache.match(key);
  const live=/\\/(data\\/countries\\.json|push-config\\.json|version\\.json)$/.test(url.pathname)||event.request.mode==='navigate'||/\\.(js|css)$/.test(url.pathname);
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
"""
(docs/'sw.js').write_text(sw.replace('__CACHE__',json.dumps('neon-energy-atlas-'+version)).replace('__FILES__',json.dumps(paths,ensure_ascii=False)))
print(json.dumps({'version':version,'cachedFiles':len(paths),'bytes':sum(p.stat().st_size for p in files)},ensure_ascii=False))
