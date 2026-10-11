"""Pure source parsers for Atlas. No network writes or application mutations.
EIA parser consumes the APIv2 response; gold parser consumes the two-page USGS PDF.
Gold parsing requires pypdf. Only complete prior calendar years are eligible.
"""
from __future__ import annotations
import io, json, math, re
from datetime import date
from urllib.parse import urlencode

EIA_SOURCE = 'https://www.eia.gov/international/data/world'
EIA_BULK = 'https://api.eia.gov/bulk/INTL.zip'
USGS_SOURCE = 'https://www.usgs.gov/centers/national-minerals-information-center/gold-statistics-and-information'
GOLD_NAMES = {'United States':'USA','Australia':'AUS','Brazil':'BRA','Canada':'CAN','China':'CHN','Ghana':'GHA','Indonesia':'IDN','Kazakhstan':'KAZ','Mexico':'MEX','Peru':'PER','Russia':'RUS','South Africa':'ZAF','Uzbekistan':'UZB'}

def eia_url(key='DEMO_KEY', today=None):
    today = today or date.today()
    return 'https://api.eia.gov/v2/international/data/?' + urlencode({
        'api_key': key, 'frequency': 'annual', 'data[0]': 'value',
        'facets[productId][]': '57', 'facets[activityId][]': '1',
        'facets[unit][]': 'TBPD', 'start': str(today.year-2),
        'sort[0][column]': 'period', 'sort[0][direction]': 'desc',
        'offset': 0, 'length': 5000,
    })

def parse_eia(raw, today=None):
    today = today or date.today()
    doc = json.loads(raw) if isinstance(raw, (str, bytes, bytearray)) else raw
    if 'response' not in doc: raise ValueError('EIA response missing')
    response = doc['response']; rows = response.get('data', [])
    if int(response.get('total',0)) != len(rows): raise ValueError('EIA response incomplete: pagination or truncation')
    byyear={}
    for row in rows:
        if str(row.get('productId')) != '57' or str(row.get('activityId')) != '1' or row.get('unit') != 'TBPD':
            raise ValueError('Unexpected EIA series or unit')
        year = str(row['period'])
        if not re.fullmatch(r'\d{4}', year) or int(year) >= today.year: continue
        if row.get('countryRegionTypeId') != 'c' and row['countryRegionId'] != 'WORL': continue
        value = row.get('value')
        if value is None or value in ('--','NA'): continue
        value = float(value)
        if not math.isfinite(value) or value < 0: raise ValueError('Invalid EIA value')
        code = row['countryRegionId']
        if code == 'WORL': code='WORLD'
        if code in byyear.setdefault(year,{}): raise ValueError('Duplicate EIA country-year')
        byyear[year][code] = {
            'value': value / 1000, 'year': int(year), 'name': row['countryRegionName'],
            'rawValue': row['value'], 'rawUnit': 'thousand barrels per day',
            'flag': row.get('dataFlagDescription'),
        }
    for year, values in sorted(byyear.items(), reverse=True):
        if not {'WORLD','RUS','CHN','USA'} <= values.keys() or len(values)<201: continue
        world=values['WORLD']; countries={k:v for k,v in values.items() if k!='WORLD'}
        country_sum=sum(v['value'] for v in countries.values())
        # Catch missing positive-production countries and accidental aggregate inclusion.
        if not 50 < world['value'] < 130: raise ValueError('EIA world total implausible for crude plus condensate')
        if abs(country_sum-world['value']) > world['value']*.01: raise ValueError('EIA country values do not reconcile with world')
        return {'metric':'oil','unit':'million barrels per day','year':int(year),'world':world,'countries':countries,'countrySum':country_sum}
    raise ValueError('EIA has no complete common prior calendar year')

def usgs_gold_url(edition=2026):
    return f'https://pubs.usgs.gov/periodicals/mcs{edition}/mcs{edition}-gold.pdf'

def parse_gold_text(text, names=None):
    names = {**GOLD_NAMES, **(names or {})}
    if 'GOLD' not in text or 'gold content' not in text: raise ValueError('Not a USGS gold chapter')
    m = re.search(r'World Mine Production and Reserves:(.*?)World Resources:', text, re.S)
    if not m: raise ValueError('USGS gold production table missing')
    table = m.group(1)
    years = re.search(r'\b(20\d{2})\s+(20\d{2})e\b', table)
    if not years: raise ValueError('USGS gold year header missing or changed')
    prior, year = map(int, years.groups())
    if year != prior+1: raise ValueError('USGS gold year discontinuity')
    countries={}; world=None; other=None
    for line in table[years.end():].splitlines():
        line=line.strip()
        if not line:continue
        row = re.fullmatch(r'(.+?)\s+(e?[\d,]+)\s+(e?[\d,]+)\s+(.+)', line)
        if not row: raise ValueError('Unrecognized USGS gold table row: '+line)
        name, previous, current, reserves = row.groups()
        value = float(current.lstrip('e').replace(',',''))
        previous = float(previous.lstrip('e').replace(',',''))
        if value<0:raise ValueError('Negative gold production')
        item={'value':value,'year':year,'name':name,'estimated':True,'previousValue':previous,'previousYear':prior}
        if name == 'World total (rounded)':world=item
        elif name == 'Other countries':other=item
        elif name in names:
            code=names[name]
            if code in countries:raise ValueError('Duplicate gold country')
            countries[code]=item
        else:raise ValueError('Gold country mapping needed: '+name)
    if not world or not other or not {'USA','RUS','CHN'} <= countries.keys() or len(countries)<10:
        raise ValueError('Incomplete USGS gold table')
    country_sum=sum(v['value'] for v in countries.values())
    if abs(country_sum + other['value'] - world['value']) > world['value']*.04:
        raise ValueError('Gold table total discrepancy exceeds rounding tolerance')
    return {'metric':'gold','unit':'metric tonnes of mined gold per year','year':year,'estimated':True,'world':world,'countries':countries,'countrySum':country_sum,'otherCountries':other['value'],'roundingDifference':world['value']-country_sum-other['value']}

