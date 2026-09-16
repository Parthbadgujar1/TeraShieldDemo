"""
TeraShield: Unified 4-Engine GIS Platform
Main FastAPI Application
"""

from fastapi import FastAPI, Depends, HTTPException, Header, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import logging

from app.core.config import get_settings
from app.api.hazard_router import router as hazard_router
from app.api.exposure_router import router as exposure_router
from app.api.relocation_router import router as relocation_router
from app.api.dashboard_router import router as dashboard_router
from app.api.testdata_router import router as testdata_router
from app.api.pipeline_router import router as pipeline_router
from app.api.emergency_router import router as emergency_router

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings = get_settings()


# ============================================================================
# LIFECYCLE
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown events"""
    # Startup
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    logger.info(f"Database: {settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME}")
    logger.info(f"Running in {'DEBUG' if settings.DEBUG else 'PRODUCTION'} mode")

    yield

    # Shutdown
    logger.info(f"Shutting down {settings.APP_NAME}")


# ============================================================================
# APP INITIALIZATION
# ============================================================================

app = FastAPI(
    title=settings.APP_NAME,
    description="Intelligent Hazard-Based Red Zone Identification & Relocation Platform",
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# AUTHENTICATION HELPER
# ============================================================================

def verify_auth(authorization: str = Header(None)) -> dict:
    """Simple authentication for demo. Two roles: the analytical admin
    portal, and the Emergency Response Team's operational portal — a
    separate role, not just another page of the same dashboard."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    if authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "")
        if token == "demo-token-sih":
            return {"user": "demo", "scope": "admin"}
        if token == "demo-token-rescue":
            return {"user": settings.DEMO_RESCUE_USER, "scope": "emergency_team"}

    # Demo credentials
    if authorization == f"Basic {settings.DEMO_USER}:{settings.DEMO_PASS}":
        return {"user": settings.DEMO_USER, "scope": "admin"}

    raise HTTPException(status_code=401, detail="Invalid credentials")


def require_emergency_team(auth: dict = Depends(verify_auth)) -> dict:
    """Endpoints only the Emergency Response Team role should reach."""
    if auth["scope"] != "emergency_team":
        raise HTTPException(status_code=403, detail="Emergency Response Team access required")
    return auth


# ============================================================================
# HEALTH & STATUS ENDPOINTS
# ============================================================================

@app.get("/health")
async def health_check():
    """
    Health check endpoint

    Returns status of all 4 engines
    """
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "engines": {
            "hazard_intelligence": "operational",
            "exposure_vulnerability": "operational",
            "relocation_intelligence": "operational",
            "gis_dashboard": "operational"
        }
    }


@app.get("/info")
async def app_info():
    """Application information"""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "description": "Intelligent disaster risk management platform",
        "modules": 4,
        "authors": ["Ministry of Home Affairs", "NDRF"],
        "endpoints": {
            "hazard_intelligence": f"{settings.API_PREFIX}/hazard",
            "exposure_vulnerability": f"{settings.API_PREFIX}/exposure",
            "relocation_intelligence": f"{settings.API_PREFIX}/relocation",
            "gis_dashboard": f"{settings.API_PREFIX}/dashboard"
        }
    }


# ============================================================================
# AUTHENTICATION ENDPOINTS
# ============================================================================

@app.post("/auth/login")
async def login(username: str = Form(...), password: str = Form(...)):
    """
    Demo login endpoint. Two roles:
    - Admin portal:            username sih     / password sih2026
    - Emergency Response Team: username rescue  / password rescue2026
    """
    if username == settings.DEMO_USER and password == settings.DEMO_PASS:
        return {
            "token": "demo-token-sih",
            "token_type": "Bearer",
            "scope": "admin",
            "expires_in": 3600
        }
    if username == settings.DEMO_RESCUE_USER and password == settings.DEMO_RESCUE_PASS:
        return {
            "token": "demo-token-rescue",
            "token_type": "Bearer",
            "scope": "emergency_team",
            "expires_in": 3600
        }

    raise HTTPException(status_code=401, detail="Invalid credentials")


# ============================================================================
# ROUTER REGISTRATION
# ============================================================================

# Engine 1: Hazard Intelligence
app.include_router(
    hazard_router,
    prefix=f"{settings.API_PREFIX}/hazard",
    tags=["Engine 1: Hazard Intelligence"],
    dependencies=[Depends(verify_auth)]
)

# Engine 2: Exposure & Vulnerability
app.include_router(
    exposure_router,
    prefix=f"{settings.API_PREFIX}/exposure",
    tags=["Engine 2: Exposure & Vulnerability"],
    dependencies=[Depends(verify_auth)]
)

