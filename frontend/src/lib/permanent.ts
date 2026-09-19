import { clamp01, haversineKm } from "./geo";
import type { LandClass, Pilot, PilotSite, PilotVillage, Tier } from "./types";

/**
 * Permanent resettlement (months to years) — deliberately separate from evacuation (hours to days).
 * For one habitation: screen candidate sites with hard rejects, classify land status and the approval it implies,
 * keep the village together within livelihood reach, score durability and build a realistic timeline.
 */
export const RESETTLEMENT = {
  maxReachKm: 10,          // farmland / fish-landing / market must stay reachable
  minRiskBufferM: 300,     // distance from RED/ORANGE terrain
  hhPerHa: 25,             // gross households per usable hectare (matches data-pipeline/build_pilot.py)
  constructionMonths: 14,  // PMAY-G house + layout + services, hill terrain
  verifyMonths: 3,         // field survey / geotechnical verification (Screened -> Verified)
  consultMonths: 3,        // DM notification + Gram Sabha consultation
};

export type LandRoute = "revenue" | "common" | "private" | "forest" | "blocked";
export interface LandInfo { route: LandRoute; label: string; months: number; approval: string; ease: number; horizon: "immediate" | "short_term" | "medium_term" | "blocked" }

/** OSM land-use is a proxy for land status; Bhulekh / forest-department records are the authority. */
export const LAND_INFO: Record<LandClass, LandInfo> = {
  UNKNOWN: { route: "revenue", label: "Unclassified in OSM (revenue-land proxy)", months: 4, ease: 0.7, horizon: "short_term", approval: "Verify ownership on Bhulekh / land records; District Collector allotment if government (revenue) land." },
  COMMON: { route: "common", label: "Grass / scrub / meadow (common-land proxy)", months: 3, ease: 0.9, horizon: "immediate", approval: "Confirm it is not forest or a grazing commons under the Gram Panchayat; District Collector allotment." },
  BUILT: { route: "revenue", label: "Existing built-up land", months: 6, ease: 0.6, horizon: "short_term", approval: "Check tenure and encumbrances; infill needs layout approval from the local body." },
  PRIVATE_AGRI: { route: "private", label: "Private agriculture / plantation / orchard", months: 24, ease: 0.35, horizon: "medium_term", approval: "Acquisition under the RFCTLARR Act 2013: Social Impact Assessment, notification, award (typically 18–36 months), or negotiated purchase." },
  FOREST: { route: "forest", label: "Forest land", months: 18, ease: 0.15, horizon: "medium_term", approval: "Forest (Conservation) Act 1980 diversion (Stage-I/II) and Forest Rights Act consent; may be refused." },
  PROTECTED: { route: "blocked", label: "Protected area / sanctuary", months: 0, ease: 0, horizon: "blocked", approval: "Not permitted: protected area / eco-sensitive zone." },
  WATER: { route: "blocked", label: "Water body / wetland", months: 0, ease: 0, horizon: "blocked", approval: "Not permitted: water body or wetland." },
};

export interface SiteOption {
  site: PilotSite;
  distKm: number;
  rejects: string[];
  land: LandInfo;
  hh: number;
  capacity: { hh: number; covers: boolean; shortfall: number; bind: string; status: PilotSite["cap_status"] };
  safety: number; // 0..1
  durability: { score: number; reach: number; services: number; tenure: number; capacity: number };
  months: number; // months from decision to move-in
  score: number; // 0..1, rank key (safety and durability half each)
}

export function householdsOf(v: PilotVillage, p: Pilot): number {
  const size = p.district.pop_census / Math.max(p.district.hh, 1);
  return Math.max(1, Math.round(v.pop / size));
}

const q = (km: number | null, span: number) => (km == null ? 0.3 : 1 - clamp01(km / span));

export function siteOptions(v: PilotVillage, p: Pilot, radiusKm: number = RESETTLEMENT.maxReachKm): SiteOption[] {
  const hh = householdsOf(v, p);
  const out: SiteOption[] = [];
  for (const s of p.sites) {
    const distKm = haversineKm(v, s);
    if (distKm > radiusKm * 1.6) continue;
    const land = LAND_INFO[s.land];
    const rejects: string[] = [];
    if (land.route === "blocked") rejects.push(land.label);
    if (s.risk_m < RESETTLEMENT.minRiskBufferM) rejects.push(`only ${s.risk_m} m from red/orange terrain (< ${RESETTLEMENT.minRiskBufferM} m)`);
    if (distKm > radiusKm) rejects.push(`${distKm.toFixed(1)} km from the village — beyond ${radiusKm} km livelihood reach`);
    const cap = s.cap_hh;
    const safety = clamp01(0.6 * clamp01(s.risk_m / 1500) + 0.25 * (1 - clamp01(s.slope / 10)) + 0.15 * clamp01(s.hand / 40));
    const reach = 1 - clamp01(distKm / radiusKm);
    const services = 0.5 * q(s.school_km, 6) + 0.5 * q(s.health_km, 15);
    const capScore = clamp01(cap / hh);
    const dur = 0.3 * reach + 0.2 * services + 0.25 * land.ease + 0.25 * capScore;
    const months = Math.max(RESETTLEMENT.verifyMonths + RESETTLEMENT.consultMonths, land.months) + RESETTLEMENT.constructionMonths;
    out.push({
      site: s, distKm, rejects, land, hh,
      capacity: { hh: cap, covers: cap >= hh, shortfall: Math.max(0, hh - cap), bind: s.bind, status: s.cap_status },
      safety, durability: { score: dur, reach, services, tenure: land.ease, capacity: capScore }, months,
      score: 0.5 * safety + 0.5 * dur,
    });
  }
  return out.sort((a, b) => Number(a.rejects.length > 0) - Number(b.rejects.length > 0) || b.score - a.score);
}

