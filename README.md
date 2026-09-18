# TeraShield

**Smart India Hackathon 2026 · Problem Statement 26191** — *Intelligent identification of hazard-based red zones,
carrying-capacity assessment and immediate relocation needs for vulnerable habitations* (Ministry of Home Affairs · NDRF).

TeraShield is a GIS decision-support portal for State Disaster Management Authorities. It maps multi-hazard red zones for
**594 districts across 37 states/UTs**, works out who and what is exposed, and plans where vulnerable habitations can safely
move — with real road routes checked against the live forecast.

The frontend is a **fully static site**. It needs no server or database, so it deploys to Vercel as-is.

## What is in the portal

| Module | What it does |
|---|---|
| **GIS Dashboard** | Interactive India map of RED / ORANGE / YELLOW / GREEN zones by district, per hazard or combined, with the annual probability **or a live 72-hour outlook**. Click a district for hazards, drivers, exposure, relocation need, live river discharge and Google Maps. |
| **Hazard Intelligence** | Flood, landslide, cloudburst, coastal erosion, cyclone and heatwave for all of India: probabilities, return periods, state × hazard matrix, ranked districts, filters, definitions, precautions and warning agencies. |
| **Exposure & Vulnerability** | Hazard × Exposure × Vulnerability = Risk for each district. Eleven Census-2011 vulnerability factors, a 15-category exposure framework (each variable labelled Census / derived / OpenStreetMap-live / needs survey data) and live infrastructure counts from OpenStreetMap. |
| **Relocation Intelligence** | Picks a real habitation, screens 48 candidate sites for local hazard, routes the best six on the real road network, scores each road against forecast rain and terrain, checks capacity, and ranks sites with adjustable multi-objective weights (Pareto-optimal sites flagged). Predicted / imminent / active-event phases, blocked-road re-routing, movement plan, Google Maps route. |
| **Emergency Response** (rescue login) | Operational view of the same data: live risk map and rescue-priority ranking, and the evacuation planner. Uses the same calculations as the admin dashboard, so the two portals always agree. |

### What makes it different
- **Dynamic red zones** — zones re-scored from the live forecast, not a frozen map.
- **Hazard-aware evacuation routing** — a road that will flood or slip is priced in before people are sent down it.
- **Multi-objective, explainable relocation** — safety, road, capacity, services, cost and community trade-offs with Pareto marking.
- **Honest data labelling** — every figure says whether it is live, Census, computed or still needs a survey dataset.

## Data and method

Everything is computed from public datasets by [`data-pipeline/`](data-pipeline):

| Input | Source |
|---|---|
| District boundaries | GADM district polygons (Telangana and Ladakh re-labelled) |
| Population, housing, assets, literacy | Census of India 2011, district level |
| Terrain | SRTM elevation via Open-Meteo, sampled ±13 km around each district centre |
| Rain and temperature (2014–2023) | NASA POWER (MERRA-2) daily |
| Cyclones (1990–2023) | NOAA IBTrACS, North Indian Ocean |
| Landslide history | NASA Global Landslide Catalog |
| Coast and rivers | Natural Earth 10 m |

Hazard weights follow the project's research: flood `0.35·rain + 0.25·low-elevation + 0.20·river + 0.10·flat + 0.10·built-up`,
landslide `0.45·slope + 0.25·rain + …`, cloudburst `0.70·intensity + 0.30·orographic`, coastal
`0.50·distance + 0.30·cyclone + 0.20·shoreline class`. Occurrence probability is susceptibility × trigger frequency; cyclone and
heatwave are empirical frequencies (IMD heatwave criteria). Live layers come straight from the browser:
[Open-Meteo](https://open-meteo.com) forecast and GloFAS river discharge, [OpenStreetMap](https://www.openstreetmap.org) via Overpass,
and road routing from OSRM.

**Limits.** District-scale estimates rank districts; they do not replace local surveys. NDVI, lithology and licensed asset data
are not free, and OpenStreetMap coverage varies. The methodology is stated in the app next to each figure.

## Run it

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

| Login | Password | Role |
|---|---|---|
| `sih` | `sih2026` | Admin — four analysis modules |
| `rescue` | `rescue2026` | Emergency Response Team |

The demo credentials are checked in the browser (there is no user database); production would use the SDMA's single sign-on.

```bash
npm test             # 30 unit tests (core logic + dataset consistency)
npm run build        # production build in frontend/dist
```

## Deploy to Vercel

1. Import the repository in Vercel.
2. Set **Root Directory** to `frontend` (framework: Vite — detected automatically).
3. Deploy. No environment variables are needed; [`frontend/vercel.json`](frontend/vercel.json) handles routing and caching.

## Rebuild the dataset (optional)

The generated files are committed in `frontend/public/data`. To regenerate them:

```bash
cd data-pipeline
pip install -r requirements.txt
python fetch_remote.py            # downloads elevation and 10 years of climate (cached in .cache/)
python build_india_dataset.py     # writes frontend/public/data/*.json
```

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
  public/data/    generated national dataset (districts, boundaries, coastline, history)
  src/lib/        risk model, live forecast, relocation optimiser, OSM and routing clients (unit-tested)
  src/pages/      the four modules, emergency portal, login
data-pipeline/    reproducible build of the national dataset from public sources
backend/          optional FastAPI service and tests
```
