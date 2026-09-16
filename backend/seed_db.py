"""
Recreate TeraShield's Postgres schema and fill it with sample data.

This does NOT change what the running dashboard shows — main.py's routers
compute hazard/exposure/vulnerability/relocation live, in-memory, from
app/core/geodata.py + app/core/village_engine.py on every request; they
never read app/models/database.py's tables. This script exists because the
Postgres tables were wiped and the user asked for them recreated with
sample data.

To keep the seeded rows meaningful (not arbitrary numbers disconnected
from the app), every row here is produced by calling the SAME live
pipeline functions the dashboard uses (village_engine.compute_hazard,
compute_exposure, compute_vulnerability, relocation_engine.compute_priority)
for the same two real pilot districts (Chamoli, Kendrapara) and their
generated villages, then persisted as a point-in-time snapshot.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from shapely.geometry import Point, LineString, box
from geoalchemy2.shape import from_shape

from app.core.config import get_settings
from app.core import geodata, village_engine, relocation_engine
from app.models.database import (
    Base, District, Village, HazardAssessment, MultiHazardAssessment,
    ExposureData, VulnerabilityScore, ExposureVulnerabilitySummary,
    RelocationSite, RelocationAssignment, EvacuationRoute,
    DisasterEvent, ResponseAction, Alert, Report, AuditLog,
)

settings = get_settings()
engine = create_engine(settings.DATABASE_URL)
Session = sessionmaker(bind=engine)


def village_square(lat: float, lon: float, half_side_deg: float = 0.01):
    return from_shape(box(lon - half_side_deg, lat - half_side_deg, lon + half_side_deg, lat + half_side_deg), srid=4326)


def district_bbox(blocks) -> "box":
    lats = [b.lat for b in blocks]
    lons = [b.lon for b in blocks]
    pad = 0.05
    return from_shape(box(min(lons) - pad, min(lats) - pad, max(lons) + pad, max(lats) + pad), srid=4326)


def category_for_score(score: float) -> str:
    """Same RED/ORANGE/YELLOW/GREEN thresholds village_engine.compute_hazard()
    uses for the fused multi-hazard score, applied here per individual hazard
    type so each row's risk_category is comparable/consistent."""
    thresholds = [0.25, 0.50, 0.75]
    names = ["GREEN", "YELLOW", "ORANGE", "RED"]
    level = sum(score >= t for t in thresholds)
    return names[level]


