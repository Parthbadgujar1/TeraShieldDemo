"""Tests for relocation site generation and priority scoring."""

import pytest

from app.core import geodata, relocation_engine, village_engine

CHAMOLI = geodata.get_district("chamoli")


def test_sites_generated_for_every_block():
    sites = relocation_engine.generate_sites("chamoli")
    assert len(sites) == len(CHAMOLI.blocks)


def test_site_suitability_score_is_0_to_100():
    for site in relocation_engine.generate_sites("kendrapara"):
        assert 0 <= site["suitability"]["score"] <= 100
        assert site["suitability"]["grade"] in ("A", "B", "C", "D")


def test_site_carrying_capacity_is_non_negative():
    for site in relocation_engine.generate_sites("chamoli"):
        cap = site["carrying_capacity"]
        assert cap["total_capacity_people"] >= 0
        assert cap["available_slots_people"] >= 0
        assert cap["available_slots_people"] <= cap["total_capacity_people"]


@pytest.mark.parametrize("score,expected_tier", [
    (90, "immediate"),
    (75, "immediate"),
    (60, "short_term"),
    (55, "short_term"),
    (40, "medium_term"),
    (35, "medium_term"),
    (10, "monitor"),
])
def test_priority_tier_thresholds(score, expected_tier):
    assert relocation_engine.priority_tier_for_score(score) == expected_tier


def test_compute_priority_returns_valid_tier_and_assigned_site():
    village = village_engine.get_villages("chamoli")[0]
    hazard = village_engine.compute_hazard(village)
    vulnerability = village_engine.compute_vulnerability(village, CHAMOLI)

    priority = relocation_engine.compute_priority(village, CHAMOLI, hazard, vulnerability)

    assert priority["relocation_priority"]["tier"] in ("immediate", "short_term", "medium_term", "monitor")
    assert 0 <= priority["relocation_priority"]["score"] <= 100
    assert priority["assigned_site"]["site_id"].startswith("site_cha_")
    assert priority["assigned_site"]["distance_km"] >= 0


def test_priority_score_breakdown_weights_sum_to_one():
    village = village_engine.get_villages("kendrapara")[0]
    hazard = village_engine.compute_hazard(village)
    vulnerability = village_engine.compute_vulnerability(village, geodata.get_district("kendrapara"))
    priority = relocation_engine.compute_priority(village, geodata.get_district("kendrapara"), hazard, vulnerability)

    total_weight = sum(f["weight"] for f in priority["priority_score_breakdown"].values())
    assert abs(total_weight - 1.0) < 1e-9
