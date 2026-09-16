# 🌍 TeraShield: Intelligent Hazard-Based Red Zone Identification & Relocation Platform

**Smart India Hackathon 2026** | Ministry of Home Affairs | NDRF

> An AI-driven GIS platform for proactive disaster risk management, identifying hazard-prone red zones, assessing relocation site capacity, and prioritizing vulnerable habitations for evacuation.

---

## 📋 Quick Start

### Prerequisites
- Python 3.9+
- Node.js 18+
- PostgreSQL 12+ with PostGIS
- Google Earth Engine API credentials (optional, for advanced use)

### Local Development (5 minutes)

```bash
# 1. Clone & setup backend
cd D:\TeraShield\hazards-main\backend
python -m venv venv
venv\Scripts\activate  # Windows
source venv/bin/activate  # Linux/Mac
pip install -r requirements.txt

# 2. Start backend
uvicorn api.main:app --reload --port 8000
# 🎉 API running at http://localhost:8000/docs

# 3. In a new terminal, setup frontend
cd D:\TeraShield
npm install
npm run dev
# 🎉 Frontend running at http://localhost:5173
```

**Login Credentials (Demo):**
- Username: `sih`
- Password: `sih2026`

---

## 🏗️ Project Structure

```
TeraShield/
├── ENGINE 1: HAZARD INTELLIGENCE (✅ Ready)
│   └── hazards-main/
│       ├── backend/
│       │   ├── api/main.py           # FastAPI endpoints
│       │   ├── hazards/              # 4 danger sensors
│       │   ├── fusion/               # Multi-hazard fusion
│       │   ├── gee/                  # Google Earth Engine
│       │   └── data_pipeline/        # Data download & prep
│       └── README.md
│
├── ENGINE 2: EXPOSURE & VULNERABILITY (In Progress)
│   └── engine-2-exposure-vulnerability-main/
│       └── Documentation/            # Architecture & design
│
├── ENGINE 3: RELOCATION INTELLIGENCE (Planned)
│   └── Coming Week 6-7
│
├── ENGINE 4: GIS DASHBOARD (Planned)
│   └── Coming Week 8-9
│
├── DOCUMENTATION (📚 Complete)
│   ├── PROJECT_RESEARCH.md           # Comprehensive analysis
│   ├── PROJECT_STRUCTURE.md          # Directory layout
│   ├── IMPLEMENTATION_ROADMAP.md     # 12-week sprint plan
│   └── README.md                     # This file
│
└── DEPLOYMENT (Coming Week 10+)
    ├── docker/
    ├── k8s/
    └── ci-cd/
```

---

## 🎯 What Each Engine Does

### **Engine 1: Hazard Intelligence** ✅
Identifies disaster-prone red zones using 4 hazard sensors:
- 🌊 Flood Risk (GFSM + rainfall + DEM)
- 🏔️ Landslide Risk (ILSM + slope + terrain)
- 🌪️ Cloudburst Risk (extreme rainfall + terrain)
- 🌊 Coastal Erosion (distance to coast + erosion data)

**Output:** `village_risk_{district}.csv/geojson` with RED/ORANGE/YELLOW/GREEN classification

### **Engine 2: Exposure & Vulnerability** 🟡
Inventories what's at risk:
- 👥 Population counts & demographics
- 🏘️ Buildings & settlements
- 🏥 Critical facilities (hospitals, schools)
- 💼 Livelihoods & economic assets
- 🌍 Environmental resources

**Output:** Exposure profiles + vulnerability scores per village

### **Engine 3: Relocation Intelligence** 🔴
Finds safe relocation options:
- 📍 Identifies suitable sites (slope, distance, soil, etc)
- 📊 Assesses site carrying capacity
- 🎯 Prioritizes villages for relocation
- 🛣️ Optimizes evacuation routes

**Output:** Relocation assignments + priority tiers + evacuation routes

### **Engine 4: Integrated GIS Dashboard** 🔴
Single authority portal with:
- 🗺️ Interactive hazard maps
- 📈 Risk dashboards & KPIs
- 📋 Village detail profiles
- 🚨 Real-time alerts
- 📊 Automated reports

**Output:** Web interface for state disaster authorities

---

## 🔄 Complete Workflow

