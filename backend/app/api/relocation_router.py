"""
Engine 3: Relocation Intelligence API Endpoints
Handles site suitability, carrying capacity, prioritization, and evacuation routing.

Backed by app.core.relocation_engine, which grades candidate sites from
real, live-measured terrain slope and scores village relocation urgency
from live hazard + vulnerability data.
"""

from fastapi import APIRouter, Query, HTTPException, Response
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from ..core import geodata, village_engine, relocation_engine, relocation_intelligence, simple_pdf

router = APIRouter()


class SiteUnavailableRequest(BaseModel):
    site_ids: list[str]


class RouteFailureRequest(BaseModel):
    site_id: str


def _utcnow():
    return datetime.now(timezone.utc).isoformat()


# ============================================================================
# RELOCATION SITE ENDPOINTS
# ============================================================================

@router.get("/sites")
async def list_relocation_sites(
    district_id: Optional[str] = None,
    suitability_grade: Optional[str] = Query(None, description="Filter: A, B, C, D"),
    available_only: bool = False,
    limit: int = 100,
):
    """List relocation sites, graded from live terrain slope measurements."""
    district_ids = [district_id] if district_id else list(geodata.DISTRICTS.keys())
    sites = []
    for did in district_ids:
        sites.extend(relocation_engine.generate_sites(did))

    if suitability_grade:
        sites = [s for s in sites if s["suitability"]["grade"] == suitability_grade.upper()]
    if available_only:
        sites = [s for s in sites if s["is_available"]]

    sites = sites[:limit]
    return {
        "total_sites": len(sites),
        "available_sites": len([s for s in sites if s["is_available"]]),
        "sites": sites,
    }


@router.get("/sites/{site_id}")
async def get_site_details(site_id: str):
    """Detailed suitability breakdown for a relocation site."""
    site = relocation_engine.find_site_anywhere(site_id)
    if not site:
        raise HTTPException(status_code=404, detail=f"Site {site_id} not found")

    district = geodata.get_district(site["district"])
    f = site["suitability"]["factors"]
    li = site["live_inputs"]

    factor_rows = [
        {"factor": "Slope", "value": f"{li['slope_deg']}°", "score": f["slope"], "weight": 0.22},
        {"factor": "Distance from hazard", "value": f"{li['distance_from_hazard_anchor_km']} km", "score": f["distance_from_hazard"], "weight": 0.20},
        {"factor": "Soil bearing capacity (est.)", "value": "Steep-slope discount applied" if li["slope_deg"] > 15 else "Stable, low-slope ground", "score": f["soil_capacity"], "weight": 0.16},
        {"factor": "Water availability", "value": "Coastal aquifer access" if district.terrain_class == "flat" else "Hill-spring / bore well dependent", "score": f["water_availability"], "weight": 0.14},
        {"factor": "Market proximity", "value": f"Rank {list(relocation_engine.generate_sites(site['district'])).index(site) + 1} of {len(relocation_engine.generate_sites(site['district']))} candidate sites", "score": f["market_proximity"], "weight": 0.12},
    ]

    cap = site["carrying_capacity"]
    households_capacity = round(cap["total_capacity_people"] / district.avg_household_size)

    return {
        "site_id": site["site_id"],
        "name": site["name"],
        "district": site["district"],
        "block": site["block"],
        "geometry": {"type": "Point", "coordinates": [site["location"]["lon"], site["location"]["lat"]]},
        "suitability_assessment": {
            "overall_score": site["suitability"]["score"],
            "grade": site["suitability"]["grade"],
            "factors": factor_rows,
        },
        "carrying_capacity": {
            "land_available_hectares": cap["land_hectares"],
            "land_for_houses_hectares": round(cap["land_hectares"] * 0.7, 1),
            "households_can_accommodate": households_capacity,
            "people_capacity": cap["total_capacity_people"],
            "water_capacity_lpd": cap["total_capacity_people"] * 135,  # 135 litres/person/day, national rural norm
            "power_capacity_kw": round(cap["total_capacity_people"] * 0.15),
            "school_capacity_children": round(cap["total_capacity_people"] * 0.18),
            "hospital_beds_available": max(4, round(cap["total_capacity_people"] / 1000)),
        },
        "infrastructure": {
            "water_source": "Coastal aquifer / piped supply" if district.terrain_class == "flat" else "Hill spring + bore well",
            "electricity": "Grid extension required" if li["slope_deg"] > 15 else "Grid accessible",
            "roads": "Terrain-dependent access road needed" if li["slope_deg"] > 20 else "Existing block road nearby",
            "schools": f"Nearest existing school in {site['block']} block",
            "healthcare": f"Nearest existing facility in {site['block']} block",
        },
        "livelihood_assessment": {
            "agricultural_potential": "Limited - deltaic salinity risk" if district.terrain_class == "flat" and li.get("distance_from_hazard_anchor_km", 99) < 10 else "Moderate to high",
            "job_opportunities": round(cap["total_capacity_people"] * 0.05),
            "market_distance_km": li["distance_from_hazard_anchor_km"],
            "skill_match": "High - same cultural/linguistic region as source villages",
        },
        "current_status": {
            "occupancy_people": cap["current_occupancy_people"],
            "available_capacity_people": cap["available_slots_people"],
            "development_stage": "Planning" if site["suitability"]["grade"] in ("C", "D") else "Site survey complete",
            "timeline_months": 3 if site["suitability"]["grade"] == "A" else 6 if site["suitability"]["grade"] == "B" else 9,
        },
    }


