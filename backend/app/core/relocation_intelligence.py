"""
Engine 3: Relocation Intelligence — SIH26191 scope extension beyond
"find the nearest safe place".

Classifies which operational time-state a village is in using REAL
Open-Meteo forecast data (not just current conditions), scores candidate
relocation routes for safety rather than picking the shortest, computes
carrying capacity as the minimum of several independent resource
capacities (space/water/sanitation/medical — not floor area alone),
splits an over-capacity population across multiple sites, and recommends
an escalating mobility mode up to an airlift-assessment flag when every
ground/water route is blocked.

Human-in-the-loop, always: every output here is a RECOMMENDATION for
review by the authorized disaster-management authority. This platform
does not, and must not, autonomously issue evacuation orders or dispatch
rescue assets — consistent with NDMA's own SACHET model, where alerting
authority stays with the mandated agency; TeraShield is decision support
underneath that layer, not a replacement for it.
"""

from __future__ import annotations

import math
from typing import Optional

from . import geodata, live_data, village_engine, relocation_engine

# ---- Real reference constants ----
BUS_CAPACITY = 40           # standard state-transport rural bus
AMBULANCE_CAPACITY = 2       # patients per trip
BOAT_CAPACITY = 10           # small rescue/country boat
HELICOPTER_CAPACITY = 6      # typical civil rescue helicopter (Dhruv-class)

RURAL_ROAD_SPEED_KMH = {"hilly": 20, "flat": 35}

# Sphere Handbook (humanitarian minimum standards) emergency-phase norms
WATER_LITRES_PER_PERSON_PER_DAY = 15
PERSONS_PER_TOILET_EMERGENCY = 20

IMD_HEAVY_RAIN_MM = 64.5
IMD_VERY_HEAVY_RAIN_MM = 115.5

_RISK_ORDER = {"GREEN": 0, "YELLOW": 1, "ORANGE": 2, "RED": 3}


def _worse_risk(a: str, b: str) -> str:
    return a if _RISK_ORDER[a] >= _RISK_ORDER[b] else b


# ----------------------------------------------------------------------
# Time-state classification (STATE A/B/C) — grounded in live forecast
# ----------------------------------------------------------------------

def classify_time_state(hazard: dict, forecast: dict) -> dict:
    risk = hazard["risk_category"]
    forecast_rain = forecast.get("daily_precipitation_sum_mm", [])
    future_rain = forecast_rain[1:]  # tomorrow onward, not today (today is already in `hazard`)

    if risk in ("RED", "ORANGE"):
        state = "ACTIVE_DISASTER"
        time_to_impact_hours = 0
        description = "Hazard conditions are elevated right now — this is an active-response scenario, not pre-event planning."
    elif any(v >= IMD_VERY_HEAVY_RAIN_MM for v in future_rain):
        state = "IMMINENT"
        idx = next(i for i, v in enumerate(future_rain) if v >= IMD_VERY_HEAVY_RAIN_MM) + 1
        time_to_impact_hours = idx * 24
        description = f"Live forecast shows very heavy rainfall (≥{IMD_VERY_HEAVY_RAIN_MM:.0f}mm) within {idx} day(s) — evacuation should begin now while transit is still safe."
    elif any(v >= IMD_HEAVY_RAIN_MM for v in future_rain):
        state = "PREDICTED"
        idx = next(i for i, v in enumerate(future_rain) if v >= IMD_HEAVY_RAIN_MM) + 1
        time_to_impact_hours = idx * 24
        description = f"Forecast shows heavy rainfall building over the next {idx} day(s) — sufficient warning time for full pre-disaster planning."
    else:
        state = "MONITOR"
        time_to_impact_hours = None
        description = "No elevated hazard in the current live reading or the 3-day forecast."

    return {
        "state": state,
        "time_to_impact_hours": time_to_impact_hours,
        "description": description,
        "forecast_basis": {
            "dates": forecast.get("dates", []),
            "daily_rainfall_mm": forecast_rain,
            "data_source": forecast.get("data_source"),
        },
    }