```
BEFORE DISASTER                DURING DISASTER             AFTER DISASTER
───────────────                ───────────────             ──────────────

1. Identify RED zones    →     1. Update hazard zones      1. Assess damage
2. Count exposed people  →     2. Re-assess exposure       2. Execute relocation
3. Find safe sites       →     3. Optimize evacuation      3. Track recovery
4. Prioritize villages   →     4. Track deployments        4. Learn & improve
5. Plan relocation       →     5. Coordinate response      5. Update models
6. Dashboard review      →     6. Real-time monitoring     6. Report findings
```

---

## 📊 API Endpoints (Hazard Intelligence - Live)

```bash
# List available districts
curl http://localhost:8000/api/districts \
  -H "Authorization: Bearer demo-token-sih"

# Get villages in GeoJSON (for maps)
curl http://localhost:8000/api/districts/chamoli/villages \
  -H "Authorization: Bearer demo-token-sih"

# Get village data as table (CSV-like)
curl http://localhost:8000/api/districts/chamoli/table \
  -H "Authorization: Bearer demo-token-sih"

# Get risk profile for single village
curl http://localhost:8000/api/districts/chamoli/villages/village_123/risk \
  -H "Authorization: Bearer demo-token-sih"

# Search villages by name
curl "http://localhost:8000/api/search?q=uttarkashi" \
  -H "Authorization: Bearer demo-token-sih"

# Health check
curl http://localhost:8000/api/health
```

See full API docs at: http://localhost:8000/docs (Swagger UI)

---

## 🛠️ Running Hazard Pipeline (Advanced)

### Quick Demo (5 minutes, no setup)
```bash
cd hazards-main/backend
python run_pipeline.py
# Generates: backend/data/processed/village_risk.csv
```

### Full GEE Pipeline (15 minutes, requires GEE credentials)
```bash
# Set environment variables
$env:GEE_PROJECT="your-gee-project-id"
$env:GEE_CREDENTIALS="path/to/service-account.json"
$env:SIH_DISTRICT="chamoli"

# Run for Uttarakhand (Himalayas)
python backend/gee/run_gee.py --state Uttarakhand --district chamoli

# Or Odisha (Coastal)
python backend/gee/run_gee.py --state Odisha --district kendrapara

# Or all states in one go
python backend/gee/run_gee.py --all-states
```

### Training the Model (Notebook)
```bash
jupyter notebook backend/Fusion_and_RedZone.ipynb
```

---

## 📦 Sample Data

**Pre-loaded Districts:**
- **Chamoli** (Uttarakhand) - Landslide + Cloudburst risk
- **Kendrapara** (Odisha) - Flood + Coastal Erosion risk

These work without any setup or API keys!

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| **PROJECT_RESEARCH.md** | Problem analysis, architecture, workflows, user personas |
| **PROJECT_STRUCTURE.md** | Directory layout, data flow, database schema, API design |
| **IMPLEMENTATION_ROADMAP.md** | Detailed 12-week sprint plan with tasks & deliverables |
| **backend/README.md** | Hazard engine technical guide (GEE, models, data) |
| **Engine 2 Docs** | Exposure & vulnerability architecture (17 documents) |

**Read in this order:** Research → Structure → Roadmap → Engine-specific docs

---

## 🚀 Development Roadmap

| Phase | Timeline | Focus | Status |
|-------|----------|-------|--------|
| **0: Planning** | Week 1-2 | Research & design | ✅ Done |
| **1: Core APIs** | Week 3-5 | Engine 1 & 2 APIs | 🟡 In Progress |
| **2: Relocation** | Week 6-7 | Engine 3 implementation | 🔴 Planned |
| **3: Dashboard** | Week 8-9 | Frontend UI | 🔴 Planned |
| **4: Integration** | Week 10-11 | Testing & optimization | 🔴 Planned |
| **5: Deployment** | Week 12 | Production deployment | 🔴 Planned |

---

## 🧪 Testing

```bash
# Run all tests
pytest tests/ --cov=backend

# Unit tests only
pytest tests/unit/ -v

# Integration tests
pytest tests/integration/ -v

# Frontend tests (coming)
cd frontend && npm test
```

---

## 🔐 Security Notes

### Current (Demo)
- ✅ CORS enabled for all origins (demo only)
- ✅ Simple bearer token authentication
- ✅ No HTTPS (local dev)

### Production (Todo)
- [ ] JWT with expiry
- [ ] Rate limiting
- [ ] HTTPS/TLS
- [ ] Input validation & sanitization
- [ ] SQL injection prevention (via ORM)
- [ ] CSRF protection
- [ ] Audit logging
- [ ] Role-based access control (RBAC)

---

## 🌐 Browser Support

