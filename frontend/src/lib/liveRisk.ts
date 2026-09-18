import { smooth } from "./geo";
import { HAZARDS, ZONES, zoneForComposite } from "./risk";
import type { District, Forecast, HazardKey, Zone } from "./types";

/**
 * 72-hour outlook = climatological annual probability x live trigger multiplier.
 * The multiplier runs from `floor` (trigger absent) to 2.0 (trigger fully met), so a district whose
 * baseline is high stays high only while the weather can actually set the hazard off.
 */
const FLOOR: Record<HazardKey, number> = { flood: 0.5, landslide: 0.5, cloudburst: 0.3, coastal: 0.6, cyclone: 0.25, heatwave: 0 };

export function multiplier(hazard: HazardKey, trigger: number): number {
  const f = FLOOR[hazard];
  return f + (2 - f) * trigger;
}

export function triggers(d: District, f: Forecast): Record<HazardKey, number> {
  const rainEff = Math.max(f.rainMax, 0.6 * f.rain3);
  const coastal = d.coast <= 30 ? 1 : d.coast <= 150 ? 0.4 : 0.05;
  return {
    flood: smooth(rainEff, 15, 115),
    landslide: smooth(rainEff, 20, 120),
    cloudburst: smooth(f.hourlyMax, 8, 40),
    coastal: smooth(f.gustMax, 40, 100) * coastal,
    cyclone: smooth(f.gustMax, 45, 100) * coastal,
    heatwave: smooth(f.tmaxMax, d.clim.hthr - 4, d.clim.hthr + 4),
  };
}

export interface LiveResult {
  P: Record<HazardKey, number>;
  trig: Record<HazardKey, number>;
  risk: number;
  zone: Zone;
  dom: HazardKey;
  delta: number;
  escalated: boolean;
}

export function composite(P: Record<HazardKey, number>): number {
  const vals = HAZARDS.map((h) => P[h.key] * (h.key === "heatwave" ? 0.4 : 1)).sort((a, b) => b - a);
  return 0.6 * vals[0] + 0.4 * ((vals[0] + vals[1] + vals[2]) / 3);
}

export function liveOutlook(d: District, f: Forecast): LiveResult {
  const trig = triggers(d, f);
  const P = {} as Record<HazardKey, number>;
  for (const h of HAZARDS) P[h.key] = Math.min(95, d.P[h.key] * multiplier(h.key, trig[h.key]));
  const risk = composite(P);
  const zone = zoneForComposite(risk);
  const dom = HAZARDS.reduce((a, b) => (P[b.key] > P[a.key] ? b : a)).key;
  return { P, trig, risk, zone, dom, delta: risk - d.risk, escalated: ZONES.indexOf(zone) < ZONES.indexOf(d.zone) };
}
