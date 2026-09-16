"""Structural checks on the real district/block reference data."""

from app.core import geodata


def test_lists_both_pilot_districts():
    districts = geodata.list_districts()
    ids = {d.district_id for d in districts}
    assert ids == {"chamoli", "kendrapara"}


def test_district_lookup_returns_none_for_unknown_id():
    assert geodata.get_district("nonexistent") is None


def test_every_district_has_at_least_one_block():
    for district in geodata.list_districts():
        assert len(district.blocks) > 0


def test_block_coordinates_are_within_india():
    # Coarse sanity bounds for Indian territory, not a precise polygon check.
    for district in geodata.list_districts():
        for block in district.blocks:
            assert 6.0 <= block.lat <= 37.0
            assert 68.0 <= block.lon <= 97.5


def test_coastal_blocks_only_in_kendrapara():
    chamoli = geodata.get_district("chamoli")
    kendrapara = geodata.get_district("kendrapara")
    assert all(b.coast_distance_km is None for b in chamoli.blocks)
    assert any(b.coast_distance_km is not None for b in kendrapara.blocks)


def test_avg_household_size_is_positive():
    for district in geodata.list_districts():
        assert district.avg_household_size > 0


def test_lithology_risk_defined_for_every_district():
    for district in geodata.list_districts():
        assert district.district_id in geodata.DISTRICT_LITHOLOGY_RISK
        risk = geodata.DISTRICT_LITHOLOGY_RISK[district.district_id]
        assert 0.0 <= risk <= 1.0
