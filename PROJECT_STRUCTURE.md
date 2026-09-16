# TeraShield Project Structure

## Directory Layout

```
D:/TeraShield/
│
├── .claude/                          # Claude Code configuration
│
├── hazards-main/                     # Engine 1: Hazard Intelligence
│   ├── backend/
│   │   ├── api/
│   │   │   └── main.py              # FastAPI endpoints
│   │   ├── engine/
│   │   │   ├── contracts.py         # Data schemas
│   │   │   └── explain.py           # Risk profiling logic
│   │   ├── hazards/
│   │   │   ├── flood.py
│   │   │   ├── landslide.py
│   │   │   ├── coastal.py
│   │   │   └── cloudburst.py
│   │   ├── fusion/
│   │   │   └── red_zone.py          # Multi-hazard fusion
│   │   ├── gee/
│   │   │   ├── config.py
│   │   │   ├── pipeline.py
│   │   │   └── run_gee.py
│   │   ├── data_pipeline/
│   │   │   ├── download_data.py
│   │   │   └── preprocess_villages.py
│   │   ├── config/
│   │   │   └── settings.py
│   │   ├── Fusion_and_RedZone.ipynb
│   │   └── requirements.txt
│   └── README.md
│
├── engine-2-exposure-vulnerability-main/  # Engine 2: Exposure & Vulnerability
│   ├── Exposure_Vulnerability_Engine_2_Documentation/  # 17 docs
│   └── [Implementation TBD]
│
├── engine-3-relocation-intelligence/  # Engine 3: Relocation Intelligence
│   ├── backend/
│   │   ├── site_suitability/
│   │   ├── carrying_capacity/
│   │   ├── prioritization/
│   │   └── evacuation_routing/
│   └── [Implementation TBD]
│
├── engine-4-gis-dashboard/            # Engine 4: Integrated GIS Dashboard
│   ├── frontend/
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── Map/
│   │   │   │   ├── Dashboard/
│   │   │   │   ├── RiskTable/
│   │   │   │   └── RelocationPanel/
│   │   │   ├── pages/
│   │   │   ├── services/
│   │   │   └── App.tsx
│   │   ├── public/
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   └── tsconfig.json
│   └── [Implementation TBD]
│
├── integration/                       # Integration layer
│   ├── orchestration/
│   │   └── workflow.py               # Engine-to-engine data flow
│   ├── database/
│   │   ├── migrations/
│   │   └── schema.sql
│   └── tests/
│
├── deployment/                        # DevOps & Deployment
│   ├── docker/
│   │   ├── Dockerfile.backend
│   │   ├── Dockerfile.frontend
│   │   └── docker-compose.yml
│   ├── k8s/
│   │   ├── backend-deployment.yaml
│   │   ├── frontend-deployment.yaml
│   │   └── postgres-statefulset.yaml
│   └── ci-cd/
│       └── github-workflows/
│
├── docs/                              # Documentation
│   ├── API.md                         # OpenAPI/Swagger
│   ├── SETUP.md                       # Installation & setup
│   ├── USER_GUIDE.md                  # For authorities
│   ├── DEVELOPER_GUIDE.md             # For contributors
│   ├── ARCHITECTURE.md                # System design
│   └── DATA_DICTIONARY.md             # Field definitions
│
├── tests/                             # Integrated tests
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── data/                              # Sample & real data
│   ├── sample/                        # Demo data
│   ├── raw/                           # Downloaded real data
│   └── processed/                     # Output artifacts
│
├── PROJECT_RESEARCH.md                # This research document
├── PROJECT_STRUCTURE.md               # This file
├── IMPLEMENTATION_ROADMAP.md           # Detailed phase-wise plan
├── README.md                          # Quick start guide
└── .gitignore
```

---

## Module Dependencies

