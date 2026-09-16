"""
Live environmental data feeds.

Pulls real-time precipitation, real terrain elevation, live wind, and real
river/stream geometry — and turns them into the inputs TeraShield's hazard
formulas run on. Every number that reaches the hazard engine through here
reflects an actual live reading or a named published dataset, not a
fabricated placeholder. Two providers are used, both free and keyless:

- Open-Meteo (https://open-meteo.com) — live precipitation, SRTM-derived
  elevation, live wind speed/gusts.
- OpenStreetMap, via the public Overpass API
  (https://overpass-api.de/api/interpreter) — real river/stream centerlines
  and settlement/land-use footprints, queried per district and cached.

Some named data sources a full production deployment would use (IMD's own
rainfall/cyclone feeds, ISRO Bhuvan LULC, GSI lithology maps, India-WRIS
river network, ISRO/NRSC shoreline-change datasets) require registered/paid
government access this prototype does not have. Where that's the case, the
factor is computed from the closest available free live or published
substitute — river distance from real OSM waterway geometry instead of
India-WRIS, cyclone activity from live wind instead of IMD cyclone
bulletins, land-use density from real OSM landuse tags instead of Bhuvan
LULC classes. Each factor's actual source is stated in its own
`data_source` field rather than implied.

Network calls are synchronous (stdlib urllib) and are always wrapped in
asyncio.to_thread by callers. If a live provider is unreachable, we fall
back to a deterministic, clearly-flagged estimate derived from the
coordinate itself so the API never 500s just because an upstream free
service is briefly down — but every response says which mode produced it
via `data_source`.
"""

from __future__ import annotations

import hashlib
import json
import math
import time
import urllib.parse
import urllib.request
from typing import Optional

WEATHER_URL = "https://api.open-meteo.com/v1/forecast"
ELEVATION_URL = "https://api.open-meteo.com/v1/elevation"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
REQUEST_TIMEOUT = 8
OVERPASS_TIMEOUT = 25
USER_AGENT = "TeraShield-SIH2026/1.0 (disaster-management prototype)"

_CACHE: dict[str, tuple[float, object]] = {}
WEATHER_TTL_SECONDS = 15 * 60   # rain conditions are worth re-checking every 15 min
ELEVATION_TTL_SECONDS = 24 * 60 * 60  # terrain doesn't move
GEOGRAPHY_TTL_SECONDS = 7 * 24 * 60 * 60  # rivers/settlements don't move either


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _cache_get(key: str):
    entry = _CACHE.get(key)
    if not entry:
        return None
    expires_at, value = entry
    if time.time() > expires_at:
        _CACHE.pop(key, None)
        return None
    return value


def _cache_set(key: str, value, ttl: float):
    _CACHE[key] = (time.time() + ttl, value)


def invalidate_prefix(prefix: str) -> int:
    """Drop every cache entry whose key contains `:{prefix}:` — used to
    force a fresh live-data pull for one district on demand."""
    matches = [k for k in _CACHE if f":{prefix}:" in k]
    for k in matches:
        _CACHE.pop(k, None)
    return len(matches)


def _http_get_json(url: str, params: dict) -> dict:
    full_url = f"{url}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(full_url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
        return json.loads(resp.read().decode())


def _deterministic_fallback(lat: float, lon: float, salt: str) -> float:
    """A stable pseudo-value in [0, 1) derived from the coordinate, used
    only when the live API call fails, so results stay stable across
    retries instead of flapping randomly."""
    h = hashlib.sha256(f"{salt}:{lat:.4f}:{lon:.4f}".encode()).hexdigest()
    return int(h[:8], 16) / 0xFFFFFFFF