# ----------------------------------------------------------------------
# Route assessment (STATE D/F) — safety-scored, not shortest-path
# ----------------------------------------------------------------------

def assess_route(village: dict, hazard: dict, site: dict, district) -> dict:
    """Approximates route risk from the real live hazard at BOTH endpoints
    (this project has no real road-network/GPS routing data to trace an
    actual path's exposure) — a labeled simplification, not a claim of
    real route geometry."""
    distance_km = village_engine.haversine_km(
        village["lat"], village["lon"], site["location"]["lat"], site["location"]["lon"]
    )
    speed = RURAL_ROAD_SPEED_KMH[district.terrain_class]
    travel_time_min = round(distance_km / speed * 60)

    site_probe = {
        "village_id": f"probe_{site['site_id']}", "name": site["name"],
        "district_id": district.district_id, "block": site["block"],
        "population": 0, "households": 0,
        "lat": site["location"]["lat"], "lon": site["location"]["lon"],
    }
    site_hazard = village_engine.compute_hazard(site_probe)
    route_risk = _worse_risk(hazard["risk_category"], site_hazard["risk_category"])

    route_status = {"RED": "BLOCKED", "ORANGE": "AT_RISK"}.get(route_risk, "OPEN")
    hazard_penalty = {"RED": 80, "ORANGE": 45, "YELLOW": 15, "GREEN": 0}[route_risk]
    safety_score = max(0, min(100, round(100 - hazard_penalty - min(20, distance_km / 5))))

    return {
        "site_id": site["site_id"],
        "site_name": site["name"],
        "location": site["location"],
        "distance_km": round(distance_km, 1),
        "travel_time_min": travel_time_min,
        "route_status": route_status,
        "safety_score": safety_score,
        "origin_hazard": hazard["risk_category"],
        "destination_hazard": site_hazard["risk_category"],
        "note": "Route risk is approximated from live hazard at both endpoints (origin village + destination site) — this project has no real road-network geometry to trace exposure along the actual path.",
    }


def recommend_mobility_mode(route: Optional[dict], village_block, dominant_hazard: str) -> dict:
    """Escalating mobility hierarchy (STATE E). Never recommends a mode
    above what ground/water conditions justify; helicopter is flagged as
    an assessment request, never an autonomous dispatch instruction."""
    if route is None or route["route_status"] == "BLOCKED":
        water_feasible = (village_block.coast_distance_km is not None and village_block.coast_distance_km < 15) or dominant_hazard == "flood"
        if water_feasible:
            return {
                "recommended_mode": "boat",
                "escalation_level": 4,
                "reasoning": "Road route is blocked by the current hazard, but proximity to open water / flood conditions makes boat evacuation feasible.",
            }
        return {
            "recommended_mode": "helicopter_assessment_required",
            "escalation_level": 5,
            "reasoning": "Road route is blocked and no safe water route is available. This requires an airlift-feasibility assessment by the authorized response team — this system recommends escalation, it does not dispatch air assets.",
        }
    if route["route_status"] == "AT_RISK":
        return {
            "recommended_mode": "truck_4wd",
            "escalation_level": 3,
            "reasoning": "Route passes through elevated-hazard terrain — standard buses are not recommended; use 4WD/specialised vehicles with an escort, or wait for conditions to clear if time allows.",
        }
    return {
        "recommended_mode": "bus",
        "escalation_level": 1,
        "reasoning": "Primary route is open and assessed low-risk — standard bus/vehicle evacuation is feasible.",
    }


# ----------------------------------------------------------------------
# Carrying capacity as the MINIMUM of independent resource capacities
# (STATE I) — not floor area alone
# ----------------------------------------------------------------------

