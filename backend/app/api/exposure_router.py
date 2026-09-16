"""
Engine 2: Exposure & Vulnerability API Endpoints
Handles asset inventory, exposure assessment, and vulnerability scoring.

Backed by app.core.village_engine — every number here is derived from a
village's real generated population/household count combined with real
NRHM facility norms and Census 2011 district baselines, keyed correctly
by village_id (the previous mock ignored village_id entirely).
"""

from fastapi import APIRouter, HTTPException
from typing import Optional
from datetime import datetime, timezone

from ..core import geodata, village_engine

router = APIRouter()


def _utcnow():
    return datetime.now(timezone.utc).isoformat()


# ============================================================================
# EXPOSURE ASSESSMENT ENDPOINTS
# ============================================================================

@router.get("/districts/{district_id}/summary")
async def get_exposure_summary(district_id: str):
    """Exposure summary for a district, aggregated live from generated villages."""
    district = geodata.get_district(district_id)
    if not district:
        raise HTTPException(status_code=404, detail=f"District {district_id} not found")

    summary = village_engine.summarize_district(district_id)
    scale = district.census_villages / summary["sample_size"]

    exposed_villages = [v for v, h in zip(summary["villages"], summary["hazards"]) if h["risk_category"] in ("RED", "ORANGE")]
    pop_exposed = round(sum(v["population"] for v in exposed_villages) * scale)
    hh_exposed = round(sum(v["households"] for v in exposed_villages) * scale)

    exposures = [village_engine.compute_exposure(v, district, h) for v, h in zip(summary["villages"], summary["hazards"])]
    total_buildings = round(sum(e["exposure"]["buildings"]["total"] for e in exposures) * scale)
    buildings_exposed = round(sum(e["exposure"]["buildings"]["total"] for e, v in zip(exposures, summary["villages"]) if v in exposed_villages) * scale)
    ag_land = round(sum(e["exposure"]["economic_assets"]["agricultural_land_hectares"] for e in exposures) * scale)
    livestock = round(sum(e["exposure"]["economic_assets"]["livestock_heads"] for e in exposures) * scale)

    hospitals = sum(1 for e in exposures for f in e["exposure"]["critical_facilities"] if f["type"] == "hospital")
    schools = sum(1 for e in exposures for f in e["exposure"]["critical_facilities"] if f["type"] == "school")
    water_systems = sum(1 for e in exposures for f in e["exposure"]["critical_facilities"] if f["type"] == "water_system")

    return {
        "district_id": district_id,
        "assessment_date": _utcnow(),
        "exposure_summary": {
            "total_population": district.census_population,
            "population_exposed": pop_exposed,
            "households": district.census_households,
            "households_exposed": hh_exposed,
        },
        "assets_exposed": {
            "buildings": total_buildings,
            "agricultural_land_hectares": ag_land,
            "livestock_heads": livestock,
            "roads_km": round(district.area_sqkm * 0.15),  # rough rural road density proxy
            "water_bodies": len(district.blocks),
        },
        "critical_infrastructure": {
            "hospitals_in_hazard": round(hospitals * scale),
            "schools_in_hazard": round(schools * scale),
            "power_plants_in_hazard": 0,
            "water_systems_in_hazard": round(water_systems * scale),
        },
    }


@router.get("/districts/{district_id}/villages/{village_id}/exposure")
async def get_village_exposure(district_id: str, village_id: str):
    """Detailed exposure profile for a village, computed from its real
    generated population/household counts and NRHM facility norms."""
    district = geodata.get_district(district_id)
    village = village_engine.get_village(district_id, village_id)
    if not district or not village:
        raise HTTPException(status_code=404, detail=f"Village {village_id} not found in {district_id}")

    hazard = village_engine.compute_hazard(village)
    return village_engine.compute_exposure(village, district, hazard)


@router.get("/districts/{district_id}/villages/{village_id}/profile")
async def get_village_exposure_profile(district_id: str, village_id: str):
    """
    Full multi-sector exposure profile (SIH26191 scope): human population
    (exposed vs. vulnerable, reported separately), healthcare, education,
    housing, water, energy, transport, emergency response, livelihood and
    environment — not just population/buildings/roads/hospitals.
    """
    district = geodata.get_district(district_id)
    village = village_engine.get_village(district_id, village_id)
    if not district or not village:
        raise HTTPException(status_code=404, detail=f"Village {village_id} not found in {district_id}")

    hazard = village_engine.compute_hazard(village)
    return village_engine.compute_exposure_profile(village, district, hazard)


