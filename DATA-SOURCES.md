# Источники и методика

Дата подготовки: 11.10.2026. Все наборы — снимки; автоматического фонового обновления данных нет.

## Координаты ЦОД

© OpenStreetMap contributors, ODbL 1.0 · via OpenDatacenterMap.

- Источник: [OpenDatacenterMap](https://opendatacentermap.deuxfleurs.page/), [GeoJSON](https://opendatacentermap.deuxfleurs.page/data.geojson), снимок 06.10.2026.
- [Описание проекта и лицензия](https://framagit.org/opendatacentermap/opendatacentermap-interactive/-/blob/main/README.md), [OSM copyright](https://www.openstreetmap.org/copyright), [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
- Исходные 5 006 записей. Исключены четыре явно посторонних сервисных центра; 37 lifecycle-статусов уточнены по исходным тегам. Причины и идентификаторы перечислены в `docs/data/datacenters.json`, поле `metadata`.
- Итог 5 002 точки: 4 807 functional, 157 construction, 35 proposed, 3 inactive. Начальный фильтр functional + construction: 4 964.
- Исходные координаты сохранены. Для OSM node это точка; для way/relation — центр ограничивающего прямоугольника контура. Это не координаты центров стран или городов.
- Страна: `addr:country`, где доступно, иначе пересечение с полигонами Natural Earth 1:10m. У 38 прибрежных/пограничных точек код страны не присвоен. 115 стран с присвоенными кодами; Россия 79, Китай 121.
- Метка functional означает состояние тегов OSM, не независимое подтверждение работы. Один кампус может быть представлен несколькими зданиями. Пространственные кластеры объединяют точки только на экране и не меняют данные.
- Производная база `docs/data/datacenters.json` распространяется по ODbL 1.0. Каждый объект содержит ссылку на запись OSM. Примеры Selectel Tsvetochnaya 1 и Tencent Gui’an Qixing Data Center дополнительно сверены с официальным OSM API.

## Координаты атомных блоков

Global Nuclear Power Tracker, Global Energy Monitor, August 2026 release. CC BY 4.0. Adapted: selected operating/construction units, grouped by project ID and source coordinates; selected names translated.

- [Страница GNPT](https://globalenergymonitor.org/projects/global-nuclear-power-tracker), [официальный конфиг карты](https://github.com/GlobalEnergyMonitor/interim-maps/blob/main/trackers/gnpt/config.js), [публичный GeoJSON](https://publicgemdata.nyc3.cdn.digitaloceanspaces.com/Current_maps/gnpt/gnpt_map_2026-08.geojson).
- [Лицензия GEM](https://globalenergymonitor.org/creative-commons-license), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- Из 1 825 блоков выбраны 424 operating и 85 construction. Точка объединяет блоки одного проекта только при совпадении исходных координат: 208 точек, 196 project-id, 36 стран.
- 201 точка exact; 7 approximate, относящихся к 9 строящимся блокам. Все блоки operating имеют exact. Категория exact означает точку площадки по методике GEM, не геодезическую точность.
- Россия: 13 точек, 12 проектов, 34 operating + 7 construction. Китай: 27 точек, 26 проектов, 61 + 36.
- Operating — реестровая категория, не оперативная генерация. В частности, шесть блоков Запорожской АЭС имеют этот статус в GEM; карточка содержит пояснение. Construction может включать подготовку площадки.
- Мощности GEM — номинальные электрические. Они отличаются от net capacity МАГАТЭ. Координаты не усреднялись и не смещались; при разнесении совпадающих маркеров используются временные линии интерфейса Leaflet.

## Статистика стран

| Слой | Источник | Период и определение |
|---|---|---|
| Электроэнергия | [Ember Global Electricity Review 2026](https://ember-energy.org/latest-insights/global-electricity-review-2026/supporting-materials/) | Мир 2025: 31 779,37 ТВт·ч. Страны — последний доступный год отчёта, без смешения годов в мировом итоге. Данные Ember: CC BY 4.0. |
| Национальные итоги ЦОД | [Data Center Map](https://www.datacentermap.com/datacenters/) | Просмотр 11.10.2026. Счётчик 12 259, сумма стран 12 257. Отдельный открытый каталог; координаты объектов DCM не перепубликуются. |
| Покрытие 5G по странам | [GSMA Mobile Connectivity Index](https://www.mobileconnectivityindex.com/) | Выпуск 2026, показатель coverage5g за 2025. Доля населения, не площадь. |
| Покрытие 5G, мир | [ITU Facts and Figures 2025](https://www.itu.int/itu-d/reports/statistics/2025/10/15/ff25-mobile-network-coverage/) | 55,1% населения. Отдельная оценка, не среднее GSMA. |
| Атомные итоги | [МАГАТЭ RDS-1/46](https://www.iaea.org/publications/16057/energy-electricity-and-nuclear-power-estimates-for-the-period-up-to-2060) | Конец 2025: 413 блоков, 377,076 ГВт; 72 в строительстве. Сентябрь 2026. |
| Базовые станции Китая | [MIIT / Госсовет КНР](https://english.www.gov.cn/archive/statistics/202601/28/content_WS6979f123c6d00ca5f9a08ce7.html) | 4,838 млн к концу 2025. |

Годовая атомная выработка в карточках взята из Ember. Показатели МАГАТЭ и GEM отличаются по дате, статусам и определению мощности. Карта не показывает оперативное состояние энергосистем или текущую загрузку объектов.

## Солнце

- [IAU 2015 Resolution B3](https://arxiv.org/abs/1510.07674): номинальная светимость 3,828 × 10²⁶ Вт, irradiance 1361 Вт/м².
- [NASA solar irradiance](https://earth.gsfc.nasa.gov/climate/projects/solar-irradiance/science).
- Радиус Земли 6 371 000 м; площадь перехвата πR². Получается около 173 549 ТВт падающего излучения.
- Средняя мировая электрическая мощность: 31 779,37 / 8760 = 3,62778 ТВт.
- Время энергетического эквивалента года выработки: 10,98685 минуты перехватываемого света либо 0,298866 микросекунды полной светимости. Это не доступная электрогенерация: отражение, сбор и КПД преобразования здесь не учитываются.

## Прогнозы и космос

Ссылки, даты и тип утверждения находятся прямо в соответствующих разделах. Прогнозы IEA, Ericsson и сценарии МАГАТЭ отделены от исторических данных. Проекты Google/Planet, NASA/DOE и Роскосмоса не суммируются с земной выработкой; сроки намерений не означают гарантированного ввода. Caltech MAPLE описан как эксперимент, китайское событие 2025 года — как запуск спутников.

## География, библиотеки и тайлы

- Геометрия: [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/), public domain; опубликованный TopoJSON `@d3-maps/atlas@1.0.0/world/countries/countries-110m`. Географические названия: [mledoze/countries](https://github.com/mledoze/countries), ODbL 1.0; база стран в `docs/data/countries.json` сохраняет атрибуцию.
- Leaflet 1.9.4 (BSD-2-Clause), Leaflet.markercluster 1.5.3 (MIT), D3 7.9.0 (ISC), topojson-client 3.1.0 (ISC). Лицензии включены в `docs/vendor/`.
- Детальная подложка: OpenStreetMap; действуют [условия использования тайлов](https://operations.osmfoundation.org/policies/tiles/). Атрибуция всегда видима. Нет пакетного скачивания, предзагрузки городов или кэширования тайлов service worker. Тесты жестов блокируют обращения к тайлам, чтобы не создавать автоматическую нагрузку на общий сервер.
