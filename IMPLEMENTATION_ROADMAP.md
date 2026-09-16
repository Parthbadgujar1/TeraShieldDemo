# TeraShield Implementation Roadmap
## SIH 2026 | 12-Week Sprint

---

## Phase Overview

| Phase | Duration | Deliverables | Status |
|-------|----------|--------------|--------|
| Phase 0 | Week 1-2 | Research & Planning | 🟢 DONE |
| Phase 1 | Week 3-5 | Engine 1 & 2 APIs | 🟡 IN PROGRESS |
| Phase 2 | Week 6-7 | Engine 3 Implementation | 🔴 NOT STARTED |
| Phase 3 | Week 8-9 | Frontend Dashboard | 🔴 NOT STARTED |
| Phase 4 | Week 10-11 | Integration & Testing | 🔴 NOT STARTED |
| Phase 5 | Week 12 | Deployment & Fixes | 🔴 NOT STARTED |

---

## PHASE 0: Research & Planning (Week 1-2) ✅

### Completed
- [x] Problem statement analysis
- [x] Module architecture design
- [x] Technology stack selection
- [x] API schema design
- [x] Database design
- [x] Data source identification

### Artifacts Generated
- ✅ PROJECT_RESEARCH.md (comprehensive analysis)
- ✅ PROJECT_STRUCTURE.md (directory layout)
- ✅ IMPLEMENTATION_ROADMAP.md (this document)

---

## PHASE 1: Engine 1 & 2 APIs (Week 3-5)

### Week 3: Engine 1 Final Polish + Engine 2 Setup

#### Engine 1 Tasks (Hazard Intelligence)
- [ ] **Code Audit**
  - [ ] Review `backend/hazards/*.py` for production readiness
  - [ ] Add docstrings to all functions
  - [ ] Add type hints to all parameters
  - [ ] Ensure error handling is comprehensive
  
- [ ] **Testing**
  - [ ] Write unit tests for each hazard sensor
  - [ ] Test fusion model with sample data
  - [ ] Test API endpoints
  - [ ] Create integration tests
  - [ ] Target: 80%+ code coverage

- [ ] **Documentation**
  - [ ] Update README with current state
  - [ ] Document GEE setup process
  - [ ] Create troubleshooting guide
  - [ ] Add API examples

- [ ] **Performance**
  - [ ] Profile GEE pipeline
  - [ ] Optimize village aggregation
  - [ ] Add caching layer (Redis)
  - [ ] Benchmark API response times

#### Engine 2 Setup (Exposure & Vulnerability)
- [ ] **Create directory structure**
  ```
  engine-2-exposure-vulnerability/
  ├── backend/
  │   ├── exposure/
  │   │   ├── __init__.py
  │   │   ├── population.py
  │   │   ├── buildings.py
  │   │   ├── infrastructure.py
  │   │   └── assets.py
  │   ├── vulnerability/
  │   │   ├── __init__.py
  │   │   ├── calculator.py
  │   │   └── factors.py
  │   └── api/
  │       └── endpoints.py
  └── requirements.txt
  ```

- [ ] **Data pipeline**
  - [ ] Download exposure datasets
  - [ ] Validate data formats
  - [ ] Create preprocessing scripts
  - [ ] Load into PostgreSQL

---

### Week 4: Engine 2 Implementation

#### Exposure Data Pipeline
- [ ] **Population Exposure**
  - [ ] Load WorldPop grids
  - [ ] Intersect with hazard zones (Engine 1)
  - [ ] Aggregate to village level
  - [ ] Generate population exposure CSVs
  - [ ] Create GeoJSON layers

- [ ] **Building Exposure**
  - [ ] Fetch OSM buildings
  - [ ] Classify building types (residential/commercial/etc)
  - [ ] Count buildings in hazard zones
  - [ ] Estimate occupancy (residential: 5 per building, commercial: varies)

