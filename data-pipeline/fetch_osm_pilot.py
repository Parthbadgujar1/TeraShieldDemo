"""
Fetch the OpenStreetMap layers the habitation-level pilot needs (cached in .cache/osm_<slug>_*.json).

Layers: settlements (place nodes), waterways, roads, land-use / forest / protected-area polygons, and mapped buildings.
Overpass is a free shared service, so every query is retried across mirrors and results are cached; run once, commit the output.
"""

from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request

from common import CACHE

MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]


def overpass(query: str, tries: int = 6) -> dict:
    last = None
    for attempt in range(tries):
        for m in MIRRORS:
            try:
                req = urllib.request.Request(m, data=urllib.parse.urlencode({"data": query}).encode(),
                                             headers={"User-Agent": "TeraShield-SIH2026-pilot"})
                with urllib.request.urlopen(req, timeout=240) as r:
                    return json.load(r)
            except Exception as e:  # noqa: BLE001
                last = e
                time.sleep(3)
        time.sleep(10 * (attempt + 1))
    raise RuntimeError(f"Overpass failed: {last}")


def cached(slug: str, name: str, query: str) -> dict:
    p = CACHE / f"osm_{slug}_{name}.json"
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    print(f"  overpass {name} ...")
    j = overpass(query)
    p.write_text(json.dumps(j), encoding="utf-8")
    return j


def fetch_all(slug: str, bbox: tuple[float, float, float, float]) -> dict[str, dict]:
    s, w, n, e = bbox
    b = f"({s:.4f},{w:.4f},{n:.4f},{e:.4f})"
    out = {}
    out["places"] = cached(slug, "places", f'[out:json][timeout:120];node["place"~"^(village|hamlet|town|suburb|locality|isolated_dwelling)$"]{b};out;')
    out["water"] = cached(slug, "water", f'[out:json][timeout:200];way["waterway"~"^(river|stream|canal)$"]{b};out geom;')
    out["roads"] = cached(slug, "roads", f'[out:json][timeout:200];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential)$"]{b};out geom;')
    out["landuse"] = cached(
        slug, "landuse",
        f'[out:json][timeout:240];(way["landuse"~"^(forest|farmland|orchard|plantation|residential|meadow|grass|scrub|reservoir)$"]{b};'
        f'way["natural"~"^(wood|scrub|water|wetland)$"]{b};way["leisure"="nature_reserve"]{b};way["boundary"="protected_area"]{b};'
        f'relation["boundary"~"^(protected_area|national_park)$"]{b};relation["leisure"="nature_reserve"]{b};relation["landuse"="forest"]{b};);out geom;',
    )
    out["amenity"] = cached(slug, "amenity", f'[out:json][timeout:120];nwr["amenity"~"^(hospital|clinic|doctors|school|college|community_centre|shelter|drinking_water|toilets)$"]{b};out center;')
    out["buildings"] = cached(slug, "buildings", f'[out:json][timeout:280];way["building"]{b};out center;')
    return out
