import { clamp01, haversineKm, smooth } from "./geo";
import { fetchForecasts } from "./live";
import { fetchElevations } from "./osm";
import type { LatLon } from "./types";

export interface RouteSample { lat: number; lon: number; risk: number }

export interface RouteOption {
  index: number;
  distanceKm: number;
  durationMin: number;
  /** [lat, lon] pairs */
  path: [number, number][];
  /** 0 (safe) .. 1 (unusable) hazard exposure along the road */
  risk: number;
  riskNote: string;
  samples: RouteSample[];
}

const OSRM = "https://router.project-osrm.org/route/v1/driving";

/** Real road routes (OpenStreetMap road network) with up to 3 alternatives. */
export async function fetchRoutes(from: LatLon, to: LatLon): Promise<RouteOption[]> {
  const url = `${OSRM}/${from.lon},${from.lat};${to.lon},${to.lat}?alternatives=3&overview=full&geometries=geojson&steps=false`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Routing service HTTP ${r.status}`);
  const j = await r.json();
  if (j.code !== "Ok" || !j.routes?.length) throw new Error("No road route found");
  return j.routes.map((rt: any, i: number) => ({
    index: i,
    distanceKm: rt.distance / 1000,
    durationMin: rt.duration / 60,
    path: rt.geometry.coordinates.map(([lon, lat]: number[]) => [lat, lon] as [number, number]),
    risk: 0,
    riskNote: "",
    samples: [],
  }));
}

/** Evenly spaced points along a path (about one per 8 km, at most `max`). */
export function samplePath(path: [number, number][], max = 10): LatLon[] {
  if (path.length <= 2) return path.map(([lat, lon]) => ({ lat, lon }));
  const cum: number[] = [0];
  for (let i = 1; i < path.length; i++) {
    cum.push(cum[i - 1] + haversineKm({ lat: path[i - 1][0], lon: path[i - 1][1] }, { lat: path[i][0], lon: path[i][1] }));
  }
  const total = cum[cum.length - 1];
  const n = Math.max(2, Math.min(max, Math.round(total / 8) + 1));
  const out: LatLon[] = [];
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1);
    let i = cum.findIndex((c) => c >= target);
    if (i < 0) i = path.length - 1;
    out.push({ lat: path[i][0], lon: path[i][1] });
  }
  return out;
}

/** Pure scoring of one sampled point: forecast wetness x low-lying terrain, forecast wetness x steep grade, or intense rain. */
export function sampleRisk(wet: number, lowness: number, steep: number, hourly: number): number {
  return clamp01(Math.max(wet * lowness * 0.9, wet * steep, hourly * 0.6));
}

export function routeRiskNote(risk: number): string {
  return risk > 0.6 ? "Likely to be cut by flooding or slope failure" : risk > 0.3 ? "Watch low-lying and steep stretches" : "No forecast hazard on this road";
}

/**
 * Score hazard exposure along each route from live forecast rain (flood / landslide trigger) and SRTM terrain
 * (low-lying stretches flood, steep grades slide). Mutates and returns the routes.
 */
export async function scoreRoutes(routes: RouteOption[]): Promise<RouteOption[]> {
  const perRoute = routes.map((r) => samplePath(r.path, 10));
  const all = perRoute.flat();
  const keyOf = (p: LatLon) => `${p.lat.toFixed(1)}_${p.lon.toFixed(1)}`;
  const uniq = new Map<string, { id: number; lat: number; lon: number }>();
  all.forEach((p) => {
    if (!uniq.has(keyOf(p))) uniq.set(keyOf(p), { id: uniq.size, lat: p.lat, lon: p.lon });
  });
  const [forecasts, elevations] = await Promise.all([
    fetchForecasts([...uniq.values()]).catch(() => new Map()),
    fetchElevations(all).catch(() => null),
  ]);
  let cursor = 0;
  perRoute.forEach((pts, ri) => {
    const z = elevations ? pts.map((_, i) => elevations[cursor + i]) : null;
    cursor += pts.length;
    const zMin = z ? Math.min(...z) : 0;
    const samples: RouteSample[] = pts.map((p, i) => {
      const f = forecasts.get(uniq.get(keyOf(p))!.id);
      const rainEff = f ? Math.max(f.rainMax, 0.6 * f.rain3) : 0;
      const wet = smooth(rainEff, 15, 115);
      const lowness = z ? 1 - clamp01((z[i] - zMin) / 40) : 0.3;
      let grade = 0;
      if (z && i > 0) grade = Math.abs(z[i] - z[i - 1]) / (Math.max(haversineKm(pts[i - 1], p), 0.5) * 1000);
      return { ...p, risk: sampleRisk(wet, lowness, clamp01(grade / 0.08), f ? smooth(f.hourlyMax, 10, 45) : 0) };
    });
    const rs = samples.map((s) => s.risk);
    routes[ri].samples = samples;
    routes[ri].risk = 0.6 * Math.max(...rs) + 0.4 * (rs.reduce((a, b) => a + b, 0) / rs.length);
    routes[ri].riskNote = routeRiskNote(routes[ri].risk);
  });
  return routes;
}
