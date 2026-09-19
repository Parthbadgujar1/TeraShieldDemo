import type { Dataset } from "./data";
import { districtAt, pointInGeometry } from "./geoPoly";
import type { PlanItem } from "./plan";
import { bboxOf } from "./geo";
import type { Pilot, Tier, Zone } from "./types";

/**
 * Data Lab: bring your own habitations (CSV or GeoJSON points) and optional red-zone polygons (GeoJSON).
 * Columns are auto-mapped, validated, then every habitation is placed in its district and scored with the same priority formula as the
 * national model. Inside a pilot district, the pilot's terrain red/orange polygons override the district tier.
 */
export interface Column { key: "name" | "lat" | "lon" | "population" | "households" | "district" | "state"; required: boolean; aliases: string[]; desc: string }

export const SCHEMA: Column[] = [
  { key: "name", required: true, aliases: ["name", "habitation", "village", "hamlet", "settlement", "place", "hab_name"], desc: "Habitation / village name" },
  { key: "lat", required: true, aliases: ["lat", "latitude", "y", "lat_dd", "gps_lat"], desc: "Latitude, decimal degrees (WGS-84)" },
  { key: "lon", required: true, aliases: ["lon", "lng", "long", "longitude", "x", "lon_dd", "gps_lon"], desc: "Longitude, decimal degrees (WGS-84)" },
  { key: "population", required: false, aliases: ["population", "pop", "people", "persons", "total_pop", "tot_p"], desc: "People (Census 2011 or survey)" },
  { key: "households", required: false, aliases: ["households", "hh", "houses", "families", "no_hh"], desc: "Households (estimated from population if absent)" },
  { key: "district", required: false, aliases: ["district", "dist", "dist_name"], desc: "District (auto-detected from the point if absent)" },
  { key: "state", required: false, aliases: ["state", "st_name", "state_ut"], desc: "State / UT (auto-detected if absent)" },
];

