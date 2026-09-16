"""
Tests for the village generation + hazard/exposure/vulnerability engine.

The hazard-formula tests are the most important ones here: they pin down
the exact weighted formulas (see PROJECT_RESEARCH-derived weights) so a
future change to village_engine.compute_hazard can't silently drift the
weights without a test failing.
"""

import math

import pytest

from app.core import geodata, village_engine

CHAMOLI = geodata.get_district("chamoli")
KENDRAPARA = geodata.get_district("kendrapara")


# ----------------------------------------------------------------------
# Village generation
# ----------------------------------------------------------------------

def test_villages_are_generated_for_both_districts():
    assert len(village_engine.get_villages("chamoli")) > 0
    assert len(village_engine.get_villages("kendrapara")) > 0


def test_village_generation_is_deterministic():
    first = village_engine.get_villages("chamoli")
    second = village_engine.get_villages("chamoli")
    assert [v["village_id"] for v in first] == [v["village_id"] for v in second]


def test_every_village_belongs_to_a_real_block():
    block_names = {b.name for b in CHAMOLI.blocks}
    for v in village_engine.get_villages("chamoli"):
        assert v["block"] in block_names


def test_village_population_and_households_are_positive():
    for v in village_engine.get_villages("kendrapara"):
        assert v["population"] > 0
        assert v["households"] > 0


# ----------------------------------------------------------------------
# Hazard formula weights — pins the exact weighted formulas
# ----------------------------------------------------------------------

FLOOD_WEIGHTS = {
    "rain_factor": 0.35, "low_elevation_factor": 0.25, "river_distance_factor": 0.20,
    "slope_factor": 0.10, "lulc_factor": 0.10,
}
LANDSLIDE_WEIGHTS = {
    "slope_factor": 0.45, "rain_factor": 0.25, "ndvi_factor": 0.15,
    "stream_distance_factor": 0.10, "lithology_factor": 0.05,
}
CLOUDBURST_WEIGHTS = {"intensity_factor": 0.70, "orographic_factor": 0.30}
COASTAL_WEIGHTS = {"coast_distance_factor": 0.50, "cyclone_factor": 0.30, "shoreline_change_factor": 0.20}


@pytest.fixture(scope="module")
def sample_hazard():
    village = village_engine.get_villages("chamoli")[0]
    return village_engine.compute_hazard(village)


def test_hazard_scores_cover_all_four_types(sample_hazard):
    assert set(sample_hazard["hazard_scores"]) == {"flood", "landslide", "coastal_erosion", "cloudburst"}


def test_hazard_scores_are_normalized(sample_hazard):
    for score in sample_hazard["hazard_scores"].values():
        assert 0.0 <= score <= 1.0


def test_multi_hazard_score_is_normalized(sample_hazard):
    assert 0.0 <= sample_hazard["multi_hazard_score"] <= 1.0


def test_risk_category_is_one_of_four_bands(sample_hazard):
    assert sample_hazard["risk_category"] in ("GREEN", "YELLOW", "ORANGE", "RED")


def test_factor_breakdown_present_for_every_hazard_type(sample_hazard):
    assert set(sample_hazard["factor_breakdown"]) == {"flood", "landslide", "coastal_erosion", "cloudburst"}


def test_flood_factor_weights_match_research(sample_hazard):
    weights = {f["factor"]: f["weight"] for f in sample_hazard["factor_breakdown"]["flood"]}
    assert weights == FLOOD_WEIGHTS
    assert math.isclose(sum(weights.values()), 1.0, abs_tol=1e-9)


def test_landslide_factor_weights_match_research(sample_hazard):
    weights = {f["factor"]: f["weight"] for f in sample_hazard["factor_breakdown"]["landslide"]}
    assert weights == LANDSLIDE_WEIGHTS
    assert math.isclose(sum(weights.values()), 1.0, abs_tol=1e-9)


