"""
Build the static all-India dataset that the TeraShield frontend ships with.

Every number is computed from a named public dataset (see SOURCES in meta.json):
  * boundaries ........ GADM district polygons (2011-era, Telangana/Ladakh re-labelled)
  * population ........ Census of India 2011, district level
  * terrain ........... SRTM-derived terrain tiles (AWS), zonal statistics over each district polygon
  * climate ........... NASA POWER (MERRA-2) daily rain + Tmax, 2014-2023
  * cyclones .......... NOAA IBTrACS North Indian Ocean tracks, 1990-2023
  * landslide history . NASA Global Landslide Catalog
  * coast / rivers .... Natural Earth 10m coastline + rivers
  * seismicity ........ USGS ComCat M>=4.5, 1990-2023 (context only)

Run:  python fetch_remote.py   (once, network)   then   python build_india_dataset.py
"""

from __future__ import annotations

import datetime as dt
import json
import math
import re
import statistics

import numpy as np
from shapely.geometry import box, mapping, shape
from shapely.ops import nearest_points, unary_union
from shapely.strtree import STRtree

from common import (CACHE, CENSUS_STATE_TO_MODERN, ROOT, best_match, clamp01, haversine_km, load_csv, load_json,
                    modern_state, norm_name)
from fetch_dem import all_stats as dem_stats
from fetch_remote import fetch_climate, power_cell
from fetch_seismic import attach_seismic

OUT = ROOT.parent / "frontend" / "public" / "data"
OUT.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------- model constants
HAZARDS = ["flood", "landslide", "cloudburst", "coastal", "cyclone", "heatwave"]
# Weights are the project's Module-1 research weights (see backend/app/core/village_engine.py).
W_FLOOD = dict(rain=0.35, low_elev=0.25, river=0.20, flat=0.10, lulc=0.10)
# NDVI + lithology (0.15 + 0.05) need licensed / raster inputs, so their weight goes to observed landslide history.
W_LANDSLIDE = dict(slope=0.45, rain=0.25, history=0.20, stream=0.10)
W_CLOUDBURST = dict(intensity=0.70, orographic=0.30)
W_COASTAL = dict(distance=0.50, cyclone=0.30, shoreline=0.20)
# State-level shoreline-erosion class (indicative, after NCCR shoreline-change assessments): 1.0 high, 0.6 medium, 0.35 lower
SHORELINE = {
    "West Bengal": 1.0, "Kerala": 1.0, "Tamil Nadu": 1.0, "Puducherry": 1.0, "Lakshadweep": 0.8,
    "Odisha": 0.6, "Andhra Pradesh": 0.6, "Gujarat": 0.6, "Karnataka": 0.6, "Andaman and Nicobar Islands": 0.6,
    "Maharashtra": 0.35, "Goa": 0.35, "Daman and Diu": 0.35,
}
COMPOSITE_W = dict(top=0.6, mean3=0.4)
# Hazards that decide a zone. Heatwave stress goes to vulnerability; coastal erosion is a shoreline-retreat *rate* (m/yr) that
# we cannot measure without shoreline-change data, so it is carried as a susceptibility index that may raise a zone to ORANGE
# but never on its own to RED.
ZONE_HAZARDS = ["flood", "landslide", "cloudburst", "cyclone"]
COASTAL_ORANGE_INDEX = 0.40
VBAND_CUTS = (0.70, 0.40)  # vulnerability index -> HIGH / MEDIUM / LOW
ZONE_CUTS = dict(red=0.55, orange=0.42, yellow=0.28)      # composite hazard probability (0-1) -> zone
TIER_CUTS = dict(immediate=62, short_term=50, medium_term=38)  # relocation priority (0-100)
CYCLONE_RADIUS_KM = 150
SEASONS = (1990, 2023)
IND_BOX = box(60, 4, 102, 40)


