/* Canonical calculations shared by the UI and verification. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AtlasMetrics=api;})(globalThis,()=>{
  'use strict';
  const specs={gen:{name:'Выработка',unit:'ТВт·ч',color:'#46dded',source:'ember',digits:2},dc:{name:'ЦОД · открытый каталог',unit:'объектов',color:'#ffae68',source:'osm',digits:0},reactors:{name:'Блоки АЭС',unit:'действующих',color:'#b2f681',source:'pris',digits:0},build:{name:'Блоки АЭС',unit:'строятся',color:'#86d9fc',source:'pris',digits:0},g5:{name:'Охват 5G',unit:'% населения',color:'#c38bff',source:'gsma',digits:2},index:{name:'Индекс атласа',unit:'из 100',color:'#f0edc9',digits:2}};
  const numeric=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
  function scores(countries){
    const all=Object.entries(countries).filter(([,c])=>c.year===2025&&['dc','gen','reactors','g5'].every(k=>numeric(c[k])));
    const max=Object.fromEntries(['gen','dc','reactors'].map(k=>[k,Math.max(1,...all.map(([,c])=>c[k]))]));
    return Object.fromEntries(all.map(([id,c])=>[id,25*(Math.log1p(c.gen)/Math.log1p(max.gen)+Math.log1p(c.dc)/Math.log1p(max.dc)+Math.log1p(c.reactors)/Math.log1p(max.reactors)+c.g5/100)]));
  }
  function ranking(countries,metric='gen',period='2025'){
    const index=scores(countries);
    const rows=Object.entries(countries).map(([id,c])=>({id,...c,value:metric==='index'?index[id]:c[metric]})).filter(c=>numeric(c.value)&&(metric!=='gen'||period==='latest'||c.year===Number(period)));
    rows.sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name,'ru'));
    let rank=0,last;return rows.map((c,i)=>{if(c.value!==last)rank=i+1;last=c.value;return{...c,rank};});
  }
  function validate(data){
    if(data.schema!==2||!data.meta?.checkedAt||!data.countries||Object.keys(data.countries).length<150)throw Error('Неверный формат снимка данных');
    for(const [id,c] of Object.entries(data.countries))for(const k of ['gen','dc','reactors','build','g5'])if(c[k]!=null&&(!numeric(c[k])||(k==='g5'&&c[k]>100)||(['dc','reactors','build'].includes(k)&&!Number.isInteger(c[k]))))throw Error('Некорректное значение '+id+'/'+k);
    for(const k of ['gen','dc','reactors','build','g5'])if(!numeric(data.world[k]))throw Error('Нет мирового итога '+k);
    if(!data.sources||!Array.isArray(data.forecasts))throw Error('Нет происхождения данных');return true;
  }
  return{specs,numeric,scores,ranking,validate};
});