- Chrome/Chromium 90+
- Firefox 88+
- Safari 14+
- Edge 90+
- Mobile: iOS Safari 14+, Android Chrome 90+

---

## 📝 Data & Privacy

### What We Use
- Public satellite data (Copernicus, SRTM, GPM)
- Open census/demographic data
- OpenStreetMap
- Government-provided layers (GFSM, ILSM)

### Data Retention
- Hazard assessments: Real-time (updated hourly)
- Exposure data: Refreshed monthly (from sources)
- User logs: 90 days
- Backups: 30 days

### Compliance
- Government Data Security Standard (GDSS) ready
- No personal data collected or stored
- Aggregate statistics only
- Can run fully offline after initial data load

---

## 🤝 Contributing

### Before Starting
1. Read `PROJECT_RESEARCH.md` (understand the problem)
2. Read `IMPLEMENTATION_ROADMAP.md` (know what's being built)
3. Review relevant engine's README

### Adding a Feature
1. Create a feature branch: `git checkout -b feature/engine2-exposure`
2. Make changes following the style guide
3. Write tests (aim for 80%+ coverage)
4. Submit pull request with description
5. Address review feedback

### Code Style
- **Python:** PEP 8 (enforced by Black)
- **TypeScript:** ESLint + Prettier
- **SQL:** Snake_case columns, meaningful names
- **Docstrings:** Google style for Python, JSDoc for TypeScript

---

## ⚡ Performance Tips

### Hazard Engine
- Caching: Results cached for 1 hour (configurable)
- Batch mode: Process entire district at once (faster than per-village)
- GEE: Queries are optimized but may take 5-15 minutes per district

### Frontend
- Map rendering: Optimized for 10,000+ villages (uses clustering at zoom < 8)
- Table: Paginated (100 rows per page) to keep DOM lean
- Lazy loading: Components load on-demand

### Database
- Indexes on: village_id, district_id, geometry, hazard_type
- Partitioning: By district for large datasets
- Backups: Automatic daily to S3

---

## 🐛 Troubleshooting

### Backend won't start
```bash
# Check Python version
python --version  # Should be 3.9+

# Check dependencies
pip install -r requirements.txt

# Check ports
netstat -ano | findstr :8000  # Windows
lsof -i :8000                 # Linux/Mac

# Clear cache
rm -rf backend/data/processed/*
```

### API returns 401 Unauthorized
```python
# Make sure header is correct:
headers = {"Authorization": "Bearer demo-token-sih"}

# OR for real JWT (coming in production):
headers = {"Authorization": f"Bearer {jwt_token}"}
```

### Maps not rendering
- Check browser console for errors (F12)
- Verify GeoJSON is valid at http://geojson.io
- Check Leaflet/Mapbox API keys
- Clear browser cache (Ctrl+Shift+Del)

### Slow queries
- Check if database indexes are created: `\d villages` in psql
- Add indexes: `CREATE INDEX idx_hazard_village ON hazard_assessments(village_id)`
- Consider partitioning if data > 1 million rows

---

## 📞 Support

- **Documentation:** See docs/ folder
- **Issues:** GitHub Issues (coming soon)
- **Slack:** #terashield-sih channel (team communication)
- **Email:** luckysuryatale@gmail.com (project lead)

---

## 📄 License

This project is built for Smart India Hackathon 2026 and is the intellectual property of the Ministry of Home Affairs / NDRF. Commercial use requires approval.

---

## 🙏 Acknowledgments

- **Ministry of Home Affairs** - Problem statement & domain expertise
- **National Disaster Response Force (NDRF)** - User requirements & feedback
- **Google Earth Engine** - Satellite data & processing infrastructure
- **OpenStreetMap** - Building & road data
- **WorldPop** - Population distribution data
- **Survey of India** - Administrative boundaries

---

## 🎉 Next Steps

1. **Read the research:** `PROJECT_RESEARCH.md` (15 min read)
2. **Review the roadmap:** `IMPLEMENTATION_ROADMAP.md` (understand phases)
3. **Run the backend:** `uvicorn api.main:app --reload` (1 min)
4. **Test the API:** http://localhost:8000/docs (2 min)
5. **View sample data:** Chamoli or Kendrapara district (5 min)

**Questions?** Check the relevant documentation or search existing issues.

---

**Last Updated:** September 15, 2026  
**Project Status:** Phase 1 (Core APIs) - In Progress  
**Next Milestone:** Week 5 - Engine 1 & 2 APIs Complete
#   T e r a S h i e l d  
 #   T e r a S h i e l d  
 