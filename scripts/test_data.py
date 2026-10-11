from pathlib import Path
import copy,json
from update_data import validate,diff,parse_generation,ROOT
p=json.loads((ROOT/'docs/data/countries.json').read_text());validate(p)
a=copy.deepcopy(p);b=copy.deepcopy(p)
b['countries']['RUS']['build']+=1;b['world']['build']+=1
assert any(c['country']=='RUS' and c['metric']=='build' for c in diff(a,b))
b=copy.deepcopy(a);b['countries']['RUS']['g5']+=4.99;assert not diff(a,b)
b['countries']['RUS']['g5']+=.01;assert any(c['metric']=='g5' for c in diff(a,b))
b=copy.deepcopy(a);b['countries']['RUS']['dc']+=1;assert not diff(a,b)
b['countries']['RUS']['dc']=a['countries']['RUS']['dc']+max(5,int(a['countries']['RUS']['dc']*.06));assert any(c['metric']=='dc' for c in diff(a,b))
# New/missing coverage is not silently interpreted as a zero-to-positive trend.
b=copy.deepcopy(a);b['countries']['RUS']['dc']=None;assert not diff(a,b)
# A changed low scenario matters even when the upper endpoint is unchanged.
b=copy.deepcopy(a);f=next(x for x in b['forecasts'] if x['id']=='nuclear-capacity');f['targetLow']*=1.11
assert any(x.get('id')=='nuclear-capacity' for x in diff(a,b))
alerts=json.loads((ROOT/'docs/data/alerts.json').read_text());assert alerts['schema']==1;assert len({e['id'] for e in alerts['events']})==len(alerts['events'])
assert all(e.get('title') and e.get('publishedAt') and e.get('body') for e in alerts['events'])
csv_fixture=b'Area,ISO 3 code,Year,Electricity source,Generation (TWh)\nRussia,RUS,2025,Total generation,1194.437\nWorld,,2025,Total generation,31919.868\nEU,,2025,Total generation,2800\nRussia,RUS,2025,Nuclear,218.624\nRussia,RUS,2025,Demand,1200\n'
values=parse_generation(csv_fixture,{'RUS':{}})
assert values=={('RUS',2025,'Total generation'):1194.437,('WORLD',2025,'Total generation'):31919.868,('RUS',2025,'Nuclear'):218.624}
issues=[];parsed=parse_generation(csv_fixture+b'Russia,RUS,2025,Solar,-0.1\n',{'RUS':{}},issues)
assert parsed[('RUS',2025,'Solar')] is None and issues[0]['sourceValue']==-0.1
for bad in [b'Area,Value\nWorld,100\n',csv_fixture+b'Russia,RUS,2025,Nuclear,218.624\n',csv_fixture.replace(b'1194.437',b'nan'),csv_fixture.replace(b'1194.437',b'-1')]:
    try:parse_generation(bad,{'RUS':{}})
    except AssertionError:pass
    else:raise AssertionError('Invalid or duplicate generation rows accepted')
print('Data: totals, significant-change thresholds, null handling and alert IDs verified.')

# Resource changes are assessed independently; missing figures are not zero.
b=copy.deepcopy(a);b['countries']['RUS']['oil']*=1.051
assert any(x.get('metric')=='oil' for x in diff(a,b))
b=copy.deepcopy(a);b['countries']['RUS']['goldReserves']*=1.06
assert any(x.get('metric')=='goldReserves' for x in diff(a,b))
b=copy.deepcopy(a);b['countries']['RUS']['starlink']='launched'
assert any(x.get('metric')=='starlink' for x in diff(a,b))
b=copy.deepcopy(a);b['countries']['USA']['starlink']='available'
assert not diff(a,b), 'Equivalent active Starlink statuses must not create an outage notice'
b=copy.deepcopy(a);b['spaceStats']['ytdYear']+=1;b['countries']['USA']['launchesYtd']=0
assert not diff(a,b), 'Annual reset must not be called a decline'
from resource_sources import parse_gold_text,parse_gold_reserves_text,parse_eia
from extra_sources import apply_starlink
# The superscript reserve footnote must never inflate Australia's13,000 to1,113,000.
rows='\n'.join(f'{name} 100 110 '+('1113,000' if name=='Australia' else '3,000') for name in ['United States','Australia','Brazil','Canada','China','Ghana','Indonesia','Kazakhstan','Mexico','Peru','Russia','South Africa','Uzbekistan'])
gold_text='GOLD gold content\nMineral Commodity Summaries, February 2026\nWorld Mine Production and Reserves: Mine production Reserves\n2024 2025e\n'+rows+'\nOther countries 1000 1000 11,000\nWorld total (rounded) 2300 2430 60,000\nWorld Resources:\n11For Australia, Joint Ore Reserves Committee-compliant or equivalent reserves were 4,500 tons'
assert parse_gold_reserves_text(gold_text)['countries']['AUS']['value']==13000
assert parse_gold_reserves_text(gold_text)['countries']['AUS']['jorcOrEquivalentTonnes']==4500
try:parse_gold_reserves_text(gold_text.replace('11For Australia','For Australia'))
except ValueError:pass
else:raise AssertionError('Unidentified footnote silently accepted')
for raw in [{'response':{'total':2,'data':[]}},{}]:
    try:parse_eia(raw)
    except ValueError:pass
    else:raise AssertionError('Incomplete EIA response accepted')
try:apply_starlink(copy.deepcopy(p),{'admin0':{}},'2026-10-11T00:00:00Z',{})
except AssertionError:pass
else:raise AssertionError('Empty availability source accepted')
from update_data import display_number
assert display_number(34.4718)=='34,5'
assert display_number(11132)=='11\u00a0132'
print('Extended topics: comparisons, annual rollover, missing values, qualifiers and reserve-footnote parsing verified.')
