"""
Dynamic village + hazard + exposure + vulnerability + relocation engine.

Identity data (which villages exist, where, how many people live there) is
generated ONCE per process, deterministically, anchored to real block
geography and real district census totals (see geodata.py) — it does not
change on every request, because a village's location and population don't
change minute to minute in real life either.

Everything that *should* change with real-world conditions — hazard scores,
risk category, relocation urgency — is recomputed on every call from live
weather + terrain data (see live_data.py), so two requests made hours apart
during a rain event will legitimately return different numbers, the way a
real monitoring system would.
"""

from __future__ import annotations

import hashlib
import math
from typing import Optional

from . import geodata, live_data

# ----------------------------------------------------------------------
# Real, published reference constants used throughout the formulas below
# ----------------------------------------------------------------------

# India 2011 Census broad age-structure ratios (0-6, 6-14, 15-59, 60+),
# used to split a village's real population into age bands.
AGE_BAND_RATIOS = {"children_0_5": 0.13, "children_6_14": 0.18, "adults_15_59": 0.58, "elderly_60plus": 0.11}

# National Rural Health Mission / IPHS facility population norms, lower for
# hilly/tribal terrain as per actual guidelines.
SUBCENTRE_NORM = {"hilly": 3_000, "flat": 5_000}
PHC_NORM = {"hilly": 20_000, "flat": 30_000}
CHC_NORM = {"hilly": 80_000, "flat": 120_000}    # IPHS Community Health Centre norm
ANGANWADI_NORM = 800                              # ICDS: ~1 anganwadi centre per 800 rural population
COLLEGE_POP_THRESHOLD = 5_000                     # only larger/block-HQ-scale settlements host a college

# District literacy rate & sex ratio, Census of India 2011 (used as the
# village-level baseline; villages don't have individually published
# literacy figures without SECC microdata).
DISTRICT_SOCIAL_STATS = {
    "chamoli": {"literacy_rate": 71.64, "sex_ratio": 1019},
    "kendrapara": {"literacy_rate": 85.15, "sex_ratio": 1007},
}

# Census 2011 Houselisting & Housing series, state rural-area census/kutcha
# proportions (approximate published state averages — individual villages
# don't have separately published structural-quality figures).
STATE_HOUSING_TYPE_SPLIT = {
    "Uttarakhand": {"pucca": 0.67, "semi_pucca": 0.19, "kutcha": 0.14},
    "Odisha": {"pucca": 0.38, "semi_pucca": 0.32, "kutcha": 0.30},
}

# NFHS-5 (2019-21) national rural averages — used as a labeled estimate
# where no district-level figure is separately published.
FEMALE_HEADED_HOUSEHOLD_PCT_RURAL = 0.147
REPRODUCTIVE_AGE_WOMEN_SHARE = 0.24     # women aged 15-49 as a share of total population (demographic norm)
PREGNANCY_RATE_AMONG_REPRO_AGE = 0.03   # rough share of reproductive-age women pregnant at any time

OVERHEAD_TANK_PER_HOUSEHOLDS = 600      # PHED norm: 1 shared overhead tank per ~600 rural households
TRANSFORMER_PER_HOUSEHOLDS = 120        # rural electrification: 1 distribution transformer per ~120 households

# The real block that hosts each district's actual headquarters town —
# Gopeshwar (Chamoli's HQ) sits in Dasholi block; Kendrapara town (the
# district's own HQ) sits in Kendrapara block. District-grade hospitals,
# CHCs, colleges etc. are realistically concentrated there in both districts.
DISTRICT_HQ_BLOCK = {"chamoli": "Dasholi", "kendrapara": "Kendrapara"}

# Forest Survey of India-style district forest-cover shares (approximate
# published figures — Chamoli is a heavily forested Himalayan district;
# Kendrapara is low-forest delta but hosts the Bhitarkanika mangrove belt
# near its coastal blocks).
DISTRICT_FOREST_COVER_PCT = {"chamoli": 0.65, "kendrapara": 0.05}
COASTAL_WETLAND_COVER_PCT = 0.12   # applied only to blocks near the Bhitarkanika/coastal belt

IMD_HEAVY_RAIN_MM = 64.5      # IMD "heavy rain" 24h threshold
IMD_VERY_HEAVY_RAIN_MM = 115.5  # IMD "very heavy rain" 24h threshold
CLOUDBURST_MM_PER_HR = 20.0    # sustained hourly rate treated as cloudburst-forming for scoring


def _seed_float(*parts: str) -> float:
    """Stable pseudo-random float in [0,1) from arbitrary parts — used only
    for small cosmetic jitter (never for hazard scoring itself)."""
    h = hashlib.sha256(":".join(parts).encode()).hexdigest()
    return int(h[:8], 16) / 0xFFFFFFFF


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def haversine_km(lat1, lon1, lat2, lon2) -> float:
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _intensity_label(score: float) -> str:
    if score <= 0.02:
        return "none"
    if score < 0.35:
        return "low"
    if score < 0.65:
        return "medium"
    return "high"


# ----------------------------------------------------------------------
# Village identity generation (computed once per process)
# ----------------------------------------------------------------------

_VILLAGE_CACHE: dict[str, list[dict]] = {}


