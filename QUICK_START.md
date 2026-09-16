# TeraShield Quick Start Guide

**Get up and running in 5 minutes**

---

## 🚀 Start Backend (Engine 1: Hazard Intelligence)

### Windows PowerShell
```powershell
# Navigate to project
cd D:\TeraShield\hazards-main\backend

# Create virtual environment
python -m venv venv

# Activate it
.\venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start API server
uvicorn api.main:app --reload --port 8000

# 🎉 API running at http://localhost:8000
# 🎉 Docs at http://localhost:8000/docs (Swagger)
```

### Linux/Mac Bash
```bash
cd D/TeraShield/hazards-main/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn api.main:app --reload --port 8000
```

---

## 🧪 Test the API (No Setup Required!)

### Get list of available districts
```bash
curl http://localhost:8000/api/health
# Response: {"status": "ok", "districts": ["chamoli", "kendrapara"]}
```

### View all villages in Chamoli district (GeoJSON)
```bash
curl http://localhost:8000/api/districts/chamoli/villages \
  -H "Authorization: Bearer demo-token-sih"
```

### Get single village details
```bash
curl "http://localhost:8000/api/districts/chamoli/table?limit=5" \
  -H "Authorization: Bearer demo-token-sih"
```

### Search for a village
```bash
curl "http://localhost:8000/api/search?q=tungnath" \
  -H "Authorization: Bearer demo-token-sih"
```

### Get risk profile
```bash
curl "http://localhost:8000/api/districts/chamoli/villages/VILLAGE_ID/risk" \
  -H "Authorization: Bearer demo-token-sih"
```

**Note:** Replace `VILLAGE_ID` with an actual village ID from the table query.

---

## 💻 Start Frontend (Coming Week 8-9)

```bash
# Navigate to frontend directory (when ready)
cd D:\TeraShield\frontend

# Install dependencies
npm install

# Start dev server
npm run dev

# 🎉 Frontend running at http://localhost:5173
```

---

## 📊 View Sample Data

### Sample districts already loaded:
- **Chamoli** (Uttarakhand) - Landslide + Cloudburst risk
  - ~700 villages
  - Himalayan terrain
  - Use for testing hazard analysis

- **Kendrapara** (Odisha) - Flood + Coastal erosion risk
  - ~600 villages
  - Coastal plains
  - Use for testing flood/coastal analysis

### Try these queries:
```bash
# List all villages in Kendrapara
curl "http://localhost:8000/api/districts/kendrapara/villages" \
  -H "Authorization: Bearer demo-token-sih" | jq '.' | head -50

# Get CSV table sorted by risk
curl "http://localhost:8000/api/districts/kendrapara/table?limit=20" \
  -H "Authorization: Bearer demo-token-sih" | jq '.rows[] | [.name, .multi_hazard, .red_zone_status]'

# Search coastal cities
curl "http://localhost:8000/api/search?q=coastal" \
  -H "Authorization: Bearer demo-token-sih"
```

---

## 📚 Where to Learn

### Read in this order:
1. **README.md** (5 min) - Project overview
2. **PROJECT_RESEARCH.md** (15 min) - Problem analysis & architecture
3. **PROJECT_STRUCTURE.md** (10 min) - Directory layout & API design
4. **IMPLEMENTATION_ROADMAP.md** (20 min) - Detailed 12-week plan
5. **BUILD_CHECKLIST.md** (30 min) - Task breakdown for each team member

### For Engine-specific details:
- **hazards-main/backend/README.md** - Hazard Intelligence deep dive
- **engine-2-exposure-vulnerability-main/Documentation/\*.md** - Exposure & Vulnerability architecture

---

## 🔧 Common Commands

### Check if backend is running
```bash
curl http://localhost:8000/api/health
```

### Stop backend
```bash
# In PowerShell/Terminal where uvicorn is running:
Ctrl+C
```

### View API documentation
```bash
# Open in browser:
http://localhost:8000/docs
```

### Debug API call (get full response)
```bash
curl -v "http://localhost:8000/api/districts" \
  -H "Authorization: Bearer demo-token-sih" | jq '.'
```

### Run tests
```bash
cd hazards-main/backend
pytest tests/ -v
```

### View database
```bash
# When PostgreSQL is setup (Week 10+):
psql -U postgres -d terashield
\dt                    # List tables
SELECT * FROM villages LIMIT 5;  # Preview data
```

---

## 🚨 Troubleshooting

### "Port 8000 already in use"
```bash
# Windows: Find and kill process
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# Linux/Mac: Find and kill
lsof -i :8000
kill -9 <PID>

# Or use different port:
uvicorn api.main:app --reload --port 8001
```

### "ModuleNotFoundError: No module named 'fastapi'"
```bash
# Reinstall dependencies
pip install -r requirements.txt

# Or upgrade pip first
python -m pip install --upgrade pip
```

### "401 Unauthorized"
```bash
# Check if token is correct in header:
Authorization: Bearer demo-token-sih

# Should be exactly "demo-token-sih" (no variations)
```

### "Connection refused" when calling API
```bash
# Make sure backend is actually running:
curl http://localhost:8000/api/health

# If fails, restart with:
uvicorn api.main:app --reload --port 8000
```

---

## 📋 Login (For Dashboard - Coming Week 8)

**Demo Credentials:**
- Username: `sih`
- Password: `sih2026`

These are hard-coded in `backend/api/main.py` for now. Real JWT auth coming in Phase 5.

---

## 🎯 Next Steps by Role