- [ ] **Critical Infrastructure**
  - [ ] Collect hospital/clinic locations
  - [ ] Identify schools, power plants
  - [ ] Flag facilities in RED zones
  - [ ] Assess criticality (hospital > school > power)

- [ ] **Livelihoods & Resources**
  - [ ] Identify agricultural lands in zones
  - [ ] Map livestock presence (proxy via FAO data)
  - [ ] Locate markets/trading points
  - [ ] Calculate economic exposure

#### Vulnerability Scoring
- [ ] **Socioeconomic Factors**
  - [ ] Age-based vulnerability (young & elderly at higher risk)
  - [ ] Income levels (census data by village)
  - [ ] Gender composition
  - [ ] Healthcare access distance
  - [ ] Literacy/education levels

- [ ] **Score Calculation**
  - [ ] Normalize factors to 0-1 range
  - [ ] Weight factors (research-based)
  - [ ] Aggregate into composite score
  - [ ] Classify as High/Medium/Low vulnerability

- [ ] **Confidence Scoring**
  - [ ] Track data source & age
  - [ ] Estimate accuracy based on resolution
  - [ ] Flag areas with missing data
  - [ ] Provide confidence intervals

#### Engine 2 API Endpoints
- [ ] `GET /api/v1/exposure/districts/{key}/assets` - Asset summary
- [ ] `GET /api/v1/exposure/districts/{key}/assets/{type}` - By type
- [ ] `GET /api/v1/exposure/districts/{key}/villages/{id}` - Village exposure
- [ ] `GET /api/v1/vulnerability/scores` - Global vulnerability
- [ ] `GET /api/v1/vulnerability/villages/{id}` - Village vulnerability

---

### Week 5: Integration & Testing

#### Integration Layer
- [ ] **Engine 1 → Engine 2 Flow**
  - [ ] Engine 1 outputs village_risk_*.csv
  - [ ] Engine 2 reads hazard zones
  - [ ] Engine 2 intersects with exposure
  - [ ] Complete workflow tested end-to-end

- [ ] **Database**
  - [ ] Schema created (villages, hazard_assessments, exposure_data, vulnerability_scores)
  - [ ] Indexes optimized for queries
  - [ ] Sample data loaded for 2 districts (Chamoli, Kendrapara)

- [ ] **Unified API**
  - [ ] Single FastAPI instance serves both engines
  - [ ] Authentication middleware (JWT/Bearer token)
  - [ ] CORS configured for frontend
  - [ ] Swagger documentation complete

#### Testing
- [ ] **Unit Tests**
  - [ ] Exposure calculation (population, buildings, etc)
  - [ ] Vulnerability scoring
  - [ ] API response formatting
  - [ ] Error handling

- [ ] **Integration Tests**
  - [ ] Hazard → Exposure flow
  - [ ] Full village profile (hazard + exposure + vulnerability)
  - [ ] Search & filter queries
  - [ ] Spatial operations (buffer, intersect)

- [ ] **Data Quality**
  - [ ] Validate no NaN/Inf values in outputs
  - [ ] Check geometry validity
  - [ ] Verify boundary coverage
  - [ ] Spot-check 10 villages manually

#### Documentation
- [ ] API documentation (Swagger/OpenAPI)
- [ ] Data dictionary (all fields & definitions)
- [ ] Setup guide (Windows & Linux)
- [ ] Example requests & responses

---

## PHASE 2: Engine 3 Implementation (Week 6-7)

### Week 6: Site Suitability & Carrying Capacity

#### Site Suitability Module
- [ ] **Data Collection**
  - [ ] Identify candidate sites (govt lands, community areas)
  - [ ] Collect DEM, land use, soil data
  - [ ] Map slope, aspect, drainage
  - [ ] Mark proximity to existing infrastructure

- [ ] **Suitability Scoring**
  ```
  Slope < 15° ......................... 25 points
  Distance from hazard > 500m ......... 25 points
  Soil bearing capacity > 2 kg/cm² .... 20 points
  Water availability .................. 15 points
  Proximity to markets/jobs ........... 15 points
  Cultural/social compatibility ....... 10 points
  Accessibility (road network) ........ 5 points
  ```
  
