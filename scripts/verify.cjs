const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const url=process.env.ATLAS_URL||'http://127.0.0.1:8769/';
const out=process.env.ATLAS_QA||path.resolve('test-results');fs.mkdirSync(out,{recursive:true});
const report={url,engines:[],layout:[],interactions:[],errors:[]};
async function checkLayout(page,engine,width,size,view){
  const r=await page.evaluate(()=>{
    const broken=[];
    const targets=document.querySelectorAll('.brand,.bottom-nav button,.layer-switches button,.profile,.reading-view h1,.reading-card,.timeline-content');
    for(const el of targets){if(!el.getClientRects().length)continue;const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;
      while(n=walker.nextNode()){const text=n.textContent;for(const m of text.matchAll(/[А-Яа-яЁёA-Za-z]{4,}/g)){const range=document.createRange();range.setStart(n,m.index);range.setEnd(n,m.index+m[0].length);const rects=[...range.getClientRects()];if(new Set(rects.map(r=>Math.round(r.top))).size>1)broken.push(m[0]);}}
    }
    return{width:innerWidth,scroll:document.documentElement.scrollWidth,broken:[...new Set(broken)]};
  });
  report.layout.push({engine,width,size,view,...r});assert.ok(r.scroll<=r.width+1,`${engine} ${width} ${size} ${view}: horizontal overflow ${r.scroll}`);assert.equal(r.broken.length,0,`${engine} ${width} ${size} ${view}: words split ${r.broken}`);
}
async function run(engine,browserType){
  const browser=await browserType.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block',reducedMotion:'reduce'});
  await context.route('https://tile.openstreetmap.org/**',route=>route.abort());
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push({engine,message:e.message}));
  const response=await page.goto(url);assert.equal(response.status(),200);await page.waitForFunction(()=>window.atlas);
  assert.deepEqual(await page.evaluate(()=>[atlas.dcGroup.getLayers().length,atlas.nuclearGroup.getLayers().length]),[4964,208]);
  await page.screenshot({path:path.join(out,engine+'-desktop.png'),fullPage:true});
  // Every layer toggles without resetting zoom or the other three layers.
  for(const key of ['gen','dc','g5','nuclear']){
    const before=await page.evaluate(()=>({layers:{...atlas.state.layers},z:atlas.map.getZoom(),c:atlas.map.getCenter()}));
    await page.locator(`[data-layer="${key}"]`).click();
    const after=await page.evaluate(()=>({layers:{...atlas.state.layers},z:atlas.map.getZoom(),c:atlas.map.getCenter()}));
    assert.equal(after.layers[key],!before.layers[key]);for(const k of Object.keys(before.layers))if(k!==key)assert.equal(after.layers[k],before.layers[k]);assert.equal(after.z,before.z);assert.deepEqual(after.c,before.c);
    await page.locator(`[data-layer="${key}"]`).click();
  }
  report.interactions.push(engine+': independent layers, zoom and position preserved');
  await page.locator('#dc-filter').selectOption('proposed');assert.equal(await page.evaluate(()=>atlas.dcGroup.getLayers().length),35);
  await page.locator('#dc-filter').selectOption('active');
  await page.locator('#nuclear-filter').selectOption('construction');assert.ok(await page.evaluate(()=>atlas.nuclearGroup.getLayers().every(m=>m.site.constructionUnits>0)));
  await page.locator('#nuclear-filter').selectOption('all');
  await page.locator('#country-select').selectOption('RUS');assert.match(await page.locator('#profile-name').innerText(),/Россия/);assert.match(await page.locator('#point-counts').innerText(),/79/);
  await page.locator('#country-select').selectOption('CHN');assert.match(await page.locator('#point-counts').innerText(),/121/);
  await page.locator('#site-search').fill('Белояр');await page.locator('#search-results button').first().click();
  await page.waitForSelector('.leaflet-popup');assert.match(await page.locator('.leaflet-popup-content').innerText(),/Белояр/);
  const pos=await page.evaluate(()=>{const m=atlas.nuclearMarkers.find(m=>m.site.nameRu.includes('Белояр'));return[m.getLatLng().lat,m.getLatLng().lng,atlas.map.getZoom()];});assert.deepEqual(pos,[56.8417,61.3225,12]);
  assert.ok(await page.locator('.leaflet-popup-content a').getAttribute('href'));
  await page.screenshot({path:path.join(out,engine+'-nuclear.png'),fullPage:true});
  await page.locator('#site-search').fill('Selectel Tsvetochnaya 1');await page.locator('#search-results button').first().click();
  assert.match(await page.locator('.leaflet-popup-content').innerText(),/Selectel/);
  const dcpos=await page.evaluate(()=>{const m=atlas.dcMarkers.find(m=>m.site.name==='Selectel Tsvetochnaya 1');return[m.getLatLng().lat,m.getLatLng().lng];});assert.deepEqual(dcpos,[59.886598,30.3294225]);
  report.interactions.push(engine+': filters, Russia/China, search, actual source coordinates, object popups');
  await page.locator('[data-layer="g5"]').click();const saved=await page.evaluate(()=>({z:atlas.map.getZoom(),country:atlas.state.country,layers:{...atlas.state.layers}}));await page.reload();await page.waitForFunction(()=>window.atlas);assert.deepEqual(await page.evaluate(()=>({z:atlas.map.getZoom(),country:atlas.state.country,layers:{...atlas.state.layers}})),saved);
  await page.locator('[data-layer="g5"]').click();await page.locator('#world-button').click();
  const z=await page.evaluate(()=>atlas.map.getZoom());await page.locator('#zoom-in').click();assert.ok(await page.evaluate(()=>atlas.map.getZoom())>z);await page.locator('#zoom-out').click();assert.equal(await page.evaluate(()=>atlas.map.getZoom()),z);
  await page.locator('#expand-map').click();assert.ok(await page.evaluate(()=>document.body.classList.contains('map-full')));await page.locator('#expand-map').click();
  report.interactions.push(engine+': persisted state, zoom buttons, fullscreen');
  for(const width of [320,390,440,820,1024])for(const size of [16,20,24]){
    await page.setViewportSize({width,height:width>=760?1180:956});await page.evaluate(s=>document.documentElement.style.fontSize=s+'px',size);
    for(const v of ['map','sun','future','space']){
      await page.locator(`[data-view="${v}"]`).click();await checkLayout(page,engine,width,size,v);
    }
    if(width<=760){await page.locator('[data-view="map"]').click();await page.locator('#layers-button').click();assert.ok(await page.locator('#layer-panel').isVisible());await checkLayout(page,engine,width,size,'layers');await page.locator('#close-layers').click();}
  }
  await page.setViewportSize({width:440,height:956});await page.evaluate(()=>document.documentElement.style.fontSize='16px');await page.locator('[data-view="map"]').click();await page.locator('#world-button').click();await page.waitForTimeout(400);await page.screenshot({path:path.join(out,engine+'-iphone.png'),fullPage:true});
  await page.locator('[data-view="sun"]').click();await page.screenshot({path:path.join(out,engine+'-sun.png'),fullPage:true});
  await page.locator('[data-view="future"]').click();await page.screenshot({path:path.join(out,engine+'-future.png'),fullPage:true});
  await page.locator('#about-button').click();assert.ok(await page.locator('#about-dialog').isVisible());assert.match(await page.locator('#about-dialog').innerText(),/На экран/);await page.locator('#close-about').click();
  await context.close();
  if(engine==='chromium'){
    const touch=await browser.newContext({viewport:{width:440,height:956},hasTouch:true,isMobile:true,deviceScaleFactor:2,serviceWorkers:'block',reducedMotion:'reduce'});await touch.route('https://tile.openstreetmap.org/**',r=>r.abort());
    const p=await touch.newPage();await p.goto(url);await p.waitForFunction(()=>window.atlas);const client=await touch.newCDPSession(p);const rect=await p.locator('#map').boundingBox();const cx=rect.x+rect.width*.48,cy=rect.y+rect.height*.52;
    const before=await p.evaluate(()=>atlas.map.getZoom());const t=(x,y,id)=>({x,y,id,radiusX:2,radiusY:2,force:1});
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[t(cx-28,cy,1),t(cx+28,cy,2)]});
    for(let d=35;d<=110;d+=15){await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[t(cx-d,cy,1),t(cx+d,cy,2)]});await p.waitForTimeout(25);}
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(500);assert.ok(await p.evaluate(()=>atlas.map.getZoom())>before,'pinch did not zoom');
    const c0=await p.evaluate(()=>atlas.map.getCenter());await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[t(cx,cy,1)]});for(let d=10;d<=70;d+=10){await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[t(cx+d,cy+20,1)]});await p.waitForTimeout(30);}await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(450);assert.notDeepEqual(await p.evaluate(()=>atlas.map.getCenter()),c0);
    report.interactions.push('chromium: two-finger pinch and touch drag');await touch.close();
    const offline=await browser.newContext({viewport:{width:820,height:1180}});await offline.route('https://tile.openstreetmap.org/**',r=>r.abort());const p2=await offline.newPage();await p2.goto(url);await p2.waitForFunction(()=>window.atlas);await p2.evaluate(()=>navigator.serviceWorker.ready);await p2.waitForFunction(()=>navigator.serviceWorker.controller);await offline.setOffline(true);await p2.reload();await p2.waitForFunction(()=>window.atlas);assert.equal(await p2.evaluate(()=>atlas.dcMarkers.length),5002);await p2.locator('[data-view="sun"]').click();assert.ok(await p2.locator('#sun-chart circle').count()>0);report.interactions.push('chromium: service-worker install, offline reload, data and charts available');await offline.close();
  }
  report.engines.push(engine);await browser.close();
}
(async()=>{try{await run('chromium',chromium);await run('webkit',webkit);assert.equal(report.errors.length,0,JSON.stringify(report.errors));report.passed=true;console.log(JSON.stringify({passed:true,layoutChecks:report.layout.length,interactions:report.interactions},null,2));}catch(e){report.passed=false;report.failure=e.stack;console.error(e);process.exitCode=1;}finally{fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2));if(!report.passed)process.exit(1);}})();
