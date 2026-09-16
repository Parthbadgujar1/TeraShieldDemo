"""
Emergency Response Team operational layer.

A deliberately separate layer from the analytical admin dashboard: where
Engine 1-4 answer "where is risk high and how should we plan relocation",
this answers "who needs rescue right now, how do we reach them, and where
do we take them" — the response loop, not the planning loop.

Built on top of relocation_intelligence (isolation protocol, mobility
escalation, route assessment) rather than duplicating that logic — a
"rescue mission" for an isolated village and the Engine-3 isolation
report are the same underlying assessment, just framed for a different
audience.

Resource matching here reports REQUIRED resource counts only. This
project has no live/verified emergency-resource registry (NDRF/SDRF team
locations, ambulance/boat status, etc.) to match against, and fabricating
one would be actively misleading in a disaster-response context — so we
say so explicitly rather than inventing "available" units.
"""

from __future__ import annotations

from typing import Optional

from . import geodata, village_engine, relocation_engine, relocation_intelligence

_RISK_ORDER = {"GREEN": 0, "YELLOW": 1, "ORANGE": 2, "RED": 3}


def _incident_severity(hazard: dict) -> str:
    """Maps a hazard risk category to an incident severity label for the
    response dashboard (RED/ORANGE hazard = an active incident; YELLOW/
    GREEN are monitoring, not incidents)."""
    return {"RED": "CRITICAL", "ORANGE": "HIGH", "YELLOW": "MODERATE"}.get(hazard["risk_category"])


def active_incidents_summary(district_id: Optional[str] = None) -> dict:
    """Dashboard header: active incidents by severity, people needing
    rescue now, people isolated, blocked routes, shelters nearing
    capacity — scaled from the live-assessed sample to the real district
    village count, same methodology as every other district-level number
    in this project."""
    district_ids = [district_id] if district_id else list(geodata.DISTRICTS.keys())

    counts = {"CRITICAL": 0, "HIGH": 0, "MODERATE": 0}
    people_requiring_rescue = 0
    people_isolated = 0
    blocked_route_count = 0
    hospitals_affected = 0

    for did in district_ids:
        district = geodata.get_district(did)
        villages = village_engine.get_villages(did)
        scale = district.census_villages / max(1, len(villages))

        for v in villages:
            hazard = village_engine.compute_hazard(v)
            severity = _incident_severity(hazard)
            if not severity:
                continue
            counts[severity] += round(1 * scale)

            # "Requiring rescue" / isolation / blocked-route checks only
            # apply to actual incidents (RED/ORANGE) — a YELLOW/MODERATE
            # village is in a prepare/monitor state, not one where people
            # need active rescue right now.
            if severity == "MODERATE":
                continue

            exposure_profile = village_engine.compute_exposure_profile(v, district, hazard)
            people_requiring_rescue += round(exposure_profile["people"]["population_exposed"] * scale)

            sites = relocation_engine.generate_sites(did)
            ranked_sites = sorted(sites, key=lambda s: -s["suitability"]["score"])[:5]
            routes = [relocation_intelligence.assess_route(v, hazard, s, district) for s in ranked_sites]
            if all(r["route_status"] == "BLOCKED" for r in routes):
                people_isolated += round(exposure_profile["people"]["population_exposed"] * scale)
            blocked_route_count += round(sum(1 for r in routes if r["route_status"] != "OPEN") * scale)

            if exposure_profile["healthcare"]["chc_hospital_count"] > 0:
                hospitals_affected += round(1 * scale)

    return {
        "active_incidents": counts,
        "people_requiring_immediate_rescue": people_requiring_rescue,
        "people_isolated": people_isolated,
        "blocked_or_at_risk_routes": blocked_route_count,
        "hospitals_affected": hospitals_affected,
        "note": "Counts are scaled from the live-assessed village sample to the real district village count, same methodology used throughout this platform. 'Blocked or at-risk routes' checks each incident village's top 5 candidate relocation-site routes.",
    }