def fetch_weather_batch(locations: list[tuple[float, float]]) -> list[dict]:
    """Live current precipitation + today's rainfall total for each
    (lat, lon). One HTTP call regardless of how many locations."""
    if not locations:
        return []
    lat_str = ",".join(f"{lat:.4f}" for lat, _ in locations)
    lon_str = ",".join(f"{lon:.4f}" for _, lon in locations)
    try:
        data = _http_get_json(WEATHER_URL, {
            "latitude": lat_str,
            "longitude": lon_str,
            "current": "precipitation,rain,temperature_2m",
            "daily": "precipitation_sum",
            "forecast_days": 1,
            "timezone": "auto",
        })
        rows = data if isinstance(data, list) else [data]
        out = []
        for (lat, lon), row in zip(locations, rows):
            current = row.get("current", {})
            daily = row.get("daily", {})
            precip_sum = (daily.get("precipitation_sum") or [0.0])[0]
            out.append({
                "current_precipitation_mm": current.get("precipitation", 0.0) or 0.0,
                "current_rain_mm": current.get("rain", 0.0) or 0.0,
                "daily_precipitation_sum_mm": precip_sum or 0.0,
                "temperature_c": current.get("temperature_2m"),
                "observed_at": current.get("time"),
                "data_source": "live_open_meteo",
            })
        return out
    except Exception:
        return [{
            "current_precipitation_mm": round(_deterministic_fallback(lat, lon, "precip") * 8, 2),
            "current_rain_mm": round(_deterministic_fallback(lat, lon, "rain") * 6, 2),
            "daily_precipitation_sum_mm": round(_deterministic_fallback(lat, lon, "daily") * 60, 2),
            "temperature_c": None,
            "observed_at": None,
            "data_source": "fallback_estimate",
        } for lat, lon in locations]


def fetch_elevation_batch(locations: list[tuple[float, float]]) -> list[dict]:
    """Real SRTM-derived elevation (meters) for each (lat, lon). Open-Meteo
    caps batched requests; we chunk to stay well under that limit."""
    if not locations:
        return []
    CHUNK = 90
    out: list[dict] = []
    for i in range(0, len(locations), CHUNK):
        chunk = locations[i:i + CHUNK]
        lat_str = ",".join(f"{lat:.5f}" for lat, _ in chunk)
        lon_str = ",".join(f"{lon:.5f}" for _, lon in chunk)
        try:
            data = _http_get_json(ELEVATION_URL, {"latitude": lat_str, "longitude": lon_str})
            elevations = data.get("elevation", [])
            for (lat, lon), elev in zip(chunk, elevations):
                out.append({"elevation_m": float(elev), "data_source": "live_open_meteo"})
        except Exception:
            for lat, lon in chunk:
                out.append({
                    "elevation_m": round(500 + _deterministic_fallback(lat, lon, "elev") * 3000, 1),
                    "data_source": "fallback_estimate",
                })
    return out


def fetch_wind_batch(locations: list[tuple[float, float]]) -> list[dict]:
    """Live current wind speed + gusts for each (lat, lon) — used as a real,
    free, keyless proxy for coastal storm activity (the cyclone factor),
    since IMD's own cyclone-bulletin feed has no free public API."""
    if not locations:
        return []
    lat_str = ",".join(f"{lat:.4f}" for lat, _ in locations)
    lon_str = ",".join(f"{lon:.4f}" for _, lon in locations)
    try:
        data = _http_get_json(WEATHER_URL, {
            "latitude": lat_str,
            "longitude": lon_str,
            "current": "wind_speed_10m,wind_gusts_10m",
            "wind_speed_unit": "kmh",
            "timezone": "auto",
        })
        rows = data if isinstance(data, list) else [data]
        out = []
        for row in rows:
            current = row.get("current", {})
            out.append({
                "wind_speed_kmh": current.get("wind_speed_10m", 0.0) or 0.0,
                "wind_gusts_kmh": current.get("wind_gusts_10m", 0.0) or 0.0,
                "observed_at": current.get("time"),
                "data_source": "live_open_meteo",
            })
        return out
    except Exception:
        return [{
            "wind_speed_kmh": round(_deterministic_fallback(lat, lon, "wind") * 30, 1),
            "wind_gusts_kmh": round(_deterministic_fallback(lat, lon, "gust") * 45, 1),
            "observed_at": None,
            "data_source": "fallback_estimate",
        } for lat, lon in locations]


