import type { Tier, Zone } from "./types";

/**
 * State Action Plan: turn ranked habitations into immediate / short-term / medium-term relocation lists, price them with
 * clearly labelled assumptions, choose the best set under a budget cap and export it (CSV, GeoJSON, Markdown, print-to-PDF).
 * Every rupee figure here is an *assumption* the officer can edit — none is a Government-sanctioned rate for a specific scheme instance.
 */
export type PlanLevel = "habitation" | "district";

export interface PlanItem {
  id: string;
  name: string;
  district: string;
  state: string;
  lat: number;
  lon: number;
  zone: Zone;
  tier: Tier;
  score: number;
  pop: number;
  hh: number;
  reasons: string[];
  source: "pilot" | "upload" | "district";
  level: PlanLevel;
  hills: boolean;
  /** annual probability (%) of the dominant hazard at the district, before the zone multiplier */
  annualP: number;
}

export const HORIZON: Record<Exclude<Tier, "monitor">, { label: string; window: string; months: number }> = {
  immediate: { label: "Immediate", window: "decide now; be moved before the next monsoon (≤ 6 months)", months: 6 },
  short_term: { label: "Short-term", window: "complete within 12 months", months: 12 },
  medium_term: { label: "Medium-term", window: "complete in 1–3 years", months: 36 },
};

export const REASON_TEXT: Record<string, string> = {
  SLOPE_GE30_WITHIN_150M: "Slope ≥ 30° within 150 m",
  STREAM_BANK_HAND_LE2M: "On a stream bank (≤ 2 m above the channel)",
  STREAM_TERRACE_HAND_LE6M: "On a low stream terrace (≤ 6 m above the channel)",
  RUNOUT_BELOW_STEEP_SLOPE: "In the run-out zone below steep ground",
  NO_ELIGIBLE_SITE_WITHIN_10KM: "No eligible resettlement site within 10 km",
};

export function reasonText(code: string): string {
  if (REASON_TEXT[code]) return REASON_TEXT[code];
  const m = code.match(/^CATALOGUED_LANDSLIDE_WITHIN_5KM(?:_(\d{4}))?$/);
  if (m) return `Catalogued landslide within 5 km${m[1] ? ` (${m[1]})` : ""}`;
  return code.replace(/_/g, " ").toLowerCase();
}

export interface Costs {
  pmayPlains: number; pmayHills: number; landServices: number; livelihood: number;
  exGratiaDeath: number; houseDamage: number; damageShare: number; fatalityRate: number;
  protectPerHh: number; protectEffect: number; adaptPerHh: number; adaptEffect: number; horizonYears: number;
}

/** ₹. PMAY-G unit assistance (₹1.20 lakh plains / ₹1.30 lakh hills) and the SDRF ex-gratia (₹4 lakh) are published norms; the rest are assumptions. */
export const DEFAULT_COSTS: Costs = {
  pmayPlains: 120000, pmayHills: 130000, landServices: 250000, livelihood: 50000,
  exGratiaDeath: 400000, houseDamage: 120000, damageShare: 0.5, fatalityRate: 0.003,
  protectPerHh: 300000, protectEffect: 0.6, adaptPerHh: 50000, adaptEffect: 0.25, horizonYears: 30,
};

/** Share of the district's annual hazard probability assumed to apply to a habitation of this class (assumption). */
export const ZONE_FACTOR: Record<Zone, number> = { RED: 1.0, ORANGE: 0.5, YELLOW: 0.2, GREEN: 0.05 };

export const moveCostPerHh = (it: PlanItem, c: Costs) => (it.hills ? c.pmayHills : c.pmayPlains) + c.landServices + c.livelihood;
export const moveCost = (it: PlanItem, c: Costs) => it.hh * moveCostPerHh(it, c);

/** Expected annual loss (₹) if the habitation stays: P × (damaged homes + ex-gratia for deaths). */
export function annualLoss(it: PlanItem, c: Costs): number {
  const p = (it.annualP / 100) * ZONE_FACTOR[it.zone];
  return p * (it.hh * c.damageShare * c.houseDamage + it.pop * c.fatalityRate * c.exGratiaDeath);
}