- [ ] **Filtering**
  - [ ] Identify RED zone areas (unsuitable)
  - [ ] Buffer by hazard distance
  - [ ] Calculate composite suitability
  - [ ] Create ranked site list (A/B/C grades)

#### Carrying Capacity Assessment
- [ ] **Land Capacity**
  - [ ] Measure available land per site
  - [ ] Subtract essential spaces (schools, hospitals, roads: ~30%)
  - [ ] Calculate usable land for housing
  - [ ] Assume 100-150 sqm per household

- [ ] **Infrastructure Capacity**
  - [ ] Water supply: typically 135 liters/person/day
  - [ ] Electricity: existing grid assessment
  - [ ] Sanitation: drain/sewer capacity
  - [ ] Education: schools per 1000 children
  - [ ] Healthcare: clinics/hospitals per 5000

- [ ] **Livelihood Capacity**
  - [ ] Job opportunities within 5km
  - [ ] Market proximity for agriculture
  - [ ] Skill match with existing trades
  - [ ] Government employment (NREGA) availability

#### API Endpoints
- [ ] `GET /api/v1/relocation/sites` - List suitable sites
- [ ] `POST /api/v1/relocation/sites/suitability` - Analyze new site
- [ ] `GET /api/v1/relocation/sites/{site_id}/carrying-capacity` - Capacity details

---

### Week 7: Prioritization & Matching

#### Relocation Prioritization Algorithm
- [ ] **Scoring Factors**
  ```
  Red Zone Status (RED=100, ORANGE=50, YELLOW=20) .... 40 points
  Population Vulnerability Score (0-100) ............. 30 points
  Infrastructure Exposure (schools/hospitals hit) .... 15 points
  Distance from safe zone ............................ 10 points
  Community cohesion (stay together) ................. 5 points
  ```

- [ ] **Priority Tiers**
  - [ ] **Tier 1 (Immediate):** RED zone + high vulnerability
  - [ ] **Tier 2 (Short-term):** ORANGE zone OR high vulnerability
  - [ ] **Tier 3 (Medium-term):** YELLOW zone + low vulnerability
  - [ ] **Tier 4 (Monitor):** GREEN zone, no relocation needed

#### Site-to-Village Matching
- [ ] **Matching Algorithm**
  - [ ] Match village population with site capacity
  - [ ] Prefer cultural/linguistic compatibility
  - [ ] Minimize displacement distance
  - [ ] Cluster related villages (same destination)
  - [ ] Ensure no over-capacity at sites

- [ ] **Conflict Resolution**
  - [ ] Handle cases where suitable sites are scarce
  - [ ] Partial relocation options
  - [ ] Phased relocation (by Tier)
  - [ ] Manual override capability for authorities

#### API Endpoints
- [ ] `POST /api/v1/relocation/prioritize` - Run prioritization algorithm
- [ ] `GET /api/v1/relocation/villages/{id}/priority` - Priority level for village
- [ ] `GET /api/v1/relocation/assignments` - All assignments
- [ ] `GET /api/v1/relocation/assignments/tier/{tier}` - Filter by tier

#### Evacuation Routing (Bonus)
- [ ] **Route Calculation**
  - [ ] Use OSRM or similar routing engine
  - [ ] Avoid hazard zones during disaster
  - [ ] Optimize for large groups (school buses, etc)
  - [ ] Minimize congestion (distribute over time)

- [ ] **Shelter Capacity Tracking**
  - [ ] Assign shelters for each destination
  - [ ] Track real-time capacity during event
  - [ ] Manage overflow to secondary sites
  - [ ] Support family reunification

---

## PHASE 3: Frontend Dashboard (Week 8-9)

### Week 8: Dashboard Framework & Hazard Visualization

#### Project Setup
- [ ] **React + TypeScript + Vite**
  ```bash
  npm create vite@latest -- --template react-ts
  cd frontend
  npm install axios leaflet react-leaflet recharts
  ```