export const CSV_TEMPLATE = "name,lat,lon,population,households\nExample habitation A,11.50,76.18,1200,280\nExample habitation B,30.73,79.07,650,140\n";

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const t = text.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === "," || ch === ";" || ch === "\t") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export function autoMap(headers: string[]): Partial<Record<Column["key"], number>> {
  const map: Partial<Record<Column["key"], number>> = {};
  const norm = headers.map((h) => h.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_"));
  for (const c of SCHEMA) {
    const i = norm.findIndex((h, idx) => c.aliases.includes(h) && !Object.values(map).includes(idx));
    if (i >= 0) map[c.key] = i;
  }
  return map;
}

export interface Habitation { name: string; lat: number; lon: number; population: number | null; households: number | null; district: string; state: string; row: number }
export interface Issue { row: number | null; level: "error" | "warning"; text: string }
export interface Parsed { habitations: Habitation[]; issues: Issue[]; mapping: Partial<Record<Column["key"], number>>; headers: string[]; rowsRead: number }

const IN = { minLat: 6, maxLat: 37.5, minLon: 68, maxLon: 97.5 };

export function validateRows(rows: string[][], mapping?: Partial<Record<Column["key"], number>>): Parsed {
  const issues: Issue[] = [];
  if (!rows.length) return { habitations: [], issues: [{ row: null, level: "error", text: "The file is empty." }], mapping: {}, headers: [], rowsRead: 0 };
  const headers = rows[0];
  const map = mapping ?? autoMap(headers);
  for (const c of SCHEMA.filter((x) => x.required)) if (map[c.key] == null) issues.push({ row: null, level: "error", text: `Required column "${c.key}" not found (accepted headers: ${c.aliases.join(", ")}).` });
  if (issues.length) return { habitations: [], issues, mapping: map, headers, rowsRead: rows.length - 1 };
  const num = (v: string | undefined) => { if (v == null) return null; const n = Number(String(v).replace(/,/g, "").trim()); return v.trim() === "" || !Number.isFinite(n) ? null : n; };
  const seen = new Set<string>();
  const out: Habitation[] = [];
  rows.slice(1).forEach((r, i) => {
    const rowNo = i + 2;
    const get = (k: Column["key"]) => (map[k] != null ? r[map[k]!] : undefined);
    const name = (get("name") ?? "").trim();
    const lat = num(get("lat"));
    const lon = num(get("lon"));
    if (!name) { issues.push({ row: rowNo, level: "error", text: "Missing name — row skipped." }); return; }
    if (lat == null || lon == null) { issues.push({ row: rowNo, level: "error", text: `${name}: latitude/longitude missing or not numeric — row skipped.` }); return; }
    if (lat < IN.minLat || lat > IN.maxLat || lon < IN.minLon || lon > IN.maxLon) {
      const swapped = lon >= IN.minLat && lon <= IN.maxLat && lat >= IN.minLon && lat <= IN.maxLon;
      issues.push({ row: rowNo, level: "error", text: `${name}: (${lat}, ${lon}) is outside India${swapped ? " — latitude and longitude look swapped" : ""}. Row skipped.` });
      return;
    }
    const pop = num(get("population"));
    const hh = num(get("households"));
    if (pop != null && (pop < 0 || pop > 2_000_000)) { issues.push({ row: rowNo, level: "warning", text: `${name}: population ${pop} looks implausible for a habitation.` }); }
    if (pop != null && hh != null && hh > pop) issues.push({ row: rowNo, level: "warning", text: `${name}: households (${hh}) exceed population (${pop}).` });
    if (pop == null) issues.push({ row: rowNo, level: "warning", text: `${name}: no population — the district average household size and a default of 100 people are used.` });
    const key = `${name.toLowerCase()}|${lat.toFixed(3)}|${lon.toFixed(3)}`;
    if (seen.has(key)) { issues.push({ row: rowNo, level: "warning", text: `${name}: duplicate of an earlier row — kept once.` }); return; }
    seen.add(key);
    out.push({ name, lat, lon, population: pop, households: hh, district: (get("district") ?? "").trim(), state: (get("state") ?? "").trim(), row: rowNo });
  });
  return { habitations: out, issues, mapping: map, headers, rowsRead: rows.length - 1 };
}

/** GeoJSON: Point features become habitations; Polygon/MultiPolygon features become a user red-zone layer. */
export function parseGeoJson(text: string): { habitations: Habitation[]; zones: { geometry: any; name: string }[]; issues: Issue[] } {
  const issues: Issue[] = [];
  let j: any;
  try { j = JSON.parse(text); } catch { return { habitations: [], zones: [], issues: [{ row: null, level: "error", text: "Not valid JSON." }] }; }
  const feats: any[] = j.type === "FeatureCollection" ? j.features ?? [] : j.type === "Feature" ? [j] : [];
  if (!feats.length) issues.push({ row: null, level: "error", text: "No GeoJSON features found." });
  const habitations: Habitation[] = [];
  const zones: { geometry: any; name: string }[] = [];
  feats.forEach((f, i) => {
    const g = f.geometry;
    const p = f.properties ?? {};
    if (g?.type === "Point") {
      const [lon, lat] = g.coordinates;
      const name = String(p.name ?? p.NAME ?? p.village ?? `Point ${i + 1}`);
      if (!(lat >= IN.minLat && lat <= IN.maxLat && lon >= IN.minLon && lon <= IN.maxLon)) { issues.push({ row: i + 1, level: "error", text: `${name}: outside India — skipped.` }); return; }
      const pop = Number(p.population ?? p.pop ?? p.POP);
      const hh = Number(p.households ?? p.hh);
      habitations.push({ name, lat, lon, population: Number.isFinite(pop) ? pop : null, households: Number.isFinite(hh) ? hh : null, district: String(p.district ?? ""), state: String(p.state ?? ""), row: i + 1 });
    } else if (g?.type === "Polygon" || g?.type === "MultiPolygon") zones.push({ geometry: g, name: String(p.name ?? p.zone ?? `Zone ${zones.length + 1}`) });
    else issues.push({ row: i + 1, level: "warning", text: `Feature ${i + 1}: ${g?.type ?? "no geometry"} is not supported (use Point or Polygon).` });
  });
  return { habitations, zones, issues };
}

// ---------------------------------------------------------------- classification
const ZONE_SCORE: Record<Zone, number> = { RED: 100, ORANGE: 70, YELLOW: 35, GREEN: 5 };
const TIER_CUTS = { immediate: 62, short_term: 50, medium_term: 38 };
/** Horizon from the priority score, gated by zone exactly as in the pipeline: GREEN never relocates, YELLOW is at most medium-term. */
export const tierOf = (s: number, zone: Zone = "RED"): Tier => {
  const t: Tier = s >= TIER_CUTS.immediate ? "immediate" : s >= TIER_CUTS.short_term ? "short_term" : s >= TIER_CUTS.medium_term ? "medium_term" : "monitor";
  if (zone === "GREEN") return "monitor";
  if (zone === "YELLOW" && (t === "immediate" || t === "short_term")) return "medium_term";
  return t;
};

export interface ClassifyContext {
  data: Dataset;
  districtGeo: { id?: number | string; geometry: any }[];
  pilot?: Pilot | null;
  userZones?: { geometry: any; name: string }[];
}

export interface Classified { item: PlanItem; how: string; matched: boolean }

/** Zone for a point: user polygons first (RED), then pilot terrain polygons (RED/ORANGE), then the district tier. */
export function classify(h: Habitation, ctx: ClassifyContext, boxes?: Map<number, [number, number, number, number]>): Classified {
  const { data, districtGeo, pilot, userZones } = ctx;
  const id = districtAt(h.lon, h.lat, districtGeo, boxes);
  const d = id != null ? data.byId.get(id) : undefined;
  if (!d) {
    return { matched: false, how: "Point is not inside any district polygon", item: { id: `up-${h.row}`, name: h.name, district: h.district || "unknown", state: h.state || "unknown", lat: h.lat, lon: h.lon, zone: "GREEN", tier: "monitor", score: 0, pop: h.population ?? 100, hh: h.households ?? 20, reasons: [], source: "upload", level: "habitation", hills: false, annualP: 0 } };
  }
  let zone: Zone = d.zone;
  let how = "District hazard tier (no habitation-level polygon covers this point)";
  const reasons: string[] = [];
  const inUser = userZones?.some((z) => pointInGeometry(h.lon, h.lat, z.geometry));
  if (inUser) { zone = "RED"; how = "Inside your uploaded red-zone polygon"; reasons.push("INSIDE_UPLOADED_RED_ZONE"); }
  else if (pilot && pilot.district.id === d.id) {
    const inRing = (polys: number[][][][]) => polys.some((p) => pointInGeometry(h.lon, h.lat, { type: "Polygon", coordinates: p }));
    if (inRing(pilot.red)) { zone = "RED"; how = `Inside ${pilot.district.name} terrain red-zone polygon`; reasons.push("INSIDE_PILOT_RED_POLYGON"); }
    else if (inRing(pilot.orange)) { zone = "ORANGE"; how = `Inside ${pilot.district.name} terrain orange-zone polygon`; reasons.push("INSIDE_PILOT_ORANGE_POLYGON"); }
    else { zone = "GREEN"; how = `Outside ${pilot.district.name} red/orange terrain polygons`; }
  }
  const hhSize = d.pop / Math.max(d.hh, 1);
  const pop = h.population ?? 100;
  const hh = h.households ?? Math.max(1, Math.round(pop / hhSize));
  const expo = 100 * Math.min(1, Math.log10(pop + 1) / 3.7);
  const feas = 100 * Math.max(0, 1 - d.reloc.safe_km / 120);
  const score = 0.35 * ZONE_SCORE[zone] + 0.25 * d.vuln + 0.15 * expo + 0.15 * d.hist.idx + 0.1 * feas;
  return {
    matched: true, how,
    item: {
      id: `up-${h.row}`, name: h.name, district: d.n, state: d.s, lat: h.lat, lon: h.lon, zone, tier: tierOf(score, zone), score, pop, hh, reasons,
      source: "upload", level: "habitation", hills: d.terr.s15 >= 20, annualP: Math.max(d.P.flood, d.P.landslide, d.P.cloudburst, d.P.cyclone),
    },
  };
}

export const districtBoxes = () => new Map<number, [number, number, number, number]>();
export { bboxOf };
