from pathlib import Path
import copy,json
from update_data import validate,diff,ROOT
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
alerts=json.loads((ROOT/'docs/data/alerts.json').read_text());assert alerts['schema']==1;assert len({e['id'] for e in alerts['events']})==len(alerts['events'])
assert all(e.get('title') and e.get('publishedAt') and e.get('body') for e in alerts['events'])
print('Data: totals, significant-change thresholds, null handling and alert IDs verified.')