def test_cloudburst_factor_weights_match_research(sample_hazard):
    weights = {f["factor"]: f["weight"] for f in sample_hazard["factor_breakdown"]["cloudburst"]}
    assert weights == CLOUDBURST_WEIGHTS
    assert math.isclose(sum(weights.values()), 1.0, abs_tol=1e-9)


def test_coastal_factor_weights_match_research(sample_hazard):
    weights = {f["factor"]: f["weight"] for f in sample_hazard["factor_breakdown"]["coastal_erosion"]}
    assert weights == COASTAL_WEIGHTS
    assert math.isclose(sum(weights.values()), 1.0, abs_tol=1e-9)


def test_every_factor_value_is_normalized(sample_hazard):
    for factors in sample_hazard["factor_breakdown"].values():
        for f in factors:
            assert 0.0 <= f["value"] <= 1.0, f["factor"]


def test_landslide_negligible_in_flat_coastal_district():
    village = village_engine.get_villages("kendrapara")[0]
    hazard = village_engine.compute_hazard(village)
    assert hazard["hazard_scores"]["landslide"] < 0.15


def test_coastal_erosion_zero_in_landlocked_district():
    village = village_engine.get_villages("chamoli")[0]
    hazard = village_engine.compute_hazard(village)
    assert hazard["hazard_scores"]["coastal_erosion"] == 0.0


# ----------------------------------------------------------------------
# Scenario overrides (dev/testing tool)
# ----------------------------------------------------------------------

def test_scenario_preset_raises_hazard_score():
    village = village_engine.get_villages("chamoli")[1]
    baseline = village_engine.compute_hazard(village)["multi_hazard_score"]

    village_engine.apply_scenario_preset(village["village_id"], "extreme_rain")
    try:
        overridden = village_engine.compute_hazard(village)
        assert overridden["multi_hazard_score"] >= baseline
        assert overridden["live_inputs"]["is_simulated"] is True
    finally:
        village_engine.clear_scenario_override(village["village_id"])


def test_unknown_scenario_preset_raises_value_error():
    with pytest.raises(ValueError):
        village_engine.apply_scenario_preset("v_cha_0001", "not_a_real_preset")


# ----------------------------------------------------------------------
# Custom (test) villages
# ----------------------------------------------------------------------

def test_add_and_remove_custom_village():
    village = village_engine.add_custom_village("chamoli", "Test Hamlet", 30.55, 79.56, 500)
    assert village["is_test_data"] is True
    assert village_engine.get_village("chamoli", village["village_id"]) is not None

    removed = village_engine.remove_custom_village("chamoli", village["village_id"])
    assert removed is True
    assert village_engine.get_village("chamoli", village["village_id"]) is None


def test_add_custom_village_rejects_unknown_district():
    with pytest.raises(ValueError):
        village_engine.add_custom_village("nonexistent", "X", 0, 0, 100)


# ----------------------------------------------------------------------
# Exposure & vulnerability
# ----------------------------------------------------------------------

def test_exposure_population_matches_village_total():
    village = village_engine.get_villages("kendrapara")[0]
    hazard = village_engine.compute_hazard(village)
    exposure = village_engine.compute_exposure(village, KENDRAPARA, hazard)
    assert exposure["exposure"]["population"]["total"] == village["population"]
    assert exposure["exposure"]["population"]["at_risk"] <= village["population"]


def test_vulnerability_composite_score_is_normalized():
    village = village_engine.get_villages("chamoli")[0]
    vulnerability = village_engine.compute_vulnerability(village, CHAMOLI)
    score = vulnerability["vulnerability_assessment"]["composite_score"]
    assert 0.0 <= score <= 1.0
    assert vulnerability["vulnerability_assessment"]["vulnerability_band"] in ("LOW", "MEDIUM", "HIGH")


def test_haversine_zero_distance_for_identical_points():
    assert village_engine.haversine_km(30.0, 79.0, 30.0, 79.0) == 0.0


def test_haversine_known_distance_is_reasonable():
    # Roughly Delhi to Mumbai, ~1150km great-circle.
    d = village_engine.haversine_km(28.6139, 77.2090, 19.0760, 72.8777)
    assert 1100 < d < 1250
