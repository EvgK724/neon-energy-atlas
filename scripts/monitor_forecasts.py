#!/usr/bin/env python3
"""Track numerical forecast passages in primary sources without inventing replacement forecasts.
Changed source evidence is surfaced for review; verified forecast records remain versioned.
"""
from pathlib import Path
from html.parser import HTMLParser
from concurrent.futures import ThreadPoolExecutor
import datetime,hashlib,json,re
from update_data import get,ROOT,NOW,TODAY
class Paragraphs(HTMLParser):
    def __init__(self):super().__init__();self.skip=0;self.parts=[];self.buf=[];self.depth=0
    def handle_starttag(self,tag,attrs):
        if tag in ['script','style','nav','header','footer']:self.skip+=1
        if tag in ['p','h1','h2','h3','li'] and not self.skip:self.depth+=1
    def handle_endtag(self,tag):
        if tag in ['p','h1','h2','h3','li'] and self.depth:
            self.depth-=1
            if not self.depth:self.parts.append(' '.join(self.buf));self.buf=[]
        if tag in ['script','style','nav','header','footer'] and self.skip:self.skip-=1
    def handle_data(self,s):
        if self.depth and not self.skip:self.buf.append(s)
def extract(url):
    raw=get(url)
    if raw.startswith(b'%PDF'):return None,'PDF требует проверки нового издания вручную'
    parser=Paragraphs();parser.feed(raw.decode('utf-8',errors='replace'))
    selected=[]
    for p in parser.parts:
        p=re.sub(r'\s+',' ',p).strip()
        if re.search(r'\b(?:20[2-6]\d|forecasts?|expected|projected|outlook|target|план|прогноз)\b',p,re.I) and re.search(r'TWh|GW|ТВт|ГВт|reactors?|реактор|энергоблок|satellites?|спутник|data cent|дата.центр|5G',p,re.I):
            selected.append(p)
    if not selected:return None,'Не найден распознаваемый текст прогноза'
    # Ignore cosmetic prose changes. A number/year/unit change still needs semantic review.
    fingerprints=sorted(set(' '.join(re.findall(r'\d[\d,.]*|TWh|GW|ТВт|ГВт|%|reactors?|satellites?',p,re.I)) for p in selected))
    return {'fingerprint':hashlib.sha256(json.dumps(fingerprints).encode()).hexdigest(),'passageCount':len(selected),'checkedAt':NOW},None

def main():
    p=ROOT/'docs/data/countries.json';d=json.loads(p.read_text());path=ROOT/'scripts/forecast-watch.json';baseline=json.loads(path.read_text()) if path.exists() else {}
    urls=sorted(set(f['url'] for f in d['forecasts'] if f['kind'] not in ['граница данных'])|set(['https://blog.google/innovation-and-ai/technology/research/google-project-suncatcher/','https://www.nasa.gov/news-release/nasa-department-of-energy-to-develop-lunar-surface-reactor-by-2030/']))
    def read(url):
        try:record,error=extract(url);return url,record,error
        except Exception as e:return url,None,str(e)
    changes=[];errors={}
    for url,record,error in ThreadPoolExecutor(max_workers=3).map(read,urls):
        if error:errors[url]=error;continue
        old=baseline.get(url)
        if old and old['fingerprint']!=record['fingerprint']:changes.append({'url':url,'old':old['fingerprint'],'new':record['fingerprint']})
        baseline[url]=record
    path.write_text(json.dumps(baseline,ensure_ascii=False,indent=2)+'\n')
    d['meta']['forecastMonitoring']={'checkedAt':NOW,'checkedSources':len(urls)-len(errors),'failedSources':errors,'reviewRequired':changes,'mode':'Проверка числовых фрагментов первоисточников; изменённый прогноз требует проверки смысла и единиц перед заменой.'}
    for change in changes:
        title='Обновился источник прогноза';text='Изменились числа или сроки в первоисточнике. Прежние проверенные значения сохранены до сверки нового сценария; изменение ещё не считается подтверждённым прогнозом.'
        d['changes'].append({'date':NOW,'title':title,'text':text,'url':change['url']})
        feedpath=ROOT/'docs/data/alerts.json';feed=json.loads(feedpath.read_text());event={'id':'forecast-'+change['new'][:20],'publishedAt':NOW,'title':'Энергия мира: проверьте обновлённый прогноз','body':'Источник изменил числовой фрагмент или срок. Для точного сравнения нужен разбор нового сценария. '+change['url']};feed['events']=[e for e in feed['events'] if e['id']!=event['id']]+[event];feed['events']=feed['events'][-100:];feedpath.write_text(json.dumps(feed,ensure_ascii=False,indent=2)+'\n')
    d['meta']['revision']='d-'+hashlib.sha256(json.dumps(d,sort_keys=True,ensure_ascii=False).encode()).hexdigest()[:12]
    p.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':'))+'\n');print(json.dumps({'forecastSourcesChecked':len(urls)-len(errors),'sourceReviewRequired':changes,'failedSources':errors},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
