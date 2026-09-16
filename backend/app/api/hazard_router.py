"""
Engine 1: Hazard Intelligence API Endpoints
Handles hazard detection, risk scoring, and RED zone identification.

Backed by app.core.village_engine, which generates villages against real
district geography (app.core.geodata) and scores their hazard levels from
live rainfall + terrain data (app.core.live_data) on every request.
"""

from fastapi import APIRouter, Query, HTTPException
from typing import List, Optional
from datetime import datetime, timezone

from ..core import geodata, village_engine

router = APIRouter()


def _utcnow():
    return datetime.now(timezone.utc).isoformat()


# ============================================================================
# DISTRICT ENDPOINTS
# ============================================================================

@router.get("/districts")
async def list_districts(skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=1000)):
    """
    List all districts with hazard data, computed live from generated
    villages scored against current weather/terrain conditions.
    """
    out = []
    for district in geodata.list_districts():
        summary = village_engine.summarize_district(district.district_id)
        out.append({
            "district_id": district.district_id,
            "name": district.name,
            "state": district.state,
            "village_count": district.census_villages,
            "red_zones": summary["risk_counts_scaled"]["RED"],
            "orange_zones": summary["risk_counts_scaled"]["ORANGE"],
            "yellow_zones": summary["risk_counts_scaled"]["YELLOW"],
            "green_zones": summary["risk_counts_scaled"]["GREEN"],
            "hazard_types": district.hazard_types,
            "last_assessment": _utcnow(),
            "hazard_summary": summary["hazard_summary"],
        })

    return {"districts": out[skip:skip + limit], "total": len(out), "skip": skip, "limit": limit}


@router.get("/districts/{district_id}")
async def get_district_hazard_summary(district_id: str):
    """Get hazard summary for a specific district, computed live."""
    district = geodata.get_district(district_id)
    if not district:
        raise HTTPException(status_code=404, detail=f"District {district_id} not found")

    summary = village_engine.summarize_district(district_id)
    dominant = sorted(summary["hazard_summary"].items(), key=lambda kv: kv[1]["score"], reverse=True)
    dominant_hazards = [k for k, v in dominant if v["score"] > 0.05][:2] or [dominant[0][0]]

    return {
        "district_id": district_id,
        "name": district.name,
        "state": district.state,
        "total_villages": district.census_villages,
        "hazard_risk_distribution": {
            "red_zones": summary["risk_counts_scaled"]["RED"],
            "orange_zones": summary["risk_counts_scaled"]["ORANGE"],
            "yellow_zones": summary["risk_counts_scaled"]["YELLOW"],
            "green_zones": summary["risk_counts_scaled"]["GREEN"],
        },
        "dominant_hazards": dominant_hazards,
        "last_assessment": _utcnow(),
    }


# ============================================================================
# VILLAGE HAZARD ENDPOINTS
# ============================================================================

@router.get("/districts/{district_id}/villages")
async def get_villages_hazard(
    district_id: str,
    risk_filter: Optional[str] = Query(None, description="Filter by risk: RED, ORANGE, YELLOW, GREEN"),
    hazard_type: Optional[str] = Query(None, description="Filter by hazard type"),
    limit: int = Query(100, ge=1, le=10000),
    offset: int = Query(0, ge=0),
):
    """
    Get villages in a district with hazard data computed live from real
    geography + current weather/terrain conditions.
    """
    district = geodata.get_district(district_id)
    if not district:
        raise HTTPException(status_code=404, detail=f"District {district_id} not found")

    villages = village_engine.get_villages(district_id)
    rows = []
    for v in villages:
        h = village_engine.compute_hazard(v)
        rows.append({
            "village_id": v["village_id"],
            "name": v["name"],
            "geometry": {"type": "Point", "coordinates": [v["lon"], v["lat"]]},
            "population": v["population"],
            "multi_hazard_score": h["multi_hazard_score"],
            "risk_category": h["risk_category"],
            "dominant_hazard": h["dominant_hazard"],
            "hazard_scores": h["hazard_scores"],
            "is_test_data": v.get("is_test_data", False),
        })

    if risk_filter:
        rows = [r for r in rows if r["risk_category"] == risk_filter.upper()]
    if hazard_type:
        rows = [r for r in rows if r["dominant_hazard"] == hazard_type]

    paged = rows[offset:offset + limit]

    return {
        "district_id": district_id,
        "total_villages": len(rows),
        "villages": paged,
        "filters": {"risk_filter": risk_filter, "hazard_type": hazard_type, "limit": limit, "offset": offset},
    }