# 2011-era GADM spellings -> names in use today (display only; matching to Census still uses the raw name)
DISPLAY_NAMES = {
    "Dehra Dun": "Dehradun", "Bangalore": "Bengaluru Urban", "Bangalore Rural": "Bengaluru Rural", "Gurgaon": "Gurugram",
    "Allahabad": "Prayagraj", "Faizabad": "Ayodhya", "Mysore": "Mysuru", "Belgaum": "Belagavi", "Bijapur": "Vijayapura",
    "Gulbarga": "Kalaburagi", "Shimoga": "Shivamogga", "Tumkur": "Tumakuru", "Chikmagalur": "Chikkamagaluru",
    "Bellary": "Ballari", "Mahbubnagar": "Mahabubnagar", "Rangareddy": "Ranga Reddy", "Cuddapah": "YSR Kadapa",
    "Nellore": "SPSR Nellore", "Visakhapatnam": "Visakhapatnam", "Pondicherry": "Puducherry", "Kanchipuram": "Kancheepuram",
    "Thoothukudi": "Thoothukkudi", "Tuticorin": "Thoothukkudi", "Trichirappalli": "Tiruchirappalli", "Kanniyakumari": "Kanyakumari",
    "Ahmadabad": "Ahmedabad", "Panch Mahals": "Panchmahal", "Sabar Kantha": "Sabarkantha", "Banas Kantha": "Banaskantha",
    "Darjiling": "Darjeeling", "Jalpaiguri": "Jalpaiguri", "Hugli": "Hooghly", "Haora": "Howrah", "Puruliya": "Purulia",
    "Bardhaman": "Purba Bardhaman", "Barddhaman": "Purba Bardhaman", "Kaimur (Bhabua)": "Kaimur", "Bhabua": "Kaimur",
    "Sonepur": "Subarnapur", "Baudh": "Boudh", "Jajapur": "Jajpur", "Debagarh": "Deogarh", "Khordha": "Khurda",
    "Narsimhapur": "Narsinghpur", "East Nimar": "Khandwa", "West Nimar": "Khargone", "Ahmadnagar": "Ahilyanagar",
    "Greater Bombay": "Mumbai City", "Buldana": "Buldhana", "Gondiya": "Gondia", "Vashim": "Washim",
    "Sahibzada Ajit Singh Nagar": "SAS Nagar (Mohali)", "Nawan Shehar": "Shahid Bhagat Singh Nagar", "Firozpur": "Ferozepur",
    "Kheri": "Lakhimpur Kheri", "Sant Ravidas Nagar (Bhadohi)": "Bhadohi", "Mahrajganj": "Maharajganj", "Siddharth Nagar": "Siddharthnagar",
    "Hardwar": "Haridwar", "Pauri Garhwal": "Pauri Garhwal", "Kinnaur": "Kinnaur", "Lahul and Spiti": "Lahaul and Spiti",
}


def zone_for(c: float) -> str:
    return "RED" if c >= ZONE_CUTS["red"] else "ORANGE" if c >= ZONE_CUTS["orange"] else "YELLOW" if c >= ZONE_CUTS["yellow"] else "GREEN"


def tier_for(s: float, zone: str = "RED") -> str:
    """Relocation horizon from the priority score, gated by the hazard tier: low-hazard land is never on a relocation list
    (GREEN -> monitor only) and moderate-hazard land is at most medium-term, however vulnerable the people are."""
    t = ("immediate" if s >= TIER_CUTS["immediate"] else "short_term" if s >= TIER_CUTS["short_term"]
         else "medium_term" if s >= TIER_CUTS["medium_term"] else "monitor")
    if zone == "GREEN":
        return "monitor"
    if zone == "YELLOW" and t in ("immediate", "short_term"):
        return "medium_term"
    return t


def num(r: dict, k: str) -> float:
    try:
        return float(str(r.get(k, "")).replace(",", "").strip() or 0)
    except ValueError:
        return 0.0


# ---------------------------------------------------------------- 1. districts
def load_districts():
    feats = load_json("districts.geojson")["features"]
    out = []
    for i, f in enumerate(feats):
        p = f["properties"]
        g = shape(f["geometry"])
        if not g.is_valid:
            g = g.buffer(0)
        name = re.sub(r"\s*\(.*?\)\s*", "", p["NAME_2"]).strip() or p["NAME_2"]
        raw_name = p["NAME_2"]
        if p["NAME_1"] == "Daman and Diu" and raw_name == "Junagadh":
            raw_name, name = "Diu", "Diu"
        if raw_name == "Ladakh (Leh)":
            name = "Leh"
        name = DISPLAY_NAMES.get(name, name)
        if name == "Raigarh" and p["NAME_1"] == "Maharashtra":
            name = "Raigad"
        state = modern_state(p["NAME_1"], raw_name)
        rp = g.representative_point()
        area = g.area * 111.32 * 110.57 * math.cos(math.radians(rp.y))
        out.append(dict(id=i, state=state, name=name, raw=raw_name, geom=g, lat=rp.y, lon=rp.x, area=area))
    return out


def attach_census(districts):
    rows = load_csv("census.csv")
    by_state: dict[str, dict[str, dict]] = {}
    for r in rows:
        st = CENSUS_STATE_TO_MODERN.get(r["State name"].strip(), r["State name"].title())
        by_state.setdefault(st, {})[norm_name(r["District name"])] = r
    used = 0
    for d in districts:
        cand = by_state.get({"Telangana": "Andhra Pradesh", "Ladakh": "Jammu and Kashmir"}.get(d["state"], d["state"]), {})
        d["census"] = best_match(d["raw"], cand)
        used += d["census"] is not None
    print(f"census matched {used}/{len(districts)}")


