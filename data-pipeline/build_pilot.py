"""
Habitation-level pilot: red-zone polygons below village level for one district (default: Wayanad, Kerala).

Inputs (all open):
  * DEM ............... AWS Terrarium tiles, zoom 12 (~37 m/px at 11.7 N)
  * drainage .......... OpenStreetMap waterways (rivers + streams >= 1.5 km) -> height above nearest drainage (HAND)
  * settlements ....... OSM place nodes; buildings = OSM building footprints (centroids)
  * population ........ WorldPop 2020 1 km (UN-adjusted) apportioned to the mapped buildings inside each 1 km cell
  * land status ....... OSM landuse / forest / protected-area polygons  (a *proxy* for revenue / forest / private land)
  * events ............ NASA Global Landslide Catalog points inside the district

Terrain classes (per pixel), a screening rule set -- not a geotechnical survey (no lithology, soil depth or land cover):
  RED     slope >= 30 deg  |  within 60 m of a stream and <= 2 m above it  |  slope >= 20 deg within 60 m of >= 30 deg ground (run-out)
  ORANGE  slope 20-30 deg  |  within 200 m of a stream and <= 6 m above it (gentle terrain)  |  slope >= 12 deg within 150 m of >= 30 deg ground
  YELLOW  slope 12-20 deg
Output: frontend/public/data/pilot_<slug>.json
Run:  python build_pilot.py [District name]
"""

from __future__ import annotations

import datetime as dt
import json
import math
import sys
import urllib.request

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from scipy.spatial import cKDTree
from shapely.geometry import Point, Polygon, box, mapping
from shapely.ops import linemerge, polygonize, unary_union
from shapely.prepared import prep

import build_india_dataset as B
from common import CACHE, clamp01, load_csv
from fetch_dem import lonlat_to_tile, mosaic, pixel_to_lonlat
from fetch_osm_pilot import fetch_all

Z = 12
CLASS_NAME = {0: "GREEN", 1: "YELLOW", 2: "ORANGE", 3: "RED"}
LAND = {0: "UNKNOWN", 1: "COMMON", 2: "PRIVATE_AGRI", 3: "BUILT", 4: "FOREST", 5: "PROTECTED", 6: "WATER"}
# housing assumptions (documented in the UI): gross households per hectare of usable, contiguous land
HH_PER_HA = 25
MAX_PARCEL_HA = 40   # one resettlement parcel is not a whole plateau: usable area per site is capped
WORLDPOP = "https://data.worldpop.org/GIS/Population/Global_2000_2020_1km/2020/IND/ind_ppp_2020_1km_Aggregated.tif"


def worldpop():
    import tifffile
    p = CACHE / "worldpop_ind_2020_1km.tif"
    if not p.exists():
        print("downloading WorldPop 1 km (19 MB) ...")
        req = urllib.request.Request(WORLDPOP, headers={"User-Agent": "TeraShield-SIH2026"})
        with urllib.request.urlopen(req, timeout=600) as r:
            p.write_bytes(r.read())
    with tifffile.TiffFile(p) as tf:
        pg = tf.pages[0]
        arr = pg.asarray().astype(np.float32)
        sc = pg.tags["ModelPixelScaleTag"].value
        tie = pg.tags["ModelTiepointTag"].value
    arr[arr < 0] = 0
    return arr, tie[3], tie[4], sc[0], sc[1]


def rings_from_element(e) -> list[Polygon]:
    out = []
    if e["type"] == "way" and e.get("geometry") and len(e["geometry"]) >= 4:
        pts = [(g["lon"], g["lat"]) for g in e["geometry"]]
        if pts[0] == pts[-1]:
            try:
                poly = Polygon(pts)
                if poly.is_valid and not poly.is_empty:
                    out.append(poly)
            except Exception:
                pass
    elif e["type"] == "relation":
        lines = []
        for m in e.get("members", []):
            if m.get("role") == "outer" and m.get("geometry") and len(m["geometry"]) >= 2:
                lines.append([(g["lon"], g["lat"]) for g in m["geometry"]])
        if lines:
            from shapely.geometry import LineString
            merged = linemerge([LineString(l) for l in lines])
            for poly in polygonize(merged):
                out.append(poly)
    return out