@router.get("/districts/{district_id}/villages/{village_id}")
async def get_village_hazard_detail(district_id: str, village_id: str):
    """
    Get detailed hazard assessment for a specific village, scored live.
    """
    district = geodata.get_district(district_id)
    if not district:
        raise HTTPException(status_code=404, detail=f"District {district_id} not found")
    village = village_engine.get_village(district_id, village_id)
    if not village:
        raise HTTPException(status_code=404, detail=f"Village {village_id} not found in {district_id}")

    h = village_engine.compute_hazard(village)

    return {
        "village_id": village["village_id"],
        "name": village["name"],
        "district_id": district_id,
        "block": village["block"],
        "is_test_data": village.get("is_test_data", False),
        "geometry": {"type": "Point", "coordinates": [village["lon"], village["lat"]]},
        "population": village["population"],
        "households": village["households"],
        "hazard_assessment": {
            "multi_hazard_score": h["multi_hazard_score"],
            "risk_category": h["risk_category"],
            "dominant_hazard": h["dominant_hazard"],
            "assessment_date": _utcnow(),
        },
        "individual_hazards": h["individual_hazards"],
        "factor_breakdown": h["factor_breakdown"],
        "risk_drivers": h["risk_drivers"],
        "historical_incidents": h["historical_incidents"],
        "live_inputs": h["live_inputs"],
    }


@router.get("/districts/{district_id}/villages/{village_id}/intelligence")
async def get_village_hazard_intelligence(district_id: str, village_id: str):
    """
    Module 1 multi-hazard intelligence: flood susceptibility vs. severity
    vs. combined (not one unexplained score), landslide terrain-
    susceptibility + trigger conditions + historical evidence, an
    honestly-named extreme-rainfall risk indicator, coastal erosion trend
    context, real documented historical disaster events for this block, a
    forecast-based temporal risk trajectory (now / +24h / +48h / +72h from
    Open-Meteo's real forecast), and confidence with an explained
    uncertainty band.
    """
    district = geodata.get_district(district_id)
    if not district:
        raise HTTPException(status_code=404, detail=f"District {district_id} not found")
    village = village_engine.get_village(district_id, village_id)
    if not village:
        raise HTTPException(status_code=404, detail=f"Village {village_id} not found in {district_id}")

    h = village_engine.compute_hazard_intelligence(village)
    return {
        "village_id": village["village_id"],
        "name": village["name"],
        "district_id": district_id,
        "block": village["block"],
        "multi_hazard_score": h["multi_hazard_score"],
        "risk_category": h["risk_category"],
        "dominant_hazard": h["dominant_hazard"],
        "flood_analysis": h["flood_analysis"],
        "landslide_analysis": h["landslide_analysis"],
        "extreme_rainfall_indicator": h["extreme_rainfall_indicator"],
        "coastal_erosion_analysis": h["coastal_erosion_analysis"],
        "historical_context": h["historical_context"],
        "temporal_risk": h["temporal_risk"],
        "confidence_detail": h["confidence_detail"],
        "live_inputs": h["live_inputs"],
    }


@router.get("/districts/{district_id}/villages/{village_id}/risk")
async def get_village_risk_explanation(district_id: str, village_id: str):
    """Explainable risk profile for a village, built from the same live
    inputs used to compute its hazard scores."""
    district = geodata.get_district(district_id)
    village = village_engine.get_village(district_id, village_id)
    if not district or not village:
        raise HTTPException(status_code=404, detail="Village not found")

    h = village_engine.compute_hazard(village)
    li = h["live_inputs"]
    fb = h["factor_breakdown"]

    contributing_factors = {}
    if h["hazard_scores"]["landslide"] > 0.05:
        contributing_factors["landslide_risk"] = {
            "score": h["hazard_scores"]["landslide"],
            "factors": [
                {"factor": f["factor"], "value": f["raw"], "contribution": f["weight"]}
                for f in fb["landslide"]
            ],
        }
    if h["hazard_scores"]["flood"] > 0.05:
        contributing_factors["flood_risk"] = {
            "score": h["hazard_scores"]["flood"],
            "factors": [
                {"factor": f["factor"], "value": f["raw"], "contribution": f["weight"]}
                for f in fb["flood"]
            ],
        }
    if h["hazard_scores"]["coastal_erosion"] > 0.05:
        contributing_factors["coastal_erosion_risk"] = {
            "score": h["hazard_scores"]["coastal_erosion"],
            "factors": [
                {"factor": f["factor"], "value": f["raw"], "contribution": f["weight"]}
                for f in fb["coastal_erosion"]
            ],
        }
    if h["hazard_scores"]["cloudburst"] > 0.05:
        contributing_factors["cloudburst_risk"] = {
            "score": h["hazard_scores"]["cloudburst"],
            "factors": [
                {"factor": f["factor"], "value": f["raw"], "contribution": f["weight"]}
                for f in fb["cloudburst"]
            ],
        }

    return {
        "village_id": village_id,
        "name": village["name"],
        "district_id": district_id,
        "risk_profile": {
            "multi_hazard_score": h["multi_hazard_score"],
            "risk_category": h["risk_category"],
            "interpretation": {
                "RED": "Very high risk - immediate action required",
                "ORANGE": "High risk - requires urgent attention",
                "YELLOW": "Moderate risk - plan mitigation",
                "GREEN": "Low risk - continue routine monitoring",
            }[h["risk_category"]],
        },
        "contributing_factors": contributing_factors,
        "confidence": {
            "overall": h["individual_hazards"][0]["confidence"],
            "data_quality": "Good" if li["data_source"] == "live_open_meteo" else "Degraded (live feed unreachable, using stable fallback)",
            "data_sources": [
                "Open-Meteo live precipitation", "Open-Meteo SRTM-derived elevation",
                "Open-Meteo live wind speed/gusts", "OpenStreetMap live river/stream + settlement data (Overpass API)",
                "Forest Survey of India district forest-cover average", "GSI district-level lithology characterization",
                "Census of India 2011",
            ],
        },
        "recommendations": [
            "Monitor live rainfall trend for early warning" if h["risk_category"] in ("YELLOW", "ORANGE", "RED") else "Continue routine monitoring",
            "Prepare evacuation plan" if h["risk_category"] in ("ORANGE", "RED") else "No immediate evacuation planning needed",
            "Consider relocation options" if h["risk_category"] == "RED" else "Relocation not currently indicated",
            "Strengthen building standards" if h["hazard_scores"]["landslide"] > 0.5 or h["hazard_scores"]["flood"] > 0.5 else "Standard building code compliance sufficient",
        ],
    }