/** Years for avoided losses to repay the cost of moving (undiscounted). */
export function breakEvenYears(it: PlanItem, c: Costs): number {
  const l = annualLoss(it, c);
  return l <= 0 ? Infinity : moveCost(it, c) / l;
}

export interface OptionCost { key: "nothing" | "adapt" | "protect" | "relocate"; label: string; upfront: number; expectedLoss: number; total: number }

/** Protect / adapt / relocate / do nothing over the planning horizon — officials ask "can we just build a wall?" first. */
export function compareOptions(it: PlanItem, c: Costs): OptionCost[] {
  const L = annualLoss(it, c) * c.horizonYears;
  const opts: OptionCost[] = [
    { key: "nothing", label: "Do nothing", upfront: 0, expectedLoss: L, total: L },
    { key: "adapt", label: "Adapt (raised plinths, early warning)", upfront: it.hh * c.adaptPerHh, expectedLoss: L * (1 - c.adaptEffect), total: 0 },
    { key: "protect", label: "Protect (retaining works, drainage)", upfront: it.hh * c.protectPerHh, expectedLoss: L * (1 - c.protectEffect), total: 0 },
    { key: "relocate", label: "Relocate", upfront: moveCost(it, c), expectedLoss: 0, total: 0 },
  ];
  for (const o of opts) o.total = o.upfront + o.expectedLoss;
  return opts;
}

export const bestOption = (it: PlanItem, c: Costs) => compareOptions(it, c).reduce((a, b) => (b.total < a.total ? b : a));

// ---------------------------------------------------------------- selection under a budget
export interface Selection { chosen: PlanItem[]; skipped: PlanItem[]; spend: number; households: number; people: number }

/**
 * Pick habitations under a budget cap. "value" = greedy by benefit per rupee (benefit = priority score × people);
 * "priority" = strictly by priority score. Both are heuristics — they are transparent, not provably optimal.
 */
export function selectWithinBudget(items: PlanItem[], budget: number, c: Costs, mode: "value" | "priority" = "value"): Selection {
  const pool = items.filter((i) => i.tier !== "monitor");
  const key = (i: PlanItem) => (mode === "priority" ? i.score : (i.score * i.pop) / Math.max(moveCost(i, c), 1));
  const order = [...pool].sort((a, b) => key(b) - key(a));
  const chosen: PlanItem[] = [];
  const skipped: PlanItem[] = [];
  let spend = 0;
  for (const it of order) {
    const cost = moveCost(it, c);
    if (spend + cost <= budget) { chosen.push(it); spend += cost; } else skipped.push(it);
  }
  return { chosen, skipped, spend, households: chosen.reduce((s, i) => s + i.hh, 0), people: chosen.reduce((s, i) => s + i.pop, 0) };
}

// ---------------------------------------------------------------- exports
const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export interface ExportRow extends PlanItem { horizon: string; cost: number; annualLoss: number; breakEven: number; best: string; selected: boolean }

export function toExportRows(items: PlanItem[], c: Costs, selectedIds: Set<string>): ExportRow[] {
  return items.map((i) => ({
    ...i, horizon: i.tier === "monitor" ? "Monitor" : HORIZON[i.tier].label, cost: Math.round(moveCost(i, c)), annualLoss: Math.round(annualLoss(i, c)),
    breakEven: breakEvenYears(i, c), best: bestOption(i, c).label, selected: selectedIds.has(i.id),
  }));
}

export function toCsv(rows: ExportRow[]): string {
  const head = ["rank", "horizon", "name", "district", "state", "level", "zone", "priority_score", "population", "households", "lat", "lon", "reasons", "move_cost_inr", "expected_annual_loss_inr", "break_even_years", "cheapest_30y_option", "in_budget_selection"];
  const lines = [head.join(",")];
  rows.forEach((r, k) => lines.push([
    k + 1, r.horizon, r.name, r.district, r.state, r.level, r.zone, r.score.toFixed(1), r.pop, r.hh, r.lat, r.lon, r.reasons.map(reasonText).join("; "),
    r.cost, r.annualLoss, Number.isFinite(r.breakEven) ? r.breakEven.toFixed(1) : "", r.best, r.selected ? "yes" : "no",
  ].map(csvCell).join(",")));
  return lines.join("\n");
}