def parse_gold(raw, names=None):
    from pypdf import PdfReader
    pdf=PdfReader(io.BytesIO(raw))
    if len(pdf.pages)>6:raise ValueError('Expected short gold chapter, not full MCS report')
    return parse_gold_text('\n'.join(page.extract_text() for page in pdf.pages),names)


def parse_gold_reserves_text(text, names=None):
    """USGS economic underground reserves; not monetary gold holdings.
    Reuses production parser to validate country coverage and table year.
    Superscript footnotes are removed only when their footnote is present.
    """
    production = parse_gold_text(text, names)
    names={**GOLD_NAMES, **(names or {})}
    table=re.search(r'World Mine Production and Reserves:(.*?)World Resources:',text,re.S).group(1)
    years=re.search(r'\b(20\d{2})\s+(20\d{2})e\b',table)
    footnote=re.search(r'(?m)^(\d{1,2})For Australia, Joint Ore Reserves Committee',text)
    australia_marker=footnote.group(1) if footnote else None
    edition_match = re.search(r'Mineral Commodity Summaries,\s+\w+\s+(20\d{2})',text)
    if not edition_match: raise ValueError('Gold reserve report edition missing')
    edition = int(edition_match.group(1))
    countries={};world=None;other=None
    for line in table[years.end():].splitlines():
        line=line.strip()
        if not line:continue
        row=re.fullmatch(r'(.+?)\s+(e?[\d,]+)\s+(e?[\d,]+)\s+(.+)',line)
        if not row:raise ValueError('Unrecognized USGS reserve row: '+line)
        name,previous,current,reserves=row.groups()
        reserves=reserves.strip()
        if name=='Australia' and australia_marker and reserves.startswith(australia_marker):
            reserves=reserves[len(australia_marker):]
        if not re.fullmatch(r'e?\d{1,3}(?:,\d{3})*|e?\d{1,4}',reserves):
            raise ValueError('USGS reserve value or footnote changed: '+name+' '+reserves)
        value=float(reserves.lstrip('e').replace(',',''))
        item={'value':value,'year':edition,'name':name,'estimated':True,'referenceDatePrecision':'edition'}
        if name=='World total (rounded)':world=item
        elif name=='Other countries':other=item
        elif name in names:
            if name=='Australia' and footnote:
                alternative = re.search(r'For Australia, Joint Ore Reserves Committee.compliant or equivalent reserves were\s+([\d,]+)\s+tons',text)
                if not alternative: raise ValueError('Australian reserve classification footnote changed')
                item['jorcOrEquivalentTonnes']=float(alternative.group(1).replace(',',''))
                item['note']='USGS country figure; JORC-compliant or equivalent reserves are separately stated in a source footnote. National reserve classifications are not fully uniform.'
            countries[names[name]]=item
        else:raise ValueError('Reserve country mapping needed: '+name)
    if not world or not other or countries.keys()!=production['countries'].keys():raise ValueError('Incomplete USGS gold reserves')
    if not 20000<world['value']<200000 or any(x['value']>world['value'] for x in countries.values()):raise ValueError('USGS gold reserves implausible')
    country_sum=sum(x['value'] for x in countries.values())
    if abs(country_sum+other['value']-world['value']) > world['value']*.04:raise ValueError('USGS gold reserve total exceeds rounding tolerance')
    return {'metric':'goldReserves','unit':'metric tonnes of economically recoverable gold in the ground','year':edition,'period':f'оценка USGS MCS {edition}','referenceDatePrecision':'edition','estimated':True,'world':world,'countries':countries,'countrySum':country_sum,'otherCountries':other['value'],'roundingDifference':world['value']-country_sum-other['value']}


def parse_gold_reserves(raw, names=None):
    from pypdf import PdfReader
    pdf=PdfReader(io.BytesIO(raw))
    if len(pdf.pages)>6:raise ValueError('Expected short gold chapter')
    return parse_gold_reserves_text('\n'.join(page.extract_text() for page in pdf.pages),names)
