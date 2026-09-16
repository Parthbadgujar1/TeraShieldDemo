# TeraShield Build Checklist

**Master checklist for tracking progress across all 4 engines and dashboard.**

---

## 🟢 PHASE 0: Research & Planning (COMPLETE)

- [x] Problem statement analysis
- [x] Competitive analysis (GDACS, Project NOAH, Think Hazard)
- [x] User persona identification (District Magistrate, NDRF, State Officials)
- [x] Workflow design (Before/During/After)
- [x] Technology stack selection
- [x] Architecture document
- [x] Database schema design
- [x] API schema design
- [x] Project structure creation
- [x] Implementation roadmap (12 weeks)

**Status:** ✅ DONE | **Owner:** @claude | **DueDate:** Sept 15

---

## 🟡 PHASE 1A: Engine 1 Polish (IN PROGRESS)

### Code Quality
- [ ] Add docstrings to all functions
  - [ ] `backend/hazards/*.py` (4 sensors)
  - [ ] `backend/fusion/red_zone.py`
  - [ ] `backend/engine/explain.py`
  - [ ] `backend/gee/*.py`

- [ ] Add type hints
  - [ ] Function signatures (all input params)
  - [ ] Return types
  - [ ] Class variables
  - [ ] Run `mypy` to check coverage

- [ ] Error handling
  - [ ] GEE API failures (rate limits, timeouts)
  - [ ] Missing data files
  - [ ] Invalid geometries
  - [ ] Database connection errors

### Testing (Target: 80%+ coverage)
- [ ] Unit tests for hazard sensors
  - [ ] `test_flood.py` (flood scoring logic)
  - [ ] `test_landslide.py`
  - [ ] `test_coastal.py`
  - [ ] `test_cloudburst.py`
  
- [ ] Fusion model tests
  - [ ] Test multi-hazard score calculation
  - [ ] Test risk category classification
  - [ ] Test edge cases (all scores = 0, all = 1)
  - [ ] Test weighted average formula

- [ ] API endpoint tests
  - [ ] GET /api/districts
  - [ ] GET /api/districts/{key}/villages
  - [ ] GET /api/districts/{key}/table
  - [ ] GET /api/districts/{key}/villages/{id}/risk
  - [ ] GET /api/search

- [ ] Integration tests
  - [ ] Data pipeline → Fusion → Output
  - [ ] Village detail consistency (CSV vs GeoJSON)
  - [ ] Risk score monotonicity (checks not regressed)

- [ ] Run coverage: `pytest --cov=backend tests/`

### Documentation
- [ ] Update backend/README.md
- [ ] Add GEE setup guide (step-by-step)
- [ ] Troubleshooting guide (common issues)
- [ ] API examples (curl/Python/JavaScript)
- [ ] Data dictionary (all CSV columns)

### Performance
- [ ] Profile GEE pipeline (identify bottleneck)
- [ ] Optimize village aggregation (spatial groupby)
- [ ] Add Redis caching for API responses
- [ ] Benchmark: < 500ms for village list

### API Documentation
- [ ] Swagger/OpenAPI docs complete
- [ ] All endpoints documented with examples
- [ ] Authentication explained
- [ ] Error codes documented

**Estimated:** Week 3 | **Owner:** @[friend1] | **Status:** 🟡 In Progress

---

## 🟡 PHASE 1B: Engine 2 Setup (IN PROGRESS)

### Directory Structure
```
engine-2-exposure-vulnerability/
├── backend/
│   ├── __init__.py
│   ├── exposure/
│   │   ├── __init__.py
│   │   ├── population.py
│   │   ├── buildings.py
│   │   ├── infrastructure.py
│   │   ├── assets.py
│   │   └── tests/
│   ├── vulnerability/
│   │   ├── __init__.py
│   │   ├── calculator.py
│   │   ├── factors.py
│   │   └── tests/
│   ├── api/
│   │   ├── __init__.py
│   │   ├── endpoints.py
│   │   └── models.py
│   ├── config/
│   │   └── settings.py
│   └── requirements.txt
├── tests/
├── docs/
└── README.md
```