# ---------------------------------------------------------------- 2. terrain + climate
def attach_terrain(districts):
    """Zonal terrain statistics over each district polygon (see fetch_dem.py)."""
    stats = dem_stats(districts)
    for d in districts:
        t = stats[d["id"]]
        d["elev"], d["relief"], d["slope"] = t["elev"], t["relief"], t["slope"]
        d["steep15"], d["steep30"], d["elev_max"] = t["steep15"], t["steep30"], t["elev_max"]


def longest_run(mask: np.ndarray) -> int:
    best = cur = 0
    for v in mask:
        cur = cur + 1 if v else 0
        best = max(best, cur)
    return best


def climate_metrics(lat: float, lon: float, hilly: bool) -> dict:
    cell = power_cell(lat, lon)
    d = json.load(open(CACHE / "power" / f"{cell[0]}_{cell[1]}.json"))
    keys = sorted(d["p"])
    p = np.array([d["p"][k] for k in keys], float)
    t = np.array([d["t"][k] for k in keys], float)
    p[p < 0] = np.nan
    t[t < -900] = np.nan
    yrs = np.array([int(k[:4]) for k in keys])
    doy = np.array([dt.datetime.strptime(k, "%Y%m%d").timetuple().tm_yday for k in keys])

    # Daily climatological normal (same calendar day +-7 d, all years) -> departure from normal, as IMD defines heatwaves.
    normal = np.zeros(367)
    for day in range(1, 367):
        near = np.abs(((doy - day + 183) % 366) - 183) <= 7
        normal[day] = np.nanmean(t[near]) if near.any() and np.isfinite(t[near]).any() else np.nan
    dep = t - normal[doy]
    hot_thr = 30.0 if hilly else 40.0
    # IMD: Tmax >= 40C (30C hills) AND departure >= 4.5C, or Tmax >= 45C; an event needs >= 2 consecutive days.
    hw_day = np.nan_to_num(((t >= hot_thr) & (dep >= 4.5)) | (t >= 45), nan=0).astype(bool)

    m = dict(rain=[], rx1=[], rx5=[], d30=[], d50=[], d65=[], d100=[], hot=[], spell=[], tmax=[])
    for y in sorted(set(yrs)):
        sel = yrs == y
        pf = np.nan_to_num(p[sel])
        m["rain"].append(pf.sum())
        m["rx1"].append(pf.max())
        m["rx5"].append(np.convolve(pf, np.ones(5), "valid").max())
        for name, thr in (("d30", 30), ("d50", 50), ("d65", 64.5), ("d100", 100)):
            m[name].append(pf.max() >= thr)
        m["hot"].append((np.nan_to_num(t[sel], nan=0) >= hot_thr).sum())
        m["spell"].append(longest_run(hw_day[sel]) >= 2)
        m["tmax"].append(np.nanmax(t[sel]) if np.isfinite(t[sel]).any() else np.nan)
    return dict(
        rain=float(np.mean(m["rain"])), rx1=float(np.mean(m["rx1"])), rx5=float(np.mean(m["rx5"])),
        p30=float(np.mean(m["d30"])), p50=float(np.mean(m["d50"])), p65=float(np.mean(m["d65"])), p100=float(np.mean(m["d100"])),
        hot_days=float(np.mean(m["hot"])), heat_p=float(np.mean(m["spell"])), tmax=float(np.nanmean(m["tmax"])),
        hot_thr=hot_thr,
    )


def attach_climate(districts):
    fetch_climate()
    for d in districts:
        d["clim"] = climate_metrics(d["lat"], d["lon"], hilly=d["elev"] >= 1000)


# ---------------------------------------------------------------- 3. cyclones (IBTrACS)
def cyclone_stats(districts):
    storms: dict[str, dict] = {}
    for r in load_csv("ibtracs_ni.csv"):
        sid = r.get("SID", "")
        if not re.match(r"^\d{7}[NS]\d{5}$", sid):
            continue
        try:
            season, lat, lon = int(r["SEASON"]), float(r["LAT"]), float(r["LON"])
        except ValueError:
            continue
        if not (SEASONS[0] <= season <= SEASONS[1]):
            continue
        s = storms.setdefault(sid, dict(season=season, pts=[], wind=0.0))
        s["pts"].append((lat, lon))
        for k in ("WMO_WIND", "USA_WIND", "NEWDELHI_WIND"):
            v = (r.get(k) or "").strip()
            if v:
                try:
                    s["wind"] = max(s["wind"], float(v))
                    break
                except ValueError:
                    pass
    cyc = [s for s in storms.values() if s["wind"] >= 34]  # IMD "Cyclonic Storm" and above
    print(f"cyclonic storms 1990-2023 (>=34 kt): {len(cyc)}")
    lat1, lon1, lat2, lon2, sidx = [], [], [], [], []
    for n, s in enumerate(cyc):
        pts = s["pts"] if len(s["pts"]) > 1 else s["pts"] * 2
        for a, b in zip(pts[:-1], pts[1:]):
            lat1.append(a[0]); lon1.append(a[1]); lat2.append(b[0]); lon2.append(b[1]); sidx.append(n)
    lat1, lon1, lat2, lon2, sidx = map(np.array, (lat1, lon1, lat2, lon2, sidx))
    starts = np.r_[0, np.nonzero(np.diff(sidx))[0] + 1]
    seasons = np.array([s["season"] for s in cyc])
    winds = np.array([s["wind"] for s in cyc])
    n_seasons = SEASONS[1] - SEASONS[0] + 1
    for d in districts:
        k = math.cos(math.radians(d["lat"]))
        x1, y1 = (lon1 - d["lon"]) * k * 111.32, (lat1 - d["lat"]) * 110.57
        x2, y2 = (lon2 - d["lon"]) * k * 111.32, (lat2 - d["lat"]) * 110.57
        dx, dy = x2 - x1, y2 - y1
        t = np.clip(-(x1 * dx + y1 * dy) / np.maximum(dx * dx + dy * dy, 1e-9), 0, 1)
        dist = np.hypot(x1 + t * dx, y1 + t * dy)
        per_storm = np.minimum.reduceat(dist, starts)
        near = per_storm <= CYCLONE_RADIUS_KM
        severe = near & (winds >= 64)
        d["cyc"] = dict(
            storms=int(near.sum()), severe=int(severe.sum()),
            p=len(set(seasons[near])) / n_seasons, p_severe=len(set(seasons[severe])) / n_seasons,
            max_kt=float(winds[near].max()) if near.any() else 0.0,
        )