# Engine 3: Relocation Intelligence
app.include_router(
    relocation_router,
    prefix=f"{settings.API_PREFIX}/relocation",
    tags=["Engine 3: Relocation Intelligence"],
    dependencies=[Depends(verify_auth)]
)

# Engine 4: Integrated GIS Dashboard
app.include_router(
    dashboard_router,
    prefix=f"{settings.API_PREFIX}/dashboard",
    tags=["Engine 4: GIS Dashboard"],
    dependencies=[Depends(verify_auth)]
)

# Developer/testing tools: sample data injection + scenario simulation
app.include_router(
    testdata_router,
    prefix=f"{settings.API_PREFIX}/testdata",
    tags=["Dev Tools: Test Data & Scenarios"],
    dependencies=[Depends(verify_auth)]
)

# Cross-engine pipeline view: shows hazard -> exposure -> vulnerability ->
# relocation as one explicitly-joined chain instead of separate raw calls
app.include_router(
    pipeline_router,
    prefix=f"{settings.API_PREFIX}/pipeline",
    tags=["Intelligence Pipeline"],
    dependencies=[Depends(verify_auth)]
)

# Emergency Response Team: a separate operational role, gated to only the
# emergency_team login scope (not just another page behind the same admin
# token) — the response loop, not the planning loop.
app.include_router(
    emergency_router,
    prefix=f"{settings.API_PREFIX}/emergency",
    tags=["Emergency Response Team"],
    dependencies=[Depends(require_emergency_team)]
)


# ============================================================================
# INTEGRATED ENDPOINTS (LINKING ALL ENGINES)
# ============================================================================

@app.get(f"{settings.API_PREFIX}/integrated/village/{{village_id}}")
async def get_village_complete_profile(
    village_id: str,
    auth: dict = Depends(verify_auth)
):
    """
    Get complete village profile integrating all 4 engines

    Returns:
    - Hazard assessment (Engine 1)
    - Exposure & vulnerability (Engine 2)
    - Relocation assignment (Engine 3)
    - Monitoring status (Engine 4)
    """
    return {
        "village_id": village_id,
        "status": "pending",  # Will be implemented with actual data
        "engines": {
            "hazard_intelligence": "pending",
            "exposure_vulnerability": "pending",
            "relocation_intelligence": "pending"
        }
    }


@app.get(f"{settings.API_PREFIX}/integrated/district/{{district_id}}/summary")
async def get_district_summary(
    district_id: str,
    auth: dict = Depends(verify_auth)
):
    """
    Get integrated district summary across all 4 engines

    Returns summary metrics and KPIs for the district
    """
    return {
        "district_id": district_id,
        "status": "pending",
        "summary": {
            "total_villages": 0,
            "red_zones": 0,
            "people_at_risk": 0,
            "relocation_priority": {}
        }
    }


@app.post(f"{settings.API_PREFIX}/integrated/run-analysis")
async def run_integrated_analysis(
    district_id: str,
    auth: dict = Depends(verify_auth)
):
    """
    Run full integrated analysis for a district

    Executes all 4 engines in sequence:
    1. Hazard Intelligence
    2. Exposure Assessment
    3. Relocation Planning
    4. Dashboard Update
    """
    return {
        "status": "analysis_started",
        "district_id": district_id,
        "pipeline": [
            {"step": 1, "name": "Hazard Intelligence", "status": "running"},
            {"step": 2, "name": "Exposure & Vulnerability", "status": "queued"},
            {"step": 3, "name": "Relocation Intelligence", "status": "queued"},
            {"step": 4, "name": "Dashboard Update", "status": "queued"}
        ]
    }


# ============================================================================
# ERROR HANDLERS
# ============================================================================

@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    """Custom HTTP exception handler"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "status_code": exc.status_code
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    """General exception handler"""
    logger.error(f"Unhandled exception: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "status_code": 500
        }
    )


# ============================================================================
# STARTUP MESSAGE
# ============================================================================

if __name__ == "__main__":
    import uvicorn

    print("""
    ╔═══════════════════════════════════════════════════════════════╗
    ║                     TeraShield Platform                        ║
    ║  Intelligent Hazard-Based Red Zone Identification Platform    ║
    ║                                                                ║
    ║  4 Integrated Engines:                                        ║
    ║  1. Hazard Intelligence                                       ║
    ║  2. Exposure & Vulnerability Assessment                       ║
    ║  3. Relocation Intelligence & Site Matching                  ║
    ║  4. Integrated GIS Decision Support Dashboard                ║
    ║                                                                ║
    ║  Docs: http://localhost:8000/docs                            ║
    ╚═══════════════════════════════════════════════════════════════╝
    """)

    uvicorn.run(
        "app.main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.DEBUG
    )