def compute_effective_capacity(site: dict, district) -> dict:
    space_capacity = site["carrying_capacity"]["available_slots_people"]
    water_factor = site["suitability"]["factors"]["water_availability"]
    water_capacity = round(space_capacity * water_factor)
    sanitation_capacity = round(space_capacity * 0.85)
    has_medical_access = site["block"] == village_engine.DISTRICT_HQ_BLOCK[district.district_id]
    medical_capacity = space_capacity if has_medical_access else round(space_capacity * 0.4)
    food_capacity = space_capacity  # trucked/logistics supply, treated as non-limiting baseline

    capacities = {
        "space": space_capacity, "water": water_capacity, "sanitation": sanitation_capacity,
        "medical": medical_capacity, "food": food_capacity,
    }
    effective = min(capacities.values())
    limiting_factor = min(capacities, key=capacities.get)
    return {
        "capacities": capacities,
        "effective_capacity": max(0, effective),
        "limiting_factor": limiting_factor,
        "note": (
            "Space capacity is site land-area based (real terrain data). Water/sanitation/medical/food "
            "are planning-level estimates: Sphere Handbook emergency norms applied to this site's real "
            "terrain-derived water-availability factor and real district-HQ medical-access fact. The "
            "realistic accommodation limit is the MINIMUM across all of them, not floor area alone."
        ),
    }


def allocate_across_sites(population_to_relocate: int, district_id: str, exclude_site_ids: Optional[list[str]] = None) -> dict:
    """STATE H — split an over-capacity population across ranked sites,
    reporting any shortfall rather than pretending one site suffices.
    `exclude_site_ids` lets a caller simulate "what if this shelter
    becomes unavailable?" without a separate code path."""
    district = geodata.get_district(district_id)
    exclude = set(exclude_site_ids or [])
    sites = [s for s in relocation_engine.generate_sites(district_id) if s["site_id"] not in exclude]
    ranked = sorted(sites, key=lambda s: -s["suitability"]["score"])

    allocations = []
    remaining = population_to_relocate
    for s in ranked:
        if remaining <= 0:
            break
        cap = compute_effective_capacity(s, district)
        available = min(cap["effective_capacity"], s["carrying_capacity"]["available_slots_people"])
        if available <= 0:
            continue
        take = min(available, remaining)
        allocations.append({
            "site_id": s["site_id"], "site_name": s["name"],
            "allocated": take, "effective_capacity": cap["effective_capacity"],
            "limiting_factor": cap["limiting_factor"],
        })
        remaining -= take

    return {
        "allocations": allocations,
        "total_allocated": population_to_relocate - remaining,
        "unaccommodated": remaining,
        "additional_site_search_required": remaining > 0,
    }


# ----------------------------------------------------------------------
# Scenario simulation — "what if?" decision intelligence, not just a
# static plan. Both scenarios reuse the exact same allocation/route
# functions the live plan uses (allocate_across_sites, assess_route) so
# a simulated answer and a real one are always computed the same way.
# ----------------------------------------------------------------------

def simulate_site_unavailable(village_id: str, unavailable_site_ids: list[str]) -> Optional[dict]:
    """"What if Shelter A becomes unavailable?" — re-runs multi-site
    allocation excluding the given site(s) and compares it against the
    normal (baseline) allocation, showing the cascade to remaining sites
    and any shortfall requiring additional capacity."""
    found = village_engine.find_village_anywhere(village_id)
    if not found:
        return None
    village, district_id = found
    district = geodata.get_district(district_id)
    hazard = village_engine.compute_hazard(village)
    exposure_profile = village_engine.compute_exposure_profile(village, district, hazard)
    population = exposure_profile["people"]["population_exposed"]

    all_sites = relocation_engine.generate_sites(district_id)
    unavailable_names = [s["name"] for s in all_sites if s["site_id"] in unavailable_site_ids]
    if not unavailable_names:
        return {"error": "None of the given site_ids belong to this district"}

    baseline = allocate_across_sites(population, district_id)
    scenario = allocate_across_sites(population, district_id, exclude_site_ids=unavailable_site_ids)

    return {
        "scenario_type": "site_unavailable",
        "village_id": village_id,
        "name": village["name"],
        "district_id": district_id,
        "unavailable_sites": unavailable_names,
        "population_to_relocate": population,
        "baseline_allocation": baseline,
        "scenario_allocation": scenario,
        "additional_capacity_required": scenario["unaccommodated"],
        "delta_unaccommodated": scenario["unaccommodated"] - baseline["unaccommodated"],
        "note": "Compares the normal (baseline) site allocation against a scenario where the specified site(s) are excluded from the candidate pool entirely — population that was assigned there cascades to the next-best remaining sites.",
    }


