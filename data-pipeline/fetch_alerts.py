"""
Snapshot of the official NDMA SACHET CAP alert feed (all-India RSS) matched to TeraShield districts.

SACHET does not send CORS headers, so a static site cannot call it from the browser. This script runs at build time
(and every few hours from .github/workflows/refresh-alerts.yml) and writes frontend/public/data/alerts.json.
Alerts name districts in free text, so we match district names; a name shared by several states is only accepted when the
alert text also names the state, otherwise it is reported as unresolved rather than guessed.

Run:  python fetch_alerts.py
"""

from __future__ import annotations

import datetime as dt
import email.utils
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

from common import norm_name

FEED = "https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml"
OUT = Path(__file__).resolve().parent.parent / "frontend" / "public" / "data"

KIND_PATTERNS = [
    ("cyclone", r"cyclon|depression|storm surge"),
    ("flood", r"flood|river|water level|inundat"),
    ("landslide", r"landslide|land slide|mudslide|rockfall"),
    ("heat", r"heat ?wave|hot weather|high temperature"),
    ("lightning", r"lightning|thunder"),
    ("rain", r"heavy rain|very heavy|extremely heavy|rainfall|rain"),
    ("wind", r"gusty|squall|strong wind|high wind"),
    ("fog", r"fog|cold wave"),
]
SEVERITY_PATTERNS = [
    (4, r"extremely heavy|red alert|severe cyclon|very severe"),
    (3, r"very heavy|orange|severe|warning"),
    (2, r"heavy|moderate|watch|yellow"),
]


def kind_of(text: str) -> str:
    t = text.lower()
    for k, pat in KIND_PATTERNS:
        if re.search(pat, t):
            return k
    return "other"


def severity_of(text: str) -> int:
    t = text.lower()
    for s, pat in SEVERITY_PATTERNS:
        if re.search(pat, t):
            return s
    return 1


def load_index():
    districts = json.load(open(OUT / "districts.json", encoding="utf-8"))
    by_name: dict[str, list[dict]] = {}
    states = {}
    for d in districts:
        by_name.setdefault(norm_name(d["n"]), []).append(d)
        states[norm_name(d["s"])] = d["s"]
    return by_name, states


def match_districts(text: str, by_name, states):
    low = " " + re.sub(r"[^a-z0-9]+", " ", text.lower()) + " "
    state_hits = {s for s in states if f" {s} " in low}
    ids, unresolved = [], []
    for name, cands in by_name.items():
        if len(name) < 4 or f" {name} " not in low:
            continue
        if len(cands) == 1:
            ids.append(cands[0]["id"])
            continue
        scoped = [c for c in cands if norm_name(c["s"]) in state_hits]
        if len(scoped) == 1:
            ids.append(scoped[0]["id"])
        else:
            unresolved.append(name)
    return sorted(set(ids)), unresolved, sorted(states[h] for h in state_hits)


def main():
    req = urllib.request.Request(FEED, headers={"User-Agent": "TeraShield-SIH2026-alerts"})
    raw = urllib.request.urlopen(req, timeout=60).read()
    root = ET.fromstring(raw)
    by_name, states = load_index()
    alerts, unresolved_total = [], 0
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip()
        author = (it.findtext("author") or "").strip()
        pub = it.findtext("pubDate") or ""
        try:
            when = email.utils.parsedate_to_datetime(pub).astimezone(dt.timezone.utc).isoformat()
        except Exception:
            when = None
        ids, unres, state_names = match_districts(title, by_name, states)
        unresolved_total += len(unres)
        alerts.append(dict(
            id=(it.findtext("guid") or "").strip(), title=title[:400], category=(it.findtext("category") or "").strip(),
            source=re.sub(r"^.*\(|\).*$", "", author) or author, time=when, kind=kind_of(title),
            severity=severity_of(title), districts=ids, states=state_names, link=(it.findtext("link") or "").strip(),
        ))
    alerts.sort(key=lambda a: a["time"] or "", reverse=True)          # newest first ...
    alerts.sort(key=lambda a: -a["severity"])                        # ... then most severe first (stable)
    payload = dict(
        fetched=dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes"), source=FEED, count=len(alerts),
        matched=sum(1 for a in alerts if a["districts"]), unresolved_names=unresolved_total, alerts=alerts,
    )
    json.dump(payload, open(OUT / "alerts.json", "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
    print(f"alerts {len(alerts)}, matched to districts {payload['matched']}, ambiguous names skipped {unresolved_total}")


if __name__ == "__main__":
    main()
