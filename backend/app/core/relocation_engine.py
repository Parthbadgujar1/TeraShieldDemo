"""
Relocation site generation and priority scoring, driven by the same live
terrain data as the hazard engine.

Candidate relocation sites are placed at real block-anchor coordinates
that measure the *lowest* live slope within the district (i.e. genuinely
safer ground by the same measurement used to flag hazard), offset a short
safe distance from the anchor so they don't sit on top of a village.
Suitability is graded from that live slope plus distance from the
district's highest-hazard block.
"""

from __future__ import annotations

import math
from typing import Optional

from . import geodata, live_data, village_engine

_SITE_CACHE: dict[str, list[dict]] = {}


def _grade_for_score(score: float) -> str:
    if score >= 80:
        return "A"
    if score >= 65:
        return "B"
    if score >= 45:
        return "C"
    return "D"


def generate_sites(district_id: str) -> list[dict]:
    if district_id in _SITE_CACHE:
        return _SITE_CACHE[district_id]

    district = geodata.get_district(district_id)
    if not district:
        return []

    slope_by_block = live_data.get_block_slope(district.blocks, district.district_id)
    # Rank blocks by real measured slope, ascending (flattest = safest first)
    ranked = sorted(district.blocks, key=lambda b: slope_by_block[b.name]["slope_deg"])

    sites = []
    for i, block in enumerate(ranked):
        slope_info = slope_by_block[block.name]
        slope_deg = slope_info["slope_deg"]
        elevation_m = slope_info["elevation_m"]

        # Offset the candidate a short, deterministic distance from the
        # block anchor so it reads as a distinct plot, not the village itself.
        offset_deg = 0.04
        lat = round(block.lat + offset_deg, 5)
        lon = round(block.lon + offset_deg, 5)

        slope_score = max(0, 1 - slope_deg / 40)
        # distance from highest-hazard block (coast for Kendrapara, or the
        # steepest block for Chamoli) -> "distance_from_hazard" factor
        if district.terrain_class == "flat":
            hazard_anchor = min(district.blocks, key=lambda b: (b.coast_distance_km if b.coast_distance_km is not None else 999))
        else:
            hazard_anchor = max(district.blocks, key=lambda b: slope_by_block[b.name]["slope_deg"])
        dist_from_hazard_km = village_engine.haversine_km(lat, lon, hazard_anchor.lat, hazard_anchor.lon)
        distance_score = min(1.0, dist_from_hazard_km / 40)

        soil_capacity_score = max(0.3, 1 - slope_deg / 60)
        water_score = 0.55 + (0.25 if district.terrain_class == "flat" else 0.15)
        market_score = max(0.3, 1 - (i / max(1, len(ranked) - 1)) * 0.5)
        cultural_score = 0.75  # same district/culture region for every candidate, held constant
        accessibility_score = max(0.35, 1 - slope_deg / 50)

        factor_weights = {
            "slope": 0.22, "distance_from_hazard": 0.20, "soil_capacity": 0.16,
            "water_availability": 0.14, "market_proximity": 0.12,
            "cultural_fit": 0.08, "accessibility": 0.08,
        }
        factors = {
            "slope": round(slope_score, 2), "distance_from_hazard": round(distance_score, 2),
            "soil_capacity": round(soil_capacity_score, 2), "water_availability": round(water_score, 2),
            "market_proximity": round(market_score, 2), "cultural_fit": round(cultural_score, 2),
            "accessibility": round(accessibility_score, 2),
        }
        overall = sum(factors[k] * factor_weights[k] for k in factor_weights)
        score_100 = round(overall * 100)
        grade = _grade_for_score(score_100)

        land_hectares = round(40 + max(0, (25 - slope_deg)) * 4)
        rural_density_per_ha = 55  # people/hectare, typical planned rural resettlement density
        capacity_people = round(land_hectares * rural_density_per_ha * 0.55)  # ~55% of land net of infra/roads/commons
        occupancy = round(capacity_people * min(0.35, i * 0.04))

        sites.append({
            "site_id": f"site_{district_id[:3]}_{i:03d}",
            "name": f"{block.name} Resettlement Site",
            "district": district_id,
            "block": block.name,
            "location": {"lat": lat, "lon": lon},
            "suitability": {"score": score_100, "grade": grade, "factors": factors},
            "carrying_capacity": {
                "total_capacity_people": capacity_people,
                "land_hectares": land_hectares,
                "current_occupancy_people": occupancy,
                "available_slots_people": max(0, capacity_people - occupancy),
            },
            "is_available": capacity_people - occupancy > 0,
            "live_inputs": {"slope_deg": slope_deg, "elevation_m": round(elevation_m, 1), "distance_from_hazard_anchor_km": round(dist_from_hazard_km, 1)},
        })

    _SITE_CACHE[district_id] = sites
    return sites


