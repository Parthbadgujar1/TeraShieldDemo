"""Shared helpers for the India dataset build (loading, name matching, geometry maths)."""

from __future__ import annotations

import csv
import difflib
import json
import math
import re
import unicodedata
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / ".cache"
CACHE.mkdir(exist_ok=True)

SOURCES = {
    "census.csv": "https://raw.githubusercontent.com/nishusharma1608/India-Census-2011-Analysis/master/india-districts-census-2011.csv",
    "states.geojson": "https://raw.githubusercontent.com/geohacker/india/master/state/india_state.geojson",
    "districts.geojson": "https://raw.githubusercontent.com/geohacker/india/master/district/india_district.geojson",
    "ibtracs_ni.csv": "https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/access/csv/ibtracs.NI.list.v04r01.csv",
    "coastline.geojson": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_coastline.geojson",
    "rivers.geojson": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_rivers_lake_centerlines.geojson",
    "landslides.csv": "https://raw.githubusercontent.com/frm1789/landslide-ea/master/global_landslide_catalog_export.csv",
}


def fetch(name: str) -> Path:
    path = CACHE / name
    if not path.exists():
        print(f"downloading {name} ...")
        req = urllib.request.Request(SOURCES[name], headers={"User-Agent": "TeraShield-SIH2026-build"})
        with urllib.request.urlopen(req, timeout=300) as r, open(path, "wb") as f:
            f.write(r.read())
    return path


def load_json(name: str):
    return json.load(open(fetch(name), encoding="utf-8"))


def load_csv(name: str) -> list[dict]:
    return list(csv.DictReader(open(fetch(name), encoding="utf-8", errors="replace")))


def clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def haversine_km(lat1, lon1, lat2, lon2) -> float:
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def norm_name(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    s = s.lower()
    s = re.sub(r"\(.*?\)", " ", s)
    s = re.sub(r"\b(district|dist|urban|rural|city|islands?)\b", " ", s)
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return s


# GADM 2.8 names / 2011 boundaries -> today's names
STATE_RENAME = {"Orissa": "Odisha", "Uttaranchal": "Uttarakhand", "Andaman and Nicobar": "Andaman and Nicobar Islands"}
TELANGANA = {"adilabad", "nizamabad", "karimnagar", "medak", "hyderabad", "rangareddy", "ranga reddy", "mahbubnagar",
             "nalgonda", "warangal", "khammam"}
LADAKH = {"leh", "leh ladakh", "kargil"}


def modern_state(state: str, district: str) -> str:
    state = STATE_RENAME.get(state, state)
    dn = norm_name(district)
    if state == "Andhra Pradesh" and dn in TELANGANA:
        return "Telangana"
    if state == "Jammu and Kashmir" and dn in LADAKH:
        return "Ladakh"
    return state


CENSUS_STATE_TO_MODERN = {
    "JAMMU AND KASHMIR": "Jammu and Kashmir", "HIMACHAL PRADESH": "Himachal Pradesh", "PUNJAB": "Punjab",
    "CHANDIGARH": "Chandigarh", "UTTARAKHAND": "Uttarakhand", "HARYANA": "Haryana", "NCT OF DELHI": "Delhi",
    "RAJASTHAN": "Rajasthan", "UTTAR PRADESH": "Uttar Pradesh", "BIHAR": "Bihar", "SIKKIM": "Sikkim",
    "ARUNACHAL PRADESH": "Arunachal Pradesh", "NAGALAND": "Nagaland", "MANIPUR": "Manipur", "MIZORAM": "Mizoram",
    "TRIPURA": "Tripura", "MEGHALAYA": "Meghalaya", "ASSAM": "Assam", "WEST BENGAL": "West Bengal",
    "JHARKHAND": "Jharkhand", "ODISHA": "Odisha", "CHHATTISGARH": "Chhattisgarh", "MADHYA PRADESH": "Madhya Pradesh",
    "GUJARAT": "Gujarat", "DAMAN AND DIU": "Daman and Diu", "DADRA AND NAGAR HAVELI": "Dadra and Nagar Haveli",
    "MAHARASHTRA": "Maharashtra", "ANDHRA PRADESH": "Andhra Pradesh", "KARNATAKA": "Karnataka", "GOA": "Goa",
    "LAKSHADWEEP": "Lakshadweep", "KERALA": "Kerala", "TAMIL NADU": "Tamil Nadu", "PUDUCHERRY": "Puducherry",
    "ANDAMAN AND NICOBAR ISLANDS": "Andaman and Nicobar Islands", "ORISSA": "Odisha", "PONDICHERRY": "Puducherry",
}

# GADM 2.8 district name -> Census 2011 district name, where spelling/administrative naming differs
DISTRICT_ALIAS = {
    "bhabua": "kaimur bhabua", "dahod": "dohad", "east nimar": "khandwa east nimar", "west nimar": "khargone west nimar",
    "greater bombay": "mumbai", "east imphal": "imphal east", "west imphal": "imphal west",
    "nawan shehar": "sahibzada ajit singh nagar", "east midnapore": "purba medinipur", "west midnapore": "paschim medinipur",
    "ladakh": "leh", "kavaratti": "lakshadweep", "cuddapah": "y s r", "sonepur": "subarnapur",
}


def best_match(name: str, candidates: dict[str, dict], cutoff: float = 0.62):
    n = norm_name(name)
    n = DISTRICT_ALIAS.get(n, n)
    if n in candidates:
        return candidates[n]
    hit = difflib.get_close_matches(n, list(candidates), n=1, cutoff=cutoff)
    if hit:
        return candidates[hit[0]]
    # substring containment (e.g. "Kanchipuram" vs "Kancheepuram" handled above; "Ahmadabad" vs "Ahmedabad")
    for key, val in candidates.items():
        if n and (n in key or key in n) and min(len(n), len(key)) >= 4:
            return val
    return None