- [ ] Create directory structure
- [ ] Create `__init__.py` files
- [ ] Create `requirements.txt` with dependencies
  - [ ] GeoPandas, Rasterio, Shapely
  - [ ] Pandas, NumPy, Scikit-learn
  - [ ] FastAPI, SQLAlchemy, Pydantic

### Data Pipeline
- [ ] Download exposure datasets
  - [ ] WorldPop 100m grids
  - [ ] OSM buildings extract
  - [ ] Government hospital/school registries
  - [ ] FAO livestock density

- [ ] Preprocessing
  - [ ] Reproject to common CRS (EPSG:4326)
  - [ ] Handle missing data (flag & document)
  - [ ] Validate geometries (no self-intersections)
  - [ ] Create spatial indexes

- [ ] Database ingestion
  - [ ] Create tables in PostgreSQL
  - [ ] Load preprocessed data
  - [ ] Create spatial indexes (GIST)
  - [ ] Verify row counts

### Requirements File
```text
geopandas>=0.12.0
rasterio>=1.3.0
shapely>=2.0.0
pandas>=1.5.0
numpy>=1.23.0
scikit-learn>=1.2.0
fastapi>=0.95.0
sqlalchemy>=2.0.0
pydantic>=1.10.0
psycopg2-binary>=2.9.0
```

**Estimated:** Week 3-4 | **Owner:** @[friend2] | **Status:** 🟡 Setup Phase

---

## 🟡 PHASE 2: Engine 2 Implementation (Week 4-5)

### Exposure Module

#### Population Exposure
- [ ] `exposure/population.py`
  - [ ] Load WorldPop grids per district
  - [ ] Intersect with hazard zones (from Engine 1)
  - [ ] Aggregate to village level
  - [ ] Calculate demographics (age groups from raster)
  - [ ] Output: `population_exposed_{district}.geojson`

- [ ] Tests
  - [ ] Test spatial intersection
  - [ ] Verify aggregation (totals match)
  - [ ] Edge case: village 0 exposure

#### Building Exposure
- [ ] `exposure/buildings.py`
  - [ ] Fetch OSM buildings (use Overpass API or local data)
  - [ ] Classify types (residential/commercial/industrial)
  - [ ] Count buildings per village per hazard zone
  - [ ] Estimate occupancy (residential: 5 per building)
  - [ ] Output: `buildings_exposed_{district}.geojson`

- [ ] Tests
  - [ ] Verify building counts by type
  - [ ] Occupancy estimation logic

#### Critical Infrastructure
- [ ] `exposure/infrastructure.py`
  - [ ] Load hospitals, clinics, schools
  - [ ] Flag those in RED zones (critical!)
  - [ ] Calculate criticality score (hospital > school > power)
  - [ ] Distance to nearest safe facility (for evacuees)
  - [ ] Output: `critical_facilities_risk_{district}.geojson`

- [ ] Tests
  - [ ] Verify hospital detection
  - [ ] Criticality scoring

#### Livelihoods & Assets
- [ ] `exposure/assets.py`
  - [ ] Identify agricultural lands (from land cover)
  - [ ] Estimate livestock (via FAO density grids)
  - [ ] Locate markets/trading points
  - [ ] Calculate economic exposure (rough estimate)
  - [ ] Output: `economic_assets_exposed_{district}.geojson`

### Vulnerability Module

#### Factor Calculation
- [ ] `vulnerability/calculator.py`
  - [ ] Read demographic data (census by village)
  - [ ] Calculate factors:
    - [ ] Age vulnerability (young & elderly higher)
    - [ ] Income vulnerability (low income → high vulnerability)
    - [ ] Healthcare access (distance to clinic)
    - [ ] Education (literacy rate inverse)
    - [ ] Disability (% with disability)
    - [ ] Housing quality (% pucca houses)

#### Score Aggregation
- [ ] `vulnerability/factors.py`
  - [ ] Normalize each factor to 0-1 range
  - [ ] Apply research-based weights
  - [ ] Aggregate to composite score
  - [ ] Classify as High/Medium/Low
  - [ ] Generate evidence JSON (which factors contributed)