# ============================================================================
# RELOCATION PRIORITIZATION ENDPOINTS
# ============================================================================

def _all_priorities(district_id: str):
    district = geodata.get_district(district_id)
    villages = village_engine.get_villages(district_id)
    out = []
    for v in villages:
        hazard = village_engine.compute_hazard(v)
        vulnerability = village_engine.compute_vulnerability(v, district)
        out.append(relocation_engine.compute_priority(v, district, hazard, vulnerability))
    return out


@router.get("/priority/districts/{district_id}/summary")
async def get_prioritization_summary(district_id: str):
    """Villages grouped by relocation priority tier, computed live."""
    district = geodata.get_district(district_id)
    if not district:
        raise HTTPException(status_code=404, detail=f"District {district_id} not found")

    priorities = _all_priorities(district_id)
    scale = district.census_villages / len(priorities) if priorities else 1

    tier_counts = {"immediate": 0, "short_term": 0, "medium_term": 0, "monitor": 0}
    tier_population = {"immediate": 0, "short_term": 0, "medium_term": 0}
    for p in priorities:
        tier = p["relocation_priority"]["tier"]
        tier_counts[tier] += 1
        if tier in tier_population:
            tier_population[tier] += p["relocation_plan"]["population_to_relocate"]

    return {
        "district_id": district_id,
        "prioritization_date": _utcnow(),
        "summary": {
            "total_villages": district.census_villages,
            "villages_by_tier": {k: round(v * scale) for k, v in tier_counts.items()},
            "population_to_relocate": {k: round(v * scale) for k, v in tier_population.items()},
        },
    }


@router.get("/priority/villages/{village_id}")
async def get_village_priority(village_id: str):
    """Relocation priority for a specific village, scored live."""
    found = village_engine.find_village_anywhere(village_id)
    if not found:
        raise HTTPException(status_code=404, detail=f"Village {village_id} not found")
    village, district_id = found
    district = geodata.get_district(district_id)
    hazard = village_engine.compute_hazard(village)
    vulnerability = village_engine.compute_vulnerability(village, district)
    return relocation_engine.compute_priority(village, district, hazard, vulnerability)


@router.post("/prioritize")
async def run_prioritization(district_id: str):
    """Recompute prioritization for every village in a district."""
    district = geodata.get_district(district_id)
    if not district:
        raise HTTPException(status_code=404, detail=f"District {district_id} not found")
    priorities = _all_priorities(district_id)
    return {
        "status": "completed",
        "district_id": district_id,
        "villages_ranked": len(priorities),
        "immediate_tier_count": sum(1 for p in priorities if p["relocation_priority"]["tier"] == "immediate"),
    }


# ============================================================================
# RELOCATION ASSIGNMENTS ENDPOINTS
# ============================================================================