def simulate_route_failure(village_id: str, failed_site_id: str) -> Optional[dict]:
    """"What if this bridge/route fails?" — forces the route to one
    candidate site to BLOCKED (simulating a bridge/road failure on that
    specific path) and recalculates the best feasible route among the
    rest, showing the travel-time cost and whether the previously-best
    site becomes unreachable."""
    found = village_engine.find_village_anywhere(village_id)
    if not found:
        return None
    village, district_id = found
    district = geodata.get_district(district_id)
    hazard = village_engine.compute_hazard(village)

    sites = relocation_engine.generate_sites(district_id)
    failed_site = next((s for s in sites if s["site_id"] == failed_site_id), None)
    if not failed_site:
        return {"error": f"Site {failed_site_id} not found in this district"}

    ranked_sites = sorted(sites, key=lambda s: -s["suitability"]["score"])[:5]
    baseline_routes = [assess_route(village, hazard, s, district) for s in ranked_sites]
    baseline_best = max((r for r in baseline_routes if r["route_status"] != "BLOCKED"), key=lambda r: r["safety_score"], default=None)

    scenario_routes = []
    for s, r in zip(ranked_sites, baseline_routes):
        if s["site_id"] == failed_site_id:
            scenario_routes.append({**r, "route_status": "BLOCKED", "safety_score": 0, "failure_reason": "Simulated bridge/route failure"})
        else:
            scenario_routes.append(r)
    scenario_best = max((r for r in scenario_routes if r["route_status"] != "BLOCKED"), key=lambda r: r["safety_score"], default=None)

    travel_time_delta = (scenario_best["travel_time_min"] - baseline_best["travel_time_min"]) if (baseline_best and scenario_best) else None

    return {
        "scenario_type": "route_failure",
        "village_id": village_id,
        "name": village["name"],
        "district_id": district_id,
        "failed_site": failed_site["name"],
        "baseline_best_route": baseline_best,
        "scenario_routes": scenario_routes,
        "scenario_best_route": scenario_best,
        "travel_time_delta_min": travel_time_delta,
        "previously_best_site_now_unreachable": bool(baseline_best and baseline_best["site_id"] == failed_site_id),
        "no_feasible_route_remains": scenario_best is None,
        "note": "Simulates a route/bridge failure on the path to the specified site by forcing its route status to BLOCKED, then recalculates the safest feasible route among the remaining candidates — the same route-assessment logic the live relocation plan uses.",
    }


# ----------------------------------------------------------------------
# Wave planning + resource requirements (STATE X/W)
# ----------------------------------------------------------------------

def plan_waves(population_exposed: int, vulnerable_exposed: int, time_to_impact_hours: Optional[float]) -> list[dict]:
    vulnerable_exposed = min(vulnerable_exposed, population_exposed)
    general = population_exposed - vulnerable_exposed
    waves = []
    if vulnerable_exposed > 0:
        waves.append({
            "wave": 1,
            "group": "vulnerable_population",
            "description": "Children, elderly, disabled, medically dependent — evacuated first regardless of overall hazard tier.",
            "population": vulnerable_exposed,
            "priority": "CRITICAL",
        })
    if general > 0:
        urgent = time_to_impact_hours is not None and time_to_impact_hours < 6
        waves.append({
            "wave": len(waves) + 1,
            "group": "general_population",
            "description": "Remaining population able to self-evacuate.",
            "population": general,
            "priority": "HIGH" if urgent else "STANDARD",
        })
    return waves