- [ ] **Project Structure**
  ```
  src/
  ├── components/
  │   ├── Map/
  │   │   ├── HazardMap.tsx
  │   │   └── MapLegend.tsx
  │   ├── Dashboard/
  │   │   ├── KPIPanel.tsx
  │   │   ├── DistrictSelector.tsx
  │   │   └── TimelineChart.tsx
  │   ├── RiskTable/
  │   │   ├── VillageTable.tsx
  │   │   └── FiltersPanel.tsx
  │   └── Navigation.tsx
  ├── pages/
  │   ├── LoginPage.tsx
  │   ├── DashboardPage.tsx
  │   ├── VillageDetailPage.tsx
  │   └── RelocationPlanPage.tsx
  ├── services/
  │   └── api.ts
  ├── styles/
  │   └── App.css
  └── App.tsx
  ```

#### Hazard Map Component
- [ ] **Map Features**
  - [ ] Display village boundaries (GeoJSON)
  - [ ] Color villages by risk (RED/ORANGE/YELLOW/GREEN)
  - [ ] Show hazard rasters (flood, landslide, etc) as overlays
  - [ ] Interactive popups with village info
  - [ ] Zoom-to-district functionality

- [ ] **Map Controls**
  - [ ] Layer toggle (flood, landslide, coastal, cloudburst)
  - [ ] Risk filter (show only RED, etc)
  - [ ] Search village by name
  - [ ] Center on hazard/vulnerability
  - [ ] Export map image

#### Dashboard Layout
- [ ] **KPI Section (Top)**
  - [ ] Total villages in district
  - [ ] RED zone count & population
  - [ ] ORANGE/YELLOW zone counts
  - [ ] Critical facilities at risk
  - [ ] Last update timestamp

- [ ] **Charts (Right Panel)**
  - [ ] Risk distribution histogram
  - [ ] Hazard type breakdown (pie chart)
  - [ ] Vulnerability distribution
  - [ ] Population at risk trend (historical)

- [ ] **Table (Bottom)**
  - [ ] Village list, sortable/filterable
  - [ ] Columns: Name, Risk Score, Hazard, Population, Actions
  - [ ] Pagination (100 per page)
  - [ ] Export CSV functionality

#### Authentication
- [ ] **Login Page**
  - [ ] Username/password form
  - [ ] Simple validation
  - [ ] Store JWT token (localStorage)
  - [ ] Redirect to dashboard on success

- [ ] **Session Management**
  - [ ] Add Authorization header to all requests
  - [ ] Handle 401 errors (redirect to login)
  - [ ] Logout button in navigation
  - [ ] Auto-refresh token (if implementing expiry)

---

### Week 9: Exposure & Relocation Panels

#### Exposure Panel
- [ ] **Asset Breakdown**
  - [ ] Population exposed (with age groups)
  - [ ] Buildings count
  - [ ] Critical facilities (hospitals, schools)
  - [ ] Agricultural land affected
  - [ ] Economic assets estimate

- [ ] **Visualizations**
  - [ ] Stacked bar chart (exposure by type)
  - [ ] Grid of critical facilities with status
  - [ ] Comparison with other villages
  - [ ] Trend line (year-over-year exposure change)

#### Relocation Planning Panel
- [ ] **Prioritization View**
  - [ ] Show relocation tier (Immediate/Short-term/Medium-term)
  - [ ] Suggested destination site
  - [ ] Population to relocate
  - [ ] Timeline for relocation

- [ ] **Site Details**
  - [ ] Suitable sites map (highlight destination)
  - [ ] Site suitability score breakdown
  - [ ] Carrying capacity remaining
  - [ ] Infrastructure at destination

- [ ] **Decision Support**
  - [ ] Why this village is prioritized? (explanation)
  - [ ] Why this site? (suitability factors)
  - [ ] Constraints & trade-offs
  - [ ] Override capability (for authorities)

