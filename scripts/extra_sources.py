"""Country aggregates for resources, orbital activity and service availability.
Fetches are supplied by update_data so all source failures preserve the old snapshot.
"""
import copy,datetime,math,re
from resource_sources import eia_url,parse_eia,parse_gold,parse_gold_reserves,usgs_gold_url
from space_sources import build_space,LAUNCH_URL,SATELLITE_URL
STARLINK_URL='https://starlink.com/public-files/availability.json'
STARLINK_STATUSES={'launched','available','coming_soon','blacklisted','pending_regulatory','exclude','unknown'}


def apply_resource(d,p,key,source,now):
    assert p['year']>=int(d['sources'][source].get('observationYear',p['year'])),'older resource period'
    for iso,c in d['countries'].items():
        row=p['countries'].get(iso);c[key]=row['value'] if row else None
        c.setdefault('metricMeta',{})[key]={'period':str(p['year']),'estimate':bool(p.get('estimated'))}
    d['world'][key]=p['world']['value']
    d['world'].setdefault('metricMeta',{})[key]={'period':str(p['year']),'estimate':bool(p.get('estimated'))}
    d.setdefault('resourceStats',{})[key]={k:p[k] for k in ['countrySum','otherCountries','roundingDifference'] if k in p}
    d['resourceStats'][key]['countryCount']=sum(c[key] is not None for c in d['countries'].values())
    d['sources'][source].update(retrievedAt=now,period=str(p['year']),observationYear=p['year'])


def oil(d,get,getjson,now,codes):
    today=datetime.date.fromisoformat(now[:10]);url=eia_url(today=today);p=parse_eia(get(url),today)
    apply_resource(d,p,'oil','eia',now)
    d['sources']['eia'].update(dataUrl=url,definition='Добыча сырой нефти, включая промысловый конденсат: средний суточный объём за календарный год, млн баррелей. Природные газовые жидкости, биотопливо и прирост объёма переработки исключены.',note=f"Годовой показатель {p['year']}, не добыча за сегодняшний день. В таблице атласа {d['resourceStats']['oil']['countryCount']} стран и территорий. Нули взяты из источника; пропуски не заменены нулём. Время последнего пересмотра каждой записи EIA не публикуется.",refreshMode='automatic; public EIA demo access')


def gold(d,get,getjson,now,codes):
    old_edition=int(d['sources']['usgs'].get('edition',2026));edition=old_edition
    target=int(now[:4]);raw=None
    if target>old_edition:
        # Only a new calendar-year edition is probed. An unavailable new edition
        # does not erase the still-valid prior release.
        try:
            candidate=get(usgs_gold_url(target));parse_gold(candidate);parse_gold_reserves(candidate)
            assert parse_gold_reserves(candidate)['year']==target,'USGS edition mismatch'
            raw=candidate;edition=target
        except Exception:pass
    if raw is None:raw=get(usgs_gold_url(edition))
    production=parse_gold(raw);reserves=parse_gold_reserves(raw)
    assert reserves['year']==edition and production['year']==edition-1,'USGS publication/observation year mismatch'
    if edition!=old_edition:d['sources']['usgs'].pop('publicationDate',None)
    apply_resource(d,production,'gold','usgs',now)
    apply_gold_reserves(d,reserves,now,edition)
    d['sources']['usgs'].update(edition=edition,dataUrl=usgs_gold_url(edition),name=f'USGS Mineral Commodity Summaries {edition}: Gold',note=f"Оценка первичной добычи за {production['year']} год. Отдельно опубликованы {len(production['countries'])} стран; рейтинг только среди них. Остальные страны объединены в строку «прочие», а не равны нулю. Мировой итог и строки округлены независимо.",refreshMode='automatic PDF; new annual edition validated before import')