# ---------------------------------------------------------------- 4. coast / rivers / landslide history
def line_tree(name: str, max_scalerank: int = 99):
    geoms = []
    for f in load_json(name)["features"]:
        if not f.get("geometry") or (f.get("properties") or {}).get("scalerank", 0) > max_scalerank:
            continue
        g = shape(f["geometry"]).intersection(IND_BOX)
        if not g.is_empty:
            geoms.extend(list(g.geoms) if hasattr(g, "geoms") else [g])
    return geoms, STRtree(geoms)


def dist_to_lines(geom, geoms, tree) -> float:
    i = tree.nearest(geom)
    a, b = nearest_points(geom, geoms[int(i)])
    return haversine_km(a.y, a.x, b.y, b.x)


def attach_geography(districts):
    coast, ctree = line_tree("coastline.geojson")
    rivers, rtree = line_tree("rivers.geojson", max_scalerank=7)
    from shapely.geometry import Point as _P
    for d in districts:
        d["coast_km"] = dist_to_lines(d["geom"], coast, ctree)
        d["coast_c_km"] = dist_to_lines(_P(d["lon"], d["lat"]), coast, ctree)
        d["river_km"] = dist_to_lines(_P(d["lon"], d["lat"]), rivers, rtree)

    from shapely.geometry import Point
    ev = []
    for r in load_csv("landslides.csv"):
        try:
            lat, lon = float(r["latitude"]), float(r["longitude"])
        except (ValueError, KeyError):
            continue
        if 6 <= lat <= 37.5 and 67 <= lon <= 98:
            ev.append((lat, lon, r))
    print(f"landslide events in India bbox: {len(ev)}")
    pts = [Point(lon, lat) for lat, lon, _ in ev]
    tree = STRtree(pts)
    for d in districts:
        near = tree.query(d["geom"].buffer(0.30), predicate="intersects")
        events = []
        for j in near:
            lat, lon, r = ev[int(j)]
            fat = int(float(r.get("fatality_count") or 0)) if (r.get("fatality_count") or "").strip().replace(".", "").isdigit() else 0
            ym = re.search(r"(19|20)\d{2}", (r.get("event_date") or "").split(" ")[0])   # catalogue dates are MM/DD/YYYY
            year = ym.group(0) if ym else ""
            events.append(dict(year=int(year) if year.isdigit() else None, fat=fat,
                               where=(r.get("location_description") or r.get("event_title") or "").strip()[:70],
                               trigger=(r.get("landslide_trigger") or "").strip()[:24],
                               kind=(r.get("landslide_category") or "").strip()[:24]))
        events.sort(key=lambda e: (-(e["fat"]), -(e["year"] or 0)))
        d["ls_years"] = [e["year"] for e in events if e["year"]]
        d["ls_events"] = len(events)
        d["ls_fatal"] = sum(e["fat"] for e in events)
        d["ls_top"] = events[:4]