/** One village goes to one site (keep the community together); a second site only when the first cannot hold everyone. */
export function recommend(opts: SiteOption[]): { primary: SiteOption | null; secondary: SiteOption | null } {
  const ok = opts.filter((o) => o.rejects.length === 0);
  const primary = ok.find((o) => o.capacity.covers) ?? ok[0] ?? null;
  let secondary: SiteOption | null = null;
  if (primary && !primary.capacity.covers) {
    secondary = ok.find((o) => o !== primary && haversineKm(o.site, primary.site) <= 5 && o.capacity.hh >= primary.capacity.shortfall) ?? null;
  }
  return { primary, secondary };
}

// ---------------------------------------------------------------- timeline
export interface TimelineStep { key: string; label: string; start: number; end: number; note: string }

export function timeline(opt: SiteOption, opts: { fra?: boolean } = {}): TimelineStep[] {
  const { verifyMonths, consultMonths, constructionMonths } = RESETTLEMENT;
  const steps: TimelineStep[] = [];
  steps.push({ key: "verify", label: "Field verification (Screened → Verified)", start: 0, end: verifyMonths, note: "GSI / State geology survey or geotechnical check of the habitation and the receiving site." });
  steps.push({ key: "consult", label: "Notification & Gram Sabha consultation", start: verifyMonths, end: verifyMonths + consultMonths, note: opts.fra ? "Forest Rights Act / tribal-community consent likely required — allow extra time." : "District Collector order; consent and entitlements explained in the local language." });
  const landStart = verifyMonths;
  steps.push({ key: "land", label: `Land: ${opt.land.label}`, start: landStart, end: landStart + opt.land.months, note: opt.land.approval });
  const buildStart = Math.max(verifyMonths + consultMonths, landStart + opt.land.months);
  steps.push({ key: "build", label: "Layout, services and PMAY-G houses", start: buildStart, end: buildStart + constructionMonths, note: "Water, sanitation, road link, school and health access before move-in." });
  steps.push({ key: "move", label: "Move-in, livelihood transition, ration / voter-roll transfer", start: buildStart + constructionMonths - 2, end: buildStart + constructionMonths + 2, note: "Keep farmland / fishing access; hand over vacated land to monitoring (Vacated → Monitored)." });
  return steps;
}

/** IMD normal southwest-monsoon onset (approximate, per state) as [month, day]. */
const ONSET: Record<string, [number, number]> = {
  Kerala: [6, 1], Karnataka: [6, 5], "Tamil Nadu": [6, 1], Goa: [6, 7], Maharashtra: [6, 10], Odisha: [6, 10], "West Bengal": [6, 10],
  Assam: [6, 5], Bihar: [6, 15], Uttarakhand: [6, 20], "Himachal Pradesh": [6, 25], "Jammu and Kashmir": [6, 30], Sikkim: [6, 5],
};

export function monsoonOnset(state: string, from: Date): Date {
  const [m, d] = ONSET[state] ?? [6, 15];
  let t = new Date(from.getFullYear(), m - 1, d);
  if (t <= from) t = new Date(from.getFullYear() + 1, m - 1, d);
  return t;
}

/** The next monsoon, the first monsoon after the move could realistically be complete, and whether the next one can still be caught. */
export function relocateBefore(state: string, months: number, from: Date = new Date()): { onset: Date; nextOnset: Date; catchesNext: boolean; monthsToNext: number } {
  const nextOnset = monsoonOnset(state, from);
  const monthsToNext = (nextOnset.getTime() - from.getTime()) / (30.44 * 864e5);
  const ready = new Date(from.getTime() + months * 30.44 * 864e5);
  const onset = monsoonOnset(state, new Date(ready.getTime() - 1));
  return { onset, nextOnset, catchesNext: months <= monthsToNext, monthsToNext };
}

export const horizonOfMonths = (m: number): Tier => (m <= 6 ? "immediate" : m <= 12 ? "short_term" : m <= 36 ? "medium_term" : "monitor");

export function landHorizon(land: LandClass): string {
  const i = LAND_INFO[land];
  return i.horizon === "immediate" ? "Immediate-capable" : i.horizon === "short_term" ? "Short-term (≤ 1 yr)" : i.horizon === "medium_term" ? "Medium-term only (1–3 yrs)" : "Blocked";
}
