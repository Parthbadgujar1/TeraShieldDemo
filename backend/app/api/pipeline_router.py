"""
Single endpoint that makes the intelligence pipeline's data lineage
explicit: hazard -> exposure -> vulnerability -> relocation, each stage
showing exactly what it consumed from the stage(s) before it. Useful both
as a debugging tool and as proof the engines are actually chained rather
than each independently returning disconnected numbers.
"""

from fastapi import APIRouter, HTTPException

from ..core import geodata, village_engine, relocation_engine

router = APIRouter()


@router.get("/villages/{village_id}")
async def get_village_pipeline(village_id: str):
    """Full joined pipeline output for one village, with each stage's
    inputs traced back to the stage(s) that produced them."""
    found = village_engine.find_village_anywhere(village_id)
    if not found:
        raise HTTPException(status_code=404, detail=f"Village {village_id} not found")
    village, district_id = found
    district = geodata.get_district(district_id)

    hazard = village_engine.compute_hazard(village)
    exposure = village_engine.compute_exposure(village, district, hazard)
    vulnerability = village_engine.compute_vulnerability(village, district)
    priority = relocation_engine.compute_priority(village, district, hazard, vulnerability)
    override = village_engine.get_scenario_override(village_id)

    return {
        "village_id": village_id,
        "name": village["name"],
        "district_id": district_id,
        "is_test_data": village.get("is_test_data", False),
        "active_scenario_override": override,
        "pipeline": [
            {
                "stage": 1,
                "engine": "Hazard Intelligence",
                "inputs": ["live rainfall (Open-Meteo)", "live terrain slope/elevation (Open-Meteo)", "district terrain class + coastal distance (real geography)"],
                "output": {
                    "multi_hazard_score": hazard["multi_hazard_score"],
                    "risk_category": hazard["risk_category"],
                    "dominant_hazard": hazard["dominant_hazard"],
                },
                "feeds_into": ["Exposure Assessment (stage 2)", "Relocation Intelligence (stage 4)"],
            },
            {
                "stage": 2,
                "engine": "Exposure Assessment",
                "inputs": ["hazard.multi_hazard_score → exposure_fraction", "hazard.risk_category → facility in_hazard_zone flag", "village population/households (Census-anchored)"],
                "output": {
                    "exposure_fraction": exposure["exposure"]["hazard_linkage"]["exposure_fraction"],
                    "population_at_risk": exposure["exposure"]["population"]["at_risk"],
                    "buildings_at_risk": exposure["exposure"]["buildings"]["at_risk"],
                },
                "feeds_into": ["Relocation Intelligence (stage 4, via infrastructure exposure)"],
            },
            {
                "stage": 3,
                "engine": "Vulnerability Assessment",
                "inputs": ["district Census 2011 baselines (literacy, sex ratio)", "village demographic age split", "distance to block HQ (real haversine)", "NOT derived from current hazard — vulnerability is an intrinsic susceptibility trait, assessed independently"],
                "output": {
                    "composite_score": vulnerability["vulnerability_assessment"]["composite_score"],
                    "band": vulnerability["vulnerability_assessment"]["vulnerability_band"],
                },
                "feeds_into": ["Relocation Intelligence (stage 4)"],
            },
            {
                "stage": 4,
                "engine": "Relocation Intelligence",
                "inputs": ["hazard.risk_category (40% weight)", "vulnerability.composite_score (30% weight)", "exposure-derived critical infrastructure count (15% weight)", "live-graded candidate site slope + distance (10% weight)"],
                "output": {
                    "tier": priority["relocation_priority"]["tier"],
                    "score": priority["relocation_priority"]["score"],
                    "assigned_site": priority["assigned_site"]["name"],
                },
                "feeds_into": ["Dashboard aggregation / alerts"],
            },
        ],
        "hazard": hazard,
        "exposure": exposure,
        "vulnerability": vulnerability,
        "relocation_priority": priority,
    }