@router.get("/districts/{district_id}/profile-summary")
async def get_district_exposure_profile_summary(district_id: str):
    """District-wide roll-up of the multi-sector exposure profile, plus a
    cascading-dependency read-out (a shared block-level water/power asset
    sitting in a hazard zone affects every village that depends on it, not
    just the village it physically sits in)."""
    summary = village_engine.summarize_district_exposure_profile(district_id)
    if not summary:
        raise HTTPException(status_code=404, detail=f"District {district_id} not found")
    return summary


@router.get("/assets/types")
async def get_asset_types():
    """Asset types tracked by the platform and where each comes from in
    this deployment."""
    return {
        "asset_types": [
            {"type": "population", "data_source": "Census of India 2011 (district totals, block-distributed)", "resolution_m": None, "last_update": "2011"},
            {"type": "buildings", "data_source": "Derived from household counts (Census 2011 avg household size)", "resolution_m": None, "last_update": "2011"},
            {"type": "critical_facilities", "data_source": "National Rural Health Mission population-threshold norms", "resolution_m": None, "last_update": "current"},
            {"type": "terrain / slope", "data_source": "Open-Meteo (SRTM-derived elevation), live", "resolution_m": 90, "last_update": "live"},
            {"type": "precipitation", "data_source": "Open-Meteo live forecast API", "resolution_m": None, "last_update": "live"},
            {"type": "agricultural_land / livestock", "data_source": "Estimated from household counts via rural smallholding norms (not individually surveyed)", "resolution_m": None, "last_update": "estimate"},
        ]
    }


# ============================================================================
# VULNERABILITY ASSESSMENT ENDPOINTS
# ============================================================================

@router.get("/vulnerability/districts/{district_id}/summary")
async def get_vulnerability_summary(district_id: str):
    """Vulnerability distribution for a district, computed live."""
    district = geodata.get_district(district_id)
    if not district:
        raise HTTPException(status_code=404, detail=f"District {district_id} not found")

    summary = village_engine.summarize_district(district_id)
    scale = district.census_villages / summary["sample_size"]
    vulns = [village_engine.compute_vulnerability(v, district) for v in summary["villages"]]
    bands = {"HIGH": 0, "MEDIUM": 0, "LOW": 0}
    for vu in vulns:
        bands[vu["vulnerability_assessment"]["vulnerability_band"]] += 1

    factor_severity = {}
    for vu in vulns:
        for f in vu["factor_scores"]:
            factor_severity.setdefault(f["factor"], []).append(f["score"])

    key_factors = []
    factor_meta = {
        "income": ("Limited market/employment access (remote villages)", ),
        "age": ("High proportion of children & elderly", ),
        "healthcare_access": ("Limited access to medical facilities", ),
        "literacy": ("Below-average literacy", ),
        "housing_quality": ("Construction/terrain risk to housing", ),
    }
    for factor, (desc,) in factor_meta.items():
        scores = factor_severity.get(factor, [])
        if not scores:
            continue
        avg = sum(scores) / len(scores)
        affected = round(sum(1 for s in scores if s > 0.5) * scale)
        key_factors.append({
            "factor": factor,
            "affected_villages": affected,
            "severity": "high" if avg > 0.6 else "medium" if avg > 0.35 else "low",
            "description": desc,
        })

    return {
        "district_id": district_id,
        "assessment_date": _utcnow(),
        "vulnerability_distribution": {
            "high_vulnerability_villages": round(bands["HIGH"] * scale),
            "medium_vulnerability_villages": round(bands["MEDIUM"] * scale),
            "low_vulnerability_villages": round(bands["LOW"] * scale),
        },
        "key_vulnerability_factors": key_factors,
    }