```
┌─────────────────────────────────────────────────────────────┐
│     Engine 1: Hazard Intelligence                            │
│     (Identify RED zones from 4 hazards)                      │
│     ├─ Input: Satellite data, DEM, rainfall                 │
│     └─ Output: village_risk_{district}.csv/.geojson         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│     Engine 2: Exposure & Vulnerability                       │
│     (Inventory people & assets in hazard zones)              │
│     ├─ Input: Engine 1 outputs + population/building data   │
│     └─ Output: exposed_{asset_type}_{district}.geojson      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│     Engine 3: Relocation Intelligence                        │
│     (Find safe sites & prioritize relocations)              │
│     ├─ Input: Engine 1 & 2 outputs + site suitability data  │
│     └─ Output: relocation_assignments_{district}.csv        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│     Engine 4: Integrated GIS Dashboard                       │
│     (Authority portal for decision-making)                   │
│     ├─ Input: All engine outputs + real-time data streams   │
│     └─ Output: Maps, tables, alerts, reports                │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      Data Sources                            │
├─────────────────────────────────────────────────────────────┤
│ • Google Earth Engine (DEM, rainfall, land cover)           │
│ • Survey of India (village boundaries)                       │
│ • WorldPop (population grids)                                │
│ • OSM (buildings, roads)                                     │
│ • Ministry of Census (demographics)                          │
│ • NDRF/State data (disaster history)                         │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│              Data Pipeline Layer                             │
├─────────────────────────────────────────────────────────────┤
│ • Download & validate data                                   │
│ • Standardize formats & projections                          │
│ • Handle missing data                                        │
│ • Quality checks & assertions                                │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│           Processing Layer (4 Engines)                       │
├─────────────────────────────────────────────────────────────┤
│ • Hazard Intelligence (4 risk scores)                        │
│ • Exposure & Vulnerability (asset inventory)                │
│ • Relocation Intelligence (site matching)                    │
│ • GIS Integration (spatial operations)                       │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│           Storage Layer (PostgreSQL + PostGIS)               │
├─────────────────────────────────────────────────────────────┤
│ • Villages table with geometries                             │
│ • Hazard assessments                                         │
│ • Exposure inventory                                         │
│ • Relocation assignments                                     │
│ • Audit logs                                                 │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│             API Layer (FastAPI)                              │
├─────────────────────────────────────────────────────────────┤
│ • /api/districts/*/villages                                  │
│ • /api/districts/*/exposure                                  │
│ • /api/relocation/sites                                      │
│ • /api/relocation/prioritize                                 │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│           Frontend Layer (React + Leaflet)                   │
├─────────────────────────────────────────────────────────────┤
│ • Interactive maps                                           │
│ • Risk dashboards                                            │
│ • Relocation planning tools                                  │
│ • Real-time monitoring                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## API Endpoint Organization

### Module 1: Hazard Intelligence
```
/api/v1/hazards/
  ├── /districts                    GET - List all districts
  ├── /districts/{key}              GET - District summary
  ├── /districts/{key}/villages     GET - Village GeoJSON
  ├── /districts/{key}/table        GET - Village CSV data
  └── /districts/{key}/villages/{id}
      ├── /risk                     GET - Risk profile
      ├── /explanation              GET - Risk explanation
      └── /historical               GET - Historical risk
```

### Module 2: Exposure & Vulnerability
```
/api/v1/exposure/
  ├── /districts/{key}/assets           GET - Asset summary
  ├── /districts/{key}/assets/{type}    GET - By asset type
  ├── /districts/{key}/villages/{id}/exposure
  │   └── /                             GET - Exposure profile
  ├── /vulnerability/scores             GET - Global scores
  └── /vulnerability/villages/{id}      GET - Village vulnerability
```

### Module 3: Relocation Intelligence
```
/api/v1/relocation/
  ├── /sites                            GET - Available sites
  ├── /sites/suitability                POST - Suitability analysis
  ├── /prioritize                       POST - Run prioritization
  ├── /villages/{id}/priority           GET - Priority level
  ├── /assignments                      GET - Relocation assignments
  ├── /routes                           GET - Evacuation routes
  └── /carrying-capacity/{site_id}      GET - Site capacity
```

### Module 4: Integrated Dashboard
```
/api/v1/dashboard/
  ├── /summary                          GET - KPIs & metrics
  ├── /alerts                           GET - Active alerts
  ├── /events/{event_id}                GET - Event details
  ├── /events/{event_id}/status         GET - Response status
  └── /reports                          GET - Generated reports