### If you're the **Hazard Expert** (@friend1)
→ Focus on: `ENGINE 1 POLISH` (Week 3-5)
→ Read: PROJECT_STRUCTURE.md + hazards-main/backend/README.md
→ Tasks: Code audit, testing, documentation, performance tuning

### If you're the **Data Scientist** (@friend2)
→ Focus on: `ENGINE 2 IMPLEMENTATION` (Week 4-5)
→ Read: PROJECT_RESEARCH.md + Engine 2 Documentation
→ Tasks: Exposure pipeline, vulnerability scoring, API integration

### If you're the **Geospatial Analyst** (@friend3)
→ Focus on: `ENGINE 3 IMPLEMENTATION` (Week 6-7)
→ Read: IMPLEMENTATION_ROADMAP.md Phase 3
→ Tasks: Site suitability, prioritization, evacuation routing

### If you're the **Frontend Developer** (@friend4)
→ Focus on: `FRONTEND DASHBOARD` (Week 8-9)
→ Read: PROJECT_STRUCTURE.md API section + IMPLEMENTATION_ROADMAP.md Phase 3
→ Tasks: React setup, map component, exposure panel, reports

### If you're the **DevOps/Backend Lead**
→ Focus on: `INTEGRATION & DEPLOYMENT` (Week 10-12)
→ Read: All documentation + deployment guides
→ Tasks: Database setup, Docker, CI/CD, monitoring

---

## 💡 Pro Tips

### Tip 1: Keep Terminal Output Clean
Add logging statements instead of print():
```python
import logging
logger = logging.getLogger(__name__)
logger.info("Processing village: %s", village_id)
```

### Tip 2: Use Swagger UI for Testing
Instead of curl, use http://localhost:8000/docs:
- Click "Authorize" (top right)
- Enter: `Bearer demo-token-sih`
- Click "Try it out" on any endpoint
- Much easier than curl!

### Tip 3: Save API Response to JSON
```bash
curl "http://localhost:8000/api/districts/chamoli/villages" \
  -H "Authorization: Bearer demo-token-sih" > chamoli_villages.geojson
```

### Tip 4: Pretty-print JSON
```bash
# Install jq (one-time)
choco install jq  # Windows
brew install jq   # Mac
sudo apt install jq  # Linux

# Then use it:
curl "http://localhost:8000/api/health" | jq '.'
```

### Tip 5: Monitor Memory Usage
```bash
# In separate terminal while API is running:
while($true) { ps -Name python* | Measure-Object; sleep 1 }  # Windows
watch -n 1 'ps aux | grep uvicorn'  # Linux/Mac
```

---

## 📞 Getting Help

### If you're stuck on **Hazard Intelligence**
→ Read: hazards-main/backend/README.md
→ Check: hazards-main/backend/Fusion_and_RedZone.ipynb
→ Ask: @friend1 or search GitHub issues

### If you're stuck on **Exposure & Vulnerability**
→ Read: engine-2-exposure-vulnerability-main/Documentation/
→ Ask: @friend2 or PM your progress

### If you're stuck on **Relocation Intelligence**
→ Read: IMPLEMENTATION_ROADMAP.md Phase 3 (site suitability section)
→ Ask: @friend3 or reference research docs

### If you're stuck on **Frontend**
→ Read: IMPLEMENTATION_ROADMAP.md Phase 4
→ Check: React + Leaflet docs
→ Ask: @friend4 or frontend community

### If you're stuck on **Deployment**
→ Read: Docker & Kubernetes docs (external)
→ Check: docker-compose.yml when available
→ Ask: @devops-lead

---

## ✅ Verification Checklist

- [ ] Backend starts without errors
- [ ] `http://localhost:8000/api/health` returns 200 OK
- [ ] `http://localhost:8000/docs` loads Swagger UI
- [ ] Can query districts without auth error
- [ ] `curl http://localhost:8000/api/districts/chamoli/villages` returns GeoJSON
- [ ] Can search villages with query parameter
- [ ] Single village detail endpoint works
- [ ] Risk profile endpoint returns explanation

If all above ✅, you're ready to go!

---

## 🎓 Learning Resources

### Python + GIS
- GeoPandas documentation: https://geopandas.org/
- Rasterio documentation: https://rasterio.readthedocs.io/
- Shapely documentation: https://shapely.readthedocs.io/

### Web Development
- FastAPI: https://fastapi.tiangolo.com/
- React: https://react.dev/
- Leaflet.js: https://leafletjs.com/

### Data Science
- Scikit-learn: https://scikit-learn.org/
- Pandas: https://pandas.pydata.org/
- NumPy: https://numpy.org/

### Disaster Risk Management
- UN ISDR: https://www.undrr.org/
- NDMA Guidelines: https://ndma.gov.in/
- World Bank Think Hazard: https://thinkhazard.org/

---

## 🔐 Security Notes (Development)

⚠️ **Never commit to GitHub:**
- API keys or credentials
- `.env` files with secrets
- Private GEE service accounts
- Database passwords

✅ **Always use:**
- Environment variables for secrets
- `.env.local` (in .gitignore)
- GitHub Secrets for CI/CD

---

## 🎉 You're All Set!

Backend is ready. You can now:
1. ✅ Run the Hazard Intelligence API
2. ✅ View sample data (Chamoli & Kendrapara)
3. ✅ Test endpoints with Swagger UI or curl
4. ✅ Read documentation to understand architecture
5. ✅ Start working on your assigned module

**Happy coding!** 🚀

---

**Questions?** Check README.md or the relevant documentation.  
**Found a bug?** Add it to the build checklist for tracking.  
**Need help?** Ask the team lead or check the troubleshooting section above.
