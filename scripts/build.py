#!/usr/bin/env python3
"""Version the static PWA and generate a scoped, offline service worker."""
from pathlib import Path
import hashlib,json
root=Path(__file__).resolve().parent.parent
docs=root/'docs'
files=sorted(p for p in docs.rglob('*') if p.is_file() and p.name not in {'sw.js','version.json','.DS_Store'})
h=hashlib.sha256()
for p in files:
    h.update(str(p.relative_to(docs)).encode());h.update(p.read_bytes())
version='r-'+h.hexdigest()[:16]
(docs/'version.json').write_text(json.dumps({'version':version,'date':'2026-10-11','qrTarget':'https://evgk724.github.io/neon-energy-atlas/'},ensure_ascii=False,indent=2)+'\n')
paths=['./','./version.json']+['./'+str(p.relative_to(docs)) for p in files if p.suffix in {'.html','.css','.js','.json','.webmanifest','.png','.svg'}]
sw="""'use strict';
const CACHE=__CACHE__;
const FILES=__FILES__;
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
"""
(docs/'sw.js').write_text(sw.replace('__CACHE__',json.dumps('neon-energy-atlas-'+version)).replace('__FILES__',json.dumps(paths,ensure_ascii=False)))
print(json.dumps({'version':version,'cachedFiles':len(paths),'bytes':sum(p.stat().st_size for p in files)},ensure_ascii=False))
