"""
Developer/testing tools for the live pipeline.

Two capabilities, both in-memory (reset on server restart) and clearly
labeled as test data everywhere they surface:

1. Add a custom village at any real coordinate — it runs through the exact
   same live hazard -> exposure -> vulnerability -> relocation pipeline as
   every generated village (real live weather/terrain for that point).
2. Force a hazard scenario on any village (real or test) — override
   rainfall/slope inputs to preview how the whole pipeline reacts to
   conditions that aren't happening right now (e.g. "what if this village
   saw 220mm of rain today?"), without waiting for real extreme weather.
"""

import textwrap

from fastapi import APIRouter, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field
from typing import Optional

from ..core import geodata, village_engine, relocation_engine, simple_pdf, village_pdf_parser

router = APIRouter()


class AddVillageRequest(BaseModel):
    district_id: str
    name: str
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    population: int = Field(..., gt=0, le=200_000)
    block: Optional[str] = None


class ScenarioRequest(BaseModel):
    preset: Optional[str] = None
    daily_rainfall_mm: Optional[float] = Field(None, ge=0, le=1000)
    current_rain_rate_mm_hr: Optional[float] = Field(None, ge=0, le=300)
    slope_deg: Optional[float] = Field(None, ge=0, le=70)


def _village_pipeline_snapshot(village: dict, district) -> dict:
    hazard = village_engine.compute_hazard(village)
    exposure = village_engine.compute_exposure(village, district, hazard)
    vulnerability = village_engine.compute_vulnerability(village, district)
    priority = relocation_engine.compute_priority(village, district, hazard, vulnerability)
    return {"village": village, "hazard": hazard, "exposure": exposure, "vulnerability": vulnerability, "relocation_priority": priority}


# ============================================================================
# CUSTOM TEST VILLAGES
# ============================================================================

@router.post("/villages")
async def add_test_village(body: AddVillageRequest):
    """Add a sample village for testing. Runs on real live weather/terrain
    at the coordinate given — not canned data."""
    district = geodata.get_district(body.district_id)
    if not district:
        raise HTTPException(status_code=404, detail=f"District {body.district_id} not found")
    try:
        village = village_engine.add_custom_village(
            body.district_id, body.name, body.lat, body.lon, body.population, body.block,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"status": "created", "village": village, "pipeline": _village_pipeline_snapshot(village, district)}


@router.get("/villages")
async def list_test_villages(district_id: Optional[str] = None):
    """List all test villages currently added (in-memory, this server run only)."""
    return {"villages": village_engine.list_custom_villages(district_id)}


@router.delete("/villages/{village_id}")
async def delete_test_village(village_id: str, district_id: str):
    """Remove a test village."""
    removed = village_engine.remove_custom_village(district_id, village_id)
    if not removed:
        raise HTTPException(status_code=404, detail=f"Test village {village_id} not found in {district_id}")
    return {"status": "deleted", "village_id": village_id}


# ============================================================================
# BULK IMPORT FROM PDF
# ============================================================================

@router.get("/sample-pdf")
async def download_sample_pdf(district_id: str = "chamoli"):
    """A ready-to-edit PDF template showing the expected village-data
    format, pre-filled with real block names/coordinates for the chosen
    district so a re-uploaded copy works out of the box."""
    district = geodata.get_district(district_id)
    if not district:
        raise HTTPException(status_code=404, detail=f"District {district_id} not found")

    example_blocks = district.blocks[:3]
    lines = [
        "TeraShield - Sample Village Data Template",
        f"District: {district.name} ({district.state})  [district_id: {district_id}]",
        "",
        "One village per line. Format:",
        "Village Name | Population | Latitude | Longitude | Block",
        "",
        "Latitude / Longitude / Block are OPTIONAL. If you don't know them,",
        "leave them out (e.g. \"My Village | 650\") and the village will be",
        "placed automatically within a real block of this district. If you",
        "do give a Block name, it must match one of this district's real",
        "blocks (listed at the bottom of this file).",
        "",
        "Lines starting with # are ignored. Edit or delete the example rows",
        "below, add your own (same format), then upload this file.",
        "",
    ]
    for i, b in enumerate(example_blocks):
        lines.append(f"Sample Village {i + 1} | {800 + i * 300} | {b.lat:.4f} | {b.lon:.4f} | {b.name}")
    lines.append(f"Sample Village {len(example_blocks) + 1} | 650")
    lines.append("")
    lines.append(f"Real block names in {district.name}:")
    block_names = ", ".join(b.name for b in district.blocks)
    for wrapped in textwrap.wrap(block_names, width=90):
        lines.append("  " + wrapped)

    pdf_bytes = simple_pdf.write_text_pdf(lines)
    filename = f"terashield_sample_{district_id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/villages/upload-pdf")