### API Integration
- [ ] Modify `backend/api/main.py` to add Engine 2 endpoints:
  - [ ] `GET /api/v1/exposure/districts/{key}/assets` - Asset summary
  - [ ] `GET /api/v1/exposure/districts/{key}/assets/{type}` - By type
  - [ ] `GET /api/v1/vulnerability/scores` - Global scores
  - [ ] `GET /api/v1/vulnerability/villages/{id}` - Village vuln

- [ ] Response schemas (Pydantic models)
  - [ ] `ExposureProfile` (population, buildings, etc)
  - [ ] `VulnerabilityScore` (factors + composite score)
  - [ ] `AssetInventory` (per asset type)

### Testing & Validation
- [ ] Unit tests (each exposure/vulnerability function)
- [ ] Integration tests (complete flow)
- [ ] Data validation (no NaN/Inf, geometry valid)
- [ ] Spot-check 10 villages manually

**Estimated:** Week 4-5 | **Owner:** @[friend2] | **Status:** 🔴 Not Started

---

## 🔴 PHASE 3: Engine 3 Implementation (Week 6-7)

### Directory Structure
```
engine-3-relocation-intelligence/
├── backend/
│   ├── site_suitability/
│   │   ├── __init__.py
│   │   ├── analyzer.py
│   │   └── tests/
│   ├── carrying_capacity/
│   │   ├── __init__.py
│   │   ├── calculator.py
│   │   └── tests/
│   ├── prioritization/
│   │   ├── __init__.py
│   │   ├── algorithm.py
│   │   └── tests/
│   ├── evacuation_routing/
│   │   ├── __init__.py
│   │   ├── router.py
│   │   └── tests/
│   └── api/
│       └── endpoints.py
└── requirements.txt
```

### Site Suitability Analysis
- [ ] `site_suitability/analyzer.py`
  - [ ] Slope analysis (< 15° preferred)
  - [ ] Distance from hazard zones (> 500m)
  - [ ] Soil bearing capacity (> 2 kg/cm²)
  - [ ] Water availability (groundwater depth < 5m)
  - [ ] Market/job proximity (< 5km)
  - [ ] Cultural compatibility (survey data)
  - [ ] Accessibility (road distance < 10km)

- [ ] Scoring logic:
  ```
  Slope < 15° ..................... 25 points
  Distance from hazard > 500m ...... 25 points
  Soil capacity > 2 kg/cm² ......... 20 points
  Water available .................. 15 points
  Markets < 5km .................... 15 points
  Cultural fit ..................... 10 points
  Accessibility .................... 5 points
  Total: 100 points
  ```

- [ ] Site grading:
  - [ ] Grade A: > 80 points (highly suitable)
  - [ ] Grade B: 60-80 (suitable)
  - [ ] Grade C: 40-60 (marginal)
  - [ ] Grade D: < 40 (unsuitable)

### Carrying Capacity Assessment
- [ ] `carrying_capacity/calculator.py`
  - [ ] Land capacity (total land / 100-150 sqm per household)
  - [ ] Reduce by 30% for essential infrastructure (schools, roads, clinics)
  - [ ] Water capacity (source / 135 liters per person per day)
  - [ ] Electricity (grid capacity / per-capita consumption)
  - [ ] Education (school capacity / children population)
  - [ ] Healthcare (clinic beds / population ratio)
  - [ ] Jobs (employment availability / working-age population)

- [ ] Output: `carrying_capacity_{site}.json`
  ```json
  {
    "site_id": "site_001",
    "site_name": "Proposed Relocation Site Alpha",
    "land_capacity_households": 500,
    "water_capacity_people": 2000,
    "electricity_capacity_mw": 1.5,
    "schools_capacity_children": 800,
    "hospitals_capacity_beds": 50,
    "job_slots_available": 300,
    "overall_capacity_people": 1500
  }
  ```