# ---------------------------------------------------------------- 5. hazard model
def hazard_model(d: dict, ls_key: str = "ls_events") -> None:
    c, cy = d["clim"], d["cyc"]
    dens = d["c"]["pop"] / max(d["area"], 1)
    d["dens"] = dens
    relief, elev = d["relief"], d["elev"]

    # --- flood
    low_elev, flat = clamp01(1 - (elev - 10) / 300), clamp01(1 - relief / 300)
    f = dict(
        rain=clamp01((c["rx5"] - 60) / 240), low_elev=low_elev,
        # nearest major river OR an extensive floodplain (flat + low-lying alluvium fed by tributaries the 10m river layer omits)
        river=max(clamp01(1 - d["river_km"] / 40), 0.6 * flat * low_elev),
        flat=flat, lulc=clamp01((math.log10(max(dens, 1)) - 1.3) / 2.0),
    )
    s_flood = sum(W_FLOOD[k] * f[k] for k in W_FLOOD)
    # Hill districts flood as flash floods in steep river gorges (Beas 2023, Kedarnath 2013), which a low-elevation/flat-terrain
    # score misses: take the larger of the floodplain score and a steep-basin flash-flood score.
    flash = clamp01(relief / 800) * (0.45 * f["rain"] + 0.30 * clamp01(1 - d["river_km"] / 25) + 0.25 * clamp01(d["steep15"] / 0.5))
    s_flood = max(s_flood, 0.85 * flash)
    p_flood = s_flood * (0.3 + 0.7 * clamp01(c["p65"]))

    # --- landslide (needs relief: flat terrain gates the score down)
    # terrain: robust relief plus the share of the polygon that is actually steep (300 m DEM understates local slopes,
    # so the thresholds are on the smoothed surface); rain: extreme daily rain plus wet-season total as antecedent moisture
    l = dict(
        slope=clamp01(0.40 * clamp01(relief / 1500) + 0.35 * clamp01(d["steep15"] / 0.5) + 0.25 * clamp01(d["steep30"] / 0.10)),
        rain=clamp01(0.6 * clamp01((c["rx1"] - 20) / 80) + 0.4 * clamp01((c["rain"] - 900) / 2200)),
        history=clamp01(math.log1p(d[ls_key]) / math.log1p(30)),
        stream=clamp01(1 - d["river_km"] / 30),
    )
    gate = clamp01(0.1 + relief / 350)
    s_ls = gate * sum(W_LANDSLIDE[k] * l[k] for k in W_LANDSLIDE)
    p_ls = s_ls * (0.3 + 0.7 * clamp01(c["p50"]))

    # --- cloudburst (orographic; needs relief to be physically meaningful)
    hill_gate = clamp01(relief / 450)
    cb = dict(intensity=clamp01((c["rx1"] - 15) / 85), orographic=clamp01(0.5 * elev / 2500 + 0.5 * relief / 1400))
    s_cb = hill_gate * sum(W_CLOUDBURST[k] * cb[k] for k in W_CLOUDBURST)
    p_cb = 0.9 * s_cb * (0.3 + 0.7 * clamp01(c["p50"]))

    # --- coastal erosion
    coastal_active = d["coast_km"] <= 30
    co = dict(
        distance=clamp01(1 - d["coast_c_km"] / 60) if coastal_active else 0.0,
        cyclone=clamp01(cy["p"] / 0.5) if coastal_active else 0.0,
        shoreline=SHORELINE.get(d["state"], 0.35) if coastal_active else 0.0,
    )
    # erosion, surge and shoreline retreat only matter close to the sea: fade the whole score out with distance
    gate_co = clamp01(1.25 - d["coast_c_km"] / 40) if coastal_active else 0.0
    s_co = gate_co * sum(W_COASTAL[k] * co[k] for k in W_COASTAL)
    p_co = 0.9 * s_co

    # --- cyclone / heatwave: empirical annual frequency
    p_cy = cy["p"]
    p_heat = c["heat_p"]

    d["factors"] = dict(flood=f, landslide=l, cloudburst=cb, coastal=co)
    d["S"] = dict(flood=s_flood, landslide=s_ls, cloudburst=s_cb, coastal=s_co)
    d["P"] = dict(flood=p_flood, landslide=p_ls, cloudburst=p_cb, coastal=p_co, cyclone=p_cy, heatwave=p_heat)
    # Zone = event-probability hazards only (see ZONE_HAZARDS). Heat stress is a vulnerability factor; coastal erosion can only
    # raise a district to ORANGE (shoreline change needs a rate in m/yr, which needs multi-year shoreline data).
    probs = sorted((d["P"][k] for k in ZONE_HAZARDS), reverse=True)
    d["composite"] = COMPOSITE_W["top"] * probs[0] + COMPOSITE_W["mean3"] * (sum(probs[:3]) / 3)
    d["zone"] = zone_for(d["composite"])
    d["coastal_flag"] = d["S"]["coastal"] >= COASTAL_ORANGE_INDEX
    if d["coastal_flag"] and d["zone"] in ("YELLOW", "GREEN"):
        d["zone"] = "ORANGE"
    d["dominant"] = max(ZONE_HAZARDS, key=lambda k: d["P"][k])