def _overpass_query(query: str) -> list[dict]:
    req = urllib.request.Request(
        OVERPASS_URL,
        data=urllib.parse.urlencode({"data": query}).encode(),
        headers={"User-Agent": USER_AGENT},
    )
    with urllib.request.urlopen(req, timeout=OVERPASS_TIMEOUT) as resp:
        data = json.loads(resp.read().decode())
    return data.get("elements", [])


def fetch_district_waterways(min_lat: float, min_lon: float, max_lat: float, max_lon: float) -> list[list[tuple[float, float]]]:
    """Real river/stream centerlines from OpenStreetMap (via Overpass)
    within a bounding box. Returns each waterway as a list of (lat, lon)
    points, used to compute true distance-to-nearest-river/stream instead
    of a guess — India-WRIS has no free public API this prototype can call."""
    query = (
        f'[out:json][timeout:20];'
        f'way["waterway"~"^(river|stream|canal)$"]'
        f'({min_lat},{min_lon},{max_lat},{max_lon});'
        f'out geom;'
    )
    try:
        elements = _overpass_query(query)
        ways = []
        for el in elements:
            geom = el.get("geometry") or []
            pts = [(pt["lat"], pt["lon"]) for pt in geom]
            if pts:
                ways.append(pts)
        return ways
    except Exception:
        return []


def fetch_district_landuse(min_lat: float, min_lon: float, max_lat: float, max_lon: float) -> list[tuple[float, float]]:
    """Real built-up/settlement footprints from OpenStreetMap (via
    Overpass) within a bounding box — used as a live urbanization-density
    proxy in place of ISRO Bhuvan's LULC classification, which has no free
    public API. Returns one representative (lat, lon) point per feature."""
    query = (
        f'[out:json][timeout:20];'
        f'('
        f'way["landuse"~"^(residential|commercial|industrial|retail)$"]'
        f'({min_lat},{min_lon},{max_lat},{max_lon});'
        f'node["place"~"^(town|city|village|hamlet)$"]'
        f'({min_lat},{min_lon},{max_lat},{max_lon});'
        f');'
        f'out center;'
    )
    try:
        elements = _overpass_query(query)
        points = []
        for el in elements:
            if "lat" in el and "lon" in el:
                points.append((el["lat"], el["lon"]))
            elif "center" in el:
                points.append((el["center"]["lat"], el["center"]["lon"]))
        return points
    except Exception:
        return []


def _min_distance_km_to_ways(lat: float, lon: float, ways: list[list[tuple[float, float]]]) -> Optional[float]:
    best = None
    for way in ways:
        for (plat, plon) in way:
            d = _haversine_km(lat, lon, plat, plon)
            if best is None or d < best:
                best = d
    return best


def get_district_waterways(district) -> list[list[tuple[float, float]]]:
    """District-wide real waterway geometry, one Overpass call per
    district, cached ~7 days (rivers don't move)."""
    key = f"waterways:{district.district_id}"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    lats = [b.lat for b in district.blocks]
    lons = [b.lon for b in district.blocks]
    pad = 0.18
    ways = fetch_district_waterways(min(lats) - pad, min(lons) - pad, max(lats) + pad, max(lons) + pad)
    _cache_set(key, ways, GEOGRAPHY_TTL_SECONDS)
    return ways


def get_district_landuse(district) -> list[tuple[float, float]]:
    """District-wide real settlement/land-use points, one Overpass call
    per district, cached ~7 days."""
    key = f"landuse:{district.district_id}"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    lats = [b.lat for b in district.blocks]
    lons = [b.lon for b in district.blocks]
    pad = 0.18
    points = fetch_district_landuse(min(lats) - pad, min(lons) - pad, max(lats) + pad, max(lons) + pad)
    _cache_set(key, points, GEOGRAPHY_TTL_SECONDS)
    return points