### Relocation Prioritization
- [ ] `prioritization/algorithm.py`
  - [ ] Scoring factors:
    ```
    RED zone status (RED=100, ORANGE=50, YELLOW=20) ...... 40 points
    Population vulnerability (0-100) ....................... 30 points
    Critical infrastructure exposure (hospitals hit?) ...... 15 points
    Distance from safe zone ............................... 10 points
    Community cohesion (keep together) .................... 5 points
    Total: 100 points
    ```

  - [ ] Priority tiers:
    - [ ] **Tier 1 (Immediate):** > 70 points → Relocate within 1 month
    - [ ] **Tier 2 (Short-term):** 50-70 points → Relocate within 3 months
    - [ ] **Tier 3 (Medium-term):** 30-50 points → Relocate within 6-12 months
    - [ ] **Tier 4 (Monitor):** < 30 points → No immediate action

- [ ] Site-to-village matching
  - [ ] Match village population with site capacity
  - [ ] Prefer similar climate/culture
  - [ ] Minimize displacement distance
  - [ ] Avoid over-capacity

### Evacuation Routing (Bonus)
- [ ] `evacuation_routing/router.py`
  - [ ] Use OSRM (Open Route Service) or similar
  - [ ] Calculate routes avoiding hazard zones
  - [ ] Estimate evacuation time (buses, on-foot)
  - [ ] Manage crowd flow (don't overload routes)
  - [ ] Integrate with shelter capacity tracking

### API Endpoints
- [ ] `GET /api/v1/relocation/sites` - List all sites
- [ ] `POST /api/v1/relocation/sites/suitability` - Analyze site
- [ ] `GET /api/v1/relocation/sites/{site_id}/capacity` - Capacity details
- [ ] `POST /api/v1/relocation/prioritize` - Run prioritization algorithm
- [ ] `GET /api/v1/relocation/villages/{id}/priority` - Village priority
- [ ] `GET /api/v1/relocation/assignments` - All assignments
- [ ] `GET /api/v1/relocation/routes` - Evacuation routes

### Testing
- [ ] Unit tests for each algorithm
- [ ] Integration test: prioritization → assignments
- [ ] Validation: no village assigned > capacity, no orphaned villages
- [ ] Performance: prioritization for 100k villages < 5 min

**Estimated:** Week 6-7 | **Owner:** @[friend3] | **Status:** 🔴 Not Started

---

## 🔴 PHASE 4: Frontend Dashboard (Week 8-9)

### Week 8: Setup & Hazard Map

#### Project Setup
- [ ] Create React + TypeScript project
  ```bash
  npm create vite@latest -- --template react-ts
  ```

- [ ] Install dependencies
  ```bash
  npm install axios leaflet react-leaflet recharts @mui/material
  npm install -D typescript tailwindcss postcss autoprefixer
  ```

- [ ] Project structure
  ```
  src/
  ├── components/
  │   ├── Map/
  │   │   ├── HazardMap.tsx
  │   │   ├── MapLegend.tsx
  │   │   └── MapControls.tsx
  │   ├── Dashboard/
  │   │   ├── KPIPanel.tsx
  │   │   ├── DistrictSelector.tsx
  │   │   └── ChartsPanel.tsx
  │   ├── RiskTable/
  │   │   ├── VillageTable.tsx
  │   │   └── FilterPanel.tsx
  │   ├── Navigation.tsx
  │   └── Loading.tsx
  ├── pages/
  │   ├── LoginPage.tsx
  │   ├── DashboardPage.tsx
  │   ├── VillageDetailPage.tsx
  │   └── RelocationPage.tsx
  ├── services/
  │   ├── api.ts
  │   ├── auth.ts
  │   └── types.ts
  ├── styles/
  │   ├── index.css
  │   └── tailwind.css
  └── App.tsx
  ```

#### Hazard Map Component
- [ ] `components/Map/HazardMap.tsx`
  - [ ] Display village boundaries (GeoJSON)
  - [ ] Color by risk (RED/ORANGE/YELLOW/GREEN)
  - [ ] Show hazard rasters as overlays (optional)
  - [ ] Interactive popups with village name + risk score
  - [ ] Zoom-to-district functionality
  - [ ] Clustering at low zoom levels (performance)

- [ ] `components/Map/MapLegend.tsx`
  - [ ] Show color mapping (RED = 80-100, etc)
  - [ ] Toggle layer visibility
  - [ ] Display data source & update time

- [ ] `components/Map/MapControls.tsx`
  - [ ] Layer toggle (hazard type: flood, landslide, etc)
  - [ ] Risk filter (show only RED, RED+ORANGE, etc)
  - [ ] Search box (find village by name)
  - [ ] Reset map button
  - [ ] Full-screen toggle

#### Dashboard Layout
- [ ] `components/Dashboard/KPIPanel.tsx`
  - [ ] Total villages in district
  - [ ] RED zone villages & population
  - [ ] ORANGE/YELLOW zone counts
  - [ ] Critical facilities at risk
  - [ ] Last update timestamp
  - [ ] Formatted as cards/tiles

- [ ] `components/Dashboard/DistrictSelector.tsx`
  - [ ] Dropdown to select district
  - [ ] Fetch new data on change
  - [ ] Show available districts (from API)

- [ ] `components/Dashboard/ChartsPanel.tsx`
  - [ ] Risk score distribution (histogram)
  - [ ] Hazard breakdown (pie chart)
  - [ ] Population at risk trend (line chart)
  - [ ] Use Recharts library

#### API Service
- [ ] `services/api.ts`
  - [ ] Create axios instance with auth header
  - [ ] Implement API calls:
    ```typescript
    getDistricts()
    getVillages(districtKey)
    getVillageDetail(districtKey, villageId)
    getVillageRisk(districtKey, villageId)
    searchVillages(query)
    ```
  - [ ] Error handling & retry logic
  - [ ] Caching (localStorage for basic data)

#### Authentication
- [ ] `services/auth.ts`
  - [ ] Login function (POST /api/login)
  - [ ] Token management (localStorage)
  - [ ] Logout
  - [ ] Auto-redirect on 401

- [ ] `pages/LoginPage.tsx`
  - [ ] Username/password form
  - [ ] Error messages
  - [ ] Redirect to dashboard on success

#### Responsive Design
- [ ] Desktop layout (1200px+)
- [ ] Tablet layout (768px-1199px)
- [ ] Mobile layout (< 768px)
- [ ] Test on real devices or browser dev tools

**Estimated:** Week 8 | **Owner:** @[friend4] | **Status:** 🔴 Not Started

---

### Week 9: Exposure & Relocation Panels + Polish

#### Exposure Panel
- [ ] `components/Dashboard/ExposurePanel.tsx`
  - [ ] Population exposed (with age breakdown)
  - [ ] Buildings count
  - [ ] Critical facilities (hospitals, schools) - highlight RED zones
  - [ ] Agricultural land affected
  - [ ] Economic asset estimate
  - [ ] Display as grid/cards

- [ ] `components/Dashboard/VulnerabilityPanel.tsx`
  - [ ] Vulnerability factors (income, age, healthcare, etc)
  - [ ] Composite vulnerability score
  - [ ] Comparison with district average
  - [ ] Confidence level

#### Relocation Planning Panel
- [ ] `components/Relocation/PrioritizationView.tsx`
  - [ ] Show relocation tier (Immediate/Short-term/Medium-term)
  - [ ] Suggested destination site
  - [ ] Population to relocate
  - [ ] Timeline estimate
  - [ ] Why this village? (explanation)

- [ ] `components/Relocation/SiteDetailsView.tsx`
  - [ ] Suitable sites on map (highlight destination)
  - [ ] Site suitability score + breakdown
  - [ ] Carrying capacity (available vs needed)
  - [ ] Infrastructure at destination
  - [ ] Distance from source

#### Reports & Export
- [ ] `components/Reports/ReportExporter.tsx`
  - [ ] Generate PDF (hazard assessment)
  - [ ] Export CSV (all villages)
  - [ ] Export GeoJSON (spatial data)
  - [ ] Map export (PNG at different zoom levels)

#### Mobile Optimization
- [ ] Stack panels vertically on mobile
- [ ] Touch-friendly map controls
- [ ] Collapsible sections
- [ ] Test on 375px width

#### Animations & UX
- [ ] Smooth transitions between pages
- [ ] Loading spinners during API calls
- [ ] Toast notifications for errors/success
- [ ] Keyboard shortcuts (accessibility)

#### Testing
- [ ] Unit tests for components (Jest)
- [ ] Mock API responses
- [ ] Test user interactions (RTL - React Testing Library)
- [ ] Visual regression tests (optional)

**Estimated:** Week 9 | **Owner:** @[friend4] | **Status:** 🔴 Not Started

---

## 🔴 PHASE 5: Integration & Testing (Week 10-11)

### Database Integration
- [ ] PostgreSQL + PostGIS setup
  ```sql
  CREATE EXTENSION postgis;
  CREATE EXTENSION postgis_topology;
  ```

- [ ] Schema creation
  - [ ] Run migrations: `alembic upgrade head`
  - [ ] Verify all tables exist
  - [ ] Create indexes

- [ ] Sample data loading
  - [ ] Load 2 districts (Chamoli, Kendrapara)
  - [ ] Verify row counts
  - [ ] Spot-check spatial data

### API Integration
- [ ] Unified FastAPI instance
  - [ ] All 3 engines under `/api/v1/`
  - [ ] Consistent response schemas
  - [ ] Error handling (400/401/404/500)
  - [ ] Request/response logging

- [ ] Frontend-Backend connectivity
  - [ ] All API calls working
  - [ ] Loading states implemented
  - [ ] Error messages user-friendly
  - [ ] Retry logic for failures

### End-to-End Testing
- [ ] **Workflow Test:**
  1. Load district (Chamoli)
  2. View hazard map
  3. Click village → see detail + exposure
  4. Check relocation priority
  5. View suggested site
  6. Export report

- [ ] **Data Consistency:**
  - [ ] CSV vs GeoJSON same villages
  - [ ] Risk scores monotonic (no weird jumps)
  - [ ] Exposure totals match populations
  - [ ] Vulnerability scores in range [0, 1]

### Performance Testing
- [ ] **API Performance:**
  - [ ] /districts list < 100ms
  - [ ] /villages GeoJSON < 500ms (with caching)
  - [ ] /village/{id} detail < 200ms
  - [ ] /search < 200ms

- [ ] **Frontend Performance:**
  - [ ] Map rendering 10k villages < 2s
  - [ ] Dashboard load < 1s
  - [ ] Mobile load < 2s (3G simulation)
  - [ ] Bundle size < 500KB (minified+gzip)

### Load Testing
- [ ] Use Apache JMeter or Locust
- [ ] Simulate 100 concurrent users
- [ ] Measure response times & throughput
- [ ] Identify bottlenecks

### Bug Fixes
- [ ] Address UAT feedback
- [ ] Fix edge cases
- [ ] Improve error messages
- [ ] Security scan (OWASP Top 10)

**Estimated:** Week 10-11 | **Owner:** @[team-lead] | **Status:** 🔴 Not Started

---

## 🔴 PHASE 6: Deployment & Final Polish (Week 12)

### Docker Setup
- [ ] `Dockerfile.backend`
  ```dockerfile
  FROM python:3.10-slim
  WORKDIR /app
  COPY requirements.txt .
  RUN pip install -r requirements.txt
  COPY backend/ .
  CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
  ```

- [ ] `Dockerfile.frontend`
  ```dockerfile
  FROM node:18-alpine
  WORKDIR /app
  COPY package*.json .
  RUN npm install
  COPY . .
  RUN npm run build
  EXPOSE 3000
  CMD ["npm", "run", "preview"]
  ```

- [ ] `docker-compose.yml`
  - [ ] Backend service
  - [ ] Frontend service
  - [ ] PostgreSQL service
  - [ ] Redis service
  - [ ] Volume mounts for persistence

### CI/CD Pipeline
- [ ] GitHub Actions workflow
  - [ ] Trigger on: push to main
  - [ ] Run tests (Python + JavaScript)
  - [ ] Build Docker images
  - [ ] Push to registry (Docker Hub / ECR)
  - [ ] Deploy to staging

### Production Deployment
- [ ] Cloud setup (AWS/GCP/Azure)
  - [ ] EC2 instance or Kubernetes cluster
  - [ ] RDS for PostgreSQL
  - [ ] ElastiCache for Redis
  - [ ] S3/GCS for backups

- [ ] Database migration
  - [ ] Create production database
  - [ ] Run migrations
  - [ ] Seed with real data (all 24 states, if ready)
  - [ ] Backup configuration

- [ ] Secrets management
  - [ ] GEE credentials (environment variable)
  - [ ] Database password (AWS Secrets Manager)
  - [ ] API keys (HashiCorp Vault)

- [ ] Monitoring & Logging
  - [ ] Set up CloudWatch / GCP Logs
  - [ ] Create dashboards (Grafana)
  - [ ] Set up alerts (PagerDuty)
  - [ ] ELK stack for application logs

### Go-Live Checklist
- [ ] Smoke tests on production
- [ ] Health check endpoints working
- [ ] Load test with 1000 concurrent users
- [ ] Disaster recovery plan documented
- [ ] Runbook for operators

### Knowledge Transfer
- [ ] Train authorities on system usage
- [ ] Create user guide (PDF)
- [ ] Record video tutorials (5-10 min each)
- [ ] Establish support hotline
- [ ] Set up escalation process

### Final Documentation
- [ ] API documentation (Swagger)
- [ ] User manual (for authorities)
- [ ] Developer guide (for contributors)
- [ ] Maintenance guide (for ops)
- [ ] Data dictionary
- [ ] Troubleshooting guide
- [ ] FAQ document

### Sign-off
- [ ] Ministry of Home Affairs approval
- [ ] NDRF sign-off
- [ ] All acceptance criteria met
- [ ] Final presentation to jury

**Estimated:** Week 12 | **Owner:** @[devops-lead] | **Status:** 🔴 Not Started

---

## 📊 Summary by Owner

| Owner | Modules | Weeks | Status |
|-------|---------|-------|--------|
| @claude | Research, Planning, Docs | 1-2 | ✅ |
| @friend1 | Engine 1 Polish, Testing | 3-5 | 🟡 |
| @friend2 | Engine 2 Implementation | 3-5 | 🟡 |
| @friend3 | Engine 3 Implementation | 6-7 | 🔴 |
| @friend4 | Frontend Dashboard | 8-9 | 🔴 |
| @team-lead | Integration & Testing | 10-11 | 🔴 |
| @devops-lead | Deployment & DevOps | 12 | 🔴 |

---

## 🎯 Critical Path

**Week 3:** ✅ Engine 1 ready  
**Week 5:** ✅ Engine 2 API ready  
**Week 7:** ✅ Engine 3 ready  
**Week 9:** ✅ Dashboard ready  
**Week 11:** ✅ All integrated & tested  
**Week 12:** ✅ Deployed & submitted  

**No slippage possible after Week 5 or project won't be ready!**

---

## 🚨 Blockers to Watch

- [ ] GEE API credentials (request early)
- [ ] Real data availability (GFSM, ILSM)
- [ ] PostgreSQL + PostGIS setup (not trivial)
- [ ] Government data access (may need approvals)
- [ ] Frontend dependencies (Leaflet map issues)
- [ ] Testing infrastructure (CI/CD setup)

---

## 📝 Notes

- **Daily standups:** 15 min sync (if team is co-located)
- **Weekly review:** Check progress against this checklist
- **Escalate early:** If any task will miss deadline, flag by Monday
- **Documentation:** Update in parallel (don't save for end)
- **Testing:** Write tests as you code (not at the end)

---

**Last Updated:** September 15, 2026  
**Next Review:** September 22, 2026 (End of Week 2)  
**Final Submission:** November 24, 2026 (End of Week 12)