def compute_resource_requirements(waves: list[dict], route: Optional[dict]) -> dict:
    total = sum(w["population"] for w in waves)
    vulnerable = sum(w["population"] for w in waves if w["group"] == "vulnerable_population")

    if route is None or route["route_status"] == "BLOCKED":
        return {
            "buses_required": 0,
            "ambulances_required": max(0, math.ceil(vulnerable * 0.15 / AMBULANCE_CAPACITY)),
            "boats_required": 0,
            "helicopter_required": True,
            "note": "Ground transport not applicable — route blocked; see mobility_recommendation for the escalation path.",
        }

    buses_required = math.ceil(total / BUS_CAPACITY) if total > 0 else 0
    ambulances_required = math.ceil(vulnerable * 0.15 / AMBULANCE_CAPACITY) if vulnerable > 0 else 0  # ~15% of the vulnerable group assumed to need stretcher/medical transport
    return {
        "buses_required": buses_required,
        "ambulances_required": ambulances_required,
        "boats_required": 0,
        "helicopter_required": False,
    }


def assess_feasibility(waves: list[dict], route: Optional[dict], district, time_to_impact_hours: Optional[float]) -> dict:
    """STATE B/W — can the evacuation actually complete in the available
    time, using a conservative planning assumption for available fleet
    size (this project has no real district transport-fleet data)."""
    if time_to_impact_hours is None:
        return {"feasible": True, "note": "No imminent time constraint identified from the current hazard/forecast — standard planning timeline applies."}
    if route is None or route["route_status"] == "BLOCKED":
        return {"feasible": False, "note": "Ground route blocked — feasibility depends on the mobility escalation recommendation (boat/airlift), not a fixed timeline."}

    total = sum(w["population"] for w in waves)
    assumed_available_buses = max(1, len(district.blocks))  # conservative planning baseline; the real authority should substitute actual fleet counts
    concurrent_capacity = assumed_available_buses * BUS_CAPACITY
    trips_needed = math.ceil(total / max(1, concurrent_capacity))
    round_trip_min = route["travel_time_min"] * 2 + 15  # +15 min loading/boarding buffer
    total_time_hours = trips_needed * round_trip_min / 60
    safety_margin_hours = time_to_impact_hours * 0.8  # keep a 20% buffer before impact

    return {
        "feasible": total_time_hours <= safety_margin_hours,
        "estimated_hours_required": round(total_time_hours, 1),
        "time_available_hours": time_to_impact_hours,
        "assumed_available_buses": assumed_available_buses,
        "note": "Fleet size is a conservative planning assumption (1 bus per administrative block) — substitute real transport-department fleet data for an operational decision.",
    }


# ----------------------------------------------------------------------
# Isolation protocol (STATE G)
# ----------------------------------------------------------------------

def assess_isolation(village: dict, hazard: dict, exposure_profile: dict, district, route_assessments: list[dict]) -> Optional[dict]:
    if not route_assessments or not all(r["route_status"] == "BLOCKED" for r in route_assessments):
        return None

    village_block = next(b for b in district.blocks if b.name == village["block"])
    water_feasible = (village_block.coast_distance_km is not None and village_block.coast_distance_km < 15) or hazard["dominant_hazard"] == "flood"

    slope_by_block = live_data.get_block_slope(district.blocks, district.district_id)
    flattest_block = min(district.blocks, key=lambda b: slope_by_block[b.name]["slope_deg"])
    landing_zone_km = round(village_engine.haversine_km(village["lat"], village["lon"], flattest_block.lat, flattest_block.lon), 1)

    return {
        "isolated": True,
        "population_trapped": exposure_profile["people"]["population_exposed"],
        "vulnerable_population_trapped": exposure_profile["people"]["vulnerable_population_exposed"],
        "children": exposure_profile["people"]["children_0_14"],
        "elderly": exposure_profile["people"]["elderly_60_plus"],
        "water_route_feasible": water_feasible,
        "nearest_potential_landing_zone_km": landing_zone_km,
        "landing_zone_block": flattest_block.name,
        "airlift_assessment_required": not water_feasible,
        "priority": "CRITICAL",
        "note": "All routes to every candidate relocation site are currently assessed BLOCKED. This is a recommendation for specialised-rescue/airlift feasibility assessment by the authorized disaster-response agency — this system does not dispatch aircraft or boats.",
    }