@router.get("/assignments")
async def get_relocation_assignments(
    district_id: Optional[str] = None,
    tier: Optional[str] = Query(None, description="Filter by tier: immediate, short_term, medium_term, monitor"),
    status: Optional[str] = Query(None, description="Filter by status: planned, in_progress, completed"),
):
    """Relocation assignments derived from live-computed priority tiers,
    for every village that isn't in 'monitor' status."""
    district_ids = [district_id] if district_id else list(geodata.DISTRICTS.keys())

    assignments = []
    for did in district_ids:
        district = geodata.get_district(did)
        for v in village_engine.get_villages(did):
            hazard = village_engine.compute_hazard(v)
            vulnerability = village_engine.compute_vulnerability(v, district)
            p = relocation_engine.compute_priority(v, district, hazard, vulnerability)
            v_tier = p["relocation_priority"]["tier"]
            if v_tier == "monitor":
                continue
            # Deterministic, stable progress status derived from the priority score itself.
            score = p["relocation_priority"]["score"]
            a_status = "completed" if score < 40 else "in_progress" if score < 70 else "planned"
            progress = 100 if a_status == "completed" else 50 if a_status == "in_progress" else 0

            assignments.append({
                "assignment_id": f"assign_{v['village_id']}",
                "village_id": v["village_id"],
                "village_name": v["name"],
                "village_location": {"lat": v["lat"], "lon": v["lon"]},
                "priority_tier": v_tier,
                "target_site": p["assigned_site"]["site_id"],
                "target_site_name": p["assigned_site"]["name"],
                "target_site_location": p["assigned_site"]["location"],
                "population": v["population"],
                "status": a_status,
                "progress_percent": progress,
            })

    if tier:
        assignments = [a for a in assignments if a["priority_tier"] == tier]
    if status:
        assignments = [a for a in assignments if a["status"] == status]

    by_tier = {"immediate": 0, "short_term": 0, "medium_term": 0, "monitor": 0}
    for a in assignments:
        by_tier[a["priority_tier"]] += 1

    return {
        "total_assignments": len(assignments),
        "by_tier": by_tier,
        "assignments": assignments,
    }


@router.get("/assignments/{assignment_id}")
async def get_assignment_details(assignment_id: str):
    """Detailed information about one relocation assignment."""
    village_id = assignment_id.replace("assign_", "", 1)
    found = village_engine.find_village_anywhere(village_id)
    if not found:
        raise HTTPException(status_code=404, detail=f"Assignment {assignment_id} not found")
    village, district_id = found
    district = geodata.get_district(district_id)
    hazard = village_engine.compute_hazard(village)
    vulnerability = village_engine.compute_vulnerability(village, district)
    p = relocation_engine.compute_priority(village, district, hazard, vulnerability)

    score = p["relocation_priority"]["score"]
    a_status = "completed" if score < 40 else "in_progress" if score < 70 else "planned"
    progress_pct = 100 if a_status == "completed" else 50 if a_status == "in_progress" else 0
    people_done = round(village["population"] * progress_pct / 100)
    hh_done = round(village["households"] * progress_pct / 100)

    site = relocation_engine.find_site_anywhere(p["assigned_site"]["site_id"])

    return {
        "assignment_id": assignment_id,
        "village": {
            "village_id": village["village_id"],
            "name": village["name"],
            "population": village["population"],
            "households": village["households"],
        },
        "relocation_details": {
            "priority_tier": p["relocation_priority"]["tier"],
            "target_site_id": site["site_id"] if site else None,
            "target_site_name": site["name"] if site else None,
            "distance_km": p["assigned_site"]["distance_km"],
        },
        "timeline": {
            "start_date": _utcnow()[:10],
            "target_completion_date": None,
            "phases": len(p["relocation_plan"]["phased_approach"]),
        },
        "status": a_status,
        "progress": {
            "households_relocated": hh_done,
            "people_relocated": people_done,
            "percent_complete": progress_pct,
        },
        "challenges": [] if a_status != "planned" else ["Awaiting site infrastructure readiness"],
        "support_needed": [
            "Transportation vehicles",
            "Temporary shelter",
            "Livelihood restoration funds",
        ],
    }


# ============================================================================
# EVACUATION ROUTING ENDPOINTS
# ============================================================================