# ---------------------------------------------------------------- 6. exposure / vulnerability / relocation
def census_block(r: dict) -> dict:
    pop, hh = max(num(r, "Population"), 1), max(num(r, "Households"), 1)
    work = max(num(r, "Workers"), 1)
    return dict(
        pop=num(r, "Population"), hh=num(r, "Households"),
        lit=num(r, "Literate") / pop, urb=num(r, "Urban_Households") / hh,
        scst=(num(r, "SC") + num(r, "ST")) / pop,
        agri=(num(r, "Cultivator_Workers") + num(r, "Agricultural_Workers")) / work,
        work=num(r, "Workers") / pop, fwork=num(r, "Female_Workers") / work,
        elec=num(r, "Housholds_with_Electric_Lighting") / hh, lpg=num(r, "LPG_or_PNG_Households") / hh,
        net=num(r, "Households_with_Internet") / hh, phone=num(r, "Households_with_Telephone_Mobile_Phone") / hh,
        car=num(r, "Households_with_Car_Jeep_Van") / hh, two=num(r, "Households_with_Scooter_Motorcycle_Moped") / hh,
        bike=num(r, "Households_with_Bicycle") / hh, dil=num(r, "Condition_of_occupied_census_houses_Dilapidated_Households") / hh,
        tap=num(r, "Main_source_of_drinking_water_Tapwater_Households") / hh,
        far=num(r, "Location_of_drinking_water_source_Away_Households") / hh,
        latrine=num(r, "Having_latrine_facility_within_the_premises_Total_Households") / hh,
        a50=num(r, "Age_Group_50") / pop, a30=num(r, "Age_Group_0_29") / pop,
    )


def pct_norm(values: list[float], lo_q=5, hi_q=95):
    lo, hi = np.percentile(values, lo_q), np.percentile(values, hi_q)
    return lambda v: clamp01((v - lo) / max(hi - lo, 1e-9))


W_VULN = dict(illiteracy=0.11, scst=0.07, elderly=0.07, agri=0.09, no_elec=0.07, no_lpg=0.09, dilapidated=0.11,
              no_vehicle=0.09, no_phone=0.05, water_far=0.07, no_latrine=0.07, heat_stress=0.11)


def prepare_census(districts):
    """Census block per district; an unmatched district falls back to its state's median so the model always has an input."""
    by_state: dict[str, list[dict]] = {}
    for d in districts:
        if d["census"]:
            d["c"] = census_block(d["census"])
            by_state.setdefault(d["state"], []).append(d["c"])
    for d in districts:
        if not d["census"]:
            peers = by_state.get(d["state"]) or sum(by_state.values(), [])
            d["c"] = {k: statistics.median([c[k] for c in peers]) for k in peers[0]}
            d["c"]["pop"] = max(d["c"]["pop"] * 0.5, 1)


