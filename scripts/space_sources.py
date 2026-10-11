#!/usr/bin/env python3
"""Reproducible country aggregates from CC-BY GCAT, using standard library only.

Network downloader intentionally left to the caller. Call build_space() with the
two TSV strings, ISO-3166 alpha-2 -> alpha-3 mapping, and the retrieval timestamp.
The CLI below reads the research snapshots already saved beside this script.
"""
import csv
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

BASE = "https://planet4589.org/space/gcat/"
LAUNCH_URL = BASE + "tsv/derived/launchlog.tsv"
SATELLITE_URL = BASE + "tsv/derived/currentcat.tsv"
MONTHS = {name: i + 1 for i, name in enumerate(
    "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split())}
# GCAT's country identifiers are not ISO-3166. Only explicit safe equivalents
# are normalized. Historical sovereign states and international organizations
# remain separate rather than silently credited to a modern successor country.
GCAT_TO_ISO2 = {
    "B": "BE", "D": "DE", "E": "ES", "F": "FR", "I": "IT",
    "J": "JP", "L": "LU", "N": "NO", "P": "PT", "S": "SE",
    "T": "TH", "UK": "GB", "UAE": "AE", "CYM": "KY",
    "BGN": "BG", "ESIB": "ES",
}
UNALLOCATED_NAMES = {
    "SU": "СССР (историческая атрибуция каталога)",
    "CSSR": "Чехословакия (историческая атрибуция)",
    "CSFR": "Чешская и Словацкая Федеративная Республика (историческая атрибуция)",
    "HKUK": "Британский Гонконг (историческая атрибуция)",
    "I-ESA": "Европейское космическое агентство",
    "I-EU": "Европейский союз", "I-EUM": "EUMETSAT",
    "I-ARAB": "Arabsat", "I-NATO": "НАТО", "I-RASC": "RASCOM",
    "I-INM": "Inmarsat (международная атрибуция каталога)",
}


def parse_tsv(text):
    lines = text.splitlines()
    assert lines and lines[0].startswith("#"), "Missing GCAT TSV header"
    match = re.search(r"^# Updated (\d{4}) (\w{3})\s+(\d+)\s+(\d{2})(\d{2}):(\d{2})", text, re.M)
    assert match, "Missing GCAT update timestamp"
    y, month, day, hour, minute, second = match.groups()
    updated = datetime(int(y), MONTHS[month], int(day), int(hour), int(minute), int(second), tzinfo=timezone.utc)
    reader = csv.DictReader([lines[0].lstrip("#")] + [x for x in lines[1:] if x and not x.startswith("#")], delimiter="\t")
    rows = [{k: (v or "").strip() for k, v in r.items()} for r in reader]
    return rows, updated.isoformat().replace("+00:00", "Z")


def date_prefix(value):
    m = re.match(r"(\d{4}) (\w{3})\s+(\d+)", value)
    if not m:
        raise ValueError(f"Unusable GCAT launch date: {value!r}")
    y, month, day = m.groups()
    return f"{int(y):04d}-{MONTHS[month]:02d}-{int(day):02d}"


def build_space(launch_text, current_text, iso_codes, retrieved_at, current_year=None):
    launch_rows, launch_updated = parse_tsv(launch_text)
    sat_rows, satellite_updated = parse_tsv(current_text)
    current_year = current_year or int(retrieved_at[:4])
    full_year = current_year - 1
    all_iso3 = sorted(set(iso_codes.values()))
    countries = {iso: {"launches": 0, "launchesYtd": 0, "satellites": 0, "activeSatellites": 0} for iso in all_iso3}
    unallocated = {}

    def iso3(gcat_code):
        return iso_codes.get(GCAT_TO_ISO2.get(gcat_code, gcat_code))

    def increment(code, metric):
        iso = iso3(code)
        if iso:
            countries[iso][metric] += 1
        else:
            item = unallocated.setdefault(code, {"name": UNALLOCATED_NAMES.get(code, code), "launches": 0, "launchesYtd": 0, "satellites": 0, "activeSatellites": 0})
            item[metric] += 1

    # launchlog has one row per payload, sometimes many hundreds per launch.
    # Count unique flights, and require consistent country/date for every payload.
    launches = {}
    for row in launch_rows:
        raw_year = row["Launch_Date"][:4]
        if raw_year not in (str(full_year), str(current_year)):
            continue
        code = row["Launch_Code"]
        if code[:1] not in ("O", "D") or code[1:2] == "E":
            continue
        key = row["Launch_Tag"]
        item = {"year": int(raw_year), "date": date_prefix(row["Launch_Date"]), "state": row["LVState"], "code": code}
        if key in launches:
            assert launches[key] == item, f"Inconsistent launch metadata for {key}"
        else:
            launches[key] = item
    assert len(launches) >= 100, "GCAT launch feed unexpectedly small"
    for item in launches.values():
        increment(item["state"], "launches" if item["year"] == full_year else "launchesYtd")

    # Exact physical metric: distinct catalogued payloads in free flight around
    # Earth, including inactive payloads; excludes debris, rocket stages, attached
    # instruments, reentries, solar/lunar/planetary orbit, and unknown/lost status.
    assert len(sat_rows) > 50000, "GCAT current-object feed unexpectedly small"
    earth_payloads = [row for row in sat_rows if row["Type"].startswith("P") and row["ExpandedStatus"] == "In Earth orbit"]
    assert len({r["JCAT"] for r in earth_payloads}) == len(earth_payloads), "Duplicate GCAT object IDs"
    assert len(earth_payloads) > 10000, "Unexpected Earth payload count"
    for row in earth_payloads:
        increment(row["State"], "satellites")
        if row["Active"] == "A":
            increment(row["State"], "activeSatellites")
    starlink = [r for r in earth_payloads if re.match(r"^Starlink \d+", r["Name"])]
    assert starlink and all(r["State"] == "US" and r["Owner"] == "SPXS" for r in starlink), "Unexpected Starlink attribution"
    world = {
        "launches": sum(x["year"] == full_year for x in launches.values()),
        "launchesYear": full_year,
        "launchesYtd": sum(x["year"] == current_year for x in launches.values()),
        "launchesYtdYear": current_year,
        "launchesYtdPeriod": f"{current_year}-01-01 — {launch_updated[:10]}",
        "launchesLastRecordedDate": max(x["date"] for x in launches.values()),
        "satellites": len(earth_payloads),
        "activeSatellites": sum(r["Active"] == "A" for r in earth_payloads),
        "starlinkInOrbit": len(starlink),
        "starlinkActive": sum(r["Active"] == "A" for r in starlink),
    }
    for metric in ("launches", "launchesYtd", "satellites", "activeSatellites"):
        country_sum = sum(c[metric] for c in countries.values())
        unallocated_sum = sum(c[metric] for c in unallocated.values())
        assert country_sum + unallocated_sum == world[metric], f"Unreconciled {metric}"
        world[metric + "CountrySum"] = country_sum
        world[metric + "Unallocated"] = unallocated_sum

    sources = {
        "gcatLaunches": {
            "name": "GCAT — Jonathan C. McDowell: Orbital Launch Log",
            "url": BASE + "web/cat/llog.html", "dataUrl": LAUNCH_URL,
            "retrievedAt": retrieved_at, "asOf": launch_updated,
            "period": str(full_year), "license": "CC BY 4.0",
            "definition": "Число уникальных орбитальных и дальних космических пусковых попыток (коды GCAT O/D), включая неудачные и частично успешные, по стране агентства пусковых услуг (LVState). Один пуск учитывается один раз независимо от числа спутников.",
            "note": "Методика GCAT включает предельные траектории и испытания с орбитальной энергией, поэтому итог отличается от подсчётов с их исключением. Обычные суборбитальные пуски и аварии на стартовом столе исключены. Rocket Lab New Zealand отнесён к Новой Зеландии; Arianespace — к Франции. Это страна агентства, а не место старта или страна владельца спутника. Текущий год неполный; обновление каталога не гарантирует отсутствия задержки регистрации последних пусков.",
        },
        "gcatSatellites": {
            "name": "GCAT — Jonathan C. McDowell: Current Object Catalog",
            "url": BASE + "web/cat/curcols.html", "dataUrl": SATELLITE_URL,
            "retrievedAt": retrieved_at, "asOf": satellite_updated,
            "period": satellite_updated[:10], "license": "CC BY 4.0",
            "definition": "Спутники и другие полезные нагрузки в свободном полёте на околоземной орбите, включая неработающие: Type начинается с P, текущий статус In Earth orbit. Подсчёт уникальных JCAT по текущему State владельца.",
            "note": "Обломки, ступени ракет, прикреплённые приборы, сошедшие с орбиты аппараты, неизвестные/потерянные объекты и полёты за пределами орбиты Земли исключены. Исторические государства и международные организации включены в мировой итог, но не приписаны современным странам. Активные — подмножество с флагом A; работоспособность является оценкой каталога, а не телеметрическим подтверждением. Ноль означает отсутствие записей по этому определению.",
        },
    }
    return {
        "schema": 1,
        "meta": {"checkedAt": retrieved_at, "currentYear": current_year, "fullYear": full_year, "credit": "Data from GCAT (J. McDowell, planet4589.org/space/gcat), CC BY 4.0", "zeroMeaning": "Нет объектов/пусков в выбранной категории каталога; не универсальное доказательство отсутствия космической деятельности."},
        "sources": sources, "world": world, "countries": countries,
        "unallocated": unallocated,
        "starlink": {"inOrbit": world["starlinkInOrbit"], "activeFlag": world["starlinkActive"], "asOf": satellite_updated, "source": "gcatSatellites", "definition": "Подмножество околоземных полезных нагрузок GCAT, название Starlink + цифровой номер, владелец SPXS. Это число аппаратов на орбите, а не число работающих в штатной группировке или абонентов."},
    }