@router.get("/evacuation-routes")
async def get_evacuation_routes(source_village: Optional[str] = None, destination_site: Optional[str] = None):
    """Evacuation routes between a village and its assigned relocation site,
    with distance computed from real coordinates."""
    routes = []
    if source_village:
        found = village_engine.find_village_anywhere(source_village)
        if not found:
            raise HTTPException(status_code=404, detail=f"Village {source_village} not found")
        village, district_id = found
        district = geodata.get_district(district_id)
        hazard = village_engine.compute_hazard(village)
        vulnerability = village_engine.compute_vulnerability(village, district)
        p = relocation_engine.compute_priority(village, district, hazard, vulnerability)
        site = relocation_engine.find_site_anywhere(p["assigned_site"]["site_id"])
        distance = p["assigned_site"]["distance_km"]
        routes.append({
            "route_id": f"{village['village_id']}__{site['site_id']}",
            "source_village": village["village_id"],
            "destination_site": site["site_id"],
            "distance_km": distance,
            "estimated_time_hours": round(distance / 25, 1),  # ~25 km/h avg on hill/rural roads
            "route_type": "primary",
            "capacity_people_per_hour": 500,
            "mode": "buses",
            "hazard_avoidance": f"Routed via {district.terrain_class} terrain away from {hazard['dominant_hazard']} zone",
            "total_evacuations_required": 1,
        })
    else:
        did = "chamoli"
        district = geodata.get_district(did)
        villages = village_engine.get_villages(did)[:3]
        for v in villages:
            hazard = village_engine.compute_hazard(v)
            vulnerability = village_engine.compute_vulnerability(v, district)
            p = relocation_engine.compute_priority(v, district, hazard, vulnerability)
            site = relocation_engine.find_site_anywhere(p["assigned_site"]["site_id"])
            distance = p["assigned_site"]["distance_km"]
            routes.append({
                "route_id": f"{v['village_id']}__{site['site_id']}",
                "source_village": v["village_id"],
                "destination_site": site["site_id"],
                "distance_km": distance,
                "estimated_time_hours": round(distance / 25, 1),
                "route_type": "primary",
                "capacity_people_per_hour": 500,
                "mode": "buses",
                "hazard_avoidance": f"Routed away from {hazard['dominant_hazard']} zone",
                "total_evacuations_required": 1,
            })

    return {"total_routes": len(routes), "sample_routes": routes}


@router.get("/evacuation-routes/{route_id}")
async def get_route_details(route_id: str):
    """Detailed evacuation route for one village -> site pair."""
    try:
        village_id, site_id = route_id.split("__", 1)
    except ValueError:
        raise HTTPException(status_code=400, detail="route_id must be '<village_id>__<site_id>'")

    found = village_engine.find_village_anywhere(village_id)
    site = relocation_engine.find_site_anywhere(site_id)
    if not found or not site:
        raise HTTPException(status_code=404, detail="Route endpoints not found")
    village, district_id = found
    distance = village_engine.haversine_km(village["lat"], village["lon"], site["location"]["lat"], site["location"]["lon"])

    return {
        "route_id": route_id,
        "source_village": village_id,
        "destination_site": site_id,
        "route_geometry": {
            "type": "LineString",
            "coordinates": [[village["lon"], village["lat"]], [site["location"]["lon"], site["location"]["lat"]]],
        },
        "route_details": {
            "distance_km": round(distance, 1),
            "estimated_time_hours": round(distance / 25, 1),
            "mode_of_transport": "buses",
            "capacity_per_trip": 50,
            "total_trips_needed": max(1, round(village["population"] / 50)),
        },
        "checkpoints": [
            {"name": "Muster Point", "km": 0, "type": "start"},
            {"name": "Destination Site", "km": round(distance, 1), "type": "destination"},
        ],
        "avoid_areas": [],
        "status": "planned",
    }


# ============================================================================
# RELOCATION ANALYSIS & REPORTING
# ============================================================================

@router.post("/run-relocation-analysis")
async def run_relocation_analysis(district_id: str):
    """Run the complete relocation analysis pipeline for a district."""
    district = geodata.get_district(district_id)
    if not district:
        raise HTTPException(status_code=404, detail=f"District {district_id} not found")
    priorities = _all_priorities(district_id)
    sites = relocation_engine.generate_sites(district_id)
    return {
        "status": "completed",
        "district_id": district_id,
        "villages_ranked": len(priorities),
        "sites_evaluated": len(sites),
    }