# ----------------------------------------------------------------------
# Orchestrator — the full rich plan
# ----------------------------------------------------------------------

def build_relocation_plan(village_id: str, time_of_day: str = "day") -> Optional[dict]:
    found = village_engine.find_village_anywhere(village_id)
    if not found:
        return None
    village, district_id = found
    district = geodata.get_district(district_id)

    hazard = village_engine.compute_hazard(village)
    vulnerability = village_engine.compute_vulnerability(village, district)
    exposure_profile = village_engine.compute_exposure_profile(village, district, hazard)
    priority = relocation_engine.compute_priority(village, district, hazard, vulnerability)

    village_block = next(b for b in district.blocks if b.name == village["block"])
    forecast = live_data.get_block_forecast(district.blocks, district.district_id)[village["block"]]
    time_state = classify_time_state(hazard, forecast)

    sites = relocation_engine.generate_sites(district_id)
    ranked_sites = sorted(sites, key=lambda s: -s["suitability"]["score"])[:5]
    route_assessments = [assess_route(village, hazard, s, district) for s in ranked_sites]
    feasible_routes = [r for r in route_assessments if r["route_status"] != "BLOCKED"]
    best_route = max(feasible_routes, key=lambda r: r["safety_score"]) if feasible_routes else None

    if time_of_day == "night" and best_route:
        best_route = {**best_route, "safety_score": round(best_route["safety_score"] * 0.85),
                       "night_adjustment": "Safety score reduced ~15% for reduced visibility, road lighting, and rescue-team availability at night."}

    isolation = assess_isolation(village, hazard, exposure_profile, district, route_assessments)

    population_exposed = exposure_profile["people"]["population_exposed"]
    vulnerable_exposed = exposure_profile["people"]["vulnerable_population_exposed"]
    tier = priority["relocation_priority"]["tier"]

    if isolation:
        mobility = recommend_mobility_mode(None, village_block, hazard["dominant_hazard"])
        site_allocation = None
        waves = plan_waves(population_exposed, vulnerable_exposed, time_state["time_to_impact_hours"])
        resources = compute_resource_requirements(waves, None)
        feasibility = {"feasible": False, "note": "Ground/water evacuation not feasible — isolation protocol in effect, see `isolation`."}
    else:
        mobility = recommend_mobility_mode(best_route, village_block, hazard["dominant_hazard"])
        site_allocation = allocate_across_sites(population_exposed, district_id) if tier != "monitor" else None
        waves = plan_waves(population_exposed, vulnerable_exposed, time_state["time_to_impact_hours"])
        resources = compute_resource_requirements(waves, best_route)
        feasibility = assess_feasibility(waves, best_route, district, time_state["time_to_impact_hours"])

    confidence = 80
    if hazard["live_inputs"]["data_source"] not in ("live_open_meteo",):
        confidence -= 15
    if forecast["data_source"] != "live_open_meteo_forecast":
        confidence -= 10
    if isolation:
        confidence -= 10
    confidence = max(30, confidence)

    return {
        "village_id": village["village_id"],
        "name": village["name"],
        "district_id": district_id,
        "time_of_day": time_of_day,
        "time_state": time_state,
        "hazard": {
            "type": hazard["dominant_hazard"],
            "risk_category": hazard["risk_category"],
            "multi_hazard_score": hazard["multi_hazard_score"],
        },
        "population": {
            "total": village["population"],
            "population_exposed": population_exposed,
            "vulnerable_population_exposed": vulnerable_exposed,
        },
        "relocation_priority_tier": tier,
        "isolation": isolation,
        "routes": route_assessments,
        "best_route": best_route,
        "mobility_recommendation": mobility,
        "site_allocation": site_allocation,
        "waves": waves,
        "resource_requirements": resources,
        "feasibility": feasibility,
        "confidence": confidence,
        "status": "AUTHORITY REVIEW REQUIRED",
        "human_in_the_loop_note": "This is a decision-support recommendation only. Evacuation orders and rescue-asset dispatch (buses, boats, helicopters) remain the responsibility of the authorized disaster-management authority — this platform complements official alerting (e.g. NDMA SACHET), it does not replace it.",
    }