def vulnerability_and_priority(districts):
    raw = {k: [] for k in W_VULN}
    for d in districts:
        c = d["c"]
        d["_v"] = dict(
            illiteracy=1 - c["lit"], scst=c["scst"], elderly=c["a50"], agri=c["agri"], no_elec=1 - c["elec"],
            no_lpg=1 - c["lpg"], dilapidated=c["dil"], no_vehicle=max(0.0, 1 - (c["car"] + c["two"] + 0.5 * c["bike"])),
            no_phone=1 - c["phone"], water_far=c["far"], no_latrine=1 - c["latrine"],
            heat_stress=0.7 * d["clim"]["heat_p"] + 0.3 * clamp01(d["clim"]["hot_days"] / 90),
        )
        for k in raw:
            raw[k].append(d["_v"][k])
    norms = {k: pct_norm(v) for k, v in raw.items()}
    scores = []
    for d in districts:
        d["vfac"] = {k: norms[k](d["_v"][k]) for k in W_VULN}
        scores.append(sum(W_VULN[k] * d["vfac"][k] for k in W_VULN))
    vn = pct_norm(scores, 2, 98)
    for d, s in zip(districts, scores):
        d["vuln"] = vn(s)
        d["vband"] = "HIGH" if d["vuln"] >= VBAND_CUTS[0] else "MEDIUM" if d["vuln"] >= VBAND_CUTS[1] else "LOW"

    greens = [d for d in districts if d["zone"] == "GREEN"]
    rng = np.random.default_rng(2026)
    comps = []
    for d in districts:
        d["exp_frac"] = 0.05 + 0.95 * d["composite"]
        d["exp_pop"] = d["c"]["pop"] * d["exp_frac"]
        d["exp_idx"] = clamp01((math.log10(max(d["exp_pop"], 1)) - 4.0) / 2.2)
        # One risk formula everywhere: Risk = Hazard x (0.5 Exposure + 0.5 Vulnerability)
        d["risk"] = d["composite"] * (0.5 * d["exp_idx"] + 0.5 * d["vuln"])
        hist = clamp01(0.45 * math.log1p(d["ls_events"]) / math.log1p(30) + 0.35 * clamp01(d["cyc"]["storms"] / 12) + 0.20 * d["clim"]["p100"])
        d["history"] = hist
    # Receiving district (screening only): same state first, low modelled hazard, low history; never a settlement decision.
    # The pilot habitation planner and the in-app site screening make the real siting call.
    for d in districts:
        pool_state = [g for g in greens if g["state"] == d["state"] and g["id"] != d["id"] and g["history"] < 0.35]
        pool_any = [g for g in greens if g["id"] != d["id"] and g["history"] < 0.35] or [g for g in greens if g["id"] != d["id"]]
        pool = pool_state or pool_any
        best = min(pool, key=lambda g: haversine_km(d["lat"], d["lon"], g["lat"], g["lon"])) if pool else d
        d["safe_id"], d["safe_km"] = best["id"], haversine_km(d["lat"], d["lon"], best["lat"], best["lon"])
        zone_score = {"RED": 100, "ORANGE": 70, "YELLOW": 35, "GREEN": 5}[d["zone"]]
        feas = 100 * clamp01(1 - d["safe_km"] / 120)
        comps.append([zone_score, d["vuln"] * 100, d["exp_idx"] * 100, d["history"] * 100, feas])
        d["priority"] = 0.35 * zone_score + 0.25 * d["vuln"] * 100 + 0.15 * d["exp_idx"] * 100 + 0.15 * d["history"] * 100 + 0.10 * feas
        d["tier"] = tier_for(d["priority"], d["zone"])

    # Rank stability: redraw the five priority weights 1,000 times around the defaults (Dirichlet) and record how often each
    # district keeps its tier and how often it lands in the top 10% -- answers "why 0.35 and not 0.40?".
    base_w = np.array([0.35, 0.25, 0.15, 0.15, 0.10])
    C = np.array(comps)
    n = len(districts)
    same = np.zeros(n)
    top = np.zeros(n)
    tier_of = np.array([["immediate", "short_term", "medium_term", "monitor"].index(d["tier"]) for d in districts])
    cuts = np.array([TIER_CUTS["immediate"], TIER_CUTS["short_term"], TIER_CUTS["medium_term"]])
    zone_i = np.array([["RED", "ORANGE", "YELLOW", "GREEN"].index(d["zone"]) for d in districts])
    runs = 1000
    for w in rng.dirichlet(base_w * 40, size=runs):
        sc = C @ w
        t = 3 - (sc[:, None] >= cuts[None, :]).sum(axis=1)
        t = np.where(zone_i == 3, 3, np.where((zone_i == 2) & (t < 2), 2, t))   # same zone gating as tier_for
        same += t == tier_of
        top += sc >= np.percentile(sc, 90)
    for i, d in enumerate(districts):
        d["stab_tier"], d["stab_top"] = same[i] / runs, top[i] / runs


# ---------------------------------------------------------------- 7. output
def r1(x):
    return round(float(x), 1)


def r0(x):
    return int(round(float(x)))


def pct(x):
    return round(float(x) * 100, 1)


def district_record(d: dict) -> dict:
    c = d["c"]
    return {
        "id": d["id"], "s": d["state"], "n": d["name"], "lat": round(d["lat"], 3), "lon": round(d["lon"], 3),
        "pop": r0(c["pop"]), "hh": r0(c["hh"]), "area": r0(d["area"]), "dens": r0(d["dens"]),
        "elev": r0(d["elev"]), "relief": r0(d["relief"]), "slope": r1(d["slope"]),
        "coast": r0(d["coast_km"]), "river": r0(d["river_km"]),
        "clim": {"rain": r0(d["clim"]["rain"]), "rx1": r0(d["clim"]["rx1"]), "rx5": r0(d["clim"]["rx5"]),
                 "hot": r1(d["clim"]["hot_days"]), "tmax": r1(d["clim"]["tmax"]), "hthr": int(d["clim"]["hot_thr"])},
        "P": {k: pct(v) for k, v in d["P"].items()},
        "S": {k: pct(v) for k, v in d["S"].items()},
        "F": {h: [pct(v) for v in d["factors"][h].values()] for h in d["factors"]},
        "risk": pct(d["composite"]), "zone": d["zone"], "dom": d["dominant"],
        "vuln": pct(d["vuln"]), "vband": d["vband"],
        "vf": [pct(d["vfac"][k]) for k in W_VULN],
        "c": {k: (round(v, 4) if isinstance(v, float) else v) for k, v in c.items() if k not in ("pop", "hh")},
        "expo": {"frac": pct(d["exp_frac"]), "pop": r0(d["exp_pop"]), "idx": pct(d["exp_idx"])},
        "risk_idx": pct(d["risk"]),
        "hist": {"ls": d["ls_events"], "lsf": d["ls_fatal"], "cyc": d["cyc"]["storms"], "cycs": d["cyc"]["severe"],
                 "kt": r0(d["cyc"]["max_kt"]), "idx": pct(d["history"])},
        "reloc": {"score": r1(d["priority"]), "tier": d["tier"], "safe": d["safe_id"], "safe_km": r0(d["safe_km"]),
                  "stab": pct(d["stab_tier"]), "top": pct(d["stab_top"])},
        "terr": {"relief": r0(d["relief"]), "slope": r1(d["slope"]), "s15": pct(d["steep15"]), "s30": pct(d["steep30"]), "emax": r0(d["elev_max"])},
        "seis": d["seis"], "cflag": bool(d["coastal_flag"]),
    }


