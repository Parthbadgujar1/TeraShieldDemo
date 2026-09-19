"""
Replay packs: what the 72-hour alert layer would have seen on the eve of three real events.

Source: Open-Meteo historical archive (ERA5 / ERA5-Land reanalysis). This is reanalysis, not the operational forecast that
was issued at the time — reanalysis smooths cloudbursts, so replayed alerts are, if anything, conservative. The pack is
static so the live demo can replay a monsoon disaster on stage without any network dependency.

Output: frontend/public/data/replays.json  {events:[{id,title,asof,note,f:{districtId:[rain3,rainMax,hourlyMax,peakHour,tmaxMax,gustMax]}}]}
Run:  python build_replays.py
"""

from __future__ import annotations

import json
import time
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "frontend" / "public" / "data"
EVENTS = [
    dict(id="beas-2023", title="Himachal / Beas floods", asof="2023-07-09",
         note="Record monsoon–western-disturbance rain over Himachal, 8–11 Jul 2023: Beas in spate through Kullu, Mandi and Kangra."),
    dict(id="wayanad-2024", title="Wayanad landslides", asof="2024-07-29",
         note="Extremely heavy rain on the Kerala–Karnataka ghats ahead of the 30 Jul 2024 Mundakkai–Chooralmala landslides."),
    dict(id="michaung-2023", title="Cyclone Michaung", asof="2023-12-03",
         note="Cyclone Michaung: Chennai floods, then landfall near Bapatla (Andhra Pradesh) on 5 Dec 2023."),
]


def add_days(d: str, n: int) -> str:
    import datetime as dt
    return (dt.date.fromisoformat(d) + dt.timedelta(days=n)).isoformat()


def fetch(chunk, start, end):
    url = ("https://archive-api.open-meteo.com/v1/archive?latitude=" + ",".join(f"{p['lat']:.3f}" for p in chunk)
           + "&longitude=" + ",".join(f"{p['lon']:.3f}" for p in chunk) + f"&start_date={start}&end_date={end}"
           + "&hourly=precipitation,temperature_2m,wind_gusts_10m&timezone=Asia%2FKolkata&wind_speed_unit=kmh")
    for attempt in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "TeraShield-SIH2026"}), timeout=90) as r:
                j = json.load(r)
            return j if isinstance(j, list) else [j]
        except Exception as e:
            print("   retry", attempt, e)
            time.sleep(8 * (attempt + 1))
    raise RuntimeError("archive request failed")


def main():
    districts = json.load(open(OUT / "districts.json", encoding="utf-8"))
    pts = [dict(id=d["id"], lat=d["lat"], lon=d["lon"]) for d in districts]
    events = []
    for ev in EVENTS:
        end = add_days(ev["asof"], 2)
        f = {}
        print(ev["id"])
        for i in range(0, len(pts), 40):
            chunk = pts[i:i + 40]
            rows = fetch(chunk, ev["asof"], end)
            for p, row in zip(chunk, rows):
                h = row["hourly"]
                pr = [v or 0 for v in h["precipitation"]]
                tm = [v for v in h["temperature_2m"] if v is not None]
                gu = [v or 0 for v in h["wind_gusts_10m"]]
                daily = [round(sum(pr[k * 24:(k + 1) * 24]), 1) for k in range(3)]
                hmax = max(pr) if pr else 0
                f[str(p["id"])] = [round(sum(daily), 1), round(max(daily), 1), round(hmax, 1),
                                   pr.index(hmax) if hmax >= 5 else None, round(max(tm), 1) if tm else 0, round(max(gu), 1)]
            time.sleep(4)
            print(f"  {min(i + 40, len(pts))}/{len(pts)}")
        events.append({**ev, "f": f})
    json.dump(dict(generated=time.strftime("%Y-%m-%d"), source="Open-Meteo historical archive (ERA5 reanalysis)", events=events),
              open(OUT / "replays.json", "w", encoding="utf-8"), separators=(",", ":"))
    print("wrote replays.json", (OUT / "replays.json").stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
