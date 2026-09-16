"""
Emergency Response Team API endpoints — the operational response layer,
separate from the analytical admin dashboard. Mounted with a role-gated
dependency in app.main (Emergency Response Team login only).

Backed by app.core.emergency_response, which reuses Engine 3's isolation
protocol, mobility escalation, and route-assessment logic rather than
duplicating it — a rescue mission and a relocation-plan isolation report
are the same underlying assessment for a different audience.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from ..core import emergency_response

router = APIRouter()


@router.get("/incidents/summary")
async def get_active_incidents_summary(district_id: Optional[str] = None):
    """Emergency Dashboard header: active incidents by severity, people
    needing rescue now, people isolated, blocked routes, hospitals
    affected."""
    return emergency_response.active_incidents_summary(district_id)


@router.get("/rescue-priority")
async def get_rescue_priority(district_id: Optional[str] = None, limit: int = Query(20, ge=1, le=100)):
    """Ranked list of villages needing a response team first, with an
    explicit explanation for each ranking (not just a bare score)."""
    return {"villages": emergency_response.rescue_priority_list(district_id, limit)}


@router.get("/rescue-mission/{village_id}")
async def get_rescue_mission(village_id: str):
    """Rescue Mission View: pickup population, access status (road/
    bridge/communication), route options, mobility-mode recommendation,
    resource requirements, and the isolation protocol when every route is
    blocked. Always a recommendation for authorized response-team review —
    never an autonomous dispatch instruction."""
    mission = emergency_response.rescue_mission(village_id)
    if not mission:
        raise HTTPException(status_code=404, detail=f"Village {village_id} not found")
    return mission
