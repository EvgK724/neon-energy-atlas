#!/usr/bin/env python3
"""Refresh public country statistics, validate before replacement, emit significant changes.
No credentials. A failed source keeps its prior values and prior retrieval timestamp.
Forecasts need source-aware review; import the reviewed records with --forecasts FILE.
"""
from pathlib import Path
import argparse,collections,copy,csv,datetime,gzip,hashlib,io,json,math,re,urllib.request,urllib.error,subprocess
ROOT=Path(__file__).resolve().parent.parent
DATA=ROOT/'docs/data/countries.json'
NOW=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
TODAY=NOW[:10]
CODES=json.loads((ROOT/'scripts/country-codes.json').read_text());CODES['XK']='XKX'
EXCLUDED={('node',7074394965),('node',7074557136),('node',7075542867),('node',8670268773)}

def get(url):
    req=urllib.request.Request(url,headers={'User-Agent':'NeonEnergyAtlas/2.0 (public research; github.com/EvgK724/neon-energy-atlas)'})
    try:
        with urllib.request.urlopen(req,timeout=60) as r:return r.read()
    except urllib.error.URLError as error:
        if 'CERTIFICATE_VERIFY_FAILED' not in str(error):raise
        # macOS Python may not have its own CA bundle; curl uses the system trust store.
        return subprocess.check_output(['curl','--fail','--location','--silent','--show-error','--max-time','60',url])

def getjson(url):
    raw=get(url)
    if raw[:2]==b'\x1f\x8b':raw=gzip.decompress(raw)
    return json.loads(raw)
def number(s):return int(re.search(r'\d+',str(s)).group())
def mark(d,key,period=None):
    s=d['sources'][key];s['retrievedAt']=NOW
    if period is not None:s['period']=period

def nuclear(d):
    rows=getjson(d['sources']['pris']['dataUrl'])['items'];world=getjson(d['sources']['pris']['worldUrl'])['items']
    status={'InOperation':('reactors','nucGW'),'UnderConstruction':('build','buildGW'),'InSuspendedOperation':('suspended',None),'SuspendedOperation':('suspended',None)}
    active=[r for r in rows if r['statisticType']=='InOperation'];assert len(active)>=25,'incomplete PRIS table'
    for c in d['countries'].values():
        for count,gw in status.values():
            c[count]=None if count=='suspended' else 0
            if gw:c[gw]=0
    for row in rows:
        if row['statisticType'] not in status:continue
        iso=CODES.get(row['countryCode']);assert iso in d['countries'],f'unknown PRIS country {iso}'
        count,gw=status[row['statisticType']];c=d['countries'][iso];c[count]=number(row['numberOfReactors'])
        if gw:c[gw]=float(row['capacity'])/1000
    for row in world:
        if row['statisticType'] not in status:continue
        count,gw=status[row['statisticType']];v=number(row['section1']);assert count=='suspended' or sum(c[count] for c in d['countries'].values())==v,f'PRIS total mismatch {count}'
        d['world'][count]=v
        if gw:d['world'][gw]=float(row['netCapacity'])/1000
    assert 300<d['world']['reactors']<700 and 20<d['world']['build']<250
    mark(d,'pris','текущая выдача API, проверено '+TODAY)
    d['sources']['pris']['note']=f"{d['world']['reactors']} действующих и {d['world']['build']} строящихся; ещё {d['world']['suspended']} в приостановленной эксплуатации не включены в действующие. Статус не означает генерацию в данный момент. Дата изменения каждой записи API не публикуется."
    for f in d['forecasts']:
        if f['id']=='nuclear-fleet-limit':f['value']=f"{d['world']['reactors']} действуют · {d['world']['build']} строятся";f['text']='Единого опубликованного прогноза числа действующих блоков мира на 2030/2040 в подключённых источниках нет. Строительство не учитывает будущие закрытия и переносы ввода. Сценарии МАГАТЭ ниже даны в ГВт.';f['publishedAt']='проверено '+TODAY

def generation(d):
    raw=get(d['sources']['ember']['dataUrl'])
    try:text=raw.decode('utf-8-sig')
    except UnicodeDecodeError:text=raw.decode('cp1252')
    records=list(csv.DictReader(io.StringIO(text)));keep={}
    for r in records:
        if r['Unit']!='TWh' or r['Category']!='Electricity generation' or r['Variable'] not in ['Total generation','Nuclear','Solar']:continue
        code='WORLD' if r['Area']=='World' else r['Country code']
        if code!='WORLD' and code not in d['countries']:continue
        if not r['Value']:continue
        keep[(code,int(r['Year']),r['Variable'])]=float(r['Value'])
    assert sum(1 for c,y,k in keep if y==2025 and k=='Total generation')>80,'incomplete Ember table'
    for code in list(d['countries'])+['WORLD']:
        years=[y for c,y,k in keep if c==code and k=='Total generation']
        if not years:continue
        y=max(years);c=d['world'] if code=='WORLD' else d['countries'][code]
        assert y>=c.get('year',0),'generation source older than previous snapshot'
        c.update(year=y,gen=keep[(code,y,'Total generation')],nuclear=keep.get((code,y,'Nuclear')),solar=keep.get((code,y,'Solar')))
    assert 20000<d['world']['gen']<100000
    year=d['world']['year'];hours=8784 if year%4==0 and (year%100!=0 or year%400==0) else 8760
    w=d['world'];w['meanTW']=w['gen']/hours;w['sunSeconds']=w['gen']*3.6e15/3.828e26;w['incidentMinutes']=w['gen']*3600/w['sunIncidentTW']/60
    mark(d,'ember',f'последний доступный год страны; мир — {year}')