#### Reports & Export
- [ ] **Report Generation**
  - [ ] Hazard assessment report (PDF)
  - [ ] Relocation plan report (PDF)
  - [ ] Data export (CSV of all villages)
  - [ ] Map export (PNG at different zoom levels)

- [ ] **Scheduling**
  - [ ] One-click export
  - [ ] Email reports to stakeholders
  - [ ] Archive old reports

#### Mobile Responsiveness
- [ ] **Mobile Layout**
  - [ ] Stack panels vertically on mobile
  - [ ] Touch-friendly map controls
  - [ ] Collapse/expand panels
  - [ ] Test on 375px width (phone)

---

## PHASE 4: Integration & Testing (Week 10-11)

### Week 10: End-to-End Integration

#### Workflow Testing
- [ ] **Complete Flow Test**
  1. Load Engine 1 hazard data
  2. Process Engine 2 exposure
  3. Run Engine 3 prioritization
  4. Display in Dashboard
  5. Generate report
  6. Export for stakeholders

#### Database Integration
- [ ] **Schema & Data**
  - [ ] PostgreSQL setup with PostGIS
  - [ ] All tables created with indexes
  - [ ] Sample data loaded (2 districts)
  - [ ] Backups configured

- [ ] **Query Performance**
  - [ ] 100k villages query in < 1s
  - [ ] District hazard summary in < 500ms
  - [ ] Village detail page in < 200ms
  - [ ] Spatial queries (buffer, intersect) in < 5s

#### API Integration
- [ ] **Unified Backend**
  - [ ] Single FastAPI instance
  - [ ] All 4 modules under `/api/v1/`
  - [ ] Consistent response schemas
  - [ ] Error handling standardized

- [ ] **Frontend Connectivity**
  - [ ] All API calls from React working
  - [ ] Loading states implemented
  - [ ] Error messages user-friendly
  - [ ] Retry logic for failures

#### Deployment Preparation
- [ ] **Docker Setup**
  - [ ] Backend Dockerfile created
  - [ ] Frontend Dockerfile created
  - [ ] docker-compose.yml for local dev
  - [ ] .dockerignore files

- [ ] **CI/CD Pipeline**
  - [ ] GitHub Actions workflow
  - [ ] Tests run on every push
  - [ ] Docker images built & pushed
  - [ ] Deployment to staging automated

---

### Week 11: Testing & Optimization

#### Comprehensive Testing
- [ ] **Unit Tests** (target 80%+ coverage)
  - [ ] Hazard calculation functions
  - [ ] Exposure aggregation
  - [ ] Vulnerability scoring
  - [ ] Prioritization algorithm
  - [ ] API endpoint logic

- [ ] **Integration Tests**
  - [ ] Engine 1 → 2 data flow
  - [ ] Engine 2 → 3 data flow
  - [ ] API endpoints return correct data
  - [ ] Database transactions work

- [ ] **E2E Tests** (Selenium/Playwright)
  - [ ] User login flow
  - [ ] View district map
  - [ ] Filter villages by risk
  - [ ] Click village detail
  - [ ] Generate report
  - [ ] Export CSV

#### Bug Fixes & Cleanup
- [ ] **Code Quality**
  - [ ] Run linters (ESLint, Pylint)
  - [ ] Fix style issues
  - [ ] Ensure type safety (TypeScript)
  - [ ] Remove console.logs, debug code

- [ ] **Performance Optimization**
  - [ ] Profil backend API calls
  - [ ] Optimize slow queries
  - [ ] Implement caching (Redis)
  - [ ] Frontend bundle size optimization

- [ ] **Documentation**
  - [ ] API docs complete (Swagger)
  - [ ] User guide for authorities
  - [ ] Developer guide for contributors
  - [ ] Setup & deployment guide

#### User Acceptance Testing (UAT)
- [ ] **Stakeholder Testing**
  - [ ] District Magistrates review
  - [ ] NDRF team tests workflows
  - [ ] State officials feedback
  - [ ] Incorporate suggestions