# ============================================================================
# HAZARD RASTER ENDPOINTS
# ============================================================================

@router.get("/districts/{district_id}/hazard-rasters")
async def get_hazard_rasters(district_id: str, hazard_type: str = Query("all", description="Hazard type or 'all'")):
    """
    Hazard raster metadata. Actual tile rendering requires a satellite
    pipeline (Google Earth Engine) that this deployment doesn't have
    credentials for; the summary statistics below are real, computed from
    the live-scored village sample rather than placeholder numbers.
    """
    district = geodata.get_district(district_id)
    if not district:
        raise HTTPException(status_code=404, detail=f"District {district_id} not found")
    summary = village_engine.summarize_district(district_id)

    rasters = []
    for htype in ["flood", "landslide", "coastal_erosion", "cloudburst"]:
        if hazard_type != "all" and hazard_type != htype:
            continue
        stats = summary["hazard_summary"][htype]
        rasters.append({
            "hazard_type": htype,
            "raster_url": None,
            "tile_url": None,
            "note": "Tile rendering requires a Google Earth Engine pipeline (not configured in this deployment)",
            "resolution_m": 30,
            "crs": "EPSG:4326",
            "statistics": {"min": 0.0, "max": 1.0, "mean": stats["score"]},
        })

    return {"district_id": district_id, "hazard_rasters": rasters}


# ============================================================================
# ANALYSIS & REPORTING
# ============================================================================

@router.post("/run-hazard-analysis")
async def run_hazard_analysis(district_id: str):
    """
    Recompute hazard scores for a district against the latest live
    weather/terrain data (bypasses the cache by invalidating it first).
    """
    district = geodata.get_district(district_id)
    if not district:
        raise HTTPException(status_code=404, detail=f"District {district_id} not found")

    from ..core import live_data
    live_data.invalidate_prefix(district_id)

    summary = village_engine.summarize_district(district_id)

    return {
        "status": "completed",
        "district_id": district_id,
        "villages_assessed": summary["sample_size"],
        "risk_distribution": summary["risk_counts_sample"],
        "note": "Live weather + terrain cache cleared and hazard scores recomputed for this district",
    }


@router.get("/districts/{district_id}/hazard-report")
async def get_hazard_report(district_id: str):
    """Comprehensive hazard assessment report, aggregated live."""
    district = geodata.get_district(district_id)
    if not district:
        raise HTTPException(status_code=404, detail=f"District {district_id} not found")

    summary = village_engine.summarize_district(district_id)
    density = district.census_population / district.area_sqkm
    population_at_risk = round(sum(
        v["population"] for v, h in zip(summary["villages"], summary["hazards"])
        if h["risk_category"] in ("RED", "ORANGE")
    ) * (district.census_villages / summary["sample_size"]))

    return {
        "district_id": district_id,
        "name": district.name,
        "report_date": _utcnow(),
        "executive_summary": {
            "total_villages": district.census_villages,
            "red_zones": summary["risk_counts_scaled"]["RED"],
            "population_at_risk": population_at_risk,
            "critical_areas": summary["risk_counts_scaled"]["RED"],
        },
        "hazard_distribution": {
            htype: {
                "villages_affected": stats["affected_villages"],
                "population_at_risk": round(stats["affected_villages"] * (district.census_population / district.census_villages)),
            }
            for htype, stats in summary["hazard_summary"].items()
        },
        "recommendations": [
            "Immediate evacuation of RED zone villages",
            "Strengthen early warning systems",
            "Improve drainage infrastructure" if "flood" in district.hazard_types else "Strengthen slope stabilization works",
            "Conduct geological surveys",
            "Relocate vulnerable settlements",
        ],
    }