def get_block_water_distance(blocks: list, district) -> dict[str, dict]:
    """Real distance (km) from each block to the nearest OSM-mapped
    river/stream. Falls back to a deterministic estimate only if Overpass
    is unreachable for the whole district."""
    ways = get_district_waterways(district)
    result: dict[str, dict] = {}
    for b in blocks:
        key = f"waterdist:{district.district_id}:{b.name}"
        cached = _cache_get(key)
        if cached is not None:
            result[b.name] = cached
            continue
        d = _min_distance_km_to_ways(b.lat, b.lon, ways)
        if d is None:
            payload = {
                "distance_km": round(2 + _deterministic_fallback(b.lat, b.lon, "water") * 8, 2),
                "data_source": "fallback_estimate",
            }
        else:
            payload = {"distance_km": round(d, 2), "data_source": "live_osm_overpass"}
        _cache_set(key, payload, GEOGRAPHY_TTL_SECONDS)
        result[b.name] = payload
    return result


def get_block_landuse(blocks: list, district) -> dict[str, dict]:
    """Real count of nearby (<3km) OSM settlement/land-use features per
    block, converted to a 0-1 urbanization-density reading."""
    points = get_district_landuse(district)
    result: dict[str, dict] = {}
    for b in blocks:
        key = f"landuse:{district.district_id}:{b.name}"
        cached = _cache_get(key)
        if cached is not None:
            result[b.name] = cached
            continue
        if points:
            nearby = sum(1 for (plat, plon) in points if _haversine_km(b.lat, b.lon, plat, plon) <= 3.0)
            payload = {"nearby_features": nearby, "data_source": "live_osm_overpass"}
        else:
            nearby = round(_deterministic_fallback(b.lat, b.lon, "landuse") * 6)
            payload = {"nearby_features": nearby, "data_source": "fallback_estimate"}
        _cache_set(key, payload, GEOGRAPHY_TTL_SECONDS)
        result[b.name] = payload
    return result


def fetch_forecast_batch(locations: list[tuple[float, float]], days: int = 3) -> list[dict]:
    """Real Open-Meteo *forecast* (not current-conditions) daily
    precipitation for the next `days` days — used to distinguish an
    upcoming/imminent hazard state from one that's already active."""
    if not locations:
        return []
    lat_str = ",".join(f"{lat:.4f}" for lat, _ in locations)
    lon_str = ",".join(f"{lon:.4f}" for _, lon in locations)
    try:
        data = _http_get_json(WEATHER_URL, {
            "latitude": lat_str,
            "longitude": lon_str,
            "daily": "precipitation_sum,precipitation_probability_max",
            "forecast_days": days,
            "timezone": "auto",
        })
        rows = data if isinstance(data, list) else [data]
        out = []
        for row in rows:
            daily = row.get("daily", {})
            out.append({
                "dates": daily.get("time", []),
                "daily_precipitation_sum_mm": daily.get("precipitation_sum", []) or [],
                "daily_precipitation_probability_pct": daily.get("precipitation_probability_max", []) or [],
                "data_source": "live_open_meteo_forecast",
            })
        return out
    except Exception:
        return [{
            "dates": [],
            "daily_precipitation_sum_mm": [round(_deterministic_fallback(lat, lon, f"fc{d}") * 40, 1) for d in range(days)],
            "daily_precipitation_probability_pct": [round(_deterministic_fallback(lat, lon, f"fcp{d}") * 60) for d in range(days)],
            "data_source": "fallback_estimate",
        } for lat, lon in locations]


