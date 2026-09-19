import type { Forecast, LatLon } from "./types";

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const FLOOD_URL = "https://flood-api.open-meteo.com/v1/flood";
const CACHE_KEY = "ts_forecast_v1";
const TTL_MS = 45 * 60 * 1000;

export interface Point extends LatLon { id: number }

interface Stored { t: number; d: Record<number, Forecast> }

/** Where the last forecast set came from, so the UI can say "using cached data" instead of failing silently. */
export type ForecastSource = "live" | "cached" | "stale";
export const forecastMeta: { source: ForecastSource; t: number } = { source: "live", t: 0 };

function readCache(allowStale = false): Stored | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Stored;
    return allowStale || Date.now() - s.t < TTL_MS ? s : null;
  } catch { return null; }
}
function writeCache(d: Record<number, Forecast>) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), d })); } catch { /* quota / private mode */ }
}

async function getJson(url: string, retries = 2): Promise<any> {
  let last: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url);
      if (r.status === 429) { await new Promise((res) => setTimeout(res, 1500 * (i + 1))); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) { last = e; await new Promise((res) => setTimeout(res, 400)); }
  }
  throw last;
}

/** Hour of day in India (IST, UTC+5:30) — Open-Meteo hourly series start at midnight IST today. */
function istHourNow(): number {
  return new Date(Date.now() + 5.5 * 3600e3).getUTCHours();
}

export function parseForecast(row: any): Forecast {
  const rain: number[] = (row.daily?.precipitation_sum ?? []).map((v: number | null) => v ?? 0);
  const hourly: number[] = (row.hourly?.precipitation ?? []).map((v: number | null) => v ?? 0);
  const tmax: number[] = (row.daily?.temperature_2m_max ?? []).map((v: number | null) => v ?? 0);
  const gust: number[] = (row.daily?.wind_gusts_10m_max ?? []).map((v: number | null) => v ?? 0);
  const hourlyMax = Math.max(0, ...hourly);
  return {
    rain,
    rain3: rain.reduce((a, b) => a + b, 0),
    rainMax: Math.max(0, ...rain),
    hourlyMax,
    peakHour: hourlyMax >= 5 ? Math.max(0, hourly.indexOf(hourlyMax) - istHourNow()) : null,
    tmaxMax: tmax.length ? Math.max(...tmax) : 0,
    gustMax: Math.max(0, ...gust),
  };
}

/** 72-hour forecast for many points, 60 per request, cached in localStorage for 45 minutes. */
export async function fetchForecasts(points: Point[], onProgress?: (done: number, total: number) => void): Promise<Map<number, Forecast>> {
  const out = new Map<number, Forecast>();
  const cached = readCache();
  if (cached) {
    for (const p of points) if (cached.d[p.id]) out.set(p.id, cached.d[p.id]);
    if (out.size === points.length) { forecastMeta.source = "cached"; forecastMeta.t = cached.t; onProgress?.(points.length, points.length); return out; }
  }
  const todo = points.filter((p) => !out.has(p.id));
  const CH = 60;
  const chunks: Point[][] = [];
  for (let i = 0; i < todo.length; i += CH) chunks.push(todo.slice(i, i + CH));
  let next = 0;
  let done = out.size;
  const worker = async () => {
    while (next < chunks.length) {
      const chunk = chunks[next++];
      const url = `${FORECAST_URL}?latitude=${chunk.map((p) => p.lat.toFixed(3)).join(",")}&longitude=${chunk.map((p) => p.lon.toFixed(3)).join(",")}`
        + "&daily=precipitation_sum,temperature_2m_max,wind_gusts_10m_max&hourly=precipitation&forecast_days=3&timezone=Asia%2FKolkata&wind_speed_unit=kmh";
      try {
        const json = await getJson(url);
        const rows = Array.isArray(json) ? json : [json];
        rows.forEach((row, i) => out.set(chunk[i].id, parseForecast(row)));
      } catch { /* leave those districts on the static baseline */ }
      done += chunk.length;
      onProgress?.(Math.min(done, points.length), points.length);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  if (out.size >= points.length * 0.9) {
    writeCache(Object.fromEntries(out));
    forecastMeta.source = "live"; forecastMeta.t = Date.now();
    return out;
  }
  // the public API rate-limited or timed out: fall back to the last known-good set (any age) and say so
  const stale = readCache(true);
  if (stale) {
    for (const p of points) if (!out.has(p.id) && stale.d[p.id]) out.set(p.id, stale.d[p.id]);
    forecastMeta.source = "stale"; forecastMeta.t = stale.t;
  } else if (out.size) {
    forecastMeta.source = "live"; forecastMeta.t = Date.now();
  }
  return out;
}

export interface DailyOutlook {
  date: string;
  rain: number;
  rainProb: number | null;
  tmax: number;
  tmin: number;
  gust: number;
}

export async function fetchOutlook(p: LatLon): Promise<DailyOutlook[]> {
  const url = `${FORECAST_URL}?latitude=${p.lat}&longitude=${p.lon}&daily=precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min,wind_gusts_10m_max&forecast_days=7&timezone=Asia%2FKolkata&wind_speed_unit=kmh`;
  const j = await getJson(url);
  const d = j.daily;
  return (d.time as string[]).map((date, i) => ({
    date,
    rain: d.precipitation_sum[i] ?? 0,
    rainProb: d.precipitation_probability_max?.[i] ?? null,
    tmax: d.temperature_2m_max[i],
    tmin: d.temperature_2m_min[i],
    gust: d.wind_gusts_10m_max[i] ?? 0,
  }));
}

export interface Discharge {
  now: number;
  peak7: number;
  median: number | null;
  ratio: number | null;
  days: { date: string; q: number }[];
}

/** GloFAS river discharge forecast (nearest 0.05° river cell) — keyless, via Open-Meteo. */
export async function fetchDischarge(p: LatLon): Promise<Discharge> {
  const url = `${FLOOD_URL}?latitude=${p.lat}&longitude=${p.lon}&daily=river_discharge,river_discharge_median,river_discharge_max&forecast_days=7`;
  const j = await getJson(url);
  const q: number[] = j.daily.river_discharge.map((v: number | null) => v ?? 0);
  const med: number[] = (j.daily.river_discharge_median ?? []).map((v: number | null) => v ?? 0);
  const peak = Math.max(...q);
  const median = med.length ? med.reduce((a, b) => a + b, 0) / med.length : null;
  return {
    now: q[0] ?? 0,
    peak7: peak,
    median,
    ratio: median && median > 0 ? peak / median : null,
    days: (j.daily.time as string[]).map((date, i) => ({ date, q: q[i] })),
  };
}