```

---

## Development Workflow

### Local Development
```bash
# Clone & setup
git clone <repo>
cd TeraShield
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt

# Start backend
cd backend
uvicorn api.main:app --reload --port 8000

# Start frontend
cd ../frontend
npm install
npm run dev  # Runs on port 5173

# Access
# Backend: http://localhost:8000/docs (Swagger UI)
# Frontend: http://localhost:5173
```

### Testing
```bash
# Unit tests
pytest tests/unit/

# Integration tests
pytest tests/integration/

# E2E tests
pytest tests/e2e/

# Coverage report
pytest --cov=backend tests/
```

### Deployment
```bash
# Docker build
docker-compose build

# Docker run
docker-compose up

# Kubernetes deploy
kubectl apply -f deployment/k8s/
```

---

## Key Implementation Notes

### Engine 1: Hazard Intelligence
- **Status:** API ready, GEE pipeline functional
- **Next:** Add streaming updates, real-time alerts
- **Tech:** FastAPI + GeoPandas + GEE

### Engine 2: Exposure & Vulnerability
- **Status:** Architecture documented
- **Priority:** Implement spatial intersection pipeline
- **Tech:** GeoPandas + PostgreSQL + Rasterio

### Engine 3: Relocation Intelligence
- **Status:** Needs implementation
- **Priority:** Build site suitability & prioritization
- **Tech:** Scikit-learn + routing libraries

### Engine 4: Dashboard
- **Status:** Needs implementation
- **Priority:** Create React frontend with Leaflet
- **Tech:** React + TypeScript + Leaflet

### Database
- **Setup:** PostgreSQL with PostGIS extension
- **Init:** Run migrations in `deployment/db/`
- **Backup:** Daily snapshots to S3/GCS

### Authentication
- **Current:** Demo credentials (sih/sih2026)
- **Production:** JWT + OAuth2
- **RBAC:** Different roles (admin/officer/viewer)

---

## File Naming Conventions

### Outputs
- `village_risk_{district}.csv` - Hazard scores
- `village_risk_{district}.geojson` - Spatial data
- `exposure_{asset_type}_{district}.geojson` - Exposure layers
- `vulnerability_{district}.csv` - Vulnerability scores
- `relocation_priority_{district}.csv` - Prioritized villages
- `suitable_sites_{district}.geojson` - Relocation options

### Reports
- `report_hazard_{date}_{district}.pdf`
- `report_relocation_{date}_{district}.pdf`
- `report_monitoring_{date}_{event_id}.pdf`

### Models/Training
- `model_hazard_fusion_{version}.joblib`
- `model_vulnerability_{version}.joblib`
- `model_site_suitability_{version}.joblib`

---

## Configuration Management

### Environment Variables
```env
# API
API_PORT=8000
API_HOST=0.0.0.0

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=terashield
DB_USER=postgres
DB_PASSWORD=secure_password

# Google Earth Engine
GEE_PROJECT=your-gee-project-id
GEE_CREDENTIALS=/path/to/service-account.json

# File Storage
DATA_DIR=./data
OUTPUT_DIR=./data/processed

# Feature Flags
USE_GEE=true
STREAMING_MODE=false
```

### Secrets Management
- Use `.env.local` (never commit)
- Or use GitHub Secrets for CI/CD
- Or use environment secret management (Vault, AWS Secrets Manager)

---

## Performance Targets

### API Response Times
- `/districts` list: < 100ms
- `/villages` GeoJSON: < 500ms (with caching)
- `/villages/{id}` detail: < 200ms
- Hazard calculation: 5-15 min per district (batch)
- Exposure calculation: 10-20 min per district (batch)

### Database Queries
- 100k villages queried in < 1s
- Spatial buffer/intersection: < 5s per district
- Full text search: < 100ms

### Frontend
- Map rendering: 10k villages in < 2s
- Dashboard load: < 1s
- Mobile: responsive at 375px width

### Batch Processing
- Full hazard pipeline: 15 min per district
- Exposure pipeline: 20 min per district
- Relocation prioritization: 5 min per district
- Night batch: all 24 states in < 8 hours