def land_class_of(tags: dict) -> int | None:
    lu, nat, lei, bnd = tags.get("landuse"), tags.get("natural"), tags.get("leisure"), tags.get("boundary")
    if bnd in ("protected_area", "national_park") or lei == "nature_reserve":
        return 5
    if lu == "forest" or nat == "wood":
        return 4
    if lu in ("reservoir",) or nat in ("water", "wetland"):
        return 6
    if lu == "residential":
        return 3
    if lu in ("farmland", "orchard", "plantation"):
        return 2
    if lu in ("meadow", "grass", "scrub") or nat == "scrub":
        return 1
    return None


def main(name: str = "Wayanad"):
    slug = name.lower().replace(" ", "-")
    ds = B.load_districts()
    d = next(x for x in ds if x["name"] == name)
    geom = d["geom"]
    rec = next(r for r in json.load(open(B.OUT / "districts.json", encoding="utf-8")) if r["n"] == name and r["s"] == d["state"])
    minx, miny, maxx, maxy = geom.bounds
    print(name, d["state"], "bounds", geom.bounds)

    osm = fetch_all(slug, (miny, minx, maxy, maxx))
    dem, tx0, ty0 = mosaic(geom.bounds, Z)
    H, W = dem.shape
    lat_c = (miny + maxy) / 2
    mpp = 156543.03392 * math.cos(math.radians(lat_c)) / (2 ** Z)
    print(f"grid {W}x{H}, {mpp:.1f} m/px")

    def to_px(lon, lat):
        fx, fy = lonlat_to_tile(lon, lat, Z)
        return (fx - tx0) * 256.0, (fy - ty0) * 256.0

    def raster_poly(poly: Polygon, value: int, img: Image.Image):
        dr = ImageDraw.Draw(img)
        dr.polygon([to_px(x, y) for x, y in poly.exterior.coords], fill=value)

    # district mask
    mimg = Image.new("L", (W, H), 0)
    for poly in (list(geom.geoms) if hasattr(geom, "geoms") else [geom]):
        if poly.geom_type == "Polygon":
            raster_poly(poly, 1, mimg)
            dr = ImageDraw.Draw(mimg)
            for hole in poly.interiors:
                dr.polygon([to_px(x, y) for x, y in hole.coords], fill=0)
    inside = np.asarray(mimg, bool) & np.isfinite(dem)
    dem = np.where(np.isfinite(dem), dem, 0)

    dzdy, dzdx = np.gradient(dem, mpp)
    slope = np.degrees(np.arctan(np.hypot(dzdx, dzdy)))
    # light smoothing: SRTM speckle otherwise flags isolated pixels
    slope = ndi.uniform_filter(slope, 3)

    # ---- drainage: rivers + long streams -> distance and height above nearest drainage
    def way_len_km(coords):
        return sum(B.haversine_km(a[1], a[0], b[1], b[0]) for a, b in zip(coords[:-1], coords[1:]))

    wimg = Image.new("L", (W, H), 0)
    wd = ImageDraw.Draw(wimg)
    kept = 0
    for e in osm["water"]["elements"]:
        g = e.get("geometry")
        if not g or len(g) < 2:
            continue
        coords = [(p["lon"], p["lat"]) for p in g]
        tg = e.get("tags", {})
        if tg.get("waterway") == "river" or way_len_km(coords) >= 1.5 or tg.get("waterway") == "canal":
            wd.line([to_px(x, y) for x, y in coords], fill=1, width=2 if tg.get("waterway") == "river" else 1)
            kept += 1
    stream = np.asarray(wimg, bool)
    print("drainage ways used", kept)
    sdist, (iy, ix) = ndi.distance_transform_edt(~stream, return_indices=True)
    sdist *= mpp
    hand = np.clip(dem - dem[iy, ix], 0, None)

    steep30 = slope >= 30
    d30 = ndi.distance_transform_edt(~steep30) * mpp
    steep20 = slope >= 20
    d20 = ndi.distance_transform_edt(~steep20) * mpp

    cls = np.zeros((H, W), np.uint8)
    cls[slope >= 12] = 1
    cls[(slope >= 20) | ((hand <= 6) & (sdist <= 200) & (slope < 12)) | ((d30 <= 150) & (slope >= 12))] = 2
    cls[(slope >= 30) | ((hand <= 2) & (sdist <= 60)) | ((d30 <= 60) & (slope >= 20))] = 3
    cls[~inside] = 0
    ins = inside
    print("rule shares of district area: slope>=30 %.3f | stream RED %.3f | runout RED %.3f | slope 20-30 %.3f | stream ORANGE %.3f" % (
        (steep30 & ins).mean() / ins.mean(), (((hand <= 2) & (sdist <= 60)) & ins).mean() / ins.mean(),
        (((d30 <= 60) & (slope >= 20)) & ins).mean() / ins.mean(), (((slope >= 20) & (slope < 30)) & ins).mean() / ins.mean(),
        (((hand <= 6) & (sdist <= 200) & (slope < 12)) & ins).mean() / ins.mean()))
    share = {CLASS_NAME[k]: float((cls[inside] == k).mean()) for k in range(4)}
    print("terrain class share", {k: round(v, 3) for k, v in share.items()})

    # ---- vectorise RED / ORANGE (union of run-length boxes on a 2x2 downsample)
    def vectorise(mask: np.ndarray, min_ha: float):
        ds2 = mask[: H // 2 * 2, : W // 2 * 2].reshape(H // 2, 2, W // 2, 2).max(axis=(1, 3))
        boxes = []
        for r in range(ds2.shape[0]):
            row = ds2[r]
            if not row.any():
                continue
            edges = np.diff(np.r_[0, row.astype(np.int8), 0])
            for a, b in zip(np.nonzero(edges == 1)[0], np.nonzero(edges == -1)[0]):
                boxes.append(box(a * 2, r * 2, b * 2, r * 2 + 2))
        u = unary_union(boxes).simplify(2.0, preserve_topology=True)
        polys = list(u.geoms) if hasattr(u, "geoms") else [u]
        ha_px = (mpp ** 2) / 1e4
        feats = []
        for p in polys:
            if p.area * ha_px < min_ha:
                continue

            def conv(ring):
                xs, ys = np.array(ring.coords).T
                lon, lat = pixel_to_lonlat(xs, ys, tx0, ty0, Z)
                return [[round(float(a), 4), round(float(b), 4)] for a, b in zip(lon, lat)]

            feats.append([conv(p.exterior)] + [conv(i) for i in p.interiors if Polygon(i).area * ha_px >= min_ha])
        return feats

    red_polys = vectorise(cls == 3, 1.5)
    orange_polys = vectorise(cls == 2, 5.0)
    print("polygons", len(red_polys), len(orange_polys))

    # ---- land status raster (proxy)
    limg = Image.new("L", (W, H), 0)
    polys_by_class: dict[int, list[Polygon]] = {}
    for e in osm["landuse"]["elements"]:
        c = land_class_of(e.get("tags", {}))
        if c is None:
            continue
        polys_by_class.setdefault(c, []).extend(rings_from_element(e))
    for c in (1, 2, 3, 6, 4, 5):                   # later classes overwrite earlier ones
        for p in polys_by_class.get(c, []):
            raster_poly(p, c, limg)
    land = np.asarray(limg)
    print("land polygons", {LAND[k]: len(v) for k, v in polys_by_class.items()})

    # ---- roads
    rimg = Image.new("L", (W, H), 0)
    rd = ImageDraw.Draw(rimg)
    for e in osm["roads"]["elements"]:
        g = e.get("geometry")
        if g and len(g) > 1:
            rd.line([to_px(p["lon"], p["lat"]) for p in g], fill=1)
    road_d = ndi.distance_transform_edt(~np.asarray(rimg, bool)) * mpp
    risk_d = ndi.distance_transform_edt(~(cls >= 2)) * mpp

    # ---- buildings + WorldPop
    pop_arr, wlon0, wlat0, wsx, wsy = worldpop()
    bl = [(e["center"]["lon"], e["center"]["lat"]) for e in osm["buildings"]["elements"] if e.get("center")]
    B_lon = np.array([b[0] for b in bl])
    B_lat = np.array([b[1] for b in bl])
    bx, by = np.array([to_px(x, y) for x, y in bl]).T
    bxi, byi = np.clip(bx.astype(int), 0, W - 1), np.clip(by.astype(int), 0, H - 1)
    b_in = inside[byi, bxi]
    B_lon, B_lat, bxi, byi = B_lon[b_in], B_lat[b_in], bxi[b_in], byi[b_in]
    b_cls = cls[byi, bxi]
    wc = np.floor((B_lon - wlon0) / wsx).astype(int)
    wr = np.floor((wlat0 - B_lat) / wsy).astype(int)
    key = wr * pop_arr.shape[1] + wc
    uniq, inv, cnt = np.unique(key, return_inverse=True, return_counts=True)
    cell_pop = pop_arr[uniq // pop_arr.shape[1], uniq % pop_arr.shape[1]]
    b_pop = (cell_pop / cnt)[inv]
    # population of 1 km cells inside the district that hold no mapped building (reported, not assigned)
    ry, rx = np.nonzero(inside[::8, ::8])
    clon, clat = pixel_to_lonlat(rx * 8.0, ry * 8.0, tx0, ty0, Z)
    ckey = set(((np.floor((wlat0 - clat) / wsy)).astype(int) * pop_arr.shape[1] + np.floor((clon - wlon0) / wsx).astype(int)).tolist())
    pop_total = float(sum(pop_arr[k // pop_arr.shape[1], k % pop_arr.shape[1]] for k in ckey))
    pop_mapped = float(b_pop.sum())
    print(f"buildings in district {len(B_lon)}, WorldPop total {pop_total:,.0f}, assigned to mapped buildings {pop_mapped:,.0f}")

    # ---- villages
    prepared = prep(geom)
    places = []
    for e in osm["places"]["elements"]:
        tg = e.get("tags", {})
        if not tg.get("name") or tg.get("place") == "isolated_dwelling":
            continue
        if prepared.contains(Point(e["lon"], e["lat"])):
            places.append(dict(name=tg["name"], kind=tg["place"], lat=e["lat"], lon=e["lon"], osm=e["id"]))
    print("named settlements inside district:", len(places))
    px_pl = np.array([to_px(p["lon"], p["lat"]) for p in places])
    tree = cKDTree(np.c_[B_lon, B_lat])
    vt = cKDTree(np.c_[[p["lon"] for p in places], [p["lat"] for p in places]])
    # each building -> nearest settlement (within ~1.6 km)
    dd, nearest = vt.query(np.c_[B_lon, B_lat])
    ok = dd < 0.015
    ev = load_csv("landslides.csv")
    events = []
    for r in ev:
        try:
            lat, lon = float(r["latitude"]), float(r["longitude"])
        except (ValueError, KeyError):
            continue
        if prepared.contains(Point(lon, lat)):
            import re
            ym = re.search(r"(19|20)\d{2}", (r.get("event_date") or "").split(" ")[0])
            fat = r.get("fatality_count") or ""
            events.append(dict(lat=round(lat, 4), lon=round(lon, 4), year=int(ym.group(0)) if ym else None,
                               fat=int(float(fat)) if fat.replace(".", "").isdigit() else 0,
                               title=(r.get("event_title") or "")[:90], trigger=(r.get("landslide_trigger") or "")[:24]))
    print("NASA catalogue events inside district:", len(events))
    ev_tree = cKDTree(np.c_[[e["lon"] for e in events], [e["lat"] for e in events]]) if events else None

    R = 4  # 150 m disc
    yy, xx = np.ogrid[-R:R + 1, -R:R + 1]
    disc = (xx * xx + yy * yy) <= R * R
    villages = []
    for i, p in enumerate(places):
        cx, cy = int(px_pl[i][0]), int(px_pl[i][1])
        if not (R <= cx < W - R and R <= cy < H - R):
            continue
        win = cls[cy - R:cy + R + 1, cx - R:cx + R + 1][disc]
        sl = slope[cy - R:cy + R + 1, cx - R:cx + R + 1][disc]
        red_f, org_f, yel_f = float((win == 3).mean()), float((win == 2).mean()), float((win == 1).mean())
        centre = int(cls[cy, cx])
        reasons = []
        if centre == 3 or red_f >= 0.10:
            zone = "RED"
        elif centre == 2 or red_f + org_f >= 0.20:
            zone = "ORANGE"
        elif centre == 1 or yel_f >= 0.30:
            zone = "YELLOW"
        else:
            zone = "GREEN"
        if float(sl.max()) >= 30:
            reasons.append("SLOPE_GE30_WITHIN_150M")
        if hand[cy, cx] <= 2 and sdist[cy, cx] <= 60:
            reasons.append("STREAM_BANK_HAND_LE2M")
        elif hand[cy, cx] <= 6 and sdist[cy, cx] <= 200:
            reasons.append("STREAM_TERRACE_HAND_LE6M")
        if d30[cy, cx] <= 60 and slope[cy, cx] >= 20:
            reasons.append("RUNOUT_BELOW_STEEP_SLOPE")
        sel = ok & (nearest == i)
        nb = int(sel.sum())
        pop = float(b_pop[sel].sum())
        pop_red = float(b_pop[sel & (b_cls == 3)].sum())
        pop_org = float(b_pop[sel & (b_cls == 2)].sum())
        n_ev, ev_year, ev_fat = 0, None, 0
        if ev_tree is not None:
            hits = ev_tree.query_ball_point([p["lon"], p["lat"]], r=0.045)
            n_ev = len(hits)
            if hits:
                ev_year = max([events[h]["year"] or 0 for h in hits]) or None
                ev_fat = sum(events[h]["fat"] for h in hits)
                reasons.append(f"CATALOGUED_LANDSLIDE_WITHIN_5KM_{ev_year}" if ev_year else "CATALOGUED_LANDSLIDE_WITHIN_5KM")
        villages.append(dict(
            id=i, name=p["name"], kind=p["kind"], lat=round(p["lat"], 5), lon=round(p["lon"], 5), zone=zone,
            elev=int(dem[cy, cx]), slope=round(float(slope[cy, cx]), 1), slope_max=round(float(sl.max()), 1),
            hand=round(float(hand[cy, cx]), 1), red_f=round(red_f, 2), org_f=round(org_f, 2),
            bld=nb, pop=int(round(pop)), pop_red=int(round(pop_red)), pop_org=int(round(pop_org)),
            bld_red=int((sel & (b_cls == 3)).sum()), bld_org=int((sel & (b_cls == 2)).sum()),
            ev=n_ev, ev_year=ev_year, ev_fat=ev_fat, reasons=reasons,
        ))

    # ---- candidate resettlement sites
    elig = inside & (cls == 0) & (slope <= 10) & (d20 >= 300) & ((hand >= 12) | (sdist >= 250)) & (land != 6)
    amen = [(e.get("lon") or e.get("center", {}).get("lon"), e.get("lat") or e.get("center", {}).get("lat"), e["tags"].get("amenity"))
            for e in osm["amenity"]["elements"] if e.get("tags")]
    amen = [a for a in amen if a[0] is not None]

    def nearest_km(kinds):
        pts = [(a[0], a[1]) for a in amen if a[2] in kinds]
        if not pts:
            return None
        t = cKDTree(np.array(pts))
        return t

    trees = {k: nearest_km(v) for k, v in dict(school={"school", "college"}, health={"hospital", "clinic", "doctors"}, water={"drinking_water"}).items()}
    kmlon = 111.32 * math.cos(math.radians(lat_c))

    def near_km(t, lon, lat):
        if t is None:
            return None
        dist, _ = t.query([lon, lat])
        return round(float(dist) * 111.0, 2)

    sites = []
    ha_px = (mpp ** 2) / 1e4
    for c in (0, 1, 2, 3, 4, 5):
        m = elig & (land == c)
        lab, n = ndi.label(m, structure=np.ones((3, 3)))
        if not n:
            continue
        sizes = ndi.sum(m, lab, index=np.arange(1, n + 1))
        inner = ndi.distance_transform_edt(lab > 0)
        for k in np.argsort(-sizes)[:120]:
            area = sizes[k] * ha_px
            if area < 2.0:
                break
            comp = lab == k + 1
            ys, xs = np.nonzero(comp)
            j = int(np.argmax(inner[ys, xs]))                     # most interior pixel = usable core
            cy, cx = int(ys[j]), int(xs[j])
            lon, lat = pixel_to_lonlat(np.array([cx + 0.5]), np.array([cy + 0.5]), tx0, ty0, Z)
            lon, lat = float(lon[0]), float(lat[0])
            stream_m = float(sdist[cy, cx])
            wpt = near_km(trees["water"], lon, lat)
            usable = min(float(area), MAX_PARCEL_HA)
            space = usable * HH_PER_HA
            water_ok = stream_m <= 800 or (wpt is not None and wpt <= 1.0)
            access = float(road_d[cy, cx]) <= 500
            cap_space, cap_water, cap_access = space, space if water_ok else space * 0.4, space if access else space * 0.5
            caps = {"space": cap_space, "water": cap_water, "access": cap_access}
            bind = min(caps, key=caps.get)
            sites.append(dict(
                id=len(sites), lat=round(lat, 5), lon=round(lon, 5), area=round(float(area), 1), usable=round(usable, 1), land=LAND[c],
                elev=int(dem[cy, cx]), slope=round(float(slope[cy, cx]), 1), hand=round(float(hand[cy, cx]), 1),
                risk_m=int(min(risk_d[cy, cx], 9999)), road_m=int(min(road_d[cy, cx], 9999)), stream_m=int(min(stream_m, 9999)),
                school_km=near_km(trees["school"], lon, lat), health_km=near_km(trees["health"], lon, lat), water_km=wpt,
                cap_hh=int(min(caps.values())), cap_space=int(space), bind=bind,
                cap_status=dict(space="VALIDATED", access="PARTIAL", water="PARTIAL" if water_ok else "UNVALIDATED", sanitation="UNVALIDATED"),
            ))
    sites.sort(key=lambda s: -s["area"])
    for i, s in enumerate(sites):
        s["id"] = i
    print("sites", len(sites), {k: sum(1 for s in sites if s["land"] == k) for k in LAND.values()})

    # ---- priority per village (same weights and tier cuts as the national model; district-level vulnerability/history proxies)
    st = np.array([[s["lon"], s["lat"]] for s in sites])
    site_tree = cKDTree(st) if len(st) else None
    vuln = rec["vuln"]
    hist_d = rec["hist"]["idx"]
    pops = np.array([v["pop"] for v in villages], float)
    for v in villages:
        zone_score = {"RED": 100, "ORANGE": 70, "YELLOW": 35, "GREEN": 5}[v["zone"]]
        expo = 100 * clamp01(math.log10(v["pop"] + 1) / 3.7)
        hist = 100 * clamp01(0.5 * clamp01(v["ev"] / 3) + 0.5 * hist_d / 100)
        feas = 0.0
        near_site = None
        if site_tree is not None:
            okays = [i for i in site_tree.query_ball_point([v["lon"], v["lat"]], r=0.09) if sites[i]["land"] != "PROTECTED"]
            if okays:
                best = min(okays, key=lambda i: (v["lon"] - sites[i]["lon"]) ** 2 + (v["lat"] - sites[i]["lat"]) ** 2)
                near_site = best
                feas = 100.0
            else:
                v["reasons"].append("NO_ELIGIBLE_SITE_WITHIN_10KM")
        v["score"] = round(0.35 * zone_score + 0.25 * vuln + 0.15 * expo + 0.15 * hist + 0.10 * feas, 1)
        v["tier"] = B.tier_for(v["score"], v["zone"])
        v["site"] = near_site

    zc = {z: sum(v["zone"] == z for v in villages) for z in ("RED", "ORANGE", "YELLOW", "GREEN")}
    tc = {t: sum(v["tier"] == t for v in villages) for t in ("immediate", "short_term", "medium_term", "monitor")}
    print("village zones", zc, "tiers", tc)

    # ---- checks against known events
    checks = []
    for nm in ("Mundakkai", "Chooralmala", "Punchirimattam", "Attamala"):  # settlements named in reports of the 30 Jul 2024 disaster
        for v in villages:
            if v["name"].lower().startswith(nm.lower()):
                checks.append(dict(name=v["name"], zone=v["zone"], slope_max=v["slope_max"], hand=v["hand"], reasons=v["reasons"]))
                break
    ev_in = 0
    for e in events:
        x, y = to_px(e["lon"], e["lat"])
        xi, yi = int(x), int(y)
        if 0 <= xi < W and 0 <= yi < H:
            win = cls[max(0, yi - 4):yi + 5, max(0, xi - 4):xi + 5]
            e["cls"] = CLASS_NAME[int(win.max())]
            ev_in += int(win.max() >= 2)
    summary = dict(
        area_km2=round(float(inside.sum() * mpp * mpp / 1e6), 0),
        terrain_share={k: round(v, 3) for k, v in share.items()},
        villages=zc, tiers=tc, buildings_mapped=int(len(B_lon)),
        buildings_red=int((b_cls == 3).sum()), buildings_orange=int((b_cls == 2).sum()),
        pop_worldpop=int(pop_total), pop_assigned=int(pop_mapped),
        pop_red=int(b_pop[b_cls == 3].sum()), pop_orange=int(b_pop[b_cls == 2].sum()),
        events=len(events), events_in_red_orange=ev_in,
        sites=len(sites), sites_by_land={k: sum(1 for s in sites if s["land"] == k) for k in LAND.values() if any(s["land"] == k for s in sites)},
    )
    out = dict(
        generated=dt.date.today().isoformat(),
        district=dict(id=rec["id"], name=name, state=d["state"], lat=rec["lat"], lon=rec["lon"],
                      bbox=[round(miny, 3), round(minx, 3), round(maxy, 3), round(maxx, 3)], pop_census=rec["pop"], hh=rec["hh"],
                      vuln=rec["vuln"], hist=rec["hist"]["idx"]),
        method=dict(
            dem="AWS Terrarium tiles z12 (SRTM-derived), 37 m/px, 3x3 mean slope", grid_m=round(mpp, 1),
            rules={"RED": "slope >= 30 deg | <= 2 m above a stream and within 60 m | slope >= 20 deg within 60 m of >= 30 deg ground (run-out)",
                   "ORANGE": "slope 20-30 deg | <= 6 m above a stream and within 200 m (gentle terrain) | slope >= 12 deg within 150 m of >= 30 deg ground",
                   "YELLOW": "slope 12-20 deg"},
            village_rule="RED if the village point or >= 10% of its 150 m disc is RED terrain; ORANGE if the point is ORANGE or >= 20% of the disc is RED/ORANGE",
            site_rule="GREEN terrain, slope <= 10 deg, >= 300 m from >= 20 deg slopes, >= 12 m above drainage or >= 250 m from it, contiguous area >= 2 ha (usable parcel capped at 40 ha)",
            hh_per_ha=HH_PER_HA, max_parcel_ha=MAX_PARCEL_HA, land_proxy="OSM landuse / forest / protected-area polygons (proxy; not Bhulekh or forest-department records)",
            population="WorldPop 2020 1 km apportioned equally to OSM buildings in each cell", not_modelled=["lithology", "soil depth", "land cover / NDVI", "rainfall thresholds"],
        ),
        summary=summary, checks=checks,
        red=red_polys, orange=orange_polys, villages=villages, sites=sites, events=events,
    )
    p = B.OUT / f"pilot_{slug}.json"
    json.dump(out, open(p, "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
    print(f"wrote {p.name}: {p.stat().st_size / 1024:.0f} KB")
    print(json.dumps(summary, indent=1))
    print("checks", checks)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "Wayanad")