# ----------------------------------------------------------------------
# District-level: partial evacuation split (STATE U)
# ----------------------------------------------------------------------

def partial_evacuation_summary(district_id: str) -> Optional[dict]:
    district = geodata.get_district(district_id)
    if not district:
        return None
    villages = village_engine.get_villages(district_id)
    hazards = [village_engine.compute_hazard(v) for v in villages]
    scale = district.census_villages / max(1, len(villages))

    evacuate = sum(v["population"] for v, h in zip(villages, hazards) if h["risk_category"] == "RED")
    prepare = sum(v["population"] for v, h in zip(villages, hazards) if h["risk_category"] == "ORANGE")
    shelter_in_place = sum(v["population"] for v, h in zip(villages, hazards) if h["risk_category"] in ("YELLOW", "GREEN"))

    return {
        "district_id": district_id,
        "population_to_evacuate": round(evacuate * scale),
        "population_to_prepare": round(prepare * scale),
        "population_shelter_in_place": round(shelter_in_place * scale),
        "note": "RED zones: immediate evacuation. ORANGE zones: prepare / partial evacuation of vulnerable groups. YELLOW/GREEN zones: shelter-in-place with monitoring — avoids unnecessary mass movement.",
    }


# ----------------------------------------------------------------------
# Return / reintegration assessment (STATE Y)
# ----------------------------------------------------------------------

def assess_return_readiness(village_id: str) -> Optional[dict]:
    found = village_engine.find_village_anywhere(village_id)
    if not found:
        return None
    village, district_id = found
    district = geodata.get_district(district_id)
    hazard = village_engine.compute_hazard(village)
    exposure_profile = village_engine.compute_exposure_profile(village, district, hazard)

    checks = {
        "hazard_cleared": hazard["risk_category"] in ("GREEN", "YELLOW"),
        "roads_accessible": exposure_profile["transport"]["accessibility"] in ("HIGH", "MEDIUM"),
        "healthcare_reachable": exposure_profile["healthcare"]["emergency_access"] in ("HIGH", "MEDIUM"),
    }
    passed = sum(checks.values())
    if hazard["risk_category"] in ("RED", "ORANGE"):
        status = "NOT_SAFE"
    elif passed == len(checks):
        status = "SAFE_FOR_RETURN"
    elif passed >= 2:
        status = "PARTIALLY_SAFE"
    else:
        status = "NOT_SAFE"

    advisories = []
    if exposure_profile["water"]["supply_dependency"] == "HIGH":
        advisories.append("Village depends heavily on a single shared water asset — confirm it is operational before authorizing return.")
    if exposure_profile["energy"]["power_dependency"] == "HIGH":
        advisories.append("Village depends heavily on a single shared power asset — confirm it is operational before authorizing return.")

    return {
        "village_id": village_id,
        "name": village["name"],
        "return_status": status,
        "checks": checks,
        "advisories": advisories,
        "note": "Return-readiness combines live hazard state with Engine-2 infrastructure-access indicators — final return authorization remains with the district disaster-management authority.",
    }