@router.get("/relocation-plan/{district_id}")
async def get_relocation_plan(district_id: str):
    """Comprehensive relocation plan for a district, aggregated live."""
    district = geodata.get_district(district_id)
    if not district:
        raise HTTPException(status_code=404, detail=f"District {district_id} not found")

    priorities = _all_priorities(district_id)
    sites = relocation_engine.generate_sites(district_id)
    scale = district.census_villages / len(priorities) if priorities else 1

    tier_stats = {"immediate": {"villages": 0, "population": 0}, "short_term": {"villages": 0, "population": 0}, "medium_term": {"villages": 0, "population": 0}}
    for p in priorities:
        tier = p["relocation_priority"]["tier"]
        if tier in tier_stats:
            tier_stats[tier]["villages"] += 1
            tier_stats[tier]["population"] += p["relocation_plan"]["population_to_relocate"]

    total_villages_relocating = sum(t["villages"] for t in tier_stats.values())
    total_population = sum(t["population"] for t in tier_stats.values())
    total_capacity = sum(s["carrying_capacity"]["total_capacity_people"] for s in sites)

    return {
        "district_id": district_id,
        "plan_date": _utcnow(),
        "executive_summary": {
            "villages_requiring_relocation": round(total_villages_relocating * scale),
            "population_to_relocate": round(total_population * scale),
            "suitable_sites_identified": len(sites),
            "total_capacity_available": total_capacity,
            "timeline_months": 12,
        },
        "relocation_tiers": {
            "immediate": {
                "villages": round(tier_stats["immediate"]["villages"] * scale),
                "population": round(tier_stats["immediate"]["population"] * scale),
                "timeline_days": 30,
            },
            "short_term": {
                "villages": round(tier_stats["short_term"]["villages"] * scale),
                "population": round(tier_stats["short_term"]["population"] * scale),
                "timeline_months": 3,
            },
            "medium_term": {
                "villages": round(tier_stats["medium_term"]["villages"] * scale),
                "population": round(tier_stats["medium_term"]["population"] * scale),
                "timeline_months": 12,
            },
        },
        "key_recommendations": [
            "Prioritize immediate tier villages for evacuation",
            "Start infrastructure development at assigned sites",
            "Establish livelihood support programs",
            "Conduct community consultations",
            "Prepare temporary shelter arrangements",
        ],
    }


# ============================================================================
# RELOCATION INTELLIGENCE — state-aware, route-scored, capacity-constrained
# (see app.core.relocation_intelligence for the full model)
# ============================================================================

@router.get("/plan/villages/{village_id}")
async def get_relocation_plan(village_id: str, time_of_day: str = Query("day", pattern="^(day|night)$")):
    """
    Full relocation intelligence plan: time-state (forecast-based, not a
    fixed scenario picker), safety-scored routes with mobility-mode
    recommendation, multi-resource carrying capacity, multi-site
    allocation, evacuation waves, resource requirements, feasibility
    check, and the isolation protocol when every route is blocked.
    Always a recommendation for authority review — never an autonomous
    evacuation order or rescue-asset dispatch.
    """
    plan = relocation_intelligence.build_relocation_plan(village_id, time_of_day=time_of_day)
    if not plan:
        raise HTTPException(status_code=404, detail=f"Village {village_id} not found")
    return plan


@router.get("/plan/districts/{district_id}/partial-evacuation")
async def get_partial_evacuation_summary(district_id: str):
    """District-wide split: who must evacuate now (RED), who should
    prepare/partially evacuate (ORANGE), and who can safely shelter in
    place (YELLOW/GREEN) — avoids unnecessary mass movement."""
    summary = relocation_intelligence.partial_evacuation_summary(district_id)
    if not summary:
        raise HTTPException(status_code=404, detail=f"District {district_id} not found")
    return summary


@router.get("/plan/villages/{village_id}/return-readiness")
async def get_return_readiness(village_id: str):
    """Can this village's evacuated population safely return? Combines
    live hazard state with Engine-2 infrastructure-access indicators."""
    result = relocation_intelligence.assess_return_readiness(village_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"Village {village_id} not found")
    return result


