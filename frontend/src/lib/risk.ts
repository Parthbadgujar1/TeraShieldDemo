import type { LiveResult } from "./liveRisk";
import type { District, HazardKey, Meta, Tier, Zone } from "./types";

export const ZONES: Zone[] = ["RED", "ORANGE", "YELLOW", "GREEN"];

export const ZONE_COLOR: Record<Zone, string> = {
  RED: "#d32f2f",
  ORANGE: "#f57c00",
  YELLOW: "#f2c230",
  GREEN: "#2e9e4f",
};

/**
 * A district is a screening unit, not a red zone. PS 26191 defines red zones as *areas unsuitable for permanent habitation*,
 * which is a habitation-level judgement (see the pilot in Relocation Intelligence). District colours are hazard tiers.
 */
export const ZONE_LABEL: Record<Zone, string> = {
  RED: "Very high hazard",
  ORANGE: "High hazard",
  YELLOW: "Moderate hazard",
  GREEN: "Low hazard",
};

export const ZONE_MEANING: Record<Zone, string> = {
  RED: "Very-high-hazard district — prioritise habitation-level red-zone survey",
  ORANGE: "High-hazard district — survey habitations, plan mitigation and readiness",
  YELLOW: "Moderate hazard — monitor and prepare",
  GREEN: "Low modelled hazard — still needs site-level checks before any settlement decision",
};

/** Habitation-level term, used only where polygons/points below district scale exist. */
export const RED_ZONE_DEF = "Red zone = an area unsuitable for permanent habitation (PS 26191). It is decided per habitation, not per district.";

export interface HazardDef {
  key: HazardKey; label: string; short: string; icon: string; color: string;
  /** "prob" = annual event probability; "index" = susceptibility index (0-100), not a probability */
  kind: "prob" | "index";
  /** whether it decides a district's zone */
  inZone: boolean;
  note: string;
}

export const HAZARDS: HazardDef[] = [
  { key: "flood", label: "Flood", short: "Flood", icon: "🌊", color: "#1e6fd9", kind: "prob", inZone: true, note: "Annual probability of a damaging flood." },
  { key: "landslide", label: "Landslide", short: "Landslide", icon: "⛰️", color: "#8a5a2b", kind: "prob", inZone: true, note: "Annual probability of a damaging landslide." },
  { key: "cloudburst", label: "Cloudburst potential", short: "Cloudburst", icon: "⛈️", color: "#5b4fc4", kind: "prob", inZone: true, note: "Potential from a ~50 km reanalysis grid: cloudbursts are local, so this ranks districts, it does not locate events." },
  { key: "coastal", label: "Coastal erosion (index)", short: "Coastal", icon: "🏖️", color: "#0f9aa8", kind: "index", inZone: false, note: "Susceptibility index, not a probability: erosion is a shoreline-retreat rate in m/yr that needs multi-year shoreline data. It can lift a district to High hazard, never to Very high by itself." },
  { key: "cyclone", label: "Cyclone", short: "Cyclone", icon: "🌀", color: "#c2185b", kind: "prob", inZone: true, note: "Share of seasons (1990–2023) with an IMD cyclonic storm within 150 km." },
  { key: "heatwave", label: "Heatwave (stress)", short: "Heatwave", icon: "🔥", color: "#e64a19", kind: "prob", inZone: false, note: "IMD-criteria heatwave frequency. Heat does not make land uninhabitable, so it feeds vulnerability, not the zone." },
];

/** Hazards whose probabilities decide a district's tier. */
export const ZONE_HAZARDS = HAZARDS.filter((h) => h.inZone);

export const HAZARD_BY_KEY = Object.fromEntries(HAZARDS.map((h) => [h.key, h])) as Record<HazardKey, HazardDef>;

/** Zone cut-offs on the composite multi-hazard probability (%), overridden by meta.json when loaded. */
export let ZONE_CUTS = { red: 50, orange: 36, yellow: 24 };
/** Cut-offs for classifying one hazard's own probability (%). */
export const HAZARD_CUTS = { red: 45, orange: 30, yellow: 15 };

export function applyMeta(meta: Meta) {
  ZONE_CUTS = {
    red: meta.zone_cuts.red * 100,
    orange: meta.zone_cuts.orange * 100,
    yellow: meta.zone_cuts.yellow * 100,
  };
}