---

## PHASE 5: Deployment & Final Polish (Week 12)

### Deployment
- [ ] **Production Environment**
  - [ ] Cloud infrastructure setup (AWS/GCP/Azure)
  - [ ] PostgreSQL + PostGIS (managed)
  - [ ] Redis cache setup
  - [ ] S3/GCS for backups

- [ ] **Deployment Process**
  - [ ] Database migrations run
  - [ ] Secrets configured
  - [ ] SSL certificates installed
  - [ ] DNS configured
  - [ ] Monitoring & logging setup (ELK/Prometheus)

- [ ] **Go-Live**
  - [ ] Smoke tests on production
  - [ ] Load test with 1000 concurrent users
  - [ ] Disaster recovery drill
  - [ ] Runbook documented

### Final Polish & Fixes
- [ ] **Bug Fixes**
  - [ ] Address UAT feedback
  - [ ] Fix edge cases
  - [ ] Improve error messages
  - [ ] Security scan (OWASP)

- [ ] **Performance Tuning**
  - [ ] Monitor production metrics
  - [ ] Optimize queries based on real data
  - [ ] Improve frontend load times
  - [ ] Reduce API response times

- [ ] **Knowledge Transfer**
  - [ ] Train authorities on system usage
  - [ ] Demo for government officials
  - [ ] Create video tutorials
  - [ ] Establish support process

### Final Deliverables
- [ ] Code repository with documentation
- [ ] Deployment guide
- [ ] API documentation
- [ ] User manual (for authorities)
- [ ] Maintenance guide
- [ ] Data dictionary
- [ ] Test reports
- [ ] Performance metrics

---

## Success Criteria

### Functional Requirements
- ✅ Hazard Intelligence: RED zones identified for 2+ districts
- ✅ Exposure & Vulnerability: Population & asset counts accurate
- ✅ Relocation Intelligence: Priority tiers assigned to villages
- ✅ Dashboard: Interactive map with all data layers
- ✅ API: All endpoints documented & working
- ✅ Reports: Exportable PDFs & CSVs

### Performance Requirements
- ✅ API response < 500ms (95th percentile)
- ✅ Dashboard load < 2s
- ✅ Support 10,000+ villages rendering
- ✅ Handle 100 concurrent users

### Quality Requirements
- ✅ 80%+ test coverage
- ✅ Zero security vulnerabilities (OWASP scan)
- ✅ All APIs documented
- ✅ Code follows style guide
- ✅ No console errors/warnings

### Usability Requirements
- ✅ Mobile-responsive (375px+)
- ✅ Accessible (WCAG 2.1 AA)
- ✅ Intuitive navigation
- ✅ Clear error messages
- ✅ Help documentation available

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| GEE API limits reached | Medium | High | Cache results, use samples |
| Missing data for states | High | Medium | Use proxy data, clearly flag |
| Database performance | Medium | High | Indexing, partitioning |
| Team availability | Low | High | Clear documentation, backup |
| Scope creep | High | Medium | Strict feature gate, MVP focus |
| Integration issues | Medium | High | Early integration testing |

---

## Key Milestones

- **Week 2 (Sep 22):** Research & Planning Done ✅
- **Week 5 (Oct 6):** Engine 1 & 2 APIs Ready
- **Week 7 (Oct 20):** Engine 3 Complete
- **Week 9 (Nov 3):** Dashboard Functional
- **Week 11 (Nov 17):** Testing & Optimization Done
- **Week 12 (Nov 24):** Final Deployment & Submission

---

## Notes for Team

- **Prioritize MVP:** Get 2 districts working perfectly rather than 24 partially
- **User Testing Early:** Show authorities prototypes mid-way
- **Document Everything:** Future maintenance depends on clear docs
- **Modular Design:** Each engine should work independently
- **Data Quality:** Garbage in = garbage out. Validate early
- **Communication:** Daily 15-min standups recommended