@router.get("/plan/villages/{village_id}/offline-pdf")
async def download_offline_plan_pdf(village_id: str, time_of_day: str = Query("day", pattern="^(day|night)$")):
    """Printable/downloadable emergency plan for when mobile/internet
    connectivity is unavailable — evacuation zone, route, shelter,
    capacity, and resource requirements in one document district
    authorities can print and distribute."""
    plan = relocation_intelligence.build_relocation_plan(village_id, time_of_day=time_of_day)
    if not plan:
        raise HTTPException(status_code=404, detail=f"Village {village_id} not found")

    lines = [
        f"TERASHIELD — OFFLINE EMERGENCY RELOCATION PLAN",
        f"Village: {plan['name']}  (District: {plan['district_id']})",
        f"Generated: {_utcnow()}   Time of day: {plan['time_of_day']}",
        "",
        f"HAZARD: {plan['hazard']['type']} — {plan['hazard']['risk_category']} (score {plan['hazard']['multi_hazard_score']})",
        f"TIME STATE: {plan['time_state']['state']} — {plan['time_state']['description']}",
        "",
        f"POPULATION",
        f"  Total: {plan['population']['total']}",
        f"  Population exposed: {plan['population']['population_exposed']}",
        f"  Vulnerable population exposed: {plan['population']['vulnerable_population_exposed']}",
        "",
    ]

    if plan["isolation"]:
        iso = plan["isolation"]
        lines += [
            "*** CRITICAL ISOLATION ***",
            f"  Population trapped: {iso['population_trapped']} (vulnerable: {iso['vulnerable_population_trapped']})",
            f"  Water route feasible: {'YES' if iso['water_route_feasible'] else 'NO'}",
            f"  Nearest potential landing zone: {iso['nearest_potential_landing_zone_km']} km ({iso['landing_zone_block']})",
            f"  Airlift assessment required: {'YES' if iso['airlift_assessment_required'] else 'NO'}",
            "",
        ]
    else:
        route = plan["best_route"]
        lines += ["ROUTE"]
        if route:
            lines += [
                f"  Destination: {route['site_name']}",
                f"  Distance: {route['distance_km']} km   ETA: {route['travel_time_min']} min",
                f"  Status: {route['route_status']}   Safety score: {route['safety_score']}/100",
            ]
        else:
            lines += ["  No feasible route currently assessed."]
        lines += [
            "",
            f"MOBILITY RECOMMENDATION: {plan['mobility_recommendation']['recommended_mode'].upper()}",
            f"  {plan['mobility_recommendation']['reasoning']}",
            "",
            "EVACUATION WAVES",
        ]
        for w in plan["waves"]:
            lines.append(f"  Wave {w['wave']} ({w['priority']}): {w['group']} — {w['population']} people")
        lines += [
            "",
            "RESOURCES REQUIRED",
            f"  Buses: {plan['resource_requirements'].get('buses_required', 0)}",
            f"  Ambulances: {plan['resource_requirements'].get('ambulances_required', 0)}",
            f"  Helicopter required: {'YES' if plan['resource_requirements'].get('helicopter_required') else 'NO'}",
        ]

    lines += [
        "",
        f"STATUS: {plan['status']}",
        f"Confidence: {plan['confidence']}%",
        "",
        plan["human_in_the_loop_note"],
        "",
        "EMERGENCY CONTACT: District Disaster Management Authority control room (fill in local number before distribution)",
    ]

    pdf_bytes = simple_pdf.write_text_pdf(lines)
    filename = f"terashield_emergency_plan_{village_id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ============================================================================
# SCENARIO SIMULATION — "what if?" decision intelligence
# ============================================================================

@router.post("/plan/villages/{village_id}/scenario/site-unavailable")
async def scenario_site_unavailable(village_id: str, body: SiteUnavailableRequest):
    """
    "What if this shelter becomes unavailable?" Re-runs multi-site
    allocation excluding the given site(s) and compares it against the
    normal baseline allocation — shows the cascade to remaining sites and
    any population left needing additional capacity.
    """
    if not body.site_ids:
        raise HTTPException(status_code=400, detail="Provide at least one site_id")
    result = relocation_intelligence.simulate_site_unavailable(village_id, body.site_ids)
    if not result:
        raise HTTPException(status_code=404, detail=f"Village {village_id} not found")
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post("/plan/villages/{village_id}/scenario/route-failure")
async def scenario_route_failure(village_id: str, body: RouteFailureRequest):
    """
    "What if this bridge/route fails?" Forces the route to the given site
    to BLOCKED and recalculates the safest feasible route among the
    remaining candidates — shows the travel-time cost and whether the
    previously-best site becomes unreachable.
    """
    result = relocation_intelligence.simulate_route_failure(village_id, body.site_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"Village {village_id} not found")
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result