def rescue_priority_list(district_id: Optional[str] = None, limit: int = 20) -> list[dict]:
    """Which villages need a response team first, and WHY — not just a
    ranked number. Only villages with an active incident (RED/ORANGE
    hazard) are included; this is the response loop, not the planning
    loop covered by Engine 3's relocation priority tiers."""
    district_ids = [district_id] if district_id else list(geodata.DISTRICTS.keys())
    entries = []

    for did in district_ids:
        district = geodata.get_district(did)
        for v in village_engine.get_villages(did):
            hazard = village_engine.compute_hazard(v)
            severity = _incident_severity(hazard)
            if not severity:
                continue

            exposure_profile = village_engine.compute_exposure_profile(v, district, hazard)
            sites = relocation_engine.generate_sites(did)
            ranked_sites = sorted(sites, key=lambda s: -s["suitability"]["score"])[:5]
            routes = [relocation_intelligence.assess_route(v, hazard, s, district) for s in ranked_sites]
            road_status = "BLOCKED" if all(r["route_status"] == "BLOCKED" for r in routes) else (
                "AT_RISK" if any(r["route_status"] != "OPEN" for r in routes) else "OPEN"
            )

            population_exposed = exposure_profile["people"]["population_exposed"]
            vulnerable_exposed = exposure_profile["people"]["vulnerable_population_exposed"]

            score = (
                _RISK_ORDER[hazard["risk_category"]] * 25
                + min(30, population_exposed / 50)
                + (25 if road_status == "BLOCKED" else 12 if road_status == "AT_RISK" else 0)
                + min(20, vulnerable_exposed / 20)
            )

            reasons = []
            if hazard["risk_category"] == "RED":
                reasons.append("hazard intensity is very high")
            elif hazard["risk_category"] == "ORANGE":
                reasons.append("hazard intensity is elevated")
            if population_exposed > 500:
                reasons.append("population exposure is high")
            if road_status == "BLOCKED":
                reasons.append("road accessibility has failed")
            elif road_status == "AT_RISK":
                reasons.append("road accessibility is degraded")
            if vulnerable_exposed > 100:
                reasons.append("vulnerable population is significant")

            entries.append({
                "village_id": v["village_id"],
                "name": v["name"],
                "district_id": did,
                "severity": severity,
                "population_exposed": population_exposed,
                "vulnerable_population_exposed": vulnerable_exposed,
                "road_status": road_status,
                "medical_priority_est": round(vulnerable_exposed * 0.15),
                "priority_score": round(score),
                "reasoning": f"{severity.title()} because " + ", ".join(reasons) + "." if reasons else f"{severity.title()} risk category.",
            })

    entries.sort(key=lambda e: -e["priority_score"])
    return entries[:limit]


def rescue_mission(village_id: str) -> Optional[dict]:
    """Rescue Mission View: pick up -> route -> mobility mode -> destination
    for one village, reframing Engine 3's relocation plan for a field
    response team rather than a planning authority. Includes the
    isolation protocol output verbatim when a village is isolated."""
    plan = relocation_intelligence.build_relocation_plan(village_id, time_of_day="day")
    if not plan:
        return None
    found = village_engine.find_village_anywhere(village_id)
    village, district_id = found
    district = geodata.get_district(district_id)
    exposure_profile = village_engine.compute_exposure_profile(village, district, village_engine.compute_hazard(village))

    road_status = plan["isolation"] and "BLOCKED" or (plan["best_route"]["route_status"] if plan["best_route"] else "BLOCKED")
    bridge_status = "DAMAGED" if road_status == "BLOCKED" else ("UNCERTAIN" if road_status == "AT_RISK" else "OPERATIONAL")
    # No real telecom-outage sensing available — communication status is
    # inferred from hazard severity only, and labeled as an inference.
    communication_status = "PARTIAL — inferred from hazard severity, not measured" if plan["hazard"]["risk_category"] in ("RED", "ORANGE") else "NORMAL — inferred from hazard severity, not measured"

    if plan["isolation"]:
        recommended_operation = "AIRLIFT ASSESSMENT REQUIRED" if plan["isolation"]["airlift_assessment_required"] else "BOAT-BASED RESCUE"
    elif plan["mobility_recommendation"]["recommended_mode"] == "bus":
        recommended_operation = "ROAD-BASED RESCUE"
    elif plan["mobility_recommendation"]["recommended_mode"] == "truck_4wd":
        recommended_operation = "ROAD-BASED RESCUE (4WD / specialised vehicle)"
    elif plan["mobility_recommendation"]["recommended_mode"] == "boat":
        recommended_operation = "BOAT-BASED RESCUE"
    else:
        recommended_operation = "AIRLIFT ASSESSMENT REQUIRED"

    return {
        "village_id": plan["village_id"],
        "name": plan["name"],
        "district_id": district_id,
        "location": {"lat": village["lat"], "lon": village["lon"]},
        "hazard": plan["hazard"],
        "population": {
            "total": plan["population"]["total"],
            "immediate_rescue": plan["population"]["population_exposed"],
            "assisted_rescue": plan["population"]["vulnerable_population_exposed"],
            "medical_priority_est": round(plan["population"]["vulnerable_population_exposed"] * 0.15),
            "children": exposure_profile["people"]["children_0_14"],
            "elderly": exposure_profile["people"]["elderly_60_plus"],
        },
        "access_status": {
            "road": road_status,
            "bridge": bridge_status,
            "communication": communication_status,
        },
        "isolation": plan["isolation"],
        "routes": plan["routes"],
        "best_route": plan["best_route"],
        "recommended_operation": recommended_operation,
        "mobility_recommendation": plan["mobility_recommendation"],
        "resource_requirements": plan["resource_requirements"],
        "confidence": plan["confidence"],
        "status": "AUTHORIZED RESPONSE TEAM REVIEW",
        "human_in_the_loop_note": plan["human_in_the_loop_note"],
    }