def coverage(d):
    rows=getjson(d['sources']['gsma']['dataUrl'])['items'];rows=[r for r in rows if r['zone']['type']=='country'];assert len(rows)>150,'incomplete GSMA table'
    vals={r['zone']['isoCode']:r['networkCoverage'].get('coverage5g') for r in rows};assert sum(v is not None for v in vals.values())>150
    for c in d['countries'].values():c['g5']=None
    for iso,v in vals.items():
        iso={'XKS':'XKX','KOS':'XKX'}.get(iso,iso)
        if iso in d['countries']:
            if v is not None:assert isinstance(v,(float,int)) and 0<=v<=100
            d['countries'][iso]['g5']=v
    mark(d,'gsma',max(r.get('year',int(d['sources']['gsma']['period'])) for r in rows))

def inring(x,y,r):
    inside=False;j=len(r)-1
    for i in range(len(r)):
        xi,yi=r[i][:2];xj,yj=r[j][:2]
        if (yi>y)!=(yj>y) and x<(xj-xi)*(y-yi)/(yj-yi)+xi:inside=not inside
        j=i
    return inside

def datacenters(d):
    raw=getjson(d['sources']['osm']['dataUrl']);assert len(raw['features'])>3000,'incomplete DC snapshot'
    generated=raw['metadata']['generated_at'];assert generated[:10]>=d['sources']['osm']['asOf'][:10],'older OSM source'
    with gzip.open(ROOT/'scripts/reference/country-boundaries.geojson.gz') as f:boundaries=json.load(f)
    polys=[]
    for f in boundaries['features']:
        p=f['properties'];code=p.get('ISO_A3');code=p.get('ADM0_A3') if code in (None,'-99') else code
        code={'SDS':'SSD','SAH':'ESH','KOS':'XKX'}.get(code,code);g=f['geometry'];coordinates=g['coordinates'] if g['type']=='MultiPolygon' else [g['coordinates']]
        for rings in coordinates:
            xs=[p[0] for p in rings[0]];ys=[p[1] for p in rings[0]];polys.append((min(xs),min(ys),max(xs),max(ys),rings,code))
    def locate(x,y):
        for lo,la,hi,ha,rings,code in polys:
            if lo<=x<=hi and la<=y<=ha and inring(x,y,rings[0]) and not any(inring(x,y,h) for h in rings[1:]):return code
    counts=collections.defaultdict(collections.Counter);total=collections.Counter();seen=set()
    for f in raw['features']:
        p=f['properties'];t=p.get('tags',{});key=(p['type'],p['id']);assert key not in seen,'duplicate OSM ID';seen.add(key)
        if key in EXCLUDED:continue
        lon,lat=f['geometry']['coordinates'][:2];assert -180<=lon<=180 and -90<=lat<=90
        state=p['status'];assert state in ['functional','construction','proposed']
        if t.get('abandoned')=='yes' or t.get('disused')=='yes':state='inactive'
        elif t.get('building')=='construction' or 'construction:telecom' in t or 'construction:building' in t:state='construction'
        elif 'proposed:telecom' in t or 'proposed:building' in t or t.get('proposed')=='data_center':state='proposed'
        iso=CODES.get(t.get('addr:country','').upper()) or locate(lon,lat)
        if iso not in d['countries']:iso=None
        counts[iso][state]+=1;total[state]+=1
    for iso,c in d['countries'].items():
        c['dc']=counts[iso]['functional'] if counts[iso] else None;c['dcBuild']=counts[iso]['construction'] if counts[iso] else None
    w=d['world'];w.update(dc=total['functional'],dcBuild=total['construction'],dcCountrySum=sum(c['dc'] or 0 for c in d['countries'].values()),dcUnassigned=counts[None]['functional'])
    assert w['dc']==w['dcCountrySum']+w['dcUnassigned']
    mark(d,'osm','снимок OSM от '+generated[:10]);d['sources']['osm']['asOf']=generated[:10]
    d['sources']['osm']['note']=f"Неполный открытый каталог, не общее число всех ЦОД страны. Один кампус может дать несколько объектов. Из {w['dc']} объектов functional у {w['dcUnassigned']} не определена страна; сумма стран {w['dcCountrySum']}. © OpenStreetMap contributors, ODbL 1.0."