export function toGeoJSON(rows: ExportRow[]) {
  return {
    type: "FeatureCollection",
    features: rows.map((r, k) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [r.lon, r.lat] },
      properties: {
        rank: k + 1, name: r.name, district: r.district, state: r.state, horizon: r.horizon, zone: r.zone, priority: r.score, population: r.pop, households: r.hh,
        reasons: r.reasons.map(reasonText), level: r.level, move_cost_inr: r.cost, in_budget_selection: r.selected,
      },
    })),
  };
}

export const inr = (v: number) => (v >= 1e7 ? `₹${(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `₹${(v / 1e5).toFixed(1)} L` : `₹${Math.round(v).toLocaleString("en-IN")}`);

export function toMarkdown(ctx: { title: string; scope: string; source: string; generated: string; budget: number | null; costs: Costs }, rows: ExportRow[], sel: Selection | null): string {
  const out: string[] = [];
  out.push(`# ${ctx.title}`, "", `*${ctx.scope} · generated ${ctx.generated} · TeraShield (SIH 2026, PS 26191)*`, "");
  out.push("> **Status: screening output for analyst review.** Zones and priorities are model-derived from open data; every rupee figure is an editable assumption. Nothing here is a notified red zone until verified in the field and notified by the District Collector.", "");
  out.push(`**Source of habitations:** ${ctx.source}`, "");
  if (sel && ctx.budget != null) out.push(`**Budget cap:** ${inr(ctx.budget)} — selection covers ${sel.chosen.length} habitations, ${sel.people.toLocaleString("en-IN")} people, ${inr(sel.spend)}.`, "");
  for (const h of ["Immediate", "Short-term", "Medium-term"]) {
    const list = rows.filter((r) => r.horizon === h);
    out.push(`## ${h} (${list.length})`, "");
    if (!list.length) { out.push("_None._", ""); continue; }
    out.push("| # | Habitation | District | Zone | Priority | People | Why | Cost | Break-even |", "|---|---|---|---|---|---|---|---|---|");
    list.slice(0, 60).forEach((r, k) => out.push(`| ${k + 1} | ${r.name}${r.selected ? " ✓" : ""} | ${r.district} | ${r.zone} | ${r.score.toFixed(0)} | ${r.pop.toLocaleString("en-IN")} | ${r.reasons.map(reasonText).slice(0, 2).join("; ")} | ${inr(r.cost)} | ${Number.isFinite(r.breakEven) ? `${r.breakEven.toFixed(0)} yr` : "—"} |`));
    out.push("");
  }
  const c = ctx.costs;
  out.push("## Cost assumptions (editable in the tool)", "",
    `- Per-household move cost = PMAY-G unit assistance (${inr(c.pmayPlains)} plains / ${inr(c.pmayHills)} hills) + land & services ${inr(c.landServices)} + livelihood transition ${inr(c.livelihood)}.`,
    `- Expected annual loss = annual hazard probability × zone factor × (${(c.damageShare * 100).toFixed(0)}% of homes damaged × ${inr(c.houseDamage)} + ${(c.fatalityRate * 100).toFixed(1)}% fatality rate × ${inr(c.exGratiaDeath)} ex-gratia).`,
    `- Protect costs ${inr(c.protectPerHh)}/household (removes ${(c.protectEffect * 100).toFixed(0)}% of loss); adapt costs ${inr(c.adaptPerHh)}/household (${(c.adaptEffect * 100).toFixed(0)}%). Horizon ${c.horizonYears} years, undiscounted.`, "",
    "## Method and limits", "",
    "- Priority = 0.35 zone + 0.25 vulnerability + 0.15 exposure + 0.15 disaster history + 0.10 feasibility. Tiers: ≥ 62 immediate, ≥ 50 short-term, ≥ 38 medium-term.",
    "- District figures are Census 2011 proxies; habitation-level zones exist only for pilot districts or uploaded data.",
    "- Land status comes from OpenStreetMap land-use polygons (a proxy); confirm on land records and with the forest department.");
  return out.join("\n");
}

export function download(name: string, mime: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