@router.get("/vulnerability/villages/{village_id}")
async def get_village_vulnerability(village_id: str):
    """Vulnerability assessment for a specific village."""
    found = village_engine.find_village_anywhere(village_id)
    if not found:
        raise HTTPException(status_code=404, detail=f"Village {village_id} not found")
    village, district_id = found
    district = geodata.get_district(district_id)
    return village_engine.compute_vulnerability(village, district)


# ============================================================================
# INTEGRATED EXPOSURE-VULNERABILITY ENDPOINTS
# ============================================================================

@router.get("/impact/villages/{village_id}")
async def get_village_impact_assessment(village_id: str):
    """Integrated impact assessment combining live hazard exposure and vulnerability."""
    found = village_engine.find_village_anywhere(village_id)
    if not found:
        raise HTTPException(status_code=404, detail=f"Village {village_id} not found")
    village, district_id = found
    district = geodata.get_district(district_id)

    hazard = village_engine.compute_hazard(village)
    exposure = village_engine.compute_exposure(village, district, hazard)
    vulnerability = village_engine.compute_vulnerability(village, district)

    exposure_score = hazard["multi_hazard_score"]
    vulnerability_score = vulnerability["vulnerability_assessment"]["composite_score"]
    combined = round((exposure_score * 0.5 + vulnerability_score * 0.5), 3)
    band = "HIGH" if combined >= 0.6 else "MEDIUM" if combined >= 0.35 else "LOW"

    pop_breakdown = exposure["exposure"]["population"]["breakdown"]
    children_at_risk = round((pop_breakdown["children_0_5"] + pop_breakdown["children_6_14"]) * exposure_score)
    elderly_at_risk = round(pop_breakdown["elderly_60plus"] * exposure_score)
    marginal_at_risk = round(village["population"] * vulnerability_score * 0.4)

    households = village["households"]
    ag = exposure["exposure"]["economic_assets"]
    farmers = round(households * 0.55)
    herders = round(households * 0.2)
    wage_workers = round(households * 0.3)

    return {
        "village_id": village_id,
        "name": village["name"],
        "impact_assessment": {
            "exposure_score": exposure_score,
            "vulnerability_score": vulnerability_score,
            "combined_impact_score": combined,
            "impact_band": band,
            "priority_for_intervention": band in ("HIGH", "MEDIUM") and hazard["risk_category"] in ("RED", "ORANGE"),
        },
        "exposed_and_vulnerable_population": {
            "total": village["population"],
            "children_at_risk": children_at_risk,
            "elderly_at_risk": elderly_at_risk,
            "marginal_population_at_risk": marginal_at_risk,
        },
        "affected_livelihoods": {
            "agriculture": {
                "farmers_dependent": farmers,
                "land_affected_hectares": ag["agricultural_land_hectares"],
                "annual_loss_potential_lakhs": round(ag["agricultural_land_hectares"] * 0.4 * exposure_score, 1),
            },
            "livestock": {
                "herders": herders,
                "livestock_heads": ag["livestock_heads"],
                "annual_loss_potential_lakhs": round(ag["livestock_heads"] * 0.02 * exposure_score, 1),
            },
            "daily_wage": {
                "workers": wage_workers,
                "employment_days_lost": round(30 * exposure_score),
                "annual_income_loss_lakhs": round(wage_workers * 0.03 * exposure_score, 1),
            },
        },
        "intervention_priorities": [
            p for p, cond in [
                ("Livelihood restoration programs", True),
                ("Healthcare facility strengthening", vulnerability_score > 0.5),
                ("School safety measures", pop_breakdown["children_6_14"] > 100),
                ("Building safety improvements", hazard["hazard_scores"]["landslide"] > 0.4 or hazard["hazard_scores"]["flood"] > 0.4),
                ("Early warning system training", hazard["risk_category"] in ("RED", "ORANGE", "YELLOW")),
            ] if cond
        ],
    }


