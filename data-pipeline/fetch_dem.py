"""
Zonal terrain statistics over the actual district polygons.

Source: AWS Open Data "Terrain Tiles" (Mapzen/Terrarium, SRTM-derived), zoom 9 (~300 m/px at India's latitudes).
For each district we mosaic the tiles under its bounding box, mask the polygon, compute slope from the elevation
gradient and keep robust statistics (mean elevation, 5th-95th percentile relief, mean slope, share of area steeper
than 15 and 30 degrees). This replaces the earlier 5-point sample around each district centre.

Tiles are cached in .cache/dem9/ so the download happens once.
"""

from __future__ import annotations

import io
import json
import math
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from PIL import Image, ImageDraw

from common import CACHE

Z = 9
TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
DEM_DIR = CACHE / "dem9"
DEM_DIR.mkdir(exist_ok=True)
STATS = CACHE / "dem_stats.json"


def lonlat_to_tile(lon: float, lat: float, z: int = Z) -> tuple[float, float]:
    n = 2 ** z
    x = (lon + 180.0) / 360.0 * n
    y = (1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n
    return x, y


def tile_path(x: int, y: int, z: int = Z):
    if z == Z:
        return DEM_DIR / f"{x}_{y}.png"
    d = CACHE / f"dem{z}"
    d.mkdir(exist_ok=True)
    return d / f"{x}_{y}.png"


def get_tile(x: int, y: int, z: int = Z) -> np.ndarray:
    p = tile_path(x, y, z)
    if not p.exists():
        for attempt in range(5):
            try:
                req = urllib.request.Request(TILE_URL.format(z=z, x=x, y=y), headers={"User-Agent": "TeraShield-SIH2026-build"})
                with urllib.request.urlopen(req, timeout=60) as r:
                    p.write_bytes(r.read())
                break
            except Exception:
                time.sleep(1.5 * (attempt + 1))
        else:
            return np.full((256, 256), np.nan, dtype=np.float32)
    im = np.asarray(Image.open(p).convert("RGB"), dtype=np.float32)
    return (im[..., 0] * 256.0 + im[..., 1] + im[..., 2] / 256.0 - 32768.0).astype(np.float32)


def prefetch(bounds_list) -> None:
    need = set()
    for minx, miny, maxx, maxy in bounds_list:
        x0, y1 = lonlat_to_tile(minx, miny)
        x1, y0 = lonlat_to_tile(maxx, maxy)
        for x in range(int(x0), int(x1) + 1):
            for y in range(int(y0), int(y1) + 1):
                need.add((x, y))
    todo = [t for t in need if not tile_path(*t).exists()]
    print(f"DEM tiles needed {len(need)}, to download {len(todo)}")
    done = 0
    with ThreadPoolExecutor(12) as ex:
        for _ in ex.map(lambda t: get_tile(*t), todo):
            done += 1
            if done % 200 == 0:
                print(f"  {done}/{len(todo)}")


def district_dem_stats(geom) -> dict | None:
    """Robust terrain statistics inside one polygon (shapely geometry in lon/lat)."""
    minx, miny, maxx, maxy = geom.bounds
    x0f, y1f = lonlat_to_tile(minx, miny)
    x1f, y0f = lonlat_to_tile(maxx, maxy)
    tx0, tx1, ty0, ty1 = int(x0f), int(x1f), int(y0f), int(y1f)
    W, H = (tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256
    if W * H > 60_000_000:  # very large district: sample every other pixel
        step = 2
    else:
        step = 1
    mosaic = np.full((H, W), np.nan, dtype=np.float32)
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            mosaic[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = get_tile(tx, ty)

    # rasterise polygon into the mosaic pixel grid
    mask_img = Image.new("L", (W, H), 0)
    draw = ImageDraw.Draw(mask_img)
    polys = list(geom.geoms) if hasattr(geom, "geoms") else [geom]
    for poly in polys:
        if poly.geom_type != "Polygon":
            continue

        def px(ring):
            out = []
            for lon, lat in ring.coords:
                fx, fy = lonlat_to_tile(lon, lat)
                out.append(((fx - tx0) * 256, (fy - ty0) * 256))
            return out

        draw.polygon(px(poly.exterior), fill=1)
        for hole in poly.interiors:
            draw.polygon(px(hole), fill=0)
    mask = np.asarray(mask_img, dtype=bool)

    lat_c = (miny + maxy) / 2
    m_per_px = 156543.03392 * math.cos(math.radians(lat_c)) / (2 ** Z)
    dzdy, dzdx = np.gradient(mosaic, m_per_px)
    slope = np.degrees(np.arctan(np.hypot(dzdx, dzdy)))

    if step > 1:
        mask = mask[::step, ::step]
        mosaic = mosaic[::step, ::step]
        slope = slope[::step, ::step]
    sel = mask & np.isfinite(mosaic) & np.isfinite(slope)
    if sel.sum() < 4:
        return None
    z, s = mosaic[sel], slope[sel]
    p5, p50, p95 = np.percentile(z, [5, 50, 95])
    return dict(
        elev=float(z.mean()), elev_min=float(z.min()), elev_max=float(z.max()), p5=float(p5), p95=float(p95),
        relief=float(p95 - p5), slope=float(s.mean()), slope_p90=float(np.percentile(s, 90)),
        steep15=float((s >= 15).mean()), steep30=float((s >= 30).mean()), px=int(sel.sum()),
    )


def all_stats(districts) -> dict[int, dict]:
    """districts: list of dicts with id + geom. Cached per id."""
    cache: dict[str, dict] = json.loads(STATS.read_text()) if STATS.exists() else {}
    prefetch([d["geom"].bounds for d in districts])
    for i, d in enumerate(districts):
        k = str(d["id"])
        if k in cache:
            continue
        st = district_dem_stats(d["geom"])
        if st is None:
            print("  no DEM px for", d["name"])
            continue
        cache[k] = st
        if i % 50 == 0:
            print(f"  dem stats {i}/{len(districts)}")
            STATS.write_text(json.dumps(cache))
    STATS.write_text(json.dumps(cache))
    return {int(k): v for k, v in cache.items()}


if __name__ == "__main__":
    from build_india_dataset import load_districts

    ds = load_districts()
    out = all_stats(ds)
    print("done", len(out))


def mosaic(bounds, z: int):
    """Elevation mosaic (float32, metres) covering lon/lat bounds at zoom z. Returns (array, tx0, ty0)."""
    minx, miny, maxx, maxy = bounds
    x0f, y1f = lonlat_to_tile(minx, miny, z)
    x1f, y0f = lonlat_to_tile(maxx, maxy, z)
    tx0, tx1, ty0, ty1 = int(x0f), int(x1f), int(y0f), int(y1f)
    tiles = [(x, y) for x in range(tx0, tx1 + 1) for y in range(ty0, ty1 + 1)]
    with ThreadPoolExecutor(12) as ex:
        arrs = list(ex.map(lambda t: get_tile(t[0], t[1], z), tiles))
    m = np.full(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256), np.nan, dtype=np.float32)
    for (x, y), a in zip(tiles, arrs):
        m[(y - ty0) * 256:(y - ty0 + 1) * 256, (x - tx0) * 256:(x - tx0 + 1) * 256] = a
    return m, tx0, ty0


def pixel_to_lonlat(px: np.ndarray, py: np.ndarray, tx0: int, ty0: int, z: int):
    n = 2 ** z
    x = tx0 + px / 256.0
    y = ty0 + py / 256.0
    lon = x / n * 360.0 - 180.0
    lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * y / n))))
    return lon, lat