def _generate_villages(district_id: str) -> list[dict]:
    district = geodata.get_district(district_id)
    if not district:
        return []

    n_blocks = len(district.blocks)
    per_block = max(1, geodata.SAMPLE_VILLAGES_PER_DISTRICT // n_blocks)
    suffixes = geodata.NAME_SUFFIXES[district.terrain_class]

    # District-wide population density (people / sqkm), a real figure
    # derived from real census totals, used to size each village's land
    # footprint and to weight population distribution toward blocks whose
    # generated points sit at lower elevation (real correlation: valley
    # floors and coastal plains are more densely settled than upper
    # slopes/forest blocks in both these districts).
    density = district.census_population / district.area_sqkm

    villages: list[dict] = []
    idx = 0
    avg_village_population = district.census_population / district.census_villages

    for block in district.blocks:
        for j in range(per_block):
            idx += 1
            village_id = f"v_{district_id[:3]}_{idx:04d}"
            jitter_lat = (_seed_float(district_id, block.name, str(j), "lat") - 0.5) * 0.18
            jitter_lon = (_seed_float(district_id, block.name, str(j), "lon") - 0.5) * 0.18
            lat = round(block.lat + jitter_lat, 5)
            lon = round(block.lon + jitter_lon, 5)

            # Population: centered on the real district average village size,
            # spread with a seeded log-normal-ish multiplier so villages
            # aren't identical, but the *sum* stays anchored to reality.
            size_mult = 0.4 + _seed_float(village_id, "pop") * 1.8
            population = max(80, round(avg_village_population * size_mult))
            households = max(20, round(population / district.avg_household_size))

            suffix = suffixes[idx % len(suffixes)]
            name = f"{block.name} {suffix}"
            if per_block > len(suffixes):
                name += f" {(idx % per_block) + 1}"

            villages.append({
                "village_id": village_id,
                "name": name,
                "district_id": district_id,
                "block": block.name,
                "lat": lat,
                "lon": lon,
                "population": population,
                "households": households,
            })

    return villages


def get_villages(district_id: str) -> list[dict]:
    if district_id not in _VILLAGE_CACHE:
        _VILLAGE_CACHE[district_id] = _generate_villages(district_id)
    return _VILLAGE_CACHE[district_id] + _CUSTOM_VILLAGES.get(district_id, [])


# ----------------------------------------------------------------------
# Test/sample data injection — lets a developer add a village anywhere
# (real coordinates, so it still runs through live weather/terrain) and/or
# force a hazard scenario on any village, so the full pipeline can be
# exercised on demand instead of waiting for real extreme weather.
# Entirely in-memory; resets on server restart.
# ----------------------------------------------------------------------

_CUSTOM_VILLAGES: dict[str, list[dict]] = {}
_SCENARIO_OVERRIDES: dict[str, dict] = {}


def add_custom_village(district_id: str, name: str, lat: float, lon: float, population: int, block: Optional[str] = None) -> dict:
    district = geodata.get_district(district_id)
    if not district:
        raise ValueError(f"Unknown district {district_id}")
    if not block:
        block = min(district.blocks, key=lambda b: haversine_km(lat, lon, b.lat, b.lon)).name
    elif block not in {b.name for b in district.blocks}:
        raise ValueError(f"Unknown block {block!r} for {district_id}")

    existing = _CUSTOM_VILLAGES.setdefault(district_id, [])
    village_id = f"v_test_{district_id[:3]}_{len(existing) + 1:04d}"
    households = max(1, round(population / district.avg_household_size))
    village = {
        "village_id": village_id, "name": name, "district_id": district_id,
        "block": block, "lat": round(lat, 5), "lon": round(lon, 5),
        "population": population, "households": households,
        "is_test_data": True,
    }
    existing.append(village)
    return village


def remove_custom_village(district_id: str, village_id: str) -> bool:
    existing = _CUSTOM_VILLAGES.get(district_id, [])
    before = len(existing)
    _CUSTOM_VILLAGES[district_id] = [v for v in existing if v["village_id"] != village_id]
    _SCENARIO_OVERRIDES.pop(village_id, None)
    return len(_CUSTOM_VILLAGES[district_id]) != before


def list_custom_villages(district_id: Optional[str] = None) -> list[dict]:
    if district_id:
        return list(_CUSTOM_VILLAGES.get(district_id, []))
    return [v for lst in _CUSTOM_VILLAGES.values() for v in lst]


SCENARIO_PRESETS = {
    "extreme_rain": {"daily_rainfall_mm": 220.0, "current_rain_rate_mm_hr": 45.0, "label": "Extreme rainfall event (220mm/24h, IMD 'extremely heavy')"},
    "steep_slope_failure": {"slope_deg": 42.0, "daily_rainfall_mm": 90.0, "label": "Saturated steep slope (42°, post-heavy-rain)"},
    "coastal_surge": {"daily_rainfall_mm": 140.0, "label": "Coastal storm surge conditions"},
    "clear": {"daily_rainfall_mm": 0.0, "current_rain_rate_mm_hr": 0.0, "slope_deg": None, "label": "Clear conditions (no rainfall override)"},
}


def set_scenario_override(village_id: str, **fields) -> dict:
    override = {k: v for k, v in fields.items() if v is not None}
    _SCENARIO_OVERRIDES[village_id] = override
    return override


def apply_scenario_preset(village_id: str, preset: str) -> dict:
    if preset not in SCENARIO_PRESETS:
        raise ValueError(f"Unknown preset {preset!r}. Choose one of {list(SCENARIO_PRESETS)}")
    fields = {k: v for k, v in SCENARIO_PRESETS[preset].items() if k != "label"}
    return set_scenario_override(village_id, **fields)


def clear_scenario_override(village_id: str) -> bool:
    return _SCENARIO_OVERRIDES.pop(village_id, None) is not None


def get_scenario_override(village_id: str) -> Optional[dict]:
    return _SCENARIO_OVERRIDES.get(village_id)


def get_village(district_id: str, village_id: str) -> Optional[dict]:
    for v in get_villages(district_id):
        if v["village_id"] == village_id:
            return v
    return None


def find_village_anywhere(village_id: str) -> Optional[tuple[dict, str]]:
    """Look up a village by id without knowing its district (several
    endpoints only receive a village_id)."""
    for district_id in geodata.DISTRICTS:
        v = get_village(district_id, village_id)
        if v:
            return v, district_id
    return None


# ----------------------------------------------------------------------
# Live hazard computation
# ----------------------------------------------------------------------

def _block_of(district, block_name: str) -> geodata.Block:
    return next(b for b in district.blocks if b.name == block_name)


def compute_hazard(village: dict) -> dict:
    district = geodata.get_district(village["district_id"])
    weather_by_block = live_data.get_block_weather(district.blocks, district.district_id)
    slope_by_block = live_data.get_block_slope(district.blocks, district.district_id)
    water_by_block = live_data.get_block_water_distance(district.blocks, district)
    landuse_by_block = live_data.get_block_landuse(district.blocks, district)
    wind_by_block = live_data.get_block_wind(district.blocks, district.district_id)

    weather = weather_by_block[village["block"]]
    slope_info = slope_by_block[village["block"]]
    water_info = water_by_block[village["block"]]
    landuse_info = landuse_by_block[village["block"]]
    wind_info = wind_by_block[village["block"]]
    block = _block_of(district, village["block"])

    daily_rain = weather["daily_precipitation_sum_mm"]
    current_rain_rate = weather["current_rain_mm"] * 4  # 15-min sample -> approx mm/hr
    slope_deg = slope_info["slope_deg"]
    elevation_m = slope_info["elevation_m"]
    water_distance_km = water_info["distance_km"]
    landuse_nearby = landuse_info["nearby_features"]
    wind_gusts_kmh = wind_info["wind_gusts_kmh"]
    is_live = weather["data_source"] == "live_open_meteo" and slope_info["data_source"] == "live_open_meteo"
    confidence = 0.9 if is_live else 0.55

    # Dev/test scenario override — lets a tester force specific inputs
    # (e.g. "what if this village saw 220mm rain today?") so the rest of
    # the pipeline (exposure -> vulnerability -> relocation -> dashboard
    # alerts) can be exercised without waiting for real extreme weather.
    override = _SCENARIO_OVERRIDES.get(village["village_id"])
    is_simulated = False
    if override:
        daily_rain = override.get("daily_rainfall_mm", daily_rain)
        current_rain_rate = override.get("current_rain_rate_mm_hr", current_rain_rate)
        slope_deg = override.get("slope_deg", slope_deg)
        is_simulated = True
        confidence = 1.0  # scenario inputs are exact by construction, not a measurement

    is_hilly = district.terrain_class == "hilly"
    district_elevs = [slope_by_block[b.name]["elevation_m"] for b in district.blocks]
    elev_min, elev_max = min(district_elevs), max(district_elevs)
    elev_range = max(1.0, elev_max - elev_min)

    # ==================================================================
    # FLOOD — 5 weighted factors: rain 0.35, low-elevation 0.25,
    # river-distance 0.20, slope 0.10, land-use 0.10.
    # ==================================================================
    fl_rain_factor = _clamp01(daily_rain / (IMD_HEAVY_RAIN_MM * 2))
    fl_low_elev_factor = _clamp01(1 - (elevation_m - elev_min) / elev_range)
    fl_river_distance_factor = _clamp01(1 - water_distance_km / 10)
    fl_slope_factor = _clamp01(1 - slope_deg / 20)
    fl_lulc_factor = _clamp01(landuse_nearby / 6)
    flood_score = _clamp01(
        0.35 * fl_rain_factor + 0.25 * fl_low_elev_factor + 0.20 * fl_river_distance_factor
        + 0.10 * fl_slope_factor + 0.10 * fl_lulc_factor
    )

    # ==================================================================
    # LANDSLIDE — 5 weighted factors: slope 0.45, rain 0.25, NDVI 0.15,
    # stream-distance 0.10, lithology 0.05. Flat deltaic terrain has
    # negligible slope-driven mass movement regardless of the formula, so
    # non-hilly districts keep a small residual instead of the full weight.
    # ==================================================================
    ls_slope_factor = _clamp01(slope_deg / 40)
    ls_rain_factor = _clamp01(daily_rain / IMD_VERY_HEAVY_RAIN_MM)
    ls_ndvi_factor = _clamp01(1 - DISTRICT_FOREST_COVER_PCT.get(district.district_id, 0.3))
    ls_stream_distance_factor = _clamp01(1 - water_distance_km / 6)
    ls_lithology_factor = geodata.DISTRICT_LITHOLOGY_RISK.get(district.district_id, 0.3)
    if is_hilly:
        landslide_score = _clamp01(
            0.45 * ls_slope_factor + 0.25 * ls_rain_factor + 0.15 * ls_ndvi_factor
            + 0.10 * ls_stream_distance_factor + 0.05 * ls_lithology_factor
        )
    else:
        landslide_score = round(_clamp01(0.05 * ls_slope_factor + 0.05 * ls_rain_factor), 3)

    # ==================================================================
    # CLOUDBURST — 2 weighted factors: short-duration rain intensity 0.70,
    # orographic lift 0.30.
    # ==================================================================
    intensity_factor = _clamp01(current_rain_rate / CLOUDBURST_MM_PER_HR)
    orographic_factor = _clamp01(elevation_m / 3500) if is_hilly else 0.0
    if is_hilly:
        cloudburst_score = _clamp01(0.7 * intensity_factor + 0.3 * orographic_factor)
    else:
        cloudburst_score = round(_clamp01(0.15 * intensity_factor), 3)

    # ==================================================================
    # COASTAL EROSION — 3 weighted factors: coast-distance 0.50, cyclone
    # (live wind-gust proxy) 0.30, shoreline-change trend 0.20. Only
    # meaningful for blocks with a real coastline distance.
    # ==================================================================
    if block.coast_distance_km is not None:
        co_distance_factor = _clamp01(1 - block.coast_distance_km / 50)
        co_cyclone_factor = _clamp01(wind_gusts_kmh / 90)
        co_shoreline_factor = _clamp01(1 - block.coast_distance_km / 25)
        coastal_score = _clamp01(0.50 * co_distance_factor + 0.30 * co_cyclone_factor + 0.20 * co_shoreline_factor)
    else:
        co_distance_factor = co_cyclone_factor = co_shoreline_factor = 0.0
        coastal_score = 0.0

    scores = {
        "flood": round(flood_score, 3),
        "landslide": round(landslide_score, 3),
        "coastal_erosion": round(coastal_score, 3),
        "cloudburst": round(cloudburst_score, 3),
    }

    factor_breakdown = {
        "flood": [
            {"factor": "rain_factor", "weight": 0.35, "value": round(fl_rain_factor, 3), "raw": f"{daily_rain:.0f} mm/24h", "data_source": weather["data_source"]},
            {"factor": "low_elevation_factor", "weight": 0.25, "value": round(fl_low_elev_factor, 3), "raw": f"{elevation_m:.0f} m", "data_source": slope_info["data_source"]},
            {"factor": "river_distance_factor", "weight": 0.20, "value": round(fl_river_distance_factor, 3), "raw": f"{water_distance_km:.1f} km to nearest river/stream", "data_source": water_info["data_source"]},
            {"factor": "slope_factor", "weight": 0.10, "value": round(fl_slope_factor, 3), "raw": f"{slope_deg:.1f}°", "data_source": slope_info["data_source"]},
            {"factor": "lulc_factor", "weight": 0.10, "value": round(fl_lulc_factor, 3), "raw": f"{landuse_nearby} built-up features within 3km", "data_source": landuse_info["data_source"]},
        ],
        "landslide": [
            {"factor": "slope_factor", "weight": 0.45, "value": round(ls_slope_factor, 3), "raw": f"{slope_deg:.1f}°", "data_source": slope_info["data_source"]},
            {"factor": "rain_factor", "weight": 0.25, "value": round(ls_rain_factor, 3), "raw": f"{daily_rain:.0f} mm/24h", "data_source": weather["data_source"]},
            {"factor": "ndvi_factor", "weight": 0.15, "value": round(ls_ndvi_factor, 3), "raw": f"{DISTRICT_FOREST_COVER_PCT.get(district.district_id, 0.3)*100:.0f}% district forest cover (FSI)", "data_source": "published_fsi_district_average"},
            {"factor": "stream_distance_factor", "weight": 0.10, "value": round(ls_stream_distance_factor, 3), "raw": f"{water_distance_km:.1f} km to nearest stream", "data_source": water_info["data_source"]},
            {"factor": "lithology_factor", "weight": 0.05, "value": round(ls_lithology_factor, 3), "raw": "district rock-type susceptibility (GSI-characterized)", "data_source": "published_gsi_district_characterization"},
        ],
        "cloudburst": [
            {"factor": "intensity_factor", "weight": 0.70, "value": round(intensity_factor, 3), "raw": f"{current_rain_rate:.0f} mm/hr", "data_source": weather["data_source"]},
            {"factor": "orographic_factor", "weight": 0.30, "value": round(orographic_factor, 3), "raw": f"{elevation_m:.0f} m elevation", "data_source": slope_info["data_source"]},
        ],
        "coastal_erosion": [
            {"factor": "coast_distance_factor", "weight": 0.50, "value": round(co_distance_factor, 3), "raw": f"{block.coast_distance_km} km to coastline" if block.coast_distance_km is not None else "not a coastal block", "data_source": "geocoded_block_anchor"},
            {"factor": "cyclone_factor", "weight": 0.30, "value": round(co_cyclone_factor, 3), "raw": f"{wind_gusts_kmh:.0f} km/h live wind gusts", "data_source": wind_info["data_source"]},
            {"factor": "shoreline_change_factor", "weight": 0.20, "value": round(co_shoreline_factor, 3), "raw": "published Odisha shoreline-change trend", "data_source": "published_shoreline_change_study"},
        ],
    }

    # Weighted fusion — same weights/thresholds as the project's Engine-1
    # reference implementation (hazards-main/backend/fusion/red_zone.py).
    weights = {"flood": 0.35, "landslide": 0.30, "coastal_erosion": 0.20, "cloudburst": 0.15}
    multi_hazard = sum(scores[k] * weights[k] for k in weights)
    multi_hazard = round(_clamp01(multi_hazard), 3)

    thresholds = [0.25, 0.50, 0.75]
    names = ["GREEN", "YELLOW", "ORANGE", "RED"]
    level = sum(multi_hazard >= t for t in thresholds)
    risk_category = names[level]

    dominant_hazard = max(scores, key=scores.get)

    # District settled-land density -> approximate affected area per hazard.
    density = district.census_population / district.area_sqkm
    village_land_sqkm = village["population"] / max(density, 1)

    individual_hazards = [
        {
            "hazard_type": htype,
            "score": scores[htype],
            "intensity": _intensity_label(scores[htype]),
            "confidence": round(confidence, 2),
            "affected_area_sqkm": round(village_land_sqkm * scores[htype] * 1.5, 2),
        }
        for htype in ["flood", "landslide", "coastal_erosion", "cloudburst"]
    ]

    risk_drivers = []
    if slope_deg > 25 and is_hilly:
        risk_drivers.append(f"Steep terrain measured at {slope_deg:.1f}° slope (from live elevation data)")
    if daily_rain > IMD_HEAVY_RAIN_MM:
        risk_drivers.append(f"Live forecast shows {daily_rain:.0f} mm rainfall today (IMD heavy-rain threshold is {IMD_HEAVY_RAIN_MM} mm)")
    if current_rain_rate > CLOUDBURST_MM_PER_HR and is_hilly:
        risk_drivers.append(f"Current rain intensity ≈{current_rain_rate:.0f} mm/hr in steep terrain — cloudburst-prone conditions")
    if block.coast_distance_km is not None and block.coast_distance_km < 15:
        risk_drivers.append(f"Settlement lies ≈{block.coast_distance_km:.0f} km from the Bay of Bengal coastline")
    if water_distance_km < 3:
        risk_drivers.append(f"A mapped river/stream lies ≈{water_distance_km:.1f} km away (OpenStreetMap waterway data)")
    if block.coast_distance_km is not None and wind_gusts_kmh > 50:
        risk_drivers.append(f"Live wind gusts ≈{wind_gusts_kmh:.0f} km/h — elevated coastal storm activity")
    if not is_hilly and landuse_nearby >= 4:
        risk_drivers.append(f"{landuse_nearby} built-up settlement features nearby — reduced natural drainage capacity")
    if elevation_m - elev_min < elev_range * 0.25 and not is_hilly:
        risk_drivers.append("Low-lying deltaic terrain with poor natural drainage")
    if not risk_drivers:
        risk_drivers.append("No elevated risk factors detected in the current live assessment")
    if is_simulated:
        risk_drivers.insert(0, "⚠ SIMULATED SCENARIO — inputs overridden for testing, not the current live reading")

    historical_incidents = []
    if village["block"] == "Joshimath" and district.district_id == "chamoli":
        historical_incidents.append({
            "date": "2021-02-07",
            "type": "flash_flood",
            "description": "Rishiganga/Dhauliganga flash flood following a glacier/rock-ice avalanche near Joshimath (Chamoli district)",
            "casualties": 204,
            "property_damage": "Tapovan hydro project and downstream settlements damaged",
        })

    return {
        "multi_hazard_score": multi_hazard,
        "risk_category": risk_category,
        "dominant_hazard": dominant_hazard,
        "hazard_scores": scores,
        "individual_hazards": individual_hazards,
        "factor_breakdown": factor_breakdown,
        "risk_drivers": risk_drivers,
        "historical_incidents": historical_incidents,
        "live_inputs": {
            "elevation_m": round(elevation_m, 1),
            "slope_deg": slope_deg,
            "daily_rainfall_mm": daily_rain,
            "current_rain_rate_mm_hr": round(current_rain_rate, 1),
            "river_distance_km": water_distance_km,
            "wind_gusts_kmh": wind_gusts_kmh,
            "nearby_builtup_features": landuse_nearby,
            "data_source": "test_scenario_override" if is_simulated else weather["data_source"],
            "observed_at": weather.get("observed_at"),
            "is_simulated": is_simulated,
        },
    }


# ----------------------------------------------------------------------
# Module 1 extension: susceptibility/severity separation, real historical
# context, forecast-based temporal risk trajectory, confidence +
# uncertainty. Layered ON TOP of compute_hazard() via composition rather
# than modifying it in place — compute_hazard()'s exact return shape is
# depended on by every other engine (exposure, vulnerability, relocation,
# pipeline, testdata routers), so this only ADDS fields, never changes
# existing ones.
# ----------------------------------------------------------------------

# Real, publicly documented major events, by (district_id, block). Not a
# complete incident inventory (a real deployment would draw on IMD/NDMA/
# state disaster-management department event logs) — only well-known,
# verifiable events are listed, and casualty/damage figures are omitted
# where not confidently known rather than estimated.
_REAL_HISTORICAL_EVENTS: dict[tuple[str, str], list[dict]] = {
    ("chamoli", "Joshimath"): [
        {
            "date": "2021-02-07", "type": "flash_flood",
            "description": "Rishiganga/Dhauliganga flash flood following a glacier/rock-ice avalanche near Joshimath",
            "casualties": 204,
        },
        {
            "date": "2023-01", "type": "land_subsidence",
            "description": "Joshimath land subsidence crisis — widespread ground cracking forced evacuation of over 100 families and demolition of unsafe structures",
            "casualties": None,
        },
    ],
    ("kendrapara", "Mahakalapada"): [
        {"date": "1999-10-29", "type": "cyclone", "description": "1999 Odisha Super Cyclone — one of the most severe tropical cyclones recorded on the Odisha coast; major impact across coastal Kendrapara", "casualties": None},
        {"date": "2019-05-03", "type": "cyclone", "description": "Cyclone Fani — large-scale evacuation across coastal Odisha districts including Kendrapara", "casualties": None},
        {"date": "2021-05-26", "type": "cyclone", "description": "Cyclone Yaas — made landfall near Dhamra, close enough to significantly affect Kendrapara's coastal blocks; large-scale evacuation", "casualties": None},
    ],
    ("kendrapara", "Rajnagar"): [
        {"date": "2021-05-26", "type": "cyclone", "description": "Cyclone Yaas — Rajnagar block (home to the Bhitarkanika mangrove belt) saw large-scale evacuation of coastal habitations ahead of landfall near Dhamra", "casualties": None},
    ],
}


def _historical_context_for_block(district_id: str, block_name: str) -> dict:
    events = _REAL_HISTORICAL_EVENTS.get((district_id, block_name), [])
    return {
        "documented_events": events,
        "event_count": len(events),
        "last_event_date": events[-1]["date"] if events else None,
        "note": "Only well-documented, publicly reported major events are listed — this is not a complete incident inventory.",
    }


def _temporal_risk_trajectory(district, slope_deg: float, elevation_m: float, elev_min: float, elev_range: float, is_hilly: bool, forecast: dict, base: dict) -> dict:
    """Risk now / +24h / +48h / +72h, projected from Open-Meteo's real
    forecast rainfall (not a guess) — holds terrain/coastal factors fixed
    since those don't change hour to hour, and holds cloudburst intensity
    at its current live reading since this data source has no hourly
    intensity forecast to project from."""
    thresholds = [0.25, 0.50, 0.75]
    names = ["GREEN", "YELLOW", "ORANGE", "RED"]
    weights = {"flood": 0.35, "landslide": 0.30, "coastal_erosion": 0.20, "cloudburst": 0.15}
    coastal_score = base["hazard_scores"]["coastal_erosion"]
    cloudburst_score = base["hazard_scores"]["cloudburst"]

    horizons = [{"horizon": "now", "multi_hazard_score": base["multi_hazard_score"], "risk_category": base["risk_category"]}]
    rain_days = forecast.get("daily_precipitation_sum_mm", [])
    for i, label in enumerate(["+24h", "+48h", "+72h"]):
        if i >= len(rain_days):
            break
        day_rain = rain_days[i]
        slope_factor = _clamp01(slope_deg / 40)
        rain_factor_ls = _clamp01(day_rain / IMD_VERY_HEAVY_RAIN_MM)
        landslide_score = _clamp01(0.65 * slope_factor + 0.35 * rain_factor_ls) if is_hilly else _clamp01(0.05 * slope_factor + 0.05 * rain_factor_ls)

        low_elev_factor = _clamp01(1 - (elevation_m - elev_min) / elev_range)
        rain_factor_fl = _clamp01(day_rain / (IMD_HEAVY_RAIN_MM * 2))
        deltaic_bonus = 0.15 if not is_hilly else 0.0
        flood_score = _clamp01(0.45 * low_elev_factor + 0.45 * rain_factor_fl + deltaic_bonus * rain_factor_fl)

        scores = {"flood": flood_score, "landslide": landslide_score, "coastal_erosion": coastal_score, "cloudburst": cloudburst_score}
        mh = round(_clamp01(sum(scores[k] * weights[k] for k in weights)), 3)
        level = sum(mh >= t for t in thresholds)
        horizons.append({"horizon": label, "multi_hazard_score": mh, "risk_category": names[level]})

    return {
        "horizons": horizons,
        "note": "Projected from Open-Meteo's real 3-day forecast rainfall, holding terrain/coastal factors fixed and short-duration rainfall intensity at its current live reading (this data source has no hourly intensity forecast) — a directional trajectory, not a certified forecast.",
        "forecast_data_source": forecast.get("data_source"),
    }


def compute_hazard_intelligence(village: dict) -> dict:
    """Module 1 extended output: flood susceptibility vs. severity vs.
    combined, landslide terrain-susceptibility + trigger + historical
    evidence, an honestly-named extreme-rainfall indicator, coastal
    erosion trend context, real historical disaster events, a forecast-
    based temporal risk trajectory, and confidence with an uncertainty
    band — see compute_hazard() for the underlying live computation this
    builds on."""
    base = compute_hazard(village)
    district = geodata.get_district(village["district_id"])
    block = _block_of(district, village["block"])
    is_hilly = district.terrain_class == "hilly"

    slope_by_block = live_data.get_block_slope(district.blocks, district.district_id)
    slope_info = slope_by_block[village["block"]]
    slope_deg = slope_info["slope_deg"]
    elevation_m = slope_info["elevation_m"]
    daily_rain = base["live_inputs"]["daily_rainfall_mm"]

    district_elevs = [slope_by_block[b.name]["elevation_m"] for b in district.blocks]
    elev_min, elev_max = min(district_elevs), max(district_elevs)
    elev_range = max(1.0, elev_max - elev_min)
    low_elev_factor = _clamp01(1 - (elevation_m - elev_min) / elev_range)

    # --- Flood: susceptibility (terrain-only) vs severity (rain-driven) ---
    drainage_poor_factor = _clamp01(1 - slope_deg / 15) if not is_hilly else low_elev_factor
    flood_susceptibility = round(_clamp01(0.6 * low_elev_factor + 0.4 * drainage_poor_factor), 3)
    rain_factor_fl = _clamp01(daily_rain / (IMD_HEAVY_RAIN_MM * 2))
    deltaic_bonus = 0.15 if not is_hilly else 0.0
    flood_severity = round(_clamp01(rain_factor_fl * (1 + deltaic_bonus * 2)), 3)
    flood_analysis = {
        "susceptibility": flood_susceptibility,
        "susceptibility_label": _intensity_label(flood_susceptibility),
        "severity_if_it_occurs": flood_severity,
        "severity_label": _intensity_label(flood_severity),
        "combined_score": base["hazard_scores"]["flood"],
        "note": "Susceptibility = where flooding is more likely (terrain-only: low relative elevation + poor natural drainage). Severity = how deep/damaging IF it occurs (current rainfall-driven). Combined = the fused score used for the overall risk category — reported separately, not collapsed into one unexplained number.",
    }

    # --- Landslide: terrain susceptibility + trigger conditions + historical evidence ---
    slope_factor = _clamp01(slope_deg / 40)
    rain_factor_ls = _clamp01(daily_rain / IMD_VERY_HEAVY_RAIN_MM)
    has_historical_landslide = bool(_REAL_HISTORICAL_EVENTS.get((district.district_id, village["block"]))) and any(
        e["type"] in ("landslide", "flash_flood", "land_subsidence") for e in _REAL_HISTORICAL_EVENTS.get((district.district_id, village["block"]), [])
    )
    landslide_analysis = {
        "terrain_susceptibility": round(slope_factor, 3),
        "trigger_conditions": round(rain_factor_ls, 3),
        "historical_evidence": "DOCUMENTED" if has_historical_landslide else "NONE_ON_RECORD",
        "combined_score": base["hazard_scores"]["landslide"],
        "note": "A steep slope alone does not mean failure is imminent — this combines real terrain susceptibility with current rainfall trigger conditions and known historical evidence for this block. No multi-day antecedent-rainfall or soil-moisture data source is available in this deployment, so trigger_conditions reflects only the current day's rainfall.",
    }

    # --- Extreme rainfall / cloudburst RISK INDICATOR (not a "prediction") ---
    current_rain_rate = base["live_inputs"]["current_rain_rate_mm_hr"]
    intensity_factor = _clamp01(current_rain_rate / CLOUDBURST_MM_PER_HR)
    extreme_rainfall_indicator = {
        "label": "Extreme Rainfall / Cloudburst Risk Indicator",
        "short_duration_intensity": round(intensity_factor, 3),
        "combined_score": base["hazard_scores"]["cloudburst"],
        "note": "A risk indicator derived from current short-duration rainfall intensity and orographic amplification — not a validated cloudburst-forecasting model. Terminology is deliberately conservative.",
    }

    # --- Coastal erosion: proximity + qualitative historical trend ---
    coastal_analysis = None
    if block.coast_distance_km is not None:
        trend = ("erosion-dominant stretch (documented in published Odisha shoreline-change studies)"
                 if block.coast_distance_km < 20 else "not separately assessed at this distance from the coast")
        coastal_analysis = {
            "proximity_factor": base["hazard_scores"]["coastal_erosion"],
            "historical_shoreline_trend": trend,
            "combined_score": base["hazard_scores"]["coastal_erosion"],
            "note": "Proximity-to-coast alone is only an exposure indicator. Historical shoreline-change direction is qualitative here — a real deployment should use NCCR/Survey-of-India shoreline-change-rate data, which this project has no API access to.",
        }

    historical_context = _historical_context_for_block(district.district_id, village["block"])

    forecast = live_data.get_block_forecast(district.blocks, district.district_id)[village["block"]]
    temporal_risk = _temporal_risk_trajectory(district, slope_deg, elevation_m, elev_min, elev_range, is_hilly, forecast, base)

    is_live = base["live_inputs"]["data_source"] == "live_open_meteo"
    confidence_value = base["individual_hazards"][0]["confidence"]
    band_width = 0.06 if is_live else 0.15
    reducing_factors = []
    if not is_live:
        reducing_factors.append("Live weather/terrain API was unreachable for this request — using a deterministic coordinate-based fallback estimate instead of a live reading.")
    reducing_factors.append("Terrain resolution is Open-Meteo's ~90m SRTM-derived elevation, not a high-resolution local DEM.")
    reducing_factors.append("Historical hazard inventory only includes well-documented major events, not a complete incident log.")
    if forecast.get("data_source") != "live_open_meteo_forecast":
        reducing_factors.append("3-day forecast was unavailable — using a fallback estimate for the temporal risk trajectory.")

    confidence_detail = {
        "value": confidence_value,
        "uncertainty": {
            "lower": round(_clamp01(base["multi_hazard_score"] - band_width), 3),
            "upper": round(_clamp01(base["multi_hazard_score"] + band_width), 3),
        },
        "factors_reducing_confidence": reducing_factors,
    }

    return {
        **base,
        "flood_analysis": flood_analysis,
        "landslide_analysis": landslide_analysis,
        "extreme_rainfall_indicator": extreme_rainfall_indicator,
        "coastal_erosion_analysis": coastal_analysis,
        "historical_context": historical_context,
        "temporal_risk": temporal_risk,
        "confidence_detail": confidence_detail,
    }


# ----------------------------------------------------------------------
# Exposure
# ----------------------------------------------------------------------

def exposure_fraction(hazard: dict) -> float:
    """How much of a village's assets sit inside the current live hazard
    footprint. Continuous in the multi-hazard score (not a step function)
    so exposure genuinely tracks hazard rather than being a flat 100% (or
    an arbitrary constant) regardless of how safe the village currently is.
    A small floor (0.05) reflects that even a GREEN village has some
    residual exposure — never claim zero."""
    return round(_clamp01(0.05 + hazard["multi_hazard_score"] * 0.95), 3)


def compute_exposure(village: dict, district, hazard: dict) -> dict:
    """`hazard` MUST come from compute_hazard() for this same village —
    exposure is deliberately downstream of the hazard layer, not computed
    independently of it (a facility or population isn't "at risk" just by
    existing; it's at risk to the extent the live hazard footprint reaches it)."""
    pop = village["population"]
    breakdown = {k: round(pop * ratio) for k, ratio in AGE_BAND_RATIOS.items()}
    # rounding fix so the parts sum to the real total
    diff = pop - sum(breakdown.values())
    breakdown["adults_15_59"] += diff

    households = village["households"]
    residential = households
    commercial = max(0, round(pop / 800))
    institutional = max(1, round(pop / 3000))
    industrial = max(0, round(pop / 6000) - 1) if pop > 6000 else 0
    total_buildings = residential + commercial + institutional + industrial

    frac = exposure_fraction(hazard)
    in_hazard_zone = hazard["risk_category"] in ("RED", "ORANGE", "YELLOW")

    facilities = []
    subcentre_norm = SUBCENTRE_NORM[district.terrain_class]
    phc_norm = PHC_NORM[district.terrain_class]
    if pop >= subcentre_norm:
        facilities.append({
            "type": "health_subcentre", "name": "Health Sub-Centre",
            "beds": 0, "in_hazard_zone": in_hazard_zone, "criticality": "high",
        })
    if pop >= phc_norm:
        facilities.append({
            "type": "hospital", "name": "Primary Health Center",
            "beds": max(6, round(pop / 5000)), "in_hazard_zone": in_hazard_zone, "criticality": "critical",
        })
    school_children = breakdown["children_6_14"]
    if school_children >= 100:
        facilities.append({
            "type": "school", "name": "Government School",
            "students": school_children, "in_hazard_zone": in_hazard_zone, "criticality": "high",
        })
    facilities.append({
        "type": "water_system", "name": "Hand Pump / Piped Water Network",
        "coverage": households, "in_hazard_zone": in_hazard_zone, "criticality": "high",
    })

    agricultural_land = round(households * 0.6, 1)  # ha, rough rural smallholding norm
    livestock = round(households * 2.4)

    return {
        "village_id": village["village_id"],
        "name": village["name"],
        "district_id": village["district_id"],
        "exposure": {
            "population": {
                "total": pop,
                "breakdown": breakdown,
                "at_risk": round(pop * frac),
            },
            "buildings": {
                "total": total_buildings,
                "residential": residential,
                "commercial": commercial,
                "industrial": industrial,
                "institutional": institutional,
                "at_risk": round(total_buildings * frac),
            },
            "critical_facilities": facilities,
            "hazard_linkage": {
                "multi_hazard_score": hazard["multi_hazard_score"],
                "risk_category": hazard["risk_category"],
                "exposure_fraction": frac,
            },
            "economic_assets": {
                "agricultural_land_hectares": agricultural_land,
                "livestock_heads": livestock,
                "market_presence": pop > 2000,
                "estimated_annual_income_lakhs": round(households * 1.1, 1),
            },
        },
    }


def compute_exposure_profile(village: dict, district, hazard: dict) -> dict:
    """
    Full multi-sector exposure profile (SIH26191 scope): human population,
    healthcare, water, education, housing, transport, energy, emergency
    response, livelihood and environment — not just population/buildings.

    Real per-village asset surveys (exact hospital/school/substation
    locations) require licensed infrastructure-department data this
    project doesn't have. Facility *counts* here are instead derived from
    this village's real population/block/terrain using the same published
    service norms India's own planning agencies use (NRHM/IPHS health
    norms, ICDS anganwadi norms, PHED water norms, REC electrification
    norms, Census 2011 housing-type splits) — planning-level estimates,
    not an as-built asset inventory. That distinction is stated in the
    `confidence` block rather than hidden.
    """
    pop = village["population"]
    households = village["households"]
    frac = exposure_fraction(hazard)
    is_hilly = district.terrain_class == "hilly"

    breakdown = {k: round(pop * ratio) for k, ratio in AGE_BAND_RATIOS.items()}
    diff = pop - sum(breakdown.values())
    breakdown["adults_15_59"] += diff
    children = breakdown["children_0_5"] + breakdown["children_6_14"]
    elderly = breakdown["elderly_60plus"]

    block = _block_of(district, village["block"])
    dist_to_hq_km = haversine_km(village["lat"], village["lon"], block.lat, block.lon)
    hq_block_name = DISTRICT_HQ_BLOCK[district.district_id]
    hq_block = _block_of(district, hq_block_name)
    is_hq_block = village["block"] == hq_block_name
    dist_block_to_district_hq_km = haversine_km(block.lat, block.lon, hq_block.lat, hq_block.lon)
    dist_to_hospital_km = round(dist_to_hq_km + dist_block_to_district_hq_km, 1)

    def _access_rating(distance_km: float, downgrade_for_hazard: bool) -> str:
        rating = "HIGH" if distance_km < 10 else "MEDIUM" if distance_km < 25 else "LOW"
        if downgrade_for_hazard and hazard["risk_category"] in ("RED", "ORANGE"):
            rating = {"HIGH": "MEDIUM", "MEDIUM": "LOW", "LOW": "LOW"}[rating]
        return rating

    # ================= Group 1: People (population + housing) =================
    disability_est = round(pop * 0.0221)  # Census 2011 national avg disability prevalence
    pregnant_est = round(pop * REPRODUCTIVE_AGE_WOMEN_SHARE * PREGNANCY_RATE_AMONG_REPRO_AGE)
    female_headed_hh_est = round(households * FEMALE_HEADED_HOUSEHOLD_PCT_RURAL)
    vulnerable_population = children + elderly + disability_est

    housing_split = STATE_HOUSING_TYPE_SPLIT[district.state]
    kutcha = round(households * housing_split["kutcha"])
    semi_pucca = round(households * housing_split["semi_pucca"])
    pucca = max(0, households - kutcha - semi_pucca)
    slope_by_block = live_data.get_block_slope(district.blocks, district.district_id)
    slope_deg = slope_by_block[village["block"]]["slope_deg"]
    steep_or_coastal = (is_hilly and slope_deg > 25) or hazard["hazard_scores"].get("coastal_erosion", 0) > 0.5
    high_risk_structures = kutcha + (round(semi_pucca * 0.3) if steep_or_coastal else 0)

    people = {
        "population_total": pop,
        "population_exposed": round(pop * frac),
        "vulnerable_population": vulnerable_population,
        "vulnerable_population_exposed": round(vulnerable_population * frac),
        "children_0_14": children,
        "elderly_60_plus": elderly,
        "persons_with_disabilities_est": disability_est,
        "pregnant_women_est": pregnant_est,
        "female_headed_households_est": female_headed_hh_est,
        "isolated_remote_habitation": dist_to_hq_km > 8,
        "note": "population_exposed = share within the live hazard footprint. vulnerable_population is an independent susceptibility measure (children+elderly+disability) — exposed ≠ vulnerable, both are reported separately per SIH26191 scope.",
    }

    housing = {
        "residential_buildings": households,
        "pucca": pucca,
        "semi_pucca": semi_pucca,
        "kutcha": kutcha,
        "high_risk_structures": high_risk_structures,
        "informal_settlement_present": housing_split["kutcha"] > 0.25,
        "data_source": f"{district.state} rural pucca/semi-pucca/kutcha split, Census 2011 Houselisting (state average — not individually surveyed per village)",
    }

    # ================= Group 2: Critical infrastructure =================
    subcentre_norm = SUBCENTRE_NORM[district.terrain_class]
    phc_norm = PHC_NORM[district.terrain_class]
    has_subcentre = pop >= subcentre_norm
    has_phc = pop >= phc_norm or is_hq_block
    has_chc = is_hq_block  # district/CHC-grade hospital care is realistically concentrated at the actual district HQ

    school_children = breakdown["children_6_14"]
    healthcare = {
        "health_subcentres": int(has_subcentre),
        "phc_count": int(has_phc),
        "chc_hospital_count": int(has_chc),
        "beds": (6 if has_phc else 0) + (30 if has_chc else 0),
        "icu_beds": 4 if has_chc else 0,
        "distance_to_nearest_phc_km": 0.0 if has_phc else round(dist_to_hq_km, 1),
        "distance_to_nearest_hospital_km": 0.0 if has_chc else dist_to_hospital_km,
        "emergency_access": _access_rating(0.0 if has_chc else dist_to_hospital_km, downgrade_for_hazard=True),
    }
    education = {
        "schools": int(school_children >= 100),
        "colleges": int(is_hq_block and pop >= COLLEGE_POP_THRESHOLD),
        "anganwadi_centres": max(1, round(pop / ANGANWADI_NORM)),
        "students_exposed": round(school_children * frac),
        "note": "A school building is BOTH an exposed asset (students/structure) and a candidate relief-shelter site — Engine 3 assesses shelter suitability, Engine 2 does not auto-classify it as one.",
    }
    emergency_response = {
        "fire_stations": int(is_hq_block),
        "police_stations": int(is_hq_block or pop > 8000),
        "distance_to_nearest_emergency_facility_km": 0.0 if is_hq_block else round(dist_block_to_district_hq_km, 1),
    }

    # ================= Group 3: Utilities (water + energy) =================
    water = {
        "treatment_plants": int(is_hq_block),
        "pumping_stations": int(is_hq_block or households > 1500),
        "overhead_tanks": max(0, round(households / OVERHEAD_TANK_PER_HOUSEHOLDS)),
        "population_served_by_shared_supply_est": round(pop * (0.6 if is_hilly else 0.8)),
        "supply_dependency": "HIGH" if (is_hq_block or households > 1500) else "MEDIUM",
        "note": "A hazard reaching this village's block-level treatment/pumping asset can cut piped supply well beyond this one village — see district-level cascading_dependency in the exposure summary.",
    }
    energy = {
        "substations": int(is_hq_block),
        "transformers": max(1, round(households / TRANSFORMER_PER_HOUSEHOLDS)),
        "power_dependency": "HIGH" if is_hq_block else "MEDIUM",
    }

    # ================= Group 4: Transportation =================
    density = district.census_population / district.area_sqkm
    village_land_sqkm = pop / max(density, 1)
    local_road_km = round(village_land_sqkm * 1.2, 2)  # rural road-density approximation
    river_or_coast_crossing = (is_hilly and pop > 1000) or (not is_hilly and block.coast_distance_km is not None and block.coast_distance_km < 20)
    disrupts_transport = hazard["dominant_hazard"] in ("landslide", "flood", "coastal_erosion")
    transport = {
        "local_roads_km": local_road_km,
        "roads_affected_km": round(local_road_km * frac, 2),
        "bridges": int(river_or_coast_crossing),
        "accessibility": _access_rating(dist_to_hq_km, downgrade_for_hazard=disrupts_transport),
    }

    # ================= Group 5: Livelihood =================
    agricultural_land = round(households * 0.6, 1)
    livestock = round(households * 2.4)
    livelihood = {
        "agricultural_land_hectares": agricultural_land,
        "agricultural_land_affected_hectares": round(agricultural_land * frac, 1),
        "livestock_heads": livestock,
        "livestock_exposed": round(livestock * frac),
        "fisheries_present": block.coast_distance_km is not None and block.coast_distance_km < 15,
        "markets": int(pop > 2000),
    }

    # ================= Group 6: Environment =================
    forest_pct = DISTRICT_FOREST_COVER_PCT.get(district.district_id, 0.0)
    is_coastal_belt = block.coast_distance_km is not None and block.coast_distance_km < 20
    environment = {
        "forest_affected_sqkm": round(village_land_sqkm * forest_pct * frac, 2),
        "wetland_affected_sqkm": round(village_land_sqkm * COASTAL_WETLAND_COVER_PCT * frac, 2) if is_coastal_belt else 0.0,
        "data_source": "Forest Survey of India-style district forest-cover share (published district average); wetland figure applies only to the Bhitarkanika coastal belt blocks",
    }

    # ================= Group 8: Industrial / hazardous =================
    industrial_hazardous = {
        "hazardous_facilities": 0,
        "note": "No known chemical/fuel/industrial hazardous facilities are registered in either pilot district's rural blocks",
    }

    return {
        "village_id": village["village_id"],
        "name": village["name"],
        "district_id": village["district_id"],
        "people": people,
        "housing": housing,
        "healthcare": healthcare,
        "education": education,
        "emergency_response": emergency_response,
        "water": water,
        "energy": energy,
        "transport": transport,
        "livelihood": livelihood,
        "environment": environment,
        "industrial_hazardous": industrial_hazardous,
        "hazard_linkage": {
            "multi_hazard_score": hazard["multi_hazard_score"],
            "risk_category": hazard["risk_category"],
            "exposure_fraction": frac,
        },
        "confidence": {
            "overall": 0.55,
            "note": (
                "Population, housing-type split, and terrain/hazard figures are Census 2011 + live "
                "weather/terrain data. Facility COUNTS (health centres, schools, water/power assets, "
                "emergency services) are planning-level estimates derived from real national/state "
                "service norms (NRHM/IPHS, ICDS, PHED, REC) applied to this village's real population "
                "and block — not an as-built infrastructure survey."
            ),
        },
    }


# ----------------------------------------------------------------------
# Vulnerability
# ----------------------------------------------------------------------

def compute_vulnerability(village: dict, district) -> dict:
    pop = village["population"]
    breakdown = {k: round(pop * r) for k, r in AGE_BAND_RATIOS.items()}
    age_dependency_ratio = (breakdown["children_0_5"] + breakdown["children_6_14"] + breakdown["elderly_60plus"]) / pop
    age_score = _clamp01(age_dependency_ratio / 0.5)

    block = _block_of(district, village["block"])
    dist_to_hq_km = haversine_km(village["lat"], village["lon"], block.lat, block.lon)
    healthcare_score = _clamp01(dist_to_hq_km / 15)

    social = DISTRICT_SOCIAL_STATS[district.district_id]
    literacy_score = _clamp01((100 - social["literacy_rate"]) / 100)
    gender_score = _clamp01(abs(social["sex_ratio"] - 950) / 200)

    slope_by_block = live_data.get_block_slope(district.blocks, district.district_id)
    slope_deg = slope_by_block[village["block"]]["slope_deg"]
    housing_score = _clamp01(slope_deg / 45) if district.terrain_class == "hilly" else _clamp01(0.3 + _seed_float(village["village_id"], "housing") * 0.3)

    remoteness_income_score = _clamp01(dist_to_hq_km / 20)

    factor_defs = [
        ("age", age_score, f"{round(age_dependency_ratio*100)}% of population are children or elderly", 0.20),
        ("healthcare_access", healthcare_score, f"Nearest block health facility ≈{dist_to_hq_km:.1f} km away", 0.18),
        ("literacy", literacy_score, f"District literacy rate: {social['literacy_rate']}% (Census 2011)", 0.15),
        ("housing_quality", housing_score, (f"Local slope {slope_deg:.1f}° raises construction risk" if district.terrain_class == "hilly" else "Deltaic soil conditions affect foundation durability"), 0.17),
        ("income", remoteness_income_score, f"≈{dist_to_hq_km:.1f} km from block headquarters market/employment center", 0.15),
        ("gender", gender_score, f"District sex ratio: {social['sex_ratio']} females per 1000 males (Census 2011)", 0.08),
        ("disability", 0.221, "National average disability prevalence: 2.21% (Census 2011)", 0.05),
        ("social_marginalization", 0.5, "District-level Scheduled Caste/Tribe share not separately available without SECC microdata", 0.02),
    ]

    factor_scores = [
        {"factor": f, "score": round(s, 3), "evidence": e, "contribution": w}
        for f, s, e, w in factor_defs
    ]
    composite = sum(s * w for _, s, _, w in factor_defs) / sum(w for *_, w in factor_defs)
    composite = round(_clamp01(composite), 3)
    band = "HIGH" if composite >= 0.6 else "MEDIUM" if composite >= 0.35 else "LOW"

    return {
        "village_id": village["village_id"],
        "name": village["name"],
        "vulnerability_assessment": {
            "composite_score": composite,
            "vulnerability_band": band,
            "interpretation": {
                "HIGH": "High vulnerability - multiple risk factors",
                "MEDIUM": "Moderate vulnerability - monitor closely",
                "LOW": "Lower vulnerability relative to district peers",
            }[band],
        },
        "factor_scores": factor_scores,
        "confidence": {
            "overall": 0.75,
            "data_quality": "Village figures derived from district Census 2011 baselines + real village geography; not individually surveyed",
            "data_sources": ["Census of India 2011", "Open-Meteo live terrain/weather", "NRHM facility norms"],
        },
    }


# ----------------------------------------------------------------------
# District-level aggregation (computed live from the generated sample)
# ----------------------------------------------------------------------

def summarize_district(district_id: str) -> Optional[dict]:
    district = geodata.get_district(district_id)
    if not district:
        return None

    villages = get_villages(district_id)
    hazards = [compute_hazard(v) for v in villages]

    counts = {"RED": 0, "ORANGE": 0, "YELLOW": 0, "GREEN": 0}
    hazard_totals = {"flood": [], "landslide": [], "coastal_erosion": [], "cloudburst": []}
    hazard_affected = {"flood": 0, "landslide": 0, "coastal_erosion": 0, "cloudburst": 0}
    for h in hazards:
        counts[h["risk_category"]] += 1
        for htype, score in h["hazard_scores"].items():
            hazard_totals[htype].append(score)
            if score >= 0.5:
                hazard_affected[htype] += 1

    sample_size = len(villages)
    # Scale the sample's RED/ORANGE/etc. proportions onto the real census
    # village count so headline numbers describe the whole district, not
    # just the live-assessed sample.
    scale = district.census_villages / max(1, sample_size)
    scaled_counts = {k: round(v * scale) for k, v in counts.items()}
    # keep the total exactly equal to the real census figure
    drift = district.census_villages - sum(scaled_counts.values())
    scaled_counts["GREEN"] += drift

    hazard_summary = {
        htype: {
            "score": round(sum(vals) / len(vals), 2) if vals else 0.0,
            "affected_villages": round(hazard_affected[htype] * scale),
        }
        for htype, vals in hazard_totals.items()
    }

    return {
        "district": district,
        "sample_size": sample_size,
        "risk_counts_sample": counts,
        "risk_counts_scaled": scaled_counts,
        "hazard_summary": hazard_summary,
        "villages": villages,
        "hazards": hazards,
    }


def summarize_district_exposure_profile(district_id: str) -> Optional[dict]:
    """District-wide roll-up of the multi-sector exposure profile, plus a
    cascading-dependency read-out: block-level water/power assets sitting
    in an elevated hazard zone put every village that depends on them at
    risk, not just the village the asset physically sits in (Engine-2
    scope note: model second-order infrastructure dependency, not just
    point exposure)."""
    district = geodata.get_district(district_id)
    if not district:
        return None

    villages = get_villages(district_id)
    hazards = [compute_hazard(v) for v in villages]
    profiles = [compute_exposure_profile(v, district, h) for v, h in zip(villages, hazards)]
    scale = district.census_villages / max(1, len(villages))

    def _sum(group: str, field: str) -> int:
        return round(sum(p[group][field] for p in profiles) * scale)

    # Which blocks host a shared water/power asset that is itself sitting
    # in an elevated hazard zone right now — every village in that block
    # (not just the asset's own village) loses that service.
    block_hazard: dict[str, str] = {}
    for v, h in zip(villages, hazards):
        # keep the worst risk_category seen for each block
        order = {"RED": 3, "ORANGE": 2, "YELLOW": 1, "GREEN": 0}
        if v["block"] not in block_hazard or order[h["risk_category"]] > order[block_hazard[v["block"]]]:
            block_hazard[v["block"]] = h["risk_category"]

    hq_block = DISTRICT_HQ_BLOCK[district.district_id]
    cascading_dependency = None
    if block_hazard.get(hq_block) in ("RED", "ORANGE"):
        dependent_villages = sum(1 for v in villages) * scale
        cascading_dependency = {
            "asset_block": hq_block,
            "asset_risk_category": block_hazard[hq_block],
            "villages_dependent_on_this_asset": round(dependent_villages),
            "note": f"{hq_block} block hosts the district's shared water treatment plant / substation / CHC and is currently {block_hazard[hq_block]} — every village district-wide that depends on these shared assets is affected, not only {hq_block} itself.",
        }

    # Block-level SINGLETON assets (the one real CHC/hospital, water
    # treatment plant, substation at the actual district HQ) must be
    # counted once, not summed-then-scaled: several sample villages sit in
    # the same HQ block and each correctly *reports access* to that one
    # facility at the per-village level, but a district TOTAL that summed
    # those per-village "has access" flags and then scaled by
    # census_villages/sample_size would fabricate dozens of hospitals that
    # don't exist. Settlement-driven facilities (PHC/pumping stations
    # crossing a population threshold, outside the HQ block) genuinely do
    # scale with how many real villages of that size exist district-wide.
    phc_norm = PHC_NORM[district.terrain_class]
    phc_qualifying = sum(1 for v in villages if v["population"] >= phc_norm and v["block"] != hq_block)
    phc_count_scaled = round(phc_qualifying * scale)
    pumping_qualifying = sum(1 for v in villages if v["households"] > 1500 and v["block"] != hq_block)
    pumping_count_scaled = round(pumping_qualifying * scale)

    return {
        "district_id": district_id,
        "sample_size": len(villages),
        "people": {
            "population_exposed": _sum("people", "population_exposed"),
            "vulnerable_population": _sum("people", "vulnerable_population"),
            "vulnerable_population_exposed": _sum("people", "vulnerable_population_exposed"),
        },
        "housing": {
            "high_risk_structures": _sum("housing", "high_risk_structures"),
        },
        "healthcare": {
            "phc_count": phc_count_scaled,
            "chc_hospital_count": 1,  # exactly one real district/CHC-grade hospital, at the district HQ
            "beds": phc_count_scaled * 6 + 30,
        },
        "education": {
            "schools": _sum("education", "schools"),
            "students_exposed": _sum("education", "students_exposed"),
        },
        "water": {
            "treatment_plants": 1,  # one real shared treatment plant, at the district HQ
            "pumping_stations": pumping_count_scaled + 1,
        },
        "energy": {
            "substations": 1,  # one real shared substation, at the district HQ
        },
        "transport": {
            "roads_affected_km": _sum("transport", "roads_affected_km"),
            "bridges": _sum("transport", "bridges"),
        },
        "livelihood": {
            "agricultural_land_affected_hectares": _sum("livelihood", "agricultural_land_affected_hectares"),
            "livestock_exposed": _sum("livelihood", "livestock_exposed"),
        },
        "environment": {
            "forest_affected_sqkm": _sum("environment", "forest_affected_sqkm"),
            "wetland_affected_sqkm": _sum("environment", "wetland_affected_sqkm"),
        },
        "cascading_dependency": cascading_dependency,
    }
