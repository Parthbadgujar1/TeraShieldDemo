# TeraShield

**Smart India Hackathon 2026 · Problem Statement 26191** — *Intelligent identification of hazard-based red zones,
carrying-capacity assessment and immediate relocation needs for vulnerable habitations* (Ministry of Home Affairs · NDRF).

TeraShield is a GIS decision-support portal for State Disaster Management Authorities. It screens **594 districts across
37 states/UTs** for flood, landslide, cloudburst, cyclone and coastal-erosion hazard, then goes **below district level** — habitation-level
red-zone polygons for a pilot district — and plans the *permanent* resettlement that PS 26191 is actually about.

The frontend is a **fully static site**. It needs no server or database, so it deploys to Vercel as-is.

## The idea in one paragraph

A district is not a red zone. The problem statement defines red zones as *areas unsuitable for permanent habitation*, which is a judgement made per
habitation. TeraShield therefore keeps the national map as a **screening layer** (hazard tiers), drills into a **pilot district** for red-zone polygons,
buildings, people and candidate sites, and separates **permanent resettlement** (land, livelihood, approvals, months to years) from **emergency
evacuation** (buses, waves, time-to-impact, hours to days). Forecasts can only *raise an alert* on top of the baseline — a dry week never relabels land
as safe — and zones only move down with recorded evidence and an officer's sign-off.

## What is in the portal

| Module | What it does |
|---|---|
| **GIS Dashboard** | India map of hazard tiers per district, per hazard or combined. Baseline or a **72 h alert overlay** (live Open-Meteo forecast, or a **replay** of a real event — Beas floods 2023, Wayanad 2024, Cyclone Michaung 2023). Real **NDMA SACHET** alerts outlined on the map. District panel: drivers, exposure, terrain, seismicity, evidence completeness, rank stability. |
| **Hazard Intelligence** | Flood, landslide, cloudburst potential, cyclone, heatwave (stress) and a coastal-erosion susceptibility index for every district: probabilities, return periods, state × hazard matrix, ranked districts, definitions, precautions, warning agencies. |
| **Exposure & Vulnerability** | Risk = Hazard × (½ Exposure + ½ Vulnerability). Twelve vulnerability factors (eleven Census-2011 + heat stress), a 15-category exposure framework (every variable labelled Census / derived / OpenStreetMap-live / needs survey data) and live OSM infrastructure counts. A timed-out OSM query is shown as *n/a*, never as zero. |
| **Relocation Intelligence** | Two separate tracks. **Permanent resettlement** (Wayanad pilot): red/orange terrain polygons below village level, 240 habitations with buildings and people, candidate sites with hard rejects, land-status → approval route, capacity = min(space, water, access), a *relocation-durability* score, one-village-one-site, a months-to-years timeline and the next monsoon it can beat. **Emergency evacuation**: 48 sampled sites, hard-reject on high local susceptibility, road routes scored against the forecast, Pareto front, bus-and-wave plan, blocked-road re-routing. |
| **Action Plan** | Immediate / short-term / medium-term relocation lists with reasons, priced with editable assumptions (PMAY-G ₹1.20 L plains / ₹1.30 L hills, SDRF ₹4 L), best set under a **budget cap**, protect-vs-adapt-vs-relocate comparison with break-even, exports: **CSV, GeoJSON, Markdown, print-to-PDF**. |
| **Validation & Data** | **Backtest** (frozen on 2014, tested on later landslides and cyclones, honest baselines, 500-set weight sensitivity, logistic-regression cross-check). **Data Lab** (upload CSV/GeoJSON habitations and your own red-zone polygons; schema mapping and validation report). **Zone Register** (Screened → Verified → Notified → Relocating → Vacated → Monitored; ratchet-only, SHA-256 hash-chained audit log). |
| **Emergency Response** (`rescue` login) | Operational view of the same data and shared calculations as the admin dashboard, so the two portals always agree. |

### What makes it different
- **Below-district red zones** with buildings, people, land status and approvals — not just coloured districts.
- **Evidence-ratcheted zones** and a tamper-evident register: "what did the system know that day".
- **Permanent resettlement separated from evacuation**, with durability (will families stay?) and a timeline against the monsoon.
- **A real accuracy number** — and the baselines it does *not* beat, stated plainly.
- **Honest data labelling** — every figure says whether it is live, Census, computed, a proxy or still needs a survey.

## Data and method

Everything is computed from public datasets by [`data-pipeline/`](data-pipeline):

| Input | Source |
|---|---|
| District boundaries | GADM district polygons (2011-era, 594 districts; modern spellings applied) |
| Population, housing, assets, literacy | Census of India 2011, district level |
| Terrain | AWS Terrain Tiles (SRTM-derived), **zonal statistics over each district polygon** (relief, slope, share of area > 15° / 30°) |
| Rain and temperature (2014–2023) | NASA POWER (MERRA-2) daily |
| Cyclones (1990–2023) | NOAA IBTrACS, North Indian Ocean |
| Landslide history | NASA Global Landslide Catalog |
| Seismicity | USGS ComCat M ≥ 4.5, 1990–2023 (context only; **not** the BIS IS 1893 zone map) |
| Coast and rivers | Natural Earth 10 m |
| Official alerts | NDMA SACHET CAP feed (snapshot, refreshed every 6 h by a GitHub Action) |
| Pilot: terrain, drainage, settlements, buildings, land use | AWS Terrain Tiles z12 (37 m), OpenStreetMap, WorldPop 2020 (1 km) |
| Live layers (browser) | Open-Meteo forecast + GloFAS, OpenStreetMap (Overpass), OSRM |