def main():
    print(f"Recreating schema on {settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME} ...")
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    print(f"Created tables: {list(Base.metadata.tables.keys())}")

    session = Session()
    now = datetime.utcnow()

    try:
        for district_id, district_info in geodata.DISTRICTS.items():
            # ---------------- District ----------------
            db_district = District(
                district_id=district_id,
                name=district_info.name,
                state=district_info.state,
                geometry=district_bbox(district_info.blocks),
                area_sq_km=district_info.area_sqkm,
                created_at=now,
            )
            session.add(db_district)
            session.flush()  # district must exist before villages reference it

            villages = village_engine.get_villages(district_id)
            hazards_by_village = {}
            vulnerabilities_by_village = {}

            for v in villages:
                # ---------------- Village ----------------
                session.add(Village(
                    village_id=v["village_id"],
                    name=v["name"],
                    district_id=district_id,
                    state=district_info.state,
                    geometry=village_square(v["lat"], v["lon"]),
                    area_sq_km=round(v["population"] / max(district_info.census_population / district_info.area_sqkm, 1), 3),
                    population=v["population"],
                    households=v["households"],
                    created_at=now,
                ))
                # Several downstream tables (exposure_vulnerability_summary,
                # evacuation_routes, etc.) have no ORM relationship() declared
                # back to Village, only a raw FK column — SQLAlchemy's
                # unit-of-work only orders inserts via declared relationships,
                # so without this explicit flush it can try to insert those
                # rows before the village row exists and violate the FK.
                session.flush()

                hazard = village_engine.compute_hazard(v)
                vulnerability = village_engine.compute_vulnerability(v, district_info)
                hazards_by_village[v["village_id"]] = hazard
                vulnerabilities_by_village[v["village_id"]] = vulnerability

                # ---------------- Hazard assessments (one row per hazard type) ----------------
                for ih in hazard["individual_hazards"]:
                    session.add(HazardAssessment(
                        village_id=v["village_id"],
                        district_id=district_id,
                        hazard_type=ih["hazard_type"],
                        score=ih["score"],
                        risk_category=category_for_score(ih["score"]),
                        intensity=ih["score"],
                        confidence=ih["confidence"],
                        source=hazard["live_inputs"]["data_source"],
                        assessment_date=now,
                        updated_at=now,
                    ))

                # ---------------- Multi-hazard fused assessment ----------------
                session.add(MultiHazardAssessment(
                    village_id=v["village_id"],
                    multi_hazard_score=hazard["multi_hazard_score"],
                    risk_category=hazard["risk_category"],
                    dominant_hazard=hazard["dominant_hazard"],
                    hazard_combination=json.dumps(hazard["hazard_scores"]),
                    assessment_date=now,
                    updated_at=now,
                ))

                # ---------------- Exposure data ----------------
                exposure = village_engine.compute_exposure(v, district_info, hazard)
                exp = exposure["exposure"]
                session.add(ExposureData(
                    village_id=v["village_id"], asset_type="population",
                    geometry=from_shape(Point(v["lon"], v["lat"]), srid=4326),
                    quantity=exp["population"]["total"], unit="people", criticality="high",
                    confidence=hazard["individual_hazards"][0]["confidence"], source="census_2011_generated",
                    data_date=now, created_at=now,
                    extra_data={"at_risk": exp["population"]["at_risk"], "breakdown": exp["population"]["breakdown"]},
                ))
                session.add(ExposureData(
                    village_id=v["village_id"], asset_type="buildings",
                    geometry=from_shape(Point(v["lon"], v["lat"]), srid=4326),
                    quantity=exp["buildings"]["total"], unit="count", criticality="medium",
                    confidence=hazard["individual_hazards"][0]["confidence"], source="census_2011_generated",
                    data_date=now, created_at=now,
                    extra_data={"at_risk": exp["buildings"]["at_risk"]},
                ))
                session.add(ExposureData(
                    village_id=v["village_id"], asset_type="agricultural_land",
                    geometry=from_shape(Point(v["lon"], v["lat"]), srid=4326),
                    quantity=exp["economic_assets"]["agricultural_land_hectares"], unit="hectares", criticality="medium",
                    confidence=0.6, source="rural_smallholding_norm",
                    data_date=now, created_at=now, extra_data=None,
                ))
                for fac in exp["critical_facilities"]:
                    session.add(ExposureData(
                        village_id=v["village_id"], asset_type="critical_facilities",
                        geometry=from_shape(Point(v["lon"], v["lat"]), srid=4326),
                        quantity=1, unit="facility", criticality=fac["criticality"],
                        confidence=0.7, source="nrhm_iphs_norms",
                        data_date=now, created_at=now, extra_data={"facility_type": fac["type"], "name": fac["name"]},
                    ))

                # ---------------- Vulnerability factor scores ----------------
                for fs in vulnerability["factor_scores"]:
                    session.add(VulnerabilityScore(
                        village_id=v["village_id"],
                        factor_type=fs["factor"],
                        factor_score=fs["score"],
                        evidence=fs["evidence"],
                        composite_score=vulnerability["vulnerability_assessment"]["composite_score"],
                        vulnerability_band=vulnerability["vulnerability_assessment"]["vulnerability_band"],
                        confidence=vulnerability["confidence"]["overall"],
                        source="census_2011_baseline",
                        created_at=now,
                    ))

                # ---------------- Exposure + vulnerability summary ----------------
                session.add(ExposureVulnerabilitySummary(
                    village_id=v["village_id"],
                    population_exposed=exp["population"]["at_risk"],
                    buildings_exposed=exp["buildings"]["at_risk"],
                    critical_facilities_count=len(exp["critical_facilities"]),
                    agricultural_area_exposed=exp["economic_assets"]["agricultural_land_hectares"],
                    overall_vulnerability_score=vulnerability["vulnerability_assessment"]["composite_score"],
                    vulnerability_band=vulnerability["vulnerability_assessment"]["vulnerability_band"],
                    affected_asset_types=["population", "buildings", "agricultural_land", "critical_facilities"],
                    updated_at=now,
                ))

            session.flush()  # villages must exist before sites/assignments/routes reference them

            # ---------------- Relocation sites ----------------
            sites = relocation_engine.generate_sites(district_id)
            for s in sites:
                session.add(RelocationSite(
                    site_id=s["site_id"],
                    name=s["name"],
                    district_id=district_id,
                    geometry=village_square(s["location"]["lat"], s["location"]["lon"], half_side_deg=0.02),
                    area_sq_km=round(s["carrying_capacity"]["land_hectares"] / 100, 3),
                    slope_score=s["suitability"]["factors"]["slope"],
                    distance_from_hazard_score=s["suitability"]["factors"]["distance_from_hazard"],
                    soil_capacity_score=s["suitability"]["factors"]["soil_capacity"],
                    water_availability_score=s["suitability"]["factors"]["water_availability"],
                    market_proximity_score=s["suitability"]["factors"]["market_proximity"],
                    cultural_fit_score=s["suitability"]["factors"]["cultural_fit"],
                    accessibility_score=s["suitability"]["factors"]["accessibility"],
                    overall_suitability_score=s["suitability"]["score"],
                    suitability_grade=s["suitability"]["grade"],
                    land_capacity_households=round(s["carrying_capacity"]["total_capacity_people"] / district_info.avg_household_size),
                    water_capacity_people=s["carrying_capacity"]["total_capacity_people"],
                    electricity_capacity_mw=round(s["carrying_capacity"]["total_capacity_people"] / 4000, 2),
                    school_capacity_children=round(s["carrying_capacity"]["total_capacity_people"] * 0.18),
                    hospital_capacity_beds=max(6, round(s["carrying_capacity"]["total_capacity_people"] / 5000)),
                    job_slots_available=round(s["carrying_capacity"]["total_capacity_people"] * 0.3),
                    overall_capacity_people=s["carrying_capacity"]["total_capacity_people"],
                    is_available=s["is_available"],
                    created_at=now, updated_at=now,
                ))

            session.flush()  # sites must exist before assignments/routes reference them

            # ---------------- Relocation assignments + evacuation routes ----------------
            # Only villages with elevated risk (matches what the dashboard would
            # actually flag for relocation) get an assignment row.
            for v in villages:
                hazard = hazards_by_village[v["village_id"]]
                if hazard["risk_category"] == "GREEN":
                    continue
                vulnerability = vulnerabilities_by_village[v["village_id"]]
                priority = relocation_engine.compute_priority(v, district_info, hazard, vulnerability)

                session.add(RelocationAssignment(
                    village_id=v["village_id"],
                    target_site_id=priority["assigned_site"]["site_id"],
                    priority_tier=priority["relocation_priority"]["tier"],
                    population_to_relocate=v["population"],
                    prioritization_score=priority["relocation_priority"]["score"],
                    matching_score=priority["assigned_site"]["matching_score"],
                    distance_km=priority["assigned_site"]["distance_km"],
                    cultural_compatibility=priority["assigned_site"]["cultural_compatibility"],
                    livelihood_compatibility=priority["assigned_site"]["livelihood_compatibility"],
                    timeline_days=priority["relocation_plan"]["estimated_timeline_days"],
                    status="planned",
                    created_at=now, updated_at=now,
                ))

                site = next(s for s in sites if s["site_id"] == priority["assigned_site"]["site_id"])
                session.add(EvacuationRoute(
                    source_village_id=v["village_id"],
                    destination_site_id=site["site_id"],
                    route_geometry=from_shape(
                        LineString([(v["lon"], v["lat"]), (site["location"]["lon"], site["location"]["lat"])]),
                        srid=4326,
                    ),
                    distance_km=priority["assigned_site"]["distance_km"],
                    estimated_time_hours=round(priority["assigned_site"]["distance_km"] / 25, 2),
                    capacity_people_per_hour=250,
                    mode_of_transport="buses" if district_info.terrain_class == "flat" else "mixed",
                    avoid_areas=None,
                    created_at=now,
                ))

        session.flush()

        # ---------------- Disaster events (real, documented) + response actions ----------------
        event_defs = [
            dict(name="Joshimath flash flood (Rishiganga/Dhauliganga)", district_id="chamoli", block="Joshimath",
                 date="2021-02-07", htype="flood", severity="Extreme", casualties=204,
                 people_affected=15000, people_evacuated=2000,
                 desc="Glacier/rock-ice avalanche triggered flash flood down the Rishiganga/Dhauliganga, damaging the Tapovan hydro project and downstream settlements near Joshimath."),
            dict(name="Joshimath land subsidence crisis", district_id="chamoli", block="Joshimath",
                 date="2023-01-02", htype="landslide", severity="High", casualties=0,
                 people_affected=4000, people_evacuated=850,
                 desc="Widespread ground cracking forced evacuation of over 100 families and demolition of unsafe structures in Joshimath town."),
            dict(name="Cyclone Yaas landfall (near Dhamra)", district_id="kendrapara", block="Mahakalapada",
                 date="2021-05-26", htype="coastal_erosion", severity="High", casualties=0,
                 people_affected=180000, people_evacuated=60000,
                 desc="Cyclone Yaas made landfall near Dhamra; large-scale evacuation across Kendrapara's coastal blocks including Mahakalapada and Rajnagar (Bhitarkanika belt)."),
            dict(name="Cyclone Fani evacuation", district_id="kendrapara", block="Rajnagar",
                 date="2019-05-03", htype="coastal_erosion", severity="High", casualties=0,
                 people_affected=150000, people_evacuated=45000,
                 desc="Large-scale precautionary evacuation across coastal Odisha districts including Kendrapara ahead of Cyclone Fani."),
        ]

        for ev in event_defs:
            block = next(b for b in geodata.get_district(ev["district_id"]).blocks if b.name == ev["block"])
            db_event = DisasterEvent(
                event_name=ev["name"],
                event_type=ev["htype"],
                district_id=ev["district_id"],
                geometry=village_square(block.lat, block.lon, half_side_deg=0.03),
                start_date=datetime.strptime(ev["date"], "%Y-%m-%d"),
                end_date=datetime.strptime(ev["date"], "%Y-%m-%d") + timedelta(days=3),
                severity=ev["severity"],
                casualties=ev["casualties"],
                property_damage_lakhs=0,
                people_affected=ev["people_affected"],
                people_evacuated=ev["people_evacuated"],
                created_at=now,
                extra_data={"source": "publicly documented event", "block": ev["block"]},
            )
            session.add(db_event)
            session.flush()

            session.add(ResponseAction(
                event_id=db_event.event_id,
                action_type="Evacuation",
                description=ev["desc"],
                responsible_agency="NDRF / State Disaster Management Authority",
                status="Completed",
                affected_villages=[],
                resources_deployed={"personnel": "NDRF teams", "transport": "buses/boats as applicable"},
                timestamp=db_event.start_date,
            ))

        # ---------------- Alerts for currently RED/ORANGE villages ----------------
        # (Falls back to the highest-scoring villages per district if live
        # conditions right now are calm everywhere, so the dashboard always
        # has something concrete to show — those fallback rows are labeled
        # "Watch" severity, not inflated to Critical/High.)
        alert_count = 0
        for district_id in geodata.DISTRICTS:
            villages = village_engine.get_villages(district_id)
            scored = [(v, village_engine.compute_hazard(v)) for v in villages]
            elevated = [(v, h) for v, h in scored if h["risk_category"] in ("RED", "ORANGE")]
            if not elevated:
                elevated = sorted(scored, key=lambda pair: pair[1]["multi_hazard_score"], reverse=True)[:5]

            for v, hazard in elevated:
                is_genuinely_elevated = hazard["risk_category"] in ("RED", "ORANGE")
                session.add(Alert(
                    alert_type="Hazard",
                    severity={"RED": "Critical", "ORANGE": "High"}.get(hazard["risk_category"], "Watch"),
                    title=f"{hazard['risk_category']} zone: {v['name']} ({district_id})",
                    description=f"{v['name']} is currently classified {hazard['risk_category']} "
                                f"(multi-hazard score {hazard['multi_hazard_score']}), dominant hazard: {hazard['dominant_hazard']}."
                                + ("" if is_genuinely_elevated else " No RED/ORANGE villages in this district right now — shown as the district's highest current watch-list entry."),
                    affected_villages=[v["village_id"]],
                    recommended_action="Review relocation priority and evacuation route readiness.",
                    created_at=now,
                    resolved_at=None,
                    is_active=True,
                ))
                alert_count += 1

        # Historical alerts tied to the documented disaster events, resolved.
        for ev in event_defs:
            session.add(Alert(
                alert_type="Hazard",
                severity=ev["severity"],
                title=f"[Historical] {ev['name']}",
                description=ev["desc"],
                affected_villages=[],
                recommended_action="Archived — see linked disaster event and response action for details.",
                created_at=datetime.strptime(ev["date"], "%Y-%m-%d"),
                resolved_at=datetime.strptime(ev["date"], "%Y-%m-%d") + timedelta(days=3),
                is_active=False,
            ))

        # ---------------- Sample reports ----------------
        for district_id in geodata.DISTRICTS:
            session.add(Report(
                report_type="Hazard",
                title=f"{geodata.get_district(district_id).name} District Hazard Summary",
                description="Auto-generated summary of multi-hazard risk categories across the sampled villages.",
                file_path=f"./data/processed/{district_id}_hazard_summary.pdf",
                district_id=district_id,
                event_id=None,
                generated_by="system_seed",
                created_at=now,
                extra_data={"generated_via": "seed_db.py"},
            ))

        # ---------------- Audit log for this recreation itself ----------------
        session.add(AuditLog(
            action="Create",
            entity_type="Database",
            entity_id="terashield",
            old_value=None,
            new_value={"tables": list(Base.metadata.tables.keys())},
            user="system_seed",
            timestamp=now,
            change_reason="Database was wiped; schema recreated and reseeded from the live hazard/exposure/vulnerability/relocation pipeline.",
        ))

        session.commit()
        print("Seed complete.")

        for table in Base.metadata.tables.keys():
            count = session.execute(__import__("sqlalchemy").text(f"SELECT COUNT(*) FROM {table}")).scalar()
            print(f"  {table}: {count} rows")

    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


if __name__ == "__main__":
    main()
