const {chromium,webkit}=require('playwright');const fs=require('node:fs');const assert=require('node:assert/strict');
const url=process.argv[2]||'http://127.0.0.1:8769';const dir=process.env.QA_DIR||'test-results';fs.mkdirSync(dir,{recursive:true});
(async()=>{const results=[];
for(const [name,engine]of Object.entries({chromium,webkit})){
 const browser=await engine.launch();const page=await browser.newPage({viewport:{width:440,height:956},serviceWorkers:'block'});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.waitForFunction(()=>window.atlas);
 let checks=0;
 for(const width of [320,440,1024])for(const textSize of ['normal','xlarge']){
  await page.setViewportSize({width,height:956});await page.locator('#text-size-button').click();await page.locator(`[name="text-size"][value="${textSize}"]`).check();await page.locator('#close-text-size').click();
  for(const key of ['oil','oilReserves','gold','goldReserves','launches','satellites','starlink','iphone']){
   await page.evaluate(k=>{atlas.view('map');for(const x of Object.keys(AtlasMetrics.layerKeys))atlas.state.layers[x]=false;atlas.state.layers[k]=true;atlas.state.focus=k;atlas.chooseCountry('RUS',false);atlas.updateLayers();},key);
   await page.waitForTimeout(20);
   assert.equal(await page.locator('#metrics .metric').count(),1,key+' selected profile');
   for(const view of ['map','ranking']){
    if(view==='ranking'){await page.evaluate(()=>atlas.view('ranking'));await page.selectOption('#rank-metric',key);}
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${name} overflow ${width}/${textSize}/${key}/${view}`);
    const clipped=await page.evaluate(()=>[...document.querySelectorAll('.view:not([hidden]) .metric strong,.view:not([hidden]) .rank-number b,.view:not([hidden]) .map-number b,.view:not([hidden]) .world-total strong')].filter(e=>{const r=document.createRange();r.selectNodeContents(e);const p=e.parentElement.getBoundingClientRect();return[...r.getClientRects()].some(b=>b.left<p.left-1||b.right>p.right+1)}).map(e=>e.textContent));
    assert.deepEqual(clipped,[],`${name} clipped ${width}/${textSize}/${key}/${view}`);checks++;
   }
  }
  await page.evaluate(()=>{atlas.view('map');for(const k of Object.keys(AtlasMetrics.layerKeys))atlas.state.layers[k]=true;atlas.state.focus='goldReserves';atlas.chooseCountry('RUS',true);atlas.updateLayers();});
  assert.equal(await page.locator('[data-layer][aria-pressed=true]').count(),12);assert.equal(await page.locator('#metrics .metric').count(),12);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.ok(await page.locator('.country-stat').count()>0,`${name} combined country labels missing`);
  const bad=await page.evaluate(()=>[...document.querySelectorAll('.country-stat')].flatMap(parent=>{const box=parent.getBoundingClientRect();return [...parent.querySelectorAll('.map-number b')].filter(e=>{const r=e.getBoundingClientRect();return r.bottom>box.bottom+1||r.right>box.right+1}).map(e=>e.textContent)}));assert.deepEqual(bad,[],`${name} combined labels overflow`);checks++;
  if(width===320&&textSize==='xlarge')await page.screenshot({path:`${dir}/${name}-all-layers-large.png`,fullPage:true});
 }
 await page.setViewportSize({width:440,height:956});await page.locator('#text-size-button').click();await page.locator('[name="text-size"][value="normal"]').check();await page.locator('#close-text-size').click();
 await page.locator('#layers-button').click();await page.locator('[data-layer=oil]').click();await page.locator('[data-layer=oil]').click();assert.equal(await page.evaluate(()=>atlas.state.focus),'oil');await page.locator('#close-layers').click();
 await page.reload();await page.waitForFunction(()=>window.atlas);assert.equal(await page.evaluate(()=>atlas.activeMetrics().length),12,'all selections persist');
 await page.evaluate(()=>{atlas.state.focus='starlink';atlas.updateLayers();atlas.chooseCountry('UKR',false)});assert.match(await page.locator('[data-metric=starlink] strong').innerText(),/Особый/);
 await page.evaluate(()=>{atlas.state.focus='iphone';atlas.updateLayers();atlas.chooseCountry('WORLD',false)});assert.match(await page.locator('[data-metric=iphone] strong').innerText(),/^> /);assert.match(await page.locator('#metric-context').innerText(),/нижняя граница/);
 await page.evaluate(()=>{for(const k of Object.keys(AtlasMetrics.layerKeys))atlas.state.layers[k]=['oil','oilReserves','gold','goldReserves'].includes(k);atlas.state.focus='goldReserves';atlas.chooseCountry('RUS',true);atlas.updateLayers();});await page.screenshot({path:`${dir}/${name}-resources.png`,fullPage:true});
 await page.evaluate(()=>atlas.view('space'));await page.screenshot({path:`${dir}/${name}-space.png`,fullPage:true});
 assert.deepEqual(errors,[]);results.push({engine:name,layoutChecks:checks,all12Layers:true,persistence:true,errors});await browser.close();
}
fs.writeFileSync(`${dir}/topics-verification.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));})().catch(e=>{console.error(e);process.exit(1)});