async def upload_villages_pdf(district_id: str = Form(...), file: UploadFile = File(...)):
    """
    Bulk-add test villages from a PDF: one row per village, with name and
    population required and latitude/longitude/block optional (auto-placed
    within a real block of the district when omitted). Each created
    village runs through the exact same live hazard -> exposure ->
    vulnerability -> relocation pipeline as every other village.
    Download /testdata/sample-pdf first for the expected format.
    """
    district = geodata.get_district(district_id)
    if not district:
        raise HTTPException(status_code=404, detail=f"District {district_id} not found")

    if file.filename and not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Please upload a .pdf file")

    pdf_bytes = await file.read()
    if len(pdf_bytes) > 5_000_000:
        raise HTTPException(status_code=400, detail="PDF too large (5MB max)")
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    try:
        text = village_pdf_parser.extract_text(pdf_bytes)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read this PDF: {e}")

    parsed_rows, skipped_rows = village_pdf_parser.parse_pdf_text(text)
    if not parsed_rows:
        raise HTTPException(
            status_code=400,
            detail="No parseable village rows found in this PDF. Download the sample "
                   "template (GET /testdata/sample-pdf) for the expected format.",
        )

    blocks_by_name = {b.name.lower(): b for b in district.blocks}
    created, failed = [], []

    for idx, row in enumerate(parsed_rows):
        lat, lon, block_name = row["lat"], row["lon"], row["block"]
        resolved_block = blocks_by_name.get(block_name.strip().lower()) if block_name else None

        if lat is None or lon is None:
            base = resolved_block or district.blocks[idx % len(district.blocks)]
            jitter = ((idx * 37) % 21 - 10) / 1000  # deterministic, sub-km spread
            lat = base.lat + jitter
            lon = base.lon + jitter

        try:
            village = village_engine.add_custom_village(
                district_id, row["name"], lat, lon, row["population"],
                resolved_block.name if resolved_block else None,
            )
        except ValueError as e:
            failed.append({"raw_line": row["raw_line"], "reason": str(e)})
            continue

        snapshot = _village_pipeline_snapshot(village, district)
        created.append({
            "village": village,
            "risk_category": snapshot["hazard"]["risk_category"],
            "multi_hazard_score": snapshot["hazard"]["multi_hazard_score"],
            "dominant_hazard": snapshot["hazard"]["dominant_hazard"],
        })

    return {
        "status": "processed",
        "district_id": district_id,
        "source_filename": file.filename,
        "summary": {"created": len(created), "skipped": len(skipped_rows), "failed": len(failed)},
        "created_villages": created,
        "skipped_rows": skipped_rows,
        "failed_rows": failed,
    }


# ============================================================================
# SCENARIO SIMULATION (works on ANY village, test or real)
# ============================================================================

@router.get("/scenarios/presets")
async def list_scenario_presets():
    """Ready-made scenario presets you can apply to any village."""
    return {"presets": [{"id": k, **v} for k, v in village_engine.SCENARIO_PRESETS.items()]}


@router.post("/villages/{village_id}/scenario")
async def apply_scenario(village_id: str, body: ScenarioRequest):
    """
    Force hazard inputs for one village so you can watch the whole
    pipeline (hazard -> exposure -> vulnerability -> relocation) react,
    without waiting for real extreme weather. Pass `preset` for a
    ready-made scenario, or explicit field overrides for a custom one.
    """
    found = village_engine.find_village_anywhere(village_id)
    if not found:
        raise HTTPException(status_code=404, detail=f"Village {village_id} not found")
    village, district_id = found
    district = geodata.get_district(district_id)

    if body.preset:
        try:
            village_engine.apply_scenario_preset(village_id, body.preset)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    else:
        fields = {k: v for k, v in body.model_dump().items() if k != "preset"}
        if not any(v is not None for v in fields.values()):
            raise HTTPException(status_code=400, detail="Provide a preset or at least one override field")
        village_engine.set_scenario_override(village_id, **fields)

    return {"status": "scenario_applied", "village_id": village_id, "pipeline": _village_pipeline_snapshot(village, district)}


@router.delete("/villages/{village_id}/scenario")
async def clear_scenario(village_id: str):
    """Clear a village's scenario override and return to live-measured conditions."""
    found = village_engine.find_village_anywhere(village_id)
    if not found:
        raise HTTPException(status_code=404, detail=f"Village {village_id} not found")
    village, district_id = found
    district = geodata.get_district(district_id)
    cleared = village_engine.clear_scenario_override(village_id)
    return {"status": "cleared" if cleared else "no_override_was_set", "village_id": village_id, "pipeline": _village_pipeline_snapshot(village, district)}
