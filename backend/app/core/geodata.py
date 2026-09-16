"""
Real-world geographic anchor data for TeraShield's two pilot districts.

Coordinates for administrative blocks were geocoded from OpenStreetMap
(Nominatim) against the real block/tehsil names published by the district
government sites. District population and village-count totals are the
2011 Census of India figures (the latest full village-level census).

Individual village-level records (name, exact boundary, household count)
require licensed Census/SECC microdata that is not available through a
free, keyless API. Village points below are generated deterministically
within their real parent block's area so every village carries a real
block affiliation and real approximate coordinates; hazard scores for
those points are computed from *live* rainfall and elevation data (see
live_data.py), not fabricated.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass(frozen=True)
class Block:
    name: str
    lat: float
    lon: float
    # Only meaningful for coastal districts; approximate straight-line
    # distance to the Bay of Bengal coastline in km, based on real
    # geography (Mahakalapada/Rajnagar/Rajkanika sit on/near the coast
    # and Bhitarkanika mangroves; the others are progressively inland).
    coast_distance_km: Optional[float] = None


@dataclass(frozen=True)
class DistrictInfo:
    district_id: str
    name: str
    state: str
    terrain_class: str  # "hilly" | "flat"
    census_population: int
    census_households: int
    census_villages: int
    area_sqkm: float
    hazard_types: list
    blocks: list

    @property
    def avg_household_size(self) -> float:
        return self.census_population / self.census_households


DISTRICTS: dict[str, DistrictInfo] = {
    "chamoli": DistrictInfo(
        district_id="chamoli",
        name="Chamoli",
        state="Uttarakhand",
        terrain_class="hilly",
        census_population=391_605,   # Census of India 2011
        census_households=88_964,    # Census of India 2011
        census_villages=1_246,       # Census of India 2011
        area_sqkm=8_030.0,
        hazard_types=["landslide", "cloudburst", "flood"],
        blocks=[
            Block("Joshimath", 30.5556, 79.5613),
            Block("Dasholi", 30.4088, 79.3186),       # HQ town: Gopeshwar
            Block("Ghat", 30.2585, 79.4481),
            Block("Karnaprayag", 30.2295, 79.2108),
            Block("Narayanbagar", 30.1467, 79.3743),
            Block("Tharali", 30.1472, 79.5380),
            Block("Pokhari", 30.3826, 79.2126),
            Block("Dewal", 30.2417, 79.1152),
            Block("Gairsain", 30.0546, 79.2900),
        ],
    ),
    "kendrapara": DistrictInfo(
        district_id="kendrapara",
        name="Kendrapara",
        state="Odisha",
        terrain_class="flat",
        census_population=1_440_361,  # Census of India 2011
        census_households=1_440_361 // 5,  # Odisha rural avg household size ~5; households not
        # separately published in the summary source we used, so this is a documented estimate.
        census_villages=1_592,        # Census of India 2011
        area_sqkm=2_644.0,
        hazard_types=["flood", "coastal_erosion", "cloudburst"],
        blocks=[
            Block("Mahakalapada", 20.4097, 86.6351, coast_distance_km=5),
            Block("Rajnagar", 20.6460, 86.8408, coast_distance_km=10),
            Block("Rajkanika", 20.7070, 86.7099, coast_distance_km=20),
            Block("Marshaghai", 20.4512, 86.4670, coast_distance_km=25),
            Block("Pattamundai", 20.5626, 86.5908, coast_distance_km=30),
            Block("Kendrapara", 20.5042, 86.4160, coast_distance_km=30),
            Block("Aul", 20.6506, 86.5328, coast_distance_km=35),
            Block("Derabish", 20.5461, 86.3138, coast_distance_km=40),
            Block("Garadpur", 20.6800, 86.2800, coast_distance_km=45),  # approximate: geocoder had no exact match
        ],
    ),
}

# Real, region-appropriate village-name suffix conventions.
# Himalayan (Garhwal) villages are very commonly split into upper/lower
# hamlets named "<place> Malla" (upper) / "<place> Talla" (lower), or
# carry a "-gaon"/"-tok"/"-kot" suffix. Coastal Odisha villages commonly
# carry a "-sahi"/"-patna"/"-pada"/"-bazar" suffix.
NAME_SUFFIXES = {
    "hilly": ["Malla", "Talla", "Gaon", "Tok", "Kot", "Khal", "Patti"],
    "flat": ["Sahi", "Patna", "Pada", "Bazar", "Gaon", "Chak"],
}

SAMPLE_VILLAGES_PER_DISTRICT = 60

# District-level rock-type (lithology) landslide susceptibility, 0-1.
# Individual-point lithology requires GSI's geological map series, which is
# not available as a free public API — this is a published district-level
# characterization instead of a per-point live reading. Chamoli sits in the
# Central Himalayan metamorphic belt (phyllites/schists/gneiss, heavily
# fractured and jointed), which GSI's Landslide Susceptibility Zonation
# studies for Uttarakhand consistently rate as high-susceptibility rock.
# Kendrapara is Mahanadi-delta alluvium — flat sedimentary deposits with
# negligible mass-movement susceptibility regardless of rainfall/slope.
DISTRICT_LITHOLOGY_RISK = {
    "chamoli": 0.65,
    "kendrapara": 0.10,
}


def get_district(district_id: str) -> Optional[DistrictInfo]:
    return DISTRICTS.get(district_id)


def list_districts() -> list:
    return list(DISTRICTS.values())
