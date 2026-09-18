"""Network stages of the build: SRTM elevation (Open-Meteo) and 10-year daily climate (NASA POWER).

Results are cached under .cache/ so the build is re-runnable offline.
"""

from __future__ import annotations

import concurrent.futures as cf
import json
import math
import time
import urllib.error
import urllib.request

from shapely.geometry import shape

from common import CACHE, load_json

UA = {"User-Agent": "TeraShield-SIH2026-build"}
ELEV_OFFSET_DEG = 0.12


def get_json(url: str, retries: int = 5, timeout: int = 90):
    last = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            last = e
            time.sleep(70 if e.code == 429 else 1.5 * (attempt + 1))
        except Exception as e:  # noqa: BLE001 - network flakiness, retried
            last = e
            time.sleep(8 * (attempt + 1))
    raise RuntimeError(f"failed after {retries} tries: {url[:120]} ({last})")


def district_points():
    feats = load_json("districts.geojson")["features"]
    pts = []
    for i, f in enumerate(feats):
        g = shape(f["geometry"])
        if not g.is_valid:
            g = g.buffer(0)
        p = g.representative_point()
        pts.append((i, p.y, p.x))
    return pts


def fetch_elevation():
    out_path = CACHE / "elevation.json"
    if out_path.exists():
        return json.load(open(out_path))
    part_path = CACHE / "elevation_partial.json"
    done: dict[str, float] = json.load(open(part_path)) if part_path.exists() else {}
    pts = district_points()
    samples = []  # (key, lat, lon): centre + N/S/E/W ~7 km away
    for i, lat, lon in pts:
        dlon = ELEV_OFFSET_DEG / max(0.3, math.cos(math.radians(lat)))
        for k, (a, b) in enumerate([(0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)]):
            samples.append((f"{i}:{k}", lat + a * ELEV_OFFSET_DEG, lon + b * dlon))
    todo = [s for s in samples if s[0] not in done]
    CH = 90
    for s in range(0, len(todo), CH):
        chunk = todo[s:s + CH]
        url = ("https://api.open-meteo.com/v1/elevation?latitude=" + ",".join(f"{c[1]:.4f}" for c in chunk)
               + "&longitude=" + ",".join(f"{c[2]:.4f}" for c in chunk))
        elev = get_json(url)["elevation"]
        for c, e in zip(chunk, elev):
            done[c[0]] = e
        json.dump(done, open(part_path, "w"))
        print(f"elevation {len(done)}/{len(samples)}", flush=True)
        time.sleep(11.5)  # stay under Open-Meteo's 600 coordinates/minute
    result = {}
    for i, lat, lon in pts:
        result[str(i)] = [done[f"{i}:{k}"] for k in range(5)]
    json.dump(result, open(out_path, "w"))
    return result


def power_cell(lat: float, lon: float):
    """NASA POWER (MERRA-2) snaps to a 0.5 x 0.625 degree grid; cache per cell to avoid duplicate calls."""
    return round(lat * 2) / 2, round(lon / 0.625) * 0.625


def fetch_climate():
    pts = district_points()
    cells = {}
    for i, lat, lon in pts:
        cells.setdefault(power_cell(lat, lon), []).append(i)
    d = CACHE / "power"
    d.mkdir(exist_ok=True)

    def job(cell):
        lat, lon = cell
        f = d / f"{lat}_{lon}.json"
        if f.exists():
            return cell, True
        url = ("https://power.larc.nasa.gov/api/temporal/daily/point?start=20140101&end=20231231"
               f"&latitude={lat}&longitude={lon}&community=ag&parameters=PRECTOTCORR,T2M_MAX&format=json")
        data = get_json(url, retries=6, timeout=120)["properties"]["parameter"]
        json.dump({"p": data["PRECTOTCORR"], "t": data["T2M_MAX"]}, open(f, "w"))
        return cell, False

    done = 0
    with cf.ThreadPoolExecutor(max_workers=4) as ex:
        for cell, cached in ex.map(job, list(cells)):
            done += 1
            if done % 25 == 0:
                print(f"climate cells {done}/{len(cells)}", flush=True)
    return cells


if __name__ == "__main__":
    import sys
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    if which in ("all", "elev"):
        fetch_elevation()
    if which in ("all", "climate"):
        fetch_climate()
    print("remote stage complete:", which, flush=True)
