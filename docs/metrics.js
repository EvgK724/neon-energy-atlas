/* Canonical calculations shared by the UI and verification. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AtlasMetrics=api;})(globalThis,()=>{
  'use strict';
  const specs={
    gen:{name:'Выработка',short:'ЭЭ · ТВт·ч',unit:'ТВт·ч',color:'#46dded',source:'ember',digits:1,ticks:[0,10,100,1000,10000]},
    dc:{name:'ЦОД · открытый каталог',short:'ЦОД · OSM',unit:'объектов',color:'#ffae68',source:'osm',digits:0,ticks:[0,10,100,1000]},
    reactors:{name:'Блоки АЭС',short:'АЭС · блоки',unit:'действующих',color:'#b2f681',source:'pris',digits:0,ticks:[0,10,30,60,100]},
    build:{name:'Блоки АЭС',unit:'строятся',color:'#86d9fc',source:'pris',digits:0},
    g5:{name:'Охват 5G',short:'5G · %',unit:'% населения',color:'#c38bff',source:'gsma',digits:1,ticks:[0,25,50,75,100]},
    oil:{name:'Нефть и конденсат',short:'Нефть · млн б/д',unit:'млн барр./сутки',color:'#8dbbfa',source:'eia',digits:1,ticks:[0,.1,1,5,15]},
    oilReserves:{name:'Запасы нефти',short:'Нефть · млрд б',unit:'млрд баррелей',color:'#78a4dd',source:'ogj',digits:1,ticks:[0,1,10,100,300]},
    gold:{name:'Добыча золота',short:'Золото · т/год',unit:'т/год',color:'#f4cd6a',source:'usgs',digits:1,ticks:[0,10,50,100,400]},
    goldReserves:{name:'Запасы золота',short:'Золото · т',unit:'тонн',color:'#e5b447',source:'usgsReserves',digits:0,ticks:[0,100,1000,5000,12000]},
    launches:{name:'Космические пуски',short:'Пуски · за год',unit:'попыток/год',color:'#ff8faa',source:'gcatLaunches',digits:0,ticks:[0,1,10,50,200]},
    satellites:{name:'Спутники на орбите',short:'Спутники · шт.',unit:'аппаратов',color:'#6be5c6',source:'gcatSatellites',digits:0,ticks:[0,10,100,1000,15000]},
    starlink:{name:'Starlink',short:'Starlink',unit:'статус услуги',worldUnit:'доступных рынков',color:'#b8caff',source:'starlink',digits:0,categorical:true},
    iphone:{name:'Используемые iPhone',short:'iPhone · млн',unit:'млн устройств',color:'#edb1f5',source:'iphone',digits:1,ticks:[]},
    index:{name:'Индекс атласа',unit:'из 100',color:'#f0edc9',digits:1}
  };
  const layerKeys={gen:'gen',dc:'dc',nuclear:'reactors',g5:'g5',oil:'oil',oilReserves:'oilReserves',gold:'gold',goldReserves:'goldReserves',launches:'launches',satellites:'satellites',starlink:'starlink',iphone:'iphone'};
  const starlinkStatuses={
    launched:{label:'Доступен',short:'Да',color:'#b8caff',order:0},
    available:{label:'Доступен',short:'Да',color:'#b8caff',order:0},
    coming_soon:{label:'Ожидается',short:'Ожидание',color:'#f4cd6a',order:1},
    pending_regulatory:{label:'Ожидает разрешения',short:'Разрешение',color:'#f4cd6a',order:2},
    blacklisted:{label:'Не предлагается',short:'Нет',color:'#a96f8d',order:3},
    exclude:{label:'Особый режим / нет общего статуса',short:'Особый',color:'#73869d',order:4},
    unknown:{label:'Статус не указан',short:'Нет данных',color:'#283441',order:5}
  };
  const numeric=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
  function scores(countries,year=Math.max(...Object.values(countries).map(c=>c.year||0))){
    const all=Object.entries(countries).filter(([,c])=>c.year===Number(year)&&['dc','gen','reactors','g5'].every(k=>numeric(c[k])));
    const max=Object.fromEntries(['gen','dc','reactors'].map(k=>[k,Math.max(1,...all.map(([,c])=>c[k]))]));
    return Object.fromEntries(all.map(([id,c])=>[id,25*(Math.log1p(c.gen)/Math.log1p(max.gen)+Math.log1p(c.dc)/Math.log1p(max.dc)+Math.log1p(c.reactors)/Math.log1p(max.reactors)+c.g5/100)]));
  }
  function ranking(countries,metric='gen',period='2025',commonYear){
    if(metric==='starlink')return Object.entries(countries).filter(([,c])=>c.starlink&&c.starlink!=='unknown').map(([id,c])=>({id,...c,value:c.starlink,rank:null})).sort((a,b)=>(starlinkStatuses[a.value]?.order??5)-(starlinkStatuses[b.value]?.order??5)||a.name.localeCompare(b.name,'ru'));
    const index=scores(countries,commonYear);
    const rows=Object.entries(countries).map(([id,c])=>({id,...c,value:metric==='index'?index[id]:c[metric]})).filter(c=>numeric(c.value)&&(metric!=='gen'||period==='latest'||c.year===Number(period)));
    rows.sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name,'ru'));
    let rank=0,last;return rows.map((c,i)=>{if(c.value!==last)rank=i+1;last=c.value;return{...c,rank};});
  }
  function validate(data){
    if(data.schema!==2||!data.meta?.checkedAt||!data.countries||Object.keys(data.countries).length<150)throw Error('Неверный формат снимка данных');
    for(const [id,c] of Object.entries(data.countries)){
      for(const k of ['gen','dc','reactors','build','g5','oil','oilReserves','gold','goldReserves','launches','launchesYtd','satellites','activeSatellites'])if(c[k]!=null&&(!numeric(c[k])||(k==='g5'&&c[k]>100)||(['dc','reactors','build','launches','launchesYtd','satellites','activeSatellites'].includes(k)&&!Number.isInteger(c[k]))))throw Error('Некорректное значение '+id+'/'+k);
      if(c.starlink!=null&&!starlinkStatuses[c.starlink])throw Error('Неизвестный статус Starlink '+id);
      if(c.iphone!=null&&!numeric(c.iphone))throw Error('Некорректная оценка iPhone '+id);
    }
    for(const k of ['gen','dc','reactors','build','g5'])if(!numeric(data.world[k]))throw Error('Нет мирового итога '+k);
    if(data.meta.topicsVersion===1){
      for(const k of ['oil','oilReserves','gold','goldReserves','launches','launchesYtd','satellites','starlink','iphone'])if(!numeric(data.world[k]))throw Error('Нет мирового показателя '+k);
      for(const k of ['launches','launchesYtd','satellites','activeSatellites'])if(data.world[k]!==Object.values(data.countries).reduce((n,c)=>n+(c[k]||0),0)+(data.world[k+'Unallocated']||0))throw Error('Не согласованы итоги '+k);
      if(!['>','≈'].includes(data.world.metricMeta?.iphone?.comparator))throw Error('Потерян статус оценки iPhone');
      if(data.world.starlink!==Object.values(data.countries).filter(c=>['available','launched'].includes(c.starlink)).length+(data.world.starlinkUnallocated||0))throw Error('Не согласованы рынки Starlink');
    }
    if(!data.sources||!Array.isArray(data.forecasts))throw Error('Нет происхождения данных');return true;
  }
  return{specs,layerKeys,starlinkStatuses,numeric,scores,ranking,validate};
});
