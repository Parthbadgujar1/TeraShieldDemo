import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { applyMeta } from "./risk";
import type { AlertFeed, District, HistoryEvent, Meta, Pilot, ReplayPack, Validation } from "./types";

export interface Dataset {
  districts: District[];
  byId: Map<number, District>;
  states: string[];
  byState: Map<string, District[]>;
  meta: Meta;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function getJson<T>(name: string): Promise<T> {
  const v = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev";
  const r = await fetch(`${BASE}/data/${name}?v=${v}`);
  if (!r.ok) throw new Error(`Could not load ${name} (${r.status})`);
  return r.json();
}

let datasetPromise: Promise<Dataset> | null = null;

export function loadDataset(): Promise<Dataset> {
  if (!datasetPromise) {
    datasetPromise = Promise.all([getJson<District[]>("districts.json"), getJson<Meta>("meta.json")]).then(([districts, meta]) => {
      applyMeta(meta);
      const byState = new Map<string, District[]>();
      for (const d of districts) {
        if (!byState.has(d.s)) byState.set(d.s, []);
        byState.get(d.s)!.push(d);
      }
      for (const list of byState.values()) list.sort((a, b) => a.n.localeCompare(b.n));
      return {
        districts,
        byId: new Map(districts.map((d) => [d.id, d])),
        states: [...byState.keys()].sort(),
        byState,
        meta,
      };
    });
    datasetPromise.catch(() => (datasetPromise = null));
  }
  return datasetPromise;
}

export function useDataset() {
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadDataset().then((d) => alive && setData(d)).catch((e) => alive && setError(String(e.message || e)));
    return () => { alive = false; };
  }, []);
  return { data, error };
}

export interface GeoCollection { type: "FeatureCollection"; features: any[] }

const geoCache: Record<string, Promise<any>> = {};
function cached<T>(name: string): Promise<T> {
  if (!geoCache[name]) geoCache[name] = getJson<T>(name).catch((e) => { delete geoCache[name]; throw e; });
  return geoCache[name];
}
export const loadDistrictGeo = () => cached<GeoCollection>("geo_districts.json");
export const loadStateGeo = () => cached<GeoCollection>("geo_states.json");
export const loadHistory = () => cached<Record<string, HistoryEvent[]>>("history.json");
export const loadCoast = () => cached<number[][][]>("coast.json");
export const loadAlerts = () => cached<AlertFeed>("alerts.json");
export const loadReplays = () => cached<ReplayPack>("replays.json");
export const loadValidation = () => cached<Validation>("validation.json");
export const loadPilot = (slug = "wayanad") => cached<Pilot>(`pilot_${slug}.json`);

/** Pilot districts that ship habitation-level data. Add a slug here after running data-pipeline/build_pilot.py. */
export const PILOT_SLUGS = ["wayanad"] as const;

/** Remember the last district across the four modules. */
const KEY = "ts_district";
export function rememberDistrict(id: number) {
  try { localStorage.setItem(KEY, String(id)); } catch { /* private mode */ }
}
export function recalledDistrict(): number | null {
  try { const v = localStorage.getItem(KEY); return v ? Number(v) : null; } catch { return null; }
}

export interface StateSummary {
  state: string;
  districts: number;
  pop: number;
  red: number; orange: number; yellow: number; green: number;
  meanRisk: number;
  meanP: Record<string, number>;
}

export function summariseStates(districts: District[]): StateSummary[] {
  const map = new Map<string, StateSummary>();
  for (const d of districts) {
    let s = map.get(d.s);
    if (!s) map.set(d.s, (s = { state: d.s, districts: 0, pop: 0, red: 0, orange: 0, yellow: 0, green: 0, meanRisk: 0, meanP: {} }));
    s.districts++; s.pop += d.pop; s.meanRisk += d.risk;
    if (d.zone === "RED") s.red++; else if (d.zone === "ORANGE") s.orange++; else if (d.zone === "YELLOW") s.yellow++; else s.green++;
    for (const k of Object.keys(d.P)) s.meanP[k] = (s.meanP[k] || 0) + (d.P as Record<string, number>)[k];
  }
  for (const s of map.values()) {
    s.meanRisk /= s.districts;
    for (const k of Object.keys(s.meanP)) s.meanP[k] /= s.districts;
  }
  return [...map.values()].sort((a, b) => a.state.localeCompare(b.state));
}

/**
 * The selected district lives in the URL (?d=<id>) so a link always reopens the same analysis and the four
 * modules stay in step. With `fallbackToDefault` the highest-risk district is chosen when none is given.
 */
export function useDistrictParam(data: Dataset | null, fallbackToDefault = false) {
  const [params, setParams] = useSearchParams();
  const raw = params.get("d");
  const parsed = raw != null && raw !== "" ? Number(raw) : null;
  const valid = parsed != null && data?.byId.has(parsed) ? parsed : null;

  const set = useCallback(
    (next: number | null) => {
      const p = new URLSearchParams(params);
      if (next == null) p.delete("d");
      else { p.set("d", String(next)); rememberDistrict(next); }
      setParams(p, { replace: true });
    },
    [params, setParams],
  );

  useEffect(() => {
    if (!data || valid != null || !fallbackToDefault) return;
    const recalled = recalledDistrict();
    const id = recalled != null && data.byId.has(recalled) ? recalled : [...data.districts].sort((a, b) => b.risk_idx - a.risk_idx)[0].id;
    set(id);
  }, [data, valid, fallbackToDefault, set]);

  return [valid, set] as const;
}

/** Districts named in an active official SACHET alert (for a map outline). */
export function useAlertDistricts(): Set<number> {
  const [ids, setIds] = useState<Set<number>>(new Set());
  useEffect(() => {
    let alive = true;
    loadAlerts().then((f) => alive && setIds(new Set(f.alerts.flatMap((a) => a.districts)))).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  return ids;
}
