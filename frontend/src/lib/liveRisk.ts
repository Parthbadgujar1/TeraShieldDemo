import { smooth } from "./geo";
import { HAZARDS, ZONES, ZONE_HAZARDS, worseZone, zoneForComposite } from "./risk";
import type { District, Forecast, HazardKey, Zone } from "./types";

/**
 * 72-hour alert layer = baseline x live trigger multiplier, **never below the baseline**.
 * A dry week must not turn a landslide-prone district green, so the forecast can only raise an alert on top of the
 * evidence-based baseline: P_alert = max(P_baseline, P_baseline x multiplier) with the multiplier running 1.0 -> 2.0 as
 * the trigger (rain / wind / temperature) is met. Baseline zones change only with observed evidence, not with the weather.
 */
export function multiplier(_hazard: HazardKey, trigger: number): number {
  return 1 + trigger;
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
  /** alert-level probabilities (>= baseline) */
  P: Record<HazardKey, number>;
  trig: Record<HazardKey, number>;
  risk: number;
  /** worse of the baseline tier and the tier implied by the 72-h alert */
  zone: Zone;
  dom: HazardKey;
  delta: number;
  escalated: boolean;
}

/** Composite over the hazards that decide a zone (heatwave and the coastal index are excluded). */
export function composite(P: Record<HazardKey, number>): number {
  const vals = ZONE_HAZARDS.map((h) => P[h.key]).sort((a, b) => b - a);
  return 0.6 * vals[0] + 0.4 * ((vals[0] + vals[1] + vals[2]) / 3);
}

export function liveOutlook(d: District, f: Forecast): LiveResult {
  const trig = triggers(d, f);
  const P = {} as Record<HazardKey, number>;
  for (const h of HAZARDS) P[h.key] = Math.max(d.P[h.key], Math.min(95, d.P[h.key] * multiplier(h.key, trig[h.key])));
  const live = composite(P);
  const raised = live > d.risk + 0.05; // the forecast must actually lift the score; rounding in the stored baseline is not an alert
  const risk = Math.max(d.risk, live);
  const zone = raised ? worseZone(d.zone, zoneForComposite(risk)) : d.zone;
  const dom = ZONE_HAZARDS.reduce((a, b) => (P[b.key] > P[a.key] ? b : a)).key;
  return { P, trig, risk, zone, dom, delta: risk - d.risk, escalated: ZONES.indexOf(zone) < ZONES.indexOf(d.zone) };
}
