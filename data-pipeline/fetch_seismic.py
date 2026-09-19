"""
Historical seismicity per district from the USGS ComCat catalogue (M >= 4.5, 1990-2023, India and neighbourhood).

This is *observed seismicity* — a context layer. It is not the BIS IS 1893 seismic-zone map, which has no open machine-readable
district table; the UI says so.
"""

from __future__ import annotations

import csv
import io
import math
import urllib.request

import numpy as np

from common import CACHE


def load_quakes() -> np.ndarray:
    p = CACHE / "usgs_quakes.csv"
    if not p.exists():
        rows = []
        for a, b in (("1990-01-01", "2006-12-31"), ("2007-01-01", "2023-12-31")):
            url = ("https://earthquake.usgs.gov/fdsnws/event/1/query?format=csv&orderby=time&limit=20000&minmagnitude=4.5"
                   f"&starttime={a}&endtime={b}&minlatitude=5&maxlatitude=38&minlongitude=66&maxlongitude=100")
            print("downloading USGS", a, b)
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "TeraShield-SIH2026"}), timeout=180) as r:
                rows.append(r.read().decode("utf-8"))
        p.write_text(rows[0] + "\n".join(rows[1].splitlines()[1:]), encoding="utf-8")
    out = []
    for r in csv.DictReader(io.StringIO(p.read_text(encoding="utf-8"))):
        try:
            out.append((float(r["latitude"]), float(r["longitude"]), float(r["mag"])))
        except (ValueError, KeyError):
            pass
    return np.array(out)


def attach_seismic(districts, radius_km: float = 100.0) -> None:
    q = load_quakes()
    print(f"USGS quakes M>=4.5 loaded: {len(q)}")
    for d in districts:
        k = math.cos(math.radians(d["lat"]))
        dx = (q[:, 1] - d["lon"]) * k * 111.32
        dy = (q[:, 0] - d["lat"]) * 110.57
        near = np.hypot(dx, dy) <= radius_km
        mags = q[near, 2]
        d["seis"] = dict(n=int(near.sum()), m6=int((mags >= 6).sum()), max=float(mags.max()) if near.any() else 0.0)