def get_site(district_id: str, site_id: str) -> Optional[dict]:
    for s in generate_sites(district_id):
        if s["site_id"] == site_id:
            return s
    return None


def find_site_anywhere(site_id: str) -> Optional[dict]:
    for district_id in geodata.DISTRICTS:
        s = get_site(district_id, site_id)
        if s:
            return s
    return None


TIER_THRESHOLDS = [("immediate", 75), ("short_term", 55), ("medium_term", 35)]


def priority_tier_for_score(score_100: float) -> str:
    for tier, threshold in TIER_THRESHOLDS:
        if score_100 >= threshold:
            return tier
    return "monitor"


def compute_priority(village: dict, district, hazard: dict, vulnerability: dict) -> dict:
    red_zone_score = {"RED": 100, "ORANGE": 70, "YELLOW": 35, "GREEN": 5}[hazard["risk_category"]]
    vuln_score = vulnerability["vulnerability_assessment"]["composite_score"] * 100

    sites = generate_sites(district.district_id)
    nearest_site = min(sites, key=lambda s: village_engine.haversine_km(
        village["lat"], village["lon"], s["location"]["lat"], s["location"]["lon"]))
    distance_km = village_engine.haversine_km(
        village["lat"], village["lon"], nearest_site["location"]["lat"], nearest_site["location"]["lon"])
    distance_score = max(0, 100 - distance_km * 2)

    critical_infra_count = 1 if village["population"] >= 3000 else 0
    infra_score = min(100, critical_infra_count * 40 + 30)

    community_cohesion_score = 60  # held constant: no differentiated real signal available per village

    weights = {
        "red_zone_status": 0.40, "population_vulnerability": 0.30,
        "critical_infrastructure_exposure": 0.15, "distance_from_safe_zone": 0.10,
        "community_cohesion": 0.05,
    }
    values = {
        "red_zone_status": red_zone_score, "population_vulnerability": vuln_score,
        "critical_infrastructure_exposure": infra_score, "distance_from_safe_zone": distance_score,
        "community_cohesion": community_cohesion_score,
    }
    total_score = sum(values[k] * weights[k] for k in weights)
    tier = priority_tier_for_score(total_score)

    interpretations = {
        "immediate": "Requires immediate evacuation and relocation",
        "short_term": "Plan relocation within the next quarter",
        "medium_term": "Schedule relocation within the next year",
        "monitor": "No relocation required at present — continue monitoring",
    }

    matching_score = round((nearest_site["suitability"]["score"] * 0.6) + (distance_score * 0.4))

    households_to_relocate = village["households"]
    timeline_days = {"immediate": 30, "short_term": 90, "medium_term": 365, "monitor": 0}[tier]

    phased = []
    if households_to_relocate > 0 and tier != "monitor":
        phase_size = max(1, math.ceil(households_to_relocate / 3))
        remaining = households_to_relocate
        phase_days = max(5, timeline_days // 3)
        for p in range(1, 4):
            take = min(phase_size, remaining)
            if take <= 0:
                break
            phased.append({"phase": p, "households": take, "days": phase_days})
            remaining -= take

    return {
        "village_id": village["village_id"],
        "name": village["name"],
        "location": {"lat": village["lat"], "lon": village["lon"]},
        "relocation_priority": {
            "tier": tier,
            "score": round(total_score),
            "interpretation": interpretations[tier],
        },
        "priority_score_breakdown": {
            "red_zone_status": {"value": hazard["risk_category"], "score": red_zone_score, "weight": weights["red_zone_status"]},
            "population_vulnerability": {"value": round(vuln_score / 100, 2), "score": round(vuln_score), "weight": weights["population_vulnerability"]},
            "critical_infrastructure_exposure": {"value": critical_infra_count, "score": infra_score, "weight": weights["critical_infrastructure_exposure"]},
            "distance_from_safe_zone": {"value": f"{distance_km:.1f} km", "score": round(distance_score), "weight": weights["distance_from_safe_zone"]},
            "community_cohesion": {"value": "Not individually surveyed", "score": community_cohesion_score, "weight": weights["community_cohesion"]},
        },
        "assigned_site": {
            "site_id": nearest_site["site_id"],
            "name": nearest_site["name"],
            "location": nearest_site["location"],
            "distance_km": round(distance_km, 1),
            "suitability_score": nearest_site["suitability"]["score"],
            "matching_score": matching_score,
            "cultural_compatibility": nearest_site["suitability"]["factors"]["cultural_fit"],
            "livelihood_compatibility": nearest_site["suitability"]["factors"]["market_proximity"],
        },
        "relocation_plan": {
            "population_to_relocate": village["population"] if tier != "monitor" else 0,
            "households_to_relocate": households_to_relocate if tier != "monitor" else 0,
            "estimated_timeline_days": timeline_days,
            "phased_approach": phased,
        },
    }