def apply_gold_reserves(d,p,now,edition=2026):
    # The reserves column has an edition date, not a reported end-of-year date.
    for iso,c in d['countries'].items():
        row=p['countries'].get(iso);c['goldReserves']=row['value'] if row else None
        c.setdefault('metricMeta',{})['goldReserves']={'period':f'USGS {edition}','estimate':True}
    d['world']['goldReserves']=p['world']['value']
    d['world'].setdefault('metricMeta',{})['goldReserves']={'period':f'USGS {edition}','estimate':True}
    d.setdefault('resourceStats',{})['goldReserves']={k:p[k] for k in ['countrySum','otherCountries','roundingDifference'] if k in p}
    d['resourceStats']['goldReserves']['countryCount']=len(p['countries'])
    au=p['countries'].get('AUS',{});au_note=f" Австралия: {au['value']:g} т в сводной оценке; {au['jorcOrEquivalentTonnes']:g} т отвечают JORC или эквиваленту." if 'jorcOrEquivalentTonnes' in au else ''
    d['sources']['usgsReserves'].update(name=f'USGS MCS {edition} · запасы золота',url='https://www.usgs.gov/centers/national-minerals-information-center/gold-statistics-and-information',dataUrl=usgs_gold_url(edition),edition=edition,period=f'оценка USGS MCS {edition}',retrievedAt=now,definition='Экономически извлекаемые запасы золота в недрах, в тоннах содержащегося металла. Золотые резервы банков и весь объём геологических ресурсов сюда не входят.',note=f"Выпуск USGS {edition}; точная дата оценки колонки запасов в таблице не указана. Отдельно опубликованы {len(p['countries'])} стран; рейтинг ограничен этой выборкой. Оценки зависят от условий разработки и национальной классификации. Мировой итог округлён отдельно.{au_note}",refreshMode='automatic PDF with production')


def space(d,get,getjson,now,codes):
    p=build_space(get(LAUNCH_URL).decode('utf-8-sig'),get(SATELLITE_URL).decode('utf-8-sig'),codes,now)
    for key in ['gcatLaunches','gcatSatellites']:
        assert p['sources'][key]['asOf']>=d['sources'][key]['asOf'],'older GCAT feed'
    for iso,c in d['countries'].items():
        c.update(p['countries'].get(iso,{}));c.setdefault('metricMeta',{})['launches']={'period':str(p['meta']['fullYear'])}
    d['world'].update(p['world']);d['world']['starlinkSatellites']=p['world']['starlinkInOrbit']
    d['world'].setdefault('metricMeta',{})['launches']={'period':str(p['meta']['fullYear'])}
    d['sources'].update(p['sources']);d['spaceStats']={'ytdYear':p['meta']['currentYear'],'unallocated':p['unallocated'],'credit':p['meta']['credit']}
    source=d['sources']['gcatSatellites']
    source['definition']='Спутники и другие полезные нагрузки в свободном полёте на околоземной орбите, включая неработающие. Подсчёт по стране владельца, указанной в текущем каталоге.'
    source['note']+=f" В мировом итоге {d['world']['satellitesUnallocated']} аппаратов с исторической или международной атрибуцией. В том числе СССР: {p['unallocated'].get('SU',{}).get('satellites',0)}; они не приписаны России."


def apply_starlink(d,raw,now,codes):
    rows=raw.get('admin0');assert isinstance(rows,dict) and len(rows)>=200,'incomplete Starlink country table'
    entries={}
    for iso2,row in rows.items():
        status=row.get('status');assert status in STARLINK_STATUSES,'unknown Starlink status'
        iso=codes.get(iso2)
        if iso is None:continue  # source-internal non-country identifiers
        assert iso not in entries,'duplicate Starlink country';entries[iso]=row
    assert len(entries)>=240 and {'RUS','CHN','USA'}<=entries.keys(),'incomplete normalized Starlink coverage'
    for iso,c in d['countries'].items():
        row=entries.get(iso,{});c['starlink']=row.get('status');expected=row.get('expected')
        c['starlinkExpected']=expected.replace('Starting in ','начиная с ').replace('Pending regulatory approval','ожидается разрешение регулятора').replace('Service date is unknown at this time','дата запуска пока неизвестна') if expected else None
    active=lambda row:row.get('status') in ['available','launched']
    w=d['world'];w['starlink']=sum(active(row) for row in entries.values());w['starlinkCountrySum']=sum(active(row) for iso,row in entries.items() if iso in d['countries']);w['starlinkUnallocated']=w['starlink']-w['starlinkCountrySum']
    d['sources']['starlink'].update(name='Starlink · официальная карта доступности',dataUrl=STARLINK_URL,retrievedAt=now,period='общестрановой статус при проверке',definition='Статус услуги по общестрановому слою официальной карты Starlink. Мировое число — страны и территории, где оператор пометил сервис доступным или запущенным.',note='Статус не измеряет число пользователей или процент покрытия и не гарантирует возможность подключения по любому адресу. «Особый режим» означает отсутствие общего статуса, а не отсутствие сервиса. Ожидаемые даты — планы оператора.',refreshMode='automatic public availability feed')
    d['sources']['starlink'].pop('lastModified',None);d['sources']['starlink'].pop('sha256',None)


def starlink(d,get,getjson,now,codes):apply_starlink(d,getjson(STARLINK_URL),now,codes)