def simplify_geo(districts):
    feats = []
    tol = 0.02
    for d in districts:
        g = d["geom"].simplify(tol, preserve_topology=True)
        if g.is_empty:
            g = d["geom"]
        m = mapping(g)
        feats.append({"type": "Feature", "id": d["id"], "properties": {}, "geometry": _round_geom(m)})
    states = {}
    for d in districts:
        states.setdefault(d["state"], []).append(d["geom"].simplify(tol, preserve_topology=True).buffer(0))
    sfeats = []
    for name, gs in sorted(states.items()):
        u = unary_union(gs).simplify(tol, preserve_topology=True)
        sfeats.append({"type": "Feature", "properties": {"name": name}, "geometry": _round_geom(mapping(u))})
    return {"type": "FeatureCollection", "features": feats}, {"type": "FeatureCollection", "features": sfeats}


def _round_geom(m):
    def rnd(c):
        if isinstance(c[0], (int, float)):
            return [round(c[0], 3), round(c[1], 3)]
        return [rnd(x) for x in c]
    return {"type": m["type"], "coordinates": rnd(m["coordinates"])}


def coast_lines():
    """Simplified India coastline (for distance-to-coast inside the browser)."""
    lines = []
    for f in load_json("coastline.geojson")["features"]:
        if not f.get("geometry"):
            continue
        g = shape(f["geometry"]).intersection(box(66, 5, 100, 37)).simplify(0.01)
        if g.is_empty:
            continue
        for part in (list(g.geoms) if hasattr(g, "geoms") else [g]):
            if part.geom_type == "LineString" and len(part.coords) >= 3:
                lines.append([[round(x, 3), round(y, 3)] for x, y in part.coords])
    return lines


def distribution(name, vals):
    a = np.array(vals, float)
    print(f"  {name:<12} min {a.min():.2f}  p25 {np.percentile(a,25):.2f}  med {np.median(a):.2f}  p75 {np.percentile(a,75):.2f}  p90 {np.percentile(a,90):.2f}  max {a.max():.2f}")


def main():
    districts = load_districts()
    attach_census(districts)
    prepare_census(districts)
    attach_terrain(districts)
    attach_climate(districts)
    cyclone_stats(districts)
    attach_geography(districts)
    attach_seismic(districts)
    for d in districts:
        hazard_model(d)
    vulnerability_and_priority(districts)

    print("\nDistributions")
    for h in HAZARDS:
        distribution("P " + h, [d["P"][h] for d in districts])
    distribution("composite", [d["composite"] for d in districts])
    distribution("vulnerability", [d["vuln"] for d in districts])
    distribution("priority", [d["priority"] for d in districts])
    zc = {z: sum(d["zone"] == z for d in districts) for z in ("RED", "ORANGE", "YELLOW", "GREEN")}
    print("vulnerability bands", {b: sum(d["vband"] == b for d in districts) for b in ("HIGH", "MEDIUM", "LOW")})
    tc = {t: sum(d["tier"] == t for d in districts) for t in ("immediate", "short_term", "medium_term", "monitor")}
    print("zones", zc, "\ntiers", tc)

    records = [district_record(d) for d in districts]
    dist_geo, state_geo = simplify_geo(districts)
    history = {str(d["id"]): d["ls_top"] for d in districts if d["ls_top"]}

    def dump(name, obj):
        p = OUT / name
        json.dump(obj, open(p, "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
        print(f"wrote {name}: {p.stat().st_size / 1024:.0f} KB")

    dump("districts.json", records)
    dump("geo_districts.json", dist_geo)
    dump("geo_states.json", state_geo)
    dump("history.json", history)
    dump("coast.json", coast_lines())
    dump("meta.json", {
        "generated": dt.date.today().isoformat(),
        "districts": len(records), "states": len({d["state"] for d in districts}),
        "zone_counts": zc, "tier_counts": tc,
        "weights": dict(flood=W_FLOOD, landslide=W_LANDSLIDE, cloudburst=W_CLOUDBURST, coastal=W_COASTAL, vulnerability=W_VULN),
        "vuln_factors": list(W_VULN),
        "zone_cuts": ZONE_CUTS, "tier_cuts": TIER_CUTS, "composite": COMPOSITE_W, "vband_cuts": VBAND_CUTS,
        "cyclone_radius_km": CYCLONE_RADIUS_KM, "cyclone_seasons": list(SEASONS), "climate_years": [2014, 2023],
    })


if __name__ == "__main__":
    main()