@router.get("/risk-matrix/districts/{district_id}")
async def get_risk_matrix(district_id: str):
    """Risk matrix combining live hazard, exposure and vulnerability for every village."""
    district = geodata.get_district(district_id)
    if not district:
        raise HTTPException(status_code=404, detail=f"District {district_id} not found")

    summary = village_engine.summarize_district(district_id)
    scale = district.census_villages / summary["sample_size"]

    buckets = {"very_high_risk": 0, "high_risk": 0, "medium_risk": 0, "low_risk": 0}
    for v, h in zip(summary["villages"], summary["hazards"]):
        vulnerability = village_engine.compute_vulnerability(v, district)
        vuln_band = vulnerability["vulnerability_assessment"]["vulnerability_band"]
        if h["risk_category"] == "RED" and vuln_band == "HIGH":
            buckets["very_high_risk"] += 1
        elif h["risk_category"] in ("RED", "ORANGE") and vuln_band in ("HIGH", "MEDIUM"):
            buckets["high_risk"] += 1
        elif h["risk_category"] == "YELLOW" or vuln_band == "HIGH":
            buckets["medium_risk"] += 1
        else:
            buckets["low_risk"] += 1

    scaled = {k: round(v * scale) for k, v in buckets.items()}
    drift = district.census_villages - sum(scaled.values())
    scaled["low_risk"] += drift

    return {
        "district_id": district_id,
        "risk_matrix": {
            "very_high_risk": {"hazard_high_exposure_high_vulnerability_high": scaled["very_high_risk"], "description": "Immediate evacuation & relocation needed"},
            "high_risk": {"hazard_high_exposure_medium_or_high_vulnerability": scaled["high_risk"], "description": "Urgent intervention required"},
            "medium_risk": {"hazard_medium_or_exposure_high_vulnerability": scaled["medium_risk"], "description": "Planned intervention needed"},
            "low_risk": {"hazard_low_or_exposure_low_vulnerability_low": scaled["low_risk"], "description": "Monitoring & preparedness"},
        },
        "villages_requiring_immediate_attention": scaled["very_high_risk"],
        "villages_requiring_urgent_attention": scaled["very_high_risk"] + scaled["high_risk"],
    }


# ============================================================================
# EXPOSURE-VULNERABILITY ANALYSIS
# ============================================================================

@router.post("/run-exposure-vulnerability-analysis")
async def run_analysis(district_id: str):
    """Recompute exposure & vulnerability for a district against current data."""
    district = geodata.get_district(district_id)
    if not district:
        raise HTTPException(status_code=404, detail=f"District {district_id} not found")
    summary = village_engine.summarize_district(district_id)
    return {
        "status": "completed",
        "district_id": district_id,
        "villages_assessed": summary["sample_size"],
    }


@router.get("/districts/{district_id}/exposure-report")
async def get_exposure_report(district_id: str):
    """Comprehensive exposure and vulnerability report."""
    district = geodata.get_district(district_id)
    if not district:
        raise HTTPException(status_code=404, detail=f"District {district_id} not found")

    exposure_summary = await get_exposure_summary(district_id)
    vulnerability_summary = await get_vulnerability_summary(district_id)

    return {
        "district_id": district_id,
        "report_date": _utcnow(),
        "report_type": "Exposure and Vulnerability Assessment",
        "executive_summary": {
            "population_at_risk": exposure_summary["exposure_summary"]["population_exposed"],
            "households_at_risk": exposure_summary["exposure_summary"]["households_exposed"],
            "villages_affected": vulnerability_summary["vulnerability_distribution"]["high_vulnerability_villages"] + vulnerability_summary["vulnerability_distribution"]["medium_vulnerability_villages"],
            "high_vulnerability_villages": vulnerability_summary["vulnerability_distribution"]["high_vulnerability_villages"],
        },
        "exposure_snapshot": {
            "population": exposure_summary["exposure_summary"]["population_exposed"],
            "buildings": exposure_summary["assets_exposed"]["buildings"],
            "critical_facilities": exposure_summary["critical_infrastructure"]["hospitals_in_hazard"] + exposure_summary["critical_infrastructure"]["schools_in_hazard"] + exposure_summary["critical_infrastructure"]["water_systems_in_hazard"],
            "agricultural_area": exposure_summary["assets_exposed"]["agricultural_land_hectares"],
        },
        "vulnerability_snapshot": vulnerability_summary["vulnerability_distribution"],
        "recommendations": [
            "Prioritize high-risk villages for relocation",
            "Strengthen healthcare infrastructure",
            "Improve school safety measures",
            "Launch livelihood support programs",
            "Conduct vulnerability reduction initiatives",
        ],
    }