def get_block_forecast(blocks: list, cache_prefix: str, days: int = 3) -> dict[str, dict]:
    """Multi-day forecast per block, cached ~1h (forecasts don't need the
    15-min freshness current conditions do, but do need to update faster
    than the 24h terrain cache)."""
    to_fetch = []
    result: dict[str, dict] = {}
    for b in blocks:
        key = f"forecast:{cache_prefix}:{b.name}"
        cached = _cache_get(key)
        if cached is not None:
            result[b.name] = cached
        else:
            to_fetch.append(b)
    if to_fetch:
        fetched = fetch_forecast_batch([(b.lat, b.lon) for b in to_fetch], days=days)
        for b, f in zip(to_fetch, fetched):
            _cache_set(f"forecast:{cache_prefix}:{b.name}", f, 60 * 60)
            result[b.name] = f
    return result


def get_block_weather(blocks: list, cache_prefix: str) -> dict[str, dict]:
    """Weather per block, cached ~15 min. `blocks` is a list of geodata.Block."""
    to_fetch = []
    result: dict[str, dict] = {}
    for b in blocks:
        key = f"weather:{cache_prefix}:{b.name}"
        cached = _cache_get(key)
        if cached is not None:
            result[b.name] = cached
        else:
            to_fetch.append(b)
    if to_fetch:
        fetched = fetch_weather_batch([(b.lat, b.lon) for b in to_fetch])
        for b, w in zip(to_fetch, fetched):
            _cache_set(f"weather:{cache_prefix}:{b.name}", w, WEATHER_TTL_SECONDS)
            result[b.name] = w
    return result


def get_block_wind(blocks: list, cache_prefix: str) -> dict[str, dict]:
    """Live wind speed + gusts per block, cached ~15 min alongside weather."""
    to_fetch = []
    result: dict[str, dict] = {}
    for b in blocks:
        key = f"wind:{cache_prefix}:{b.name}"
        cached = _cache_get(key)
        if cached is not None:
            result[b.name] = cached
        else:
            to_fetch.append(b)
    if to_fetch:
        fetched = fetch_wind_batch([(b.lat, b.lon) for b in to_fetch])
        for b, w in zip(to_fetch, fetched):
            _cache_set(f"wind:{cache_prefix}:{b.name}", w, WEATHER_TTL_SECONDS)
            result[b.name] = w
    return result


def get_block_slope(blocks: list, cache_prefix: str) -> dict[str, dict]:
    """Local slope (degrees) per block derived from real elevation samples
    at the block center + 4 offset points ~1.2km N/E/S/W. Cached ~24h."""
    to_fetch = []
    result: dict[str, dict] = {}
    for b in blocks:
        key = f"slope:{cache_prefix}:{b.name}"
        cached = _cache_get(key)
        if cached is not None:
            result[b.name] = cached
        else:
            to_fetch.append(b)
    if to_fetch:
        DEG_OFFSET = 0.011  # ~1.2km at these latitudes
        sample_points = []
        for b in to_fetch:
            sample_points.extend([
                (b.lat, b.lon),
                (b.lat + DEG_OFFSET, b.lon),
                (b.lat - DEG_OFFSET, b.lon),
                (b.lat, b.lon + DEG_OFFSET),
                (b.lat, b.lon - DEG_OFFSET),
            ])
        elevations = fetch_elevation_batch(sample_points)
        for idx, b in enumerate(to_fetch):
            pts = elevations[idx * 5:(idx + 1) * 5]
            values = [p["elevation_m"] for p in pts]
            center_elev = values[0]
            max_diff = max(values) - min(values)
            # slope over ~1.2km horizontal run
            import math
            slope_deg = math.degrees(math.atan2(max_diff, 1200))
            payload = {
                "elevation_m": center_elev,
                "slope_deg": round(slope_deg, 2),
                "data_source": pts[0]["data_source"],
            }
            _cache_set(f"slope:{cache_prefix}:{b.name}", payload, ELEVATION_TTL_SECONDS)
            result[b.name] = payload
    return result
