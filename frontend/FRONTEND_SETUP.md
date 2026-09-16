# TeraShield Frontend Setup

## ✅ Quick Setup (5 minutes)

```bash
# Navigate to frontend directory
cd D:\TeraShield\frontend

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Start development server
npm run dev

# 🎉 Frontend running at http://localhost:5173
```

## 📦 Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── Map/
│   │   │   ├── HazardMap.tsx
│   │   │   ├── MapLegend.tsx
│   │   │   └── MapControls.tsx
│   │   ├── Dashboard/
│   │   │   ├── KPIPanel.tsx
│   │   │   ├── DistrictSelector.tsx
│   │   │   └── ChartsPanel.tsx
│   │   ├── RiskTable/
│   │   │   ├── VillageTable.tsx
│   │   │   └── FilterPanel.tsx
│   │   └── Navigation.tsx
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── DashboardPage.tsx
│   │   ├── VillageDetailPage.tsx
│   │   └── RelocationPage.tsx
│   ├── services/
│   │   ├── api.ts
│   │   ├── auth.ts
│   │   └── types.ts
│   ├── styles/
│   │   ├── index.css
│   │   └── tailwind.css
│   └── App.tsx
├── public/
├── vite.config.ts
├── tsconfig.json
├── package.json
└── .env.example
```

## 🔧 Environment Setup

Create `.env` file:

```env
REACT_APP_API_URL=http://localhost:8000/api/v1
REACT_APP_AUTH_TOKEN=demo-token-sih
REACT_APP_DEBUG=true
```

## 🎨 Key Components to Build

### 1. Map Component
- Display villages as GeoJSON
- Color by risk level (RED/ORANGE/YELLOW/GREEN)
- Interactive popups
- Layer toggle

### 2. Dashboard
- KPI cards (villages at risk, red zones, etc)
- Risk distribution charts
- Hazard breakdown
- Responsive layout

### 3. Village Detail Panel
- Hazard assessment
- Exposure data
- Vulnerability scores
- Relocation priority

### 4. Relocation Planning
- Site suitability scores
- Carrying capacity
- Assignment status
- Timeline

## 📊 Integration with Backend

All API calls already defined:

```typescript
// See app/services/api.ts
const api = new TeraShieldAPI(baseURL);

// Hazard endpoints
api.hazard.getDistricts();
api.hazard.getVillageDetail(districtId, villageId);
api.hazard.getVillageRisk(districtId, villageId);

// Exposure endpoints
api.exposure.getVillagexposure(districtId, villageId);
api.exposure.getVulnerability(villageId);

// Relocation endpoints
api.relocation.getSites();
api.relocation.getPriority(villageId);
api.relocation.getAssignments();

// Dashboard endpoints
api.dashboard.getSummary();
api.dashboard.getEvents();
api.dashboard.getAlerts();
```

## 🚀 Getting Started

1. **Install Node.js 18+** https://nodejs.org/
2. **Run setup commands above**
3. **Start backend** (in another terminal)
4. **Check http://localhost:5173**

## 🧪 Testing

```bash
# Run tests
npm test

# Run with coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

## 📦 Building for Production

```bash
# Build optimized version
npm run build

# Preview production build
npm run preview
```

## 🎓 Component Development Tips

1. **Type Safety:** Use TypeScript interfaces for all props
2. **API Calls:** Use services layer (not direct fetch)
3. **State Management:** Use React hooks (useState, useContext)
4. **Styling:** Use MUI + tailwind
5. **Testing:** Write tests for critical components

## 📱 Responsive Design

- Mobile: < 768px
- Tablet: 768px - 1024px
- Desktop: > 1024px

Test with browser dev tools!

---

**Ready to build the UI?** Start with the Map component!
