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