def diff(old,new):
    changes=[]
    for iso,c in new['countries'].items():
        before=old['countries'][iso]
        for k in ['dc','gen','reactors','build','g5']:
            a,b=before.get(k),c.get(k)
            if a is None or b is None or a==b:continue
            delta=abs(b-a);significant={'dc':delta>=5 and delta/max(abs(a),1)>=.05,'gen':delta/max(abs(a),1)>=.03,'reactors':delta>=1,'build':delta>=1,'g5':delta>=5}[k]
            if significant:changes.append({'source':{'dc':'OpenStreetMap','gen':'Ember','reactors':'МАГАТЭ PRIS','build':'МАГАТЭ PRIS','g5':'GSMA'}[k],'label':{'dc':'ЦОД в OSM','gen':'выработка, ТВт·ч','reactors':'действующие блоки АЭС','build':'строящиеся блоки АЭС','g5':'охват 5G, %'}[k],'country':iso,'name':c['name'],'metric':k,'old':a,'new':b,'oldPeriod':before.get('year') if k=='gen' else old['sources'][{'dc':'osm','reactors':'pris','build':'pris','g5':'gsma'}[k]].get('period'),'newPeriod':c.get('year') if k=='gen' else new['sources'][{'dc':'osm','reactors':'pris','build':'pris','g5':'gsma'}[k]].get('period')})
    prev={f['id']:f for f in old.get('forecasts',[])}
    for f in new.get('forecasts',[]):
        p=prev.get(f['id']);a=p.get('targetValue') if p else None;b=f.get('targetValue')
        if p is None:changes.append({'metric':'forecast','id':f['id'],'name':f['title'],'reason':'новый опубликованный прогноз'})
        elif p.get('targetYear')!=f.get('targetYear') or (isinstance(a,(int,float)) and isinstance(b,(int,float)) and abs(b-a)/max(abs(a),.01)>=.1):changes.append({'metric':'forecast','id':f['id'],'name':f['title'],'old':a,'new':b,'oldPeriod':p.get('targetYear'),'newPeriod':f.get('targetYear')})
    return changes

def validate(d):
    for iso,c in d['countries'].items():
        for k in ['gen','dc','reactors','build','g5']:
            v=c.get(k);assert v is None or isinstance(v,(int,float)) and math.isfinite(v) and v>=0,(iso,k,v)
            if k=='g5' and v is not None:assert v<=100
            if k in ['dc','reactors','build'] and v is not None:assert int(v)==v
    for k in ['reactors','build']:assert d['world'][k]==sum(c[k] for c in d['countries'].values())
    assert d['world']['dc']==sum(c['dc'] or 0 for c in d['countries'].values())+d['world']['dcUnassigned']

def run():
    ap=argparse.ArgumentParser();ap.add_argument('--write',action='store_true');ap.add_argument('--forecasts',type=Path);ap.add_argument('--only',choices=['pris','ember','gsma','osm']);args=ap.parse_args()
    old=json.loads(DATA.read_text());d=copy.deepcopy(old);errors={};ok=[]
    for key,fn in [('pris',nuclear),('ember',generation),('gsma',coverage),('osm',datacenters)]:
        if args.only and key!=args.only:continue
        candidate=copy.deepcopy(d)
        try:fn(candidate);validate(candidate);d=candidate;ok.append(key)
        except Exception as e:errors[key]=str(e)
    if args.forecasts:
        records=json.loads(args.forecasts.read_text());assert isinstance(records,list) and all(f.get('url','').startswith('https://') and f.get('id') for f in records)
        assert len({f['id'] for f in records})==len(records);d['forecasts']=records
    validate(d);changes=diff(old,d);d['meta']['checkedAt']=NOW;d['meta']['lastAttemptErrors']=errors;d['meta']['refreshedSources']=ok
    if changes:d['changes'].append({'date':NOW,'title':f'Изменения показателей: {len(changes)}','text':'; '.join(f"{x['name']}, {x.get('label','прогноз')}: {x.get('old','')} → {x.get('new',x.get('reason',''))}; {x.get('oldPeriod','')} → {x.get('newPeriod','')}, {x.get('source','первоисточник')}" for x in changes[:12]),'details':changes})
    d['meta']['revision']='d-'+hashlib.sha256(json.dumps({k:v for k,v in d.items() if k!='meta'},sort_keys=True,ensure_ascii=False).encode()).hexdigest()[:12]
    report={'checkedAt':NOW,'sourcesUpdated':ok,'failedSources':errors,'significant':changes,'revision':d['meta']['revision']}
    (ROOT/'refresh-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    if args.write:
        temp=DATA.with_suffix('.tmp');temp.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':'))+'\n');temp.replace(DATA)
        if changes:
            path=ROOT/'docs/data/alerts.json';feed=json.loads(path.read_text());event={'id':d['meta']['revision'],'publishedAt':NOW,'title':f'Энергия мира: {len(changes)} значимых изменений','body':d['changes'][-1]['text'][:700]};feed['events']=[e for e in feed['events'] if e['id']!=event['id']]+[event];feed['events']=feed['events'][-100:];path.write_text(json.dumps(feed,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,ensure_ascii=False,indent=2));return 1 if errors else 0
if __name__=='__main__':raise SystemExit(run())
