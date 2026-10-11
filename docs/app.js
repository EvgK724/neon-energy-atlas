'use strict';
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const fmt = (n,d=0) => n == null ? 'Нет данных' : new Intl.NumberFormat('ru-RU',{maximumFractionDigits:d}).format(n);
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeURL = s => { try { const u=new URL(s);return u.protocol==='https:'?u.href:'#'; } catch { return '#'; } };
  const color = n => ['','#46dded','#ffae68','#c38bff','#b2f681'][n];
  const root = document;
  const STORE='neon-energy-atlas-v1';
  let state={layers:{gen:true,dc:true,g5:true,nuclear:true},country:'WORLD',view:'map',nuclear:'all',dc:'active',streets:true};
  try { const old=JSON.parse(localStorage.getItem(STORE));if(old){state={...state,...old,layers:{...state.layers,...old.layers}};} } catch {}
  if(!['map','sun','future','space'].includes(state.view))state.view='map';
  if(!['all','operating','construction'].includes(state.nuclear))state.nuclear='all';
  if(!['active','all','functional','construction','proposed'].includes(state.dc))state.dc='active';
  const save=()=>{try{localStorage.setItem(STORE,JSON.stringify(state));}catch{}};
  let map, country, world, dcData, nuclearData, geo, baseLayer, genLayer, g5Layer, outlineLayer, labels, streets;
  let dcMarkers=[], nuclearMarkers=[], dcGroup, nuclearGroup, chosenMarker;
  let expanded=false, lastPanelFocus, toastTimer, initialized=false;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nameOf=s=>s.nameRu||s.nameLocal||s.name||'ЦОД без названия';
  const countryName=c=>country?.[c]?.name||c||'Страна не определена';
  const statusNames={functional:'Действующий по тегам OSM',construction:'В строительстве',proposed:'Проект',inactive:'Не действует',operating:'Эксплуатационный статус',mixed:'Эксплуатация + строительство'};
  function toast(s){$('#toast').textContent=s;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3800);}
  function panel(open,focusSearch=false){
    if(open)lastPanelFocus=document.activeElement;
    document.body.classList.toggle('layers-open',open);$('#layers-button').setAttribute('aria-expanded',String(open));
    $('#panel-scrim').hidden=!open||innerWidth>760;
    if(open && innerWidth<=760){$('#layer-panel').setAttribute('role','dialog');$('#layer-panel').setAttribute('aria-modal','true');}
    else{$('#layer-panel').removeAttribute('role');$('#layer-panel').removeAttribute('aria-modal');}
    if(open)setTimeout(()=>$(focusSearch?'#site-search':innerWidth<=760?'#close-layers':'#site-search').focus(),20);
    else if(lastPanelFocus?.isConnected)lastPanelFocus.focus({preventScroll:true});
  }
  $('#layers-button').onclick=()=>panel(!document.body.classList.contains('layers-open'));
  $('#close-layers').onclick=()=>panel(false);$('#panel-scrim').onclick=()=>panel(false);
  $('#search-button').onclick=()=>panel(true,true);
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){if(document.body.classList.contains('layers-open'))panel(false);else if(expanded)expand(false);}
    if(e.key==='Tab'&&innerWidth<=760&&document.body.classList.contains('layers-open')){
      const f=[...$('#layer-panel').querySelectorAll('button,input,select,a')].filter(x=>x.offsetParent!==null&&!x.disabled);
      if(e.shiftKey&&document.activeElement===f[0]){e.preventDefault();f.at(-1).focus();}
      else if(!e.shiftKey&&document.activeElement===f.at(-1)){e.preventDefault();f[0].focus();}
    }
  });
  function about(){panel(false);$('#about-dialog').showModal();}
  $('#about-button').onclick=about;$('#method-button').onclick=about;$('#close-about').onclick=()=>$('#about-dialog').close();
  $('#about-dialog').addEventListener('click',e=>{if(e.target===$('#about-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
  function view(id,scroll=true){
    state.view=id;$$('.view').forEach(v=>v.hidden=v.id!=='view-'+id);
    $$('[data-view]').forEach(b=>{if(b.dataset.view===id)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    if(expanded&&id!=='map')expand(false);panel(false);if(scroll)window.scrollTo({top:0,behavior:'instant'});
    if(id==='map')requestAnimationFrame(()=>map?.invalidateSize({pan:false}));
    if(id==='sun'&&world)drawSun();if(id==='future'&&world)drawNuclear();save();
  }
  $$('[data-view]').forEach(b=>b.onclick=()=>view(b.dataset.view));
  function expand(open){expanded=open;document.body.classList.toggle('map-full',open);$('#expand-map').setAttribute('aria-pressed',String(open));$('#expand-map').setAttribute('aria-label',open?'Свернуть карту':'Развернуть карту');requestAnimationFrame(()=>map.invalidateSize({pan:false}));}
  $('#expand-map').onclick=()=>expand(!expanded);
  function dcVisible(s){return state.dc==='all'||(state.dc==='active'?['functional','construction'].includes(s.status):s.status===state.dc);}
  function nuclearVisible(s){return state.nuclear==='all'||(state.nuclear==='operating'?s.operatingUnits>0:s.constructionUnits>0);}
  function cluster(kind){return L.markerClusterGroup({maxClusterRadius:kind==='dc'?48:38,showCoverageOnHover:false,spiderfyOnMaxZoom:true,spiderfyDistanceMultiplier:1.7,removeOutsideVisibleBounds:true,animate:!reduced,disableClusteringAtZoom:kind==='dc'?16:12,iconCreateFunction:c=>L.divIcon({html:fmt(c.getChildCount()),className:'cluster-icon '+kind,iconSize:[42,42],iconAnchor:[21,21]})});}
  function markerPopup(s,kind){
    const isN=kind==='nuclear',title=nameOf(s),place=[countryName(s.country),s.city||s.subnational].filter(Boolean).join(' · ');
    let details='';
    if(isN){
      details=`<p>Блоки в этой точке: <b>${fmt(s.operatingUnits)}</b> в эксплуатации; <b>${fmt(s.constructionUnits)}</b> в строительстве.</p><p>Номинальная мощность: ${fmt(s.operatingMW)} МВт + ${fmt(s.constructionMW)} МВт строящихся блоков.</p>`;
      if(s.projectPointCount>1)details+=`<p>Группа блоков: ${esc(s.unitNames.join(', '))}. У этого проекта несколько координат.</p>`;
      if(s.noteRu)details+=`<p>${esc(s.noteRu)}</p>`;
      details+=`<small>${s.accuracy==='approximate'?'⚠ Приблизительные координаты по GEM.':'Точка площадки по GEM (категория exact).'} Статус каталога не подтверждает текущую генерацию.</small>`;
    }else{
      if(s.operator)details+=`<p>Оператор: ${esc(s.operator)}</p>`;
      details+=`<p>${esc(statusNames[s.status]||s.status)}.</p><small>${s.accuracy==='osm_node'?'Исходная точка OSM.':'Центр контура здания или площадки OSM.'} Метки сообщества могут содержать ошибки; кампус иногда представлен несколькими точками.</small>`;
    }
    return `<span class="eyebrow" style="color:${isN?color(4):color(2)}">${isN?'АТОМНАЯ ЭНЕРГЕТИКА · GEM':'ДАТА-ЦЕНТР · OPENSTREETMAP'}</span><h3>${esc(title)}</h3><small>${esc(place)}</small>${details}<p class="coord">${fmt(s.lat,5)}°, ${fmt(s.lon,5)}°</p><a href="${esc(safeURL(s.sourceUrl))}" target="_blank" rel="noopener noreferrer">Карточка источника ↗</a>`;
  }
  function makeMarker(s,kind){
    const extra=(['construction','proposed','inactive'].includes(s.status)?' '+s.status:'')+(s.accuracy==='approximate'?' approximate':'');
    const m=L.marker([s.lat,s.lon],{icon:L.divIcon({html:'<i></i>',className:'map-marker '+kind+extra,iconSize:[44,44],iconAnchor:[22,22]}),title:nameOf(s),alt:nameOf(s),keyboard:true,riseOnHover:true});
    m.site=s;m.kind=kind;m.bindPopup(()=>markerPopup(s,kind),{maxWidth:330,minWidth:220,autoPanPadding:[17,23]});
    m.on('click',()=>{chosenMarker=m;if(s.country&&country[s.country])chooseCountry(s.country,false);});
    return m;
  }
  function updatePoints(){
    dcGroup.clearLayers();nuclearGroup.clearLayers();
    dcGroup.addLayers(dcMarkers.filter(m=>dcVisible(m.site)));
    nuclearGroup.addLayers(nuclearMarkers.filter(m=>nuclearVisible(m.site)));
    updateLayers(false);
  }
  function genColor(v){if(v==null)return '#253445';return d3.interpolateRgb('#102c3a','#46dded')(Math.min(1,Math.log10(v+1)/Math.log10(11001)));}
  function genStyle(f){const d=country[f.properties.iso];return{stroke:false,fill:true,fillColor:genColor(d?.year>=2023?d.gen:null),fillOpacity:map.getZoom()>=6?.16:.83,interactive:true};}
  function g5Style(f){const v=country[f.properties.iso]?.g5;return{color:v==null?'#687788':d3.interpolateRgb('#536476',color(3))(v/100),weight:v==null?1:1+v/85,opacity:map.getZoom()>=6?.25:.85,fill:false,dashArray:v==null?'2 6':v===0?'2 5':null};}
  function updateLayers(persist=true){
    const all={gen:genLayer,g5:g5Layer,dc:dcGroup,nuclear:nuclearGroup};
    for(const [k,l] of Object.entries(all)){if(state.layers[k]){if(!map.hasLayer(l))l.addTo(map);}else if(map.hasLayer(l))map.removeLayer(l);}
    $$('[data-layer]').forEach(b=>b.setAttribute('aria-pressed',String(!!state.layers[b.dataset.layer])));
    $('#layer-count').textContent=Object.values(state.layers).filter(Boolean).length;
    legend();profile();mapStatus();if(persist)save();
  }
  function legend(){
    let h='';
    if(state.layers.gen)h+=`<div class="legend-row"><span class="legend-title">Цвет · выработка, ТВт·ч</span><div class="gradient" style="background:linear-gradient(to right,${[1,10,100,1000,10000].map(genColor).join(',')})"></div><div class="legend-ticks"><span>1</span><span>10</span><span>100</span><span>1 тыс.</span><span>10 тыс.</span></div><small>Логарифмическая шкала · серый: нет свежих данных</small></div>`;
    if(state.layers.g5)h+='<div class="legend-row"><span class="legend-title">Границы · 5G, % населения</span><div class="gradient" style="background:linear-gradient(to right,#536476,#c38bff)"></div><div class="legend-ticks"><span>0%</span><span>50%</span><span>100%</span></div><small>Пунктир: 0% или нет данных. Точное значение — в карточке страны.</small></div>';
    if(state.layers.dc)h+='<div class="legend-row"><span class="legend-title"><span class="legend-icon" style="color:var(--orange)">●</span>ЦОД · объект OSM</span><small>Число в круге — группа точек. Нажмите, чтобы приблизить.</small></div>';
    if(state.layers.nuclear)h+='<div class="legend-row"><span class="legend-title"><span class="legend-icon" style="color:var(--lime)">▲</span>АЭС · группы блоков</span><small>Зелёный: эксплуатация или смешанный статус. Голубой: строительство. Бледный: приблизительные координаты.</small></div>';
    if(!h)h='<p class="small muted">Включите любой слой. Обзорная карта остаётся доступна.</p>';
    $('#legend').innerHTML=h;
  }
  function profile(){
    const w=state.country==='WORLD',d=w?world:country[state.country];if(!d)return;
    $('#country-select').value=state.country;$('#profile-name').textContent=w?'Весь мир':d.name;
    $('#profile-year').textContent='Выработка '+(d.year||'—')+' · разные даты слоёв';
    const entries=[['Выработка, ТВт·ч',fmt(d.gen,d.gen<10?2:0),'Ember · '+(d.year||'—'),1],['ЦОД, каталог',w?'≈12 300':fmt(d.dc),'Data Center Map · 2026',2],['5G, % населения',fmt(d.g5,1),(w?'ITU':'GSMA')+' · 2025',3],['АЭС, блоков',fmt(d.reactors),'МАГАТЭ · конец 2025',4]];
    $('#metrics').innerHTML=entries.map(([t,v,n,c])=>`<div class="metric" style="--mc:${color(c)}"><span>${t}</span><strong>${v}</strong><small>${n}</small></div>`).join('');
    const notes=[];if(!w&&d.year===2025)notes.push('Доля мировой выработки: '+fmt(100*d.gen/world.gen,2)+'%.');
    if(d.nuclear!=null&&d.gen>0)notes.push('Атомная выработка: '+fmt(d.nuclear,1)+' ТВт·ч ('+fmt(100*d.nuclear/d.gen,1)+'%).');
    if(d.solar!=null)notes.push('Солнечная: '+fmt(d.solar,1)+' ТВт·ч.');
    if(state.country==='RUS')notes.push('5G: значение GSMA за 2025 год; пилотные сети не равны массовому охвату.');
    if(state.country==='CHN')notes.push('4,838 млн базовых станций 5G к концу 2025 года (MIIT).');
    if(d.year&&d.year<2023)notes.push('Выработка архивная, на карте не окрашена.');
    $('#profile-note').textContent=notes.join(' ');
    const ds=dcData.sites.filter(s=>(w||s.country===state.country)&&dcVisible(s));
    const ns=nuclearData.sites.filter(s=>(w||s.country===state.country)&&nuclearVisible(s));
    const projects=new Set(ns.map(s=>s.projectId)).size;
    $('#point-counts').textContent='В выбранных фильтрах: '+fmt(ds.length)+' точек ЦОД (OSM) · '+fmt(ns.length)+' точек АЭС / '+fmt(projects)+' проектов (GEM). Координатные каталоги отличаются от статистики выше.';
  }
  function countryClick(f,e){const id=f.properties.iso,d=country[id];if(!d)return;chooseCountry(id,false);L.popup({maxWidth:260}).setLatLng(e.latlng).setContent(`<h3>${esc(d.name)}</h3><p>Выработка: <b>${fmt(d.gen,d.gen<10?2:0)} ТВт·ч</b> · ${esc(d.year||'нет года')}<br>5G: <b>${fmt(d.g5,1)}%</b> населения · 2025</p><small>Все показатели страны — под картой.</small>`).openOn(map);}
  function onCountry(f,l){l.on('click',e=>countryClick(f,e));}
  function chooseCountry(id,zoom=true){
    if(id!=='WORLD'&&!country[id])id='WORLD';state.country=id;profile();outlineLayer.clearLayers();
    if(id==='WORLD'){if(zoom)worldView();}
    else{
      const fs=geo.features.filter(f=>f.properties.iso===id);if(fs.length)outlineLayer.addData({type:'FeatureCollection',features:fs});
      if(zoom){
        map.closePopup();const custom={RUS:[[42,19],[77,180]],USA:[[24,-126],[50,-65]],FRA:[[41,-5],[52,10]]};
        if(custom[id])map.fitBounds(custom[id],{padding:[25,25],animate:!reduced,maxZoom:7});
        else if(fs.length)map.fitBounds(outlineLayer.getBounds(),{padding:[25,25],animate:!reduced,maxZoom:7});
        else if(country[id].ll)map.setView([country[id].ll[1],country[id].ll[0]],7,{animate:!reduced});
      }
    }save();
  }
  function worldView(){map.fitBounds([[-58,-180],[81,180]],{padding:[15,20],animate:false});}
  function mapStatus(){
    const ds=state.layers.dc?dcGroup.getLayers().length:0,ns=state.layers.nuclear?nuclearGroup.getLayers().length:0;
    $('#map-status').textContent=(navigator.onLine?'':'Без сети · ')+fmt(ds)+' ЦОД · '+fmt(ns)+' точек АЭС';
    const close=map.getZoom()>=6;
    $('#map-hint').textContent=close?(navigator.onLine&&state.streets?'Нажмите на объект: название, статус, координаты и источник':'Обзорная карта · подробные улицы доступны с интернетом'):'Два пальца — масштаб · число в круге — группа объектов';
  }
  function detailMap(){
    const show=state.streets&&map.getZoom()>=6&&navigator.onLine;
    if(show&&!map.hasLayer(streets))streets.addTo(map);else if(!show&&map.hasLayer(streets))map.removeLayer(streets);
    genLayer.setStyle(genStyle);g5Layer.setStyle(g5Style);mapStatus();
  }
  function zoomToSite(m){
    if(state.view!=='map')view('map');
    const k=m.kind;if(!state.layers[k])state.layers[k]=true;
    if(k==='dc'&&!dcVisible(m.site)){state.dc='all';$('#dc-filter').value='all';}
    if(k==='nuclear'&&!nuclearVisible(m.site)){state.nuclear='all';$('#nuclear-filter').value='all';}
    updatePoints();panel(false);chosenMarker=m;
    if(m.site.country&&country[m.site.country])chooseCountry(m.site.country,false);
    map.setView(m.getLatLng(),k==='dc'?16:12,{animate:false});
    (k==='dc'?dcGroup:nuclearGroup).zoomToShowLayer(m,()=>m.openPopup());save();
  }
  function search(){
    const q=$('#site-search').value.trim().toLocaleLowerCase('ru');
    if(q.length<2){$('#search-results').replaceChildren();return;}
    const found=[...nuclearMarkers,...dcMarkers].filter(m=>m.searchText.includes(q));
    const frag=document.createDocumentFragment();
    for(const m of found.slice(0,25)){
      const b=document.createElement('button');b.type='button';b.textContent=nameOf(m.site);
      const s=document.createElement('small');s.textContent=(m.kind==='dc'?'ЦОД':'АЭС')+' · '+countryName(m.site.country)+(m.site.city?' · '+m.site.city:'');b.append(s);b.onclick=()=>zoomToSite(m);frag.append(b);
    }
    const note=document.createElement('p');note.className='small muted';note.textContent=found.length?(found.length>25?'Первые 25 из '+fmt(found.length)+' результатов. Уточните название.':fmt(found.length)+' результатов. Поиск по всем статусам.'):'В этом снимке совпадений нет. Попробуйте другое название или город.';frag.append(note);$('#search-results').replaceChildren(frag);
  }
  function setupMap(){
    map=L.map('map',{zoomControl:false,attributionControl:true,minZoom:0,maxZoom:18,zoomSnap:.25,zoomDelta:1,worldCopyJump:false,maxBounds:[[-85,-210],[85,210]],maxBoundsViscosity:.7,preferCanvas:true,tapHold:false,zoomAnimation:!reduced,fadeAnimation:!reduced});
    map.attributionControl.setPrefix(false);map.attributionControl.addAttribution('<a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OSM</a> · <a href="https://globalenergymonitor.org/projects/global-nuclear-power-tracker" target="_blank" rel="noopener">GEM</a>');
    for(const [n,z] of [['base',210],['streets',250],['generation',310],['coverage',330],['selection',350],['labels',370]])map.createPane(n).style.zIndex=z;
    map.getPane('streets').classList.add('street-tiles');map.getPane('labels').style.pointerEvents='none';
    baseLayer=L.geoJSON(geo,{pane:'base',style:{color:'#38536a',weight:.6,fillColor:'#122338',fillOpacity:1},onEachFeature:onCountry}).addTo(map);
    genLayer=L.geoJSON(geo,{pane:'generation',style:genStyle,onEachFeature:onCountry});
    g5Layer=L.geoJSON(geo,{pane:'coverage',style:g5Style,onEachFeature:onCountry});
    outlineLayer=L.geoJSON(null,{pane:'selection',style:{color:'#f0faff',weight:1.8,fill:false,interactive:false}}).addTo(map);
    streets=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{pane:'streets',maxZoom:19,noWrap:true,keepBuffer:1,updateWhenIdle:true});
    streets.on('tileerror',()=>{$('#map-hint').textContent='Улицы сейчас недоступны · точки и обзорная карта работают';});
    labels=L.layerGroup().addTo(map);
    [['США',38,-102],['РОССИЯ',64,89],['КИТАЙ',36,103],['БРАЗИЛИЯ',-11,-51],['АВСТРАЛИЯ',-25,134]].forEach(([n,lat,lon])=>L.marker([lat,lon],{pane:'labels',interactive:false,icon:L.divIcon({className:'country-label',html:esc(n),iconSize:[95,14],iconAnchor:[45,7]})}).addTo(labels));
    dcGroup=cluster('dc');nuclearGroup=cluster('nuclear');
    dcMarkers=dcData.sites.map(s=>makeMarker(s,'dc'));nuclearMarkers=nuclearData.sites.map(s=>makeMarker(s,'nuclear'));
    for(const m of [...dcMarkers,...nuclearMarkers])m.searchText=[m.site.name,m.site.nameRu,m.site.nameLocal,m.site.operator,m.site.city,m.site.subnational,countryName(m.site.country),m.site.id].filter(Boolean).join(' ').toLocaleLowerCase('ru');
    map.setView([25,20],1);worldView();
    updatePoints();
    if(state.mapView&&Number.isFinite(state.mapView.lat)&&Number.isFinite(state.mapView.lon)&&Number.isFinite(state.mapView.zoom))map.setView([Math.max(-80,Math.min(80,state.mapView.lat)),Math.max(-180,Math.min(180,state.mapView.lon))],Math.max(0,Math.min(18,state.mapView.zoom)),{animate:false});
    else if(state.country!=='WORLD')chooseCountry(state.country,true);
    map.on('moveend',()=>{const c=map.getCenter();state.mapView={lat:c.lat,lon:c.lng,zoom:map.getZoom()};save();});
    map.on('zoomend',()=>{detailMap();if(map.getZoom()>4){if(map.hasLayer(labels))map.removeLayer(labels);}else if(!map.hasLayer(labels))labels.addTo(map);});
    L.control.scale({imperial:false,maxWidth:100,position:'bottomleft'}).addTo(map);
    $('#zoom-in').onclick=()=>map.zoomIn();$('#zoom-out').onclick=()=>map.zoomOut();$('#world-button').onclick=()=>chooseCountry('WORLD',true);
    $$('[data-layer]').forEach(b=>b.onclick=()=>{state.layers[b.dataset.layer]=!state.layers[b.dataset.layer];updateLayers();});
    $('#nuclear-filter').value=state.nuclear;$('#dc-filter').value=state.dc;$('#streets-toggle').checked=state.streets;
    $('#nuclear-filter').onchange=e=>{state.nuclear=e.target.value;updatePoints();save();};$('#dc-filter').onchange=e=>{state.dc=e.target.value;updatePoints();save();};
    $('#streets-toggle').onchange=e=>{state.streets=e.target.checked;detailMap();save();};
    $('#country-select').onchange=e=>chooseCountry(e.target.value,true);$$('[data-country]').forEach(b=>b.onclick=()=>chooseCountry(b.dataset.country,true));
    $('#site-search').oninput=search;
    $('#point-coverage').textContent=fmt(dcData.sites.length)+' объектов OSM и '+fmt(nuclearData.sites.length)+' точек GEM в снимке. Это открытые каталоги; полнота различается по странам.';
    detailMap();
    window.atlas={map,state,dcGroup,nuclearGroup,dcMarkers,nuclearMarkers,chooseCountry,zoomToSite,updateLayers,version:'2026.10.11'};
  }
  function methodology(){
    $('#methodology').innerHTML=`<h3>Что означают точки</h3><ul><li><b>ЦОД:</b> ${fmt(dcData.sites.length)} объектов OpenStreetMap. Снимок OpenDataCenterMap от 06.10.2026; это узлы, здания и площадки. Несколько зданий одного кампуса могут быть отдельными точками. Координата — узел OSM либо центр контура; отсутствие точки не означает отсутствие ЦОД. <a href="https://opendatacentermap.deuxfleurs.page/" target="_blank" rel="noopener noreferrer">Каталог и происхождение</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors, ODbL</a>.</li><li><b>АЭС:</b> 208 точек, 196 проектов, 424 блока со статусом operating и 85 construction. <a href="https://globalenergymonitor.org/projects/global-nuclear-power-tracker" target="_blank" rel="noopener noreferrer">Global Nuclear Power Tracker, Global Energy Monitor, август 2026</a>. ${fmt(nuclearData.sites.filter(s=>s.accuracy==='approximate').length)} координат приблизительные; они выделены в карточках. Точки объединяют блоки только при совпадении project-id и исходных координат. Мощность — номинальная электрическая.</li><li>Статус GEM <i>operating</i> не подтверждает текущую генерацию; <i>construction</i> может включать подготовку площадки. У Запорожской АЭС сохранён статус каталога с отдельным пояснением. Закрытые и отменённые блоки не включены. Данные адаптированы из GEM по <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>.</li></ul><h3>Почему статистика отличается от числа точек</h3><ul><li><b>Выработка:</b> <a href="https://ember-energy.org/latest-insights/global-electricity-review-2026/supporting-materials/" target="_blank" rel="noopener noreferrer">Ember Global Electricity Review 2026</a>. Мир: 31 779,37 ТВт·ч за 2025. По странам — последний доступный год, указанный в карточке. Страны разных лет не складываются в мировой итог. Архивные данные до 2023 не окрашены.</li><li><b>ЦОД в карточке страны:</b> <a href="https://www.datacentermap.com/datacenters/" target="_blank" rel="noopener noreferrer">Data Center Map</a>, просмотр 11.10.2026. Заголовок каталога: 12 259, сумма строк стран: 12 257. Это отдельный перечень, не полный мировой реестр и не число точек OSM. Возможен особенно сильный недоучёт России и Китая.</li><li><b>Атомная статистика:</b> <a href="https://www.iaea.org/publications/16057/energy-electricity-and-nuclear-power-estimates-for-the-period-up-to-2060" target="_blank" rel="noopener noreferrer">МАГАТЭ RDS-1/46</a>, конец 2025: 413 блоков, 377,076 ГВт и 72 строящихся блока. Даты и определения отличаются от GEM. Атомная выработка в профиле взята из Ember для сопоставимости.</li><li><b>5G:</b> <a href="https://www.mobileconnectivityindex.com/" target="_blank" rel="noopener noreferrer">GSMA MCI 2026</a>, доля населения с покрытием за 2025. Мировые 55,1% — отдельная оценка <a href="https://www.itu.int/itu-d/reports/statistics/2025/10/15/ff25-mobile-network-coverage/" target="_blank" rel="noopener noreferrer">ITU</a>. Границы показывают показатель страны; это не контуры радиосигнала и не покрытие всей территории. Ноль не исключает пилотные зоны. <a href="https://english.www.gov.cn/archive/statistics/202601/28/content_WS6979f123c6d00ca5f9a08ce7.html" target="_blank" rel="noopener noreferrer">Базовые станции Китая: MIIT</a>.</li></ul><h3>Карта и офлайн-режим</h3><p>Обзорные границы: Natural Earth / d3-maps atlas. Крупный масштаб использует OpenStreetMap; тайлы запрашиваются только для просматриваемой области и не загружаются пакетом. При отсутствии сети доступны сохранённые данные, точки и обзорные контуры. Линии границ служат визуализации источника и не определяют политический статус территорий.</p><h3>Солнечное сравнение</h3><p>Светимость 3,828 × 10²⁶ Вт; поток у Земли 1361 Вт/м²; радиус Земли 6371 км. Перехватываемая мощность = 1361 × π × R². Средняя электрическая мощность = годовая выработка / 8760 часов. Время эквивалента = годовая энергия / мощность излучения.</p>`;
  }
  function space(){
    const events=[
      ['2023','Эксперимент','Солнечная энергия из космоса','Caltech MAPLE: продемонстрирована беспроводная передача энергии в космосе. Промышленная генерация ещё не доказана.','Caltech','https://www.caltech.edu/about/news/in-a-first-caltechs-space-solar-power-demonstrator-wirelessly-transmits-power-in-space'],
      ['2025','Запуск','Китай · вычисления на орбите','Запущены первые 12 спутников Three-Body Computing Constellation.','Госсовет КНР · 15 мая 2025','https://english.www.gov.cn/english.www.gov.cn/news/202505/15/content_WS6825452ec6d0868f4e8f28e6.html'],
      ['2027','План','Google + Planet · Project Suncatcher','План двух прототипов с AI-вычислениями и солнечным питанием на начало 2027 года.','Google Research · ноябрь 2025','https://blog.google/innovation-and-ai/technology/research/google-project-suncatcher/'],
      ['2030','План','США · реактор на Луне','Целевой срок NASA и DOE для лунной ядерной энергетической установки.','NASA · январь 2026','https://www.nasa.gov/news-release/nasa-department-of-energy-to-develop-lunar-surface-reactor-by-2030/'],
      ['2036','План','Россия · лунная электростанция','Контракт на работы в 2025–2036 годах. Срок договора не гарантирует ввод установки в эксплуатацию.','Роскосмос · официальный канал','https://t.me/s/roscosmos_gk/18976']
    ];
    $('#space-timeline').innerHTML=events.map(([y,s,n,t,a,u])=>`<article class="timeline-item"><span class="timeline-year">${y}</span><div class="timeline-content"><span class="status-badge ${s==='План'?'plan':''}">${s}</span><h2>${n}</h2><p>${t}</p><a href="${u}" target="_blank" rel="noopener noreferrer">${a} ↗</a></div></article>`).join('');
  }
  async function load(){
    try{
      const urls=['data/countries.json','data/world.json','data/datacenters.json','data/nuclear.json'];
      const [p,t,d,n]=await Promise.all(urls.map(async u=>{const r=await fetch(u);if(!r.ok)throw Error('Не загружен '+u);return r.json();}));
      country=p.countries;world=p.world;dcData=d;nuclearData=n;const aliases={SDS:'SSD',KOS:'XKX',SAH:'ESH',PSX:'PSE'};
      geo=topojson.feature(t,t.objects.features);geo.features=geo.features.filter(f=>f.properties.id!=='ATA');geo.features.forEach(f=>f.properties.iso=aliases[f.properties.id]||f.properties.id);
      if(state.country!=='WORLD'&&!country[state.country])state.country='WORLD';
      const ids=Object.keys(country).filter(k=>k!=='ATA').sort((a,b)=>country[a].name.localeCompare(country[b].name,'ru'));
      for(const id of ['RUS','CHN','USA',...ids.filter(k=>!['RUS','CHN','USA'].includes(k))]){const o=document.createElement('option');o.value=id;o.textContent=country[id].name;$('#country-select').append(o);}
      setupMap();methodology();space();initialized=true;view(state.view,false);$('#map').setAttribute('aria-busy','false');
      fetch('version.json').then(r=>r.json()).then(v=>$('#release-label').textContent='Версия '+v.version+' · '+v.date).catch(()=>{});
    }catch(e){$('#map-status').textContent='Карта не загрузилась';$('#map-hint').textContent='Проверьте соединение и обновите страницу';$('#point-coverage').textContent=e.message;console.error(e);}
  }
  window.addEventListener('online',()=>{if(map)detailMap();});window.addEventListener('offline',()=>{if(map)detailMap();});
  let rw=0;new ResizeObserver(()=>{if(rw!==innerWidth){rw=innerWidth;if(innerWidth>760&&document.body.classList.contains('layers-open'))panel(false);if(initialized){if(state.view==='sun')drawSun();if(state.view==='future')drawNuclear();map.invalidateSize({pan:false});}}}).observe(document.documentElement);
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js').then(reg=>{
      navigator.serviceWorker.ready.then(()=>$('#offline-status').textContent='Офлайн-копия готова: интерфейс, данные и обзорная карта.');
      if(reg.waiting)toast('Доступна новая версия. Она откроется после закрытия всех окон приложения.');
    }).catch(()=>$('#offline-status').textContent='Не удалось сохранить офлайн-копию. Приложение работает с интернетом.');
  }else $('#offline-status').textContent='Офлайн-режим недоступен в этом браузере.';
  load();
  function drawSun() {
    const node=root.querySelector('#sun-chart'), width=node.clientWidth;
    if(!width)return;
    const height=310,left=width<500?136:178,right=12,top=26,bottom=54;
    const rows=[
      ['ЦОД · потребление',world.dcEnergy/8760,'0,055 ТВт',color(2)],
      ['Россия',country.RUS.gen/8760,'0,136 ТВт',color(1)],
      ['Китай',country.CHN.gen/8760,'1,21 ТВт',color(1)],
      ['Мир · генерация',world.meanTW,'3,63 ТВт',color(1)],
      ['Солнце → Земля',world.sunIncidentTW,'≈174 тыс. ТВт',color(2)],
      ['Солнце → космос',3.828e14,'3,828 × 10¹⁴ ТВт',color(2)]
    ];
    const svg=d3.select(node).attr('viewBox',`0 0 ${width} ${height}`).attr('height',height);svg.selectAll('*').remove();
    const x=d3.scaleLog().domain([.01,6e14]).range([left+10,width-right-10]);
    const y=d3.scalePoint().domain(rows.map(r=>r[0])).range([top+22,height-bottom-20]);
    svg.append('rect').attr('data-chart-frame','').attr('x',left).attr('y',top).attr('width',width-left-right).attr('height',height-bottom-top).attr('fill','none').attr('stroke','#294058');
    const ticks=width<500?[.01,1e6,1e14]:[.01,1,1e3,1e6,1e9,1e12,1e14];
    const tickLabel=v=>({'.01':'10⁻²','0.01':'10⁻²','1':'1','1000':'10³','1000000':'10⁶','1000000000':'10⁹','1000000000000':'10¹²','100000000000000':'10¹⁴'})[String(v)];
    for(const t of ticks)svg.append('line').attr('x1',x(t)).attr('x2',x(t)).attr('y1',top).attr('y2',height-bottom).attr('stroke','#294058').attr('stroke-width',.5);
    svg.append('g').attr('transform',`translate(0,${height-bottom})`).call(d3.axisBottom(x).tickValues(ticks).tickFormat(tickLabel).tickSize(4)).call(g=>g.select('.domain').remove());
    for(const [name,val,label,c] of rows){
      const yy=y(name);
      svg.append('text').attr('x',0).attr('y',yy-4).text(name);
      svg.append('text').attr('x',0).attr('y',yy+12).attr('fill','#a2b6ca').text(label);
      svg.append('circle').attr('cx',x(val)).attr('cy',yy).attr('r',10).attr('fill',c).attr('opacity',.13);
      svg.append('circle').attr('cx',x(val)).attr('cy',yy).attr('r',4).attr('fill',c);
    }
    svg.append('text').attr('class','axis-title').attr('data-axis','x').attr('x',width/2).attr('y',height-9).attr('text-anchor','middle').text('Мощность, ТВт · логарифмическая шкала');
    svg.append('text').attr('class','axis-title').attr('data-axis','y').attr('x',0).attr('y',14).text('Объект');
  }
  function drawNuclear() {
    const node=root.querySelector('#nuclear-chart'), width=node.clientWidth;if(!width)return;
    const height=226,left=64,right=16,top=24,bottom=48;
    const vals=[{year:'2025',lo:377,hi:377},{year:'2040',lo:535,hi:692},{year:'2050',lo:641,hi:1045},{year:'2060',lo:696,hi:1284}];
    const svg=d3.select(node).attr('viewBox',`0 0 ${width} ${height}`).attr('height',height);svg.selectAll('*').remove();
    const x=d3.scaleLinear().domain([0,d3.max(vals,d=>d.hi)*1.08]).range([left,width-right]);
    const y=d3.scalePoint().domain(vals.map(d=>d.year)).range([top+10,height-bottom-18]);
    svg.append('rect').attr('data-chart-frame','').attr('x',left).attr('y',top-16).attr('width',width-left-right).attr('height',height-bottom-top+16).attr('fill','none').attr('stroke','#294058');
    const ticks=width<500?[0,500,1000]:[0,250,500,750,1000,1250];
    svg.append('g').attr('transform',`translate(0,${height-bottom})`).call(d3.axisBottom(x).tickValues(ticks).tickFormat(d=>fmt(d))).call(g=>g.select('.domain').remove());
    for(const d of vals){
      const yy=y(d.year);
      svg.append('text').attr('x',1).attr('y',yy+4).text(d.year);
      if(d.hi>d.lo)svg.append('rect').attr('x',x(d.lo)).attr('y',yy-4).attr('width',x(d.hi)-x(d.lo)).attr('height',8).attr('fill',color(4)).attr('opacity',.27);
      for(const v of new Set([d.lo,d.hi]))svg.append('circle').attr('cx',x(v)).attr('cy',yy).attr('r',4).attr('fill',color(4));
      svg.append('text').attr('x',(x(d.lo)+x(d.hi))/2).attr('y',yy-10).attr('text-anchor','middle').text(d.lo===d.hi?fmt(d.lo):fmt(d.lo)+'–'+fmt(d.hi));
    }
    svg.append('text').attr('class','axis-title').attr('data-axis','x').attr('x',width/2).attr('y',height-8).attr('text-anchor','middle').text('Электрическая мощность, ГВт');
    svg.append('text').attr('class','axis-title').attr('data-axis','y').attr('x',1).attr('y',12).text('Год');
  }

})();