**Hazard model.** Susceptibility from weighted factors × trigger frequency → annual probability. The zone uses **flood, landslide, cloudburst and cyclone only**:
composite = 0.6·max + 0.4·mean(top 3). **Heatwave** (IMD criteria) is stress: it feeds vulnerability, not the zone. **Coastal erosion** is a *rate*
(m/yr) that needs multi-year shoreline data, so it is a susceptibility index that can lift a district to High but never to Very high.
**Cloudburst** is labelled *potential* (a ~50 km reanalysis grid cannot see a cloudburst).

**Tiers and horizons.** Priority = 0.35 zone + 0.25 vulnerability + 0.15 exposure + 0.15 history + 0.10 feasibility. Tier gating: low-hazard land is never
on a relocation list and moderate-hazard land is at most medium-term. Rank stability is reported over 1,000 random weight sets.

**Pilot terrain rules** (screening, not a geotechnical survey): RED — slope ≥ 30° | ≤ 2 m above a stream within 60 m | slope ≥ 20° within 60 m of ≥ 30° ground;
ORANGE — slope 20–30° | ≤ 6 m above a stream within 200 m | slope ≥ 12° within 150 m of ≥ 30° ground. Sites need slope ≤ 10°, ≥ 300 m from steep ground,
≥ 2 ha; usable parcel capped at 40 ha.

### Validation results (held-out; `python data-pipeline/validate.py`)

| Test | Result |
|---|---|
| Landslide, frozen at 2014, tested on 2015–2023 catalogue events | **AUC 0.78** (95% CI 0.74–0.81); top-20% of districts catch 42% of later-landslide districts (2.1× random) |
| Same, with no event history at all | AUC 0.73 — it can rank districts that have never had a reported event |
| Baseline: count of past catalogued events only | **AUC 0.84 — this beats the composite score** (landslides cluster where they are reported) |
| Weight sensitivity (500 random weight sets) | AUC stays within 0.73–0.82 |
| Cyclone, 1990–2013 frequency → 2014–2023 storms | AUC 0.82 |
| Flood, cloudburst, coastal erosion, heatwave | **not validated** — no open event inventory ingested |

### Known limits
- District boundaries are 2011-era (594 districts, India now has 750+) and are indicative, not the Survey of India depiction.
- The pilot uses terrain + drainage only (no lithology, soil depth, land cover); population is WorldPop apportioned to OSM buildings; land status is an OSM proxy, not Bhulekh or forest-department records.
- Capacity water and sanitation are proxies / unvalidated until surveyed. Census 2011 has no free 0–6 or disability district tables in this dataset, so "young (0–29)" and the national 2.21% disability rate are labelled as such.
- Not built (needs data we cannot reach from a static site): shoreline/river-bank **arrival clock** (Earth Engine time series), Open-Buildings re-entry monitoring, upstream **glacial-lake cascade graph**, host-community stress (CGWB/UDISE+/IPHS), CMIP6 design-life check, IMD district warnings (no CORS), Bhuvan WMS, BIS seismic zones.
- The demo login is checked in the browser; production would use the SDMA's single sign-on. The Zone Register lives in the browser (proves internal consistency only).

## Run it

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

| Login | Password | Role |
|---|---|---|
| `sih` | `sih2026` | Admin — six analysis modules |
| `rescue` | `rescue2026` | Emergency Response Team |

```bash
npm test             # 66 unit tests (model, live overlay, evacuation, resettlement, plan economics, lifecycle chain, Data Lab, shipped data)
npm run build        # production build in frontend/dist
```

## Deploy to Vercel

1. Import the repository in Vercel.
2. Set **Root Directory** to `frontend` (framework: Vite — detected automatically).
3. Deploy. No environment variables are needed; [`frontend/vercel.json`](frontend/vercel.json) handles routing and caching.

[`.github/workflows/refresh-alerts.yml`](.github/workflows/refresh-alerts.yml) snapshots the NDMA feed every six hours and pushes `alerts.json`, which triggers a fresh deployment.

## Rebuild the dataset (optional)

The generated files are committed in `frontend/public/data`. To regenerate them:

```bash
cd data-pipeline
pip install -r requirements.txt
python fetch_remote.py            # climate (NASA POWER), cached in .cache/
python fetch_dem.py               # terrain tiles + zonal statistics (~850 tiles)
python build_india_dataset.py     # districts, tiers, rank stability, seismicity → frontend/public/data/*.json
python build_pilot.py Wayanad     # habitation-level pilot (needs OSM via Overpass + WorldPop, cached)
python validate.py                # temporal hold-out backtest → validation.json
python build_replays.py           # ERA5 replay packs
python fetch_alerts.py            # NDMA SACHET snapshot
```

To add a pilot district, run `build_pilot.py "<District>"` and add its slug to `PILOT_SLUGS` in `frontend/src/lib/data.ts`.

## Backend (optional)

[`backend/`](backend) is a FastAPI service with the original live pilot engine for Chamoli and Kendrapara and a PostGIS schema.
The deployed portal does not use it. To run it:

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --port 8000 --reload
pytest tests
```

## Repository layout

```
frontend/         React + TypeScript + Vite static site (Leaflet maps) — this is what gets deployed
  public/data/    generated national dataset, pilot, validation, replays, alerts
  src/lib/        risk model, alert overlay, evacuation + resettlement engines, plan economics, lifecycle chain, Data Lab (unit-tested)
  src/pages/      GIS, Hazard, Exposure, Relocation (permanent + evacuation), Action Plan, Validation & Data, Emergency, Login
data-pipeline/    reproducible build of every dataset above from public sources
backend/          optional FastAPI service and tests
```