export function worseZone(a: Zone, b: Zone): Zone {
  return ZONES.indexOf(a) <= ZONES.indexOf(b) ? a : b;
}

export function zoneForComposite(pct: number): Zone {
  return pct >= ZONE_CUTS.red ? "RED" : pct >= ZONE_CUTS.orange ? "ORANGE" : pct >= ZONE_CUTS.yellow ? "YELLOW" : "GREEN";
}

export function zoneForHazard(pct: number): Zone {
  return pct >= HAZARD_CUTS.red ? "RED" : pct >= HAZARD_CUTS.orange ? "ORANGE" : pct >= HAZARD_CUTS.yellow ? "YELLOW" : "GREEN";
}

export const RISK_FORMULA = "Risk = Hazard × (½ Exposure + ½ Vulnerability)";

export const CLASS_NAME: Record<Zone, string> = { RED: "Very high", ORANGE: "High", YELLOW: "Moderate", GREEN: "Low" };

export const TIER_LABEL: Record<Tier, string> = {
  immediate: "Immediate relocation",
  short_term: "Short-term (≤ 1 yr)",
  medium_term: "Medium-term (1–3 yrs)",
  monitor: "Monitor",
};
export const TIER_COLOR: Record<Tier, string> = {
  immediate: "#d32f2f",
  short_term: "#f57c00",
  medium_term: "#d9a300",
  monitor: "#2e9e4f",
};
export const TIER_ACTION: Record<Tier, string> = {
  immediate: "Begin evacuation planning now: notify SDMA, identify receiving sites and pre-position transport.",
  short_term: "Survey habitations, confirm safe sites and complete land allotment within the year.",
  medium_term: "Include in the district relocation plan; strengthen early warning meanwhile.",
  monitor: "No relocation needed at present; keep hazard monitoring and preparedness drills.",
};

export function zoneOf(d: District, layer: "all" | HazardKey): Zone {
  return layer === "all" ? d.zone : zoneForHazard(d.P[layer]);
}

/** Percent string, adaptive precision. */
export function pct(v: number, digits = 0): string {
  return `${v.toFixed(digits)}%`;
}

export function compact(n: number): string {
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(1)} L`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${Math.round(n)}`;
}

export function lakh(n: number): string {
  return n.toLocaleString("en-IN");
}

export function returnPeriod(p: number): string {
  if (p <= 0) return "—";
  const yrs = 100 / p;
  return yrs < 1.5 ? "every year" : yrs > 50 ? "rare (>50 yr)" : `~1 in ${yrs.toFixed(yrs < 10 ? 1 : 0)} yr`;
}

export function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export type Layer = "all" | HazardKey;

/** The one place that decides a district's zone and value for a layer and time view — every portal calls this. */
export function zoneAndValue(d: District, layer: Layer, live: Map<number, LiveResult> | null): { zone: Zone; value: number; isLive: boolean } {
  const lr = live?.get(d.id);
  if (layer === "all") return lr ? { zone: lr.zone, value: lr.risk, isLive: true } : { zone: d.zone, value: d.risk, isLive: false };
  const v = lr ? lr.P[layer] : d.P[layer];
  return { zone: zoneForHazard(v), value: v, isLive: !!lr };
}

export interface ZoneRow { d: District; zone: Zone; value: number; isLive: boolean; escalated: boolean }

export function zoneRows(districts: District[], layer: Layer, live: Map<number, LiveResult> | null, state = ""): ZoneRow[] {
  return districts
    .filter((d) => !state || d.s === state)
    .map((d) => ({ d, ...zoneAndValue(d, layer, live), escalated: !!live?.get(d.id)?.escalated }));
}

/** Headline figures shown by both the admin dashboard and the emergency portal. */
export function zoneSummary(rows: ZoneRow[]) {
  const counts: Record<Zone, number> = { RED: 0, ORANGE: 0, YELLOW: 0, GREEN: 0 };
  let redPop = 0;
  let redExposed = 0;
  let escalated = 0;
  for (const r of rows) {
    counts[r.zone]++;
    if (r.zone === "RED") { redPop += r.d.pop; redExposed += r.d.expo.pop; }
    if (r.escalated) escalated++;
  }
  return { counts, redPop, redExposed, escalated };
}
