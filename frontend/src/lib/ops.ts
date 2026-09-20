import { useCallback, useEffect, useState } from "react";
import type { Zone } from "./types";

/**
 * Operational registers shared by the emergency, district-officer and field dashboards.
 *
 * Everything here is entered by people (shelters, resources, incidents, field reports) — none of it is invented or
 * simulated. In this static demo it lives in the browser (localStorage), so the roles see each other's entries only on the same
 * browser; production would keep these in a server database with role-based access.
 */

// ---------------------------------------------------------------- generic store
function read<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
}
function write<T>(key: string, v: T): boolean {
  try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch { return false; }
}

/** A list persisted in localStorage, kept in sync across tabs and across the dashboards of one browser. */
export function useStore<T>(key: string): [T[], (next: T[]) => void] {
  const [items, setItems] = useState<T[]>(() => read<T[]>(key, []));
  useEffect(() => {
    const on = (e: StorageEvent) => { if (e.key === key || e.key === null) setItems(read<T[]>(key, [])); };
    const local = () => setItems(read<T[]>(key, []));
    window.addEventListener("storage", on);
    window.addEventListener(`ts-store:${key}`, local);
    return () => { window.removeEventListener("storage", on); window.removeEventListener(`ts-store:${key}`, local); };
  }, [key]);
  const set = useCallback((next: T[]) => {
    setItems(next);
    write(key, next);
    window.dispatchEvent(new Event(`ts-store:${key}`));
  }, [key]);
  return [items, set];
}

export const KEYS = {
  shelters: "ts_ops_shelters_v1",
  resources: "ts_ops_resources_v1",
  incidents: "ts_ops_incidents_v1",
  reports: "ts_field_reports_v1",
  directory: "ts_ops_directory_v1",
} as const;

export const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---------------------------------------------------------------- shelters and resources
export type ShelterKind = "school" | "hall" | "cyclone_shelter" | "community" | "other";
export const SHELTER_KIND: Record<ShelterKind, string> = { school: "School", hall: "Community hall", cyclone_shelter: "Cyclone / flood shelter", community: "Community centre", other: "Other" };
export type ShelterStatus = "open" | "standby" | "closed";

export interface Shelter {
  id: string; name: string; districtId: number | null; district: string; state: string; kind: ShelterKind;
  capacity: number; occupied: number; water: boolean; sanitation: boolean; power: boolean; contact: string;
  lat: number | null; lon: number | null; status: ShelterStatus; updated: string;
}

/** Sphere-standard style minimum: a shelter is only safe to fill if water and sanitation are in place. */
export function shelterHeadroom(s: Shelter): number {
  if (s.status === "closed") return 0;
  const usable = s.water && s.sanitation ? s.capacity : Math.floor(s.capacity * 0.5);
  return Math.max(0, usable - s.occupied);
}

export function shelterSummary(list: Shelter[]) {
  const open = list.filter((s) => s.status !== "closed");
  return {
    count: list.length,
    capacity: open.reduce((a, s) => a + s.capacity, 0),
    occupied: open.reduce((a, s) => a + s.occupied, 0),
    headroom: open.reduce((a, s) => a + shelterHeadroom(s), 0),
    lacking: open.filter((s) => !s.water || !s.sanitation).length,
    overloaded: open.filter((s) => s.occupied > s.capacity).length,
  };
}

export type ResourceType = "bus" | "boat" | "jcb" | "ambulance" | "rescue_team" | "generator" | "medical_team" | "other";
export const RESOURCE_TYPE: Record<ResourceType, string> = {
  bus: "Buses / evacuation vehicles", boat: "Boats", jcb: "Earth-movers (JCB)", ambulance: "Ambulances", rescue_team: "Rescue teams (NDRF / SDRF)",
  generator: "Generators", medical_team: "Medical teams", other: "Other",
};
export type ResourceStatus = "available" | "deployed" | "unavailable";
export interface Resource { id: string; type: ResourceType; label: string; count: number; districtId: number | null; district: string; status: ResourceStatus; note: string; updated: string }

// ---------------------------------------------------------------- incidents
export type IncidentKind = "road_blocked" | "landslide" | "flood" | "rescue" | "casualty" | "shelter" | "power_outage" | "other";
export const INCIDENT_KIND: Record<IncidentKind, string> = {
  road_blocked: "Road blocked", landslide: "Landslide", flood: "Flooding", rescue: "Rescue in progress", casualty: "Casualty / injury",
  shelter: "Shelter event", power_outage: "Power / comms outage", other: "Other",
};
export interface Incident {
  id: string; ts: string; districtId: number | null; district: string; state: string; kind: IncidentKind; severity: 1 | 2 | 3 | 4;
  text: string; status: "open" | "closed"; by: string; lat: number | null; lon: number | null; closedTs?: string;
}

// ---------------------------------------------------------------- field reports
export type FieldCheck = "tension_cracks" | "house_cracks" | "seepage" | "tilting" | "slope_movement" | "stream_erosion" | "drain_blocked" | "water_rising";

/** Bilingual checklist so ASHA / Aapda Mitra volunteers can fill it in their own language. */
export const FIELD_CHECKS: { key: FieldCheck; en: string; hi: string; weight: number }[] = [
  { key: "tension_cracks", en: "Fresh cracks in the ground", hi: "जमीन में नई दरारें", weight: 3 },
  { key: "slope_movement", en: "Slope moving, rockfall or debris", hi: "ढलान खिसकना, पत्थर या मलबा गिरना", weight: 3 },
  { key: "seepage", en: "New springs or muddy water from the slope", hi: "ढलान से नया रिसाव या मटमैला पानी", weight: 2 },
  { key: "house_cracks", en: "New cracks in house walls or floors", hi: "घर की दीवारों या फर्श में नई दरारें", weight: 2 },
  { key: "tilting", en: "Tilting poles, trees or walls", hi: "झुके हुए खंभे, पेड़ या दीवारें", weight: 2 },
  { key: "stream_erosion", en: "Stream bank being cut away", hi: "नदी/नाले का किनारा कट रहा है", weight: 2 },
  { key: "water_rising", en: "Water level rising fast", hi: "पानी का स्तर तेज़ी से बढ़ रहा है", weight: 3 },
  { key: "drain_blocked", en: "Drain or culvert blocked", hi: "नाला या पुलिया बंद", weight: 1 },
];

export type ReportStatus = "submitted" | "acknowledged" | "escalated" | "verified" | "rejected";
export const REPORT_STATUS: Record<ReportStatus, string> = { submitted: "Submitted", acknowledged: "Acknowledged", escalated: "Escalated to DM", verified: "Verified", rejected: "Rejected" };

export interface FieldReport {
  id: string; ts: string; by: string; habitation: string; districtId: number | null; district: string; state: string;
  /** pilot habitation this report is about (Wayanad), so verification can update its register entry */
  pilotId: number | null; zone: Zone | null;
  lat: number | null; lon: number | null; checks: Partial<Record<FieldCheck, boolean>>; note: string; photo: string | null;
  status: ReportStatus; review?: { by: string; ts: string; note: string };
}

export interface Assessment { score: number; level: "routine" | "watch" | "urgent"; text: string }

/** Turns a checklist into an urgency level. Transparent rule: weights above, watch at 3, urgent at 6 or any two "3"-weight signs. */
export function assessReport(checks: Partial<Record<FieldCheck, boolean>>): Assessment {
  const on = FIELD_CHECKS.filter((c) => checks[c.key]);
  const score = on.reduce((s, c) => s + c.weight, 0);
  const strong = on.filter((c) => c.weight >= 3).length;
  if (score >= 6 || strong >= 2) return { score, level: "urgent", text: "Multiple strong ground or water signs — treat as urgent: alert the district control room and consider precautionary evacuation." };
  if (score >= 3) return { score, level: "watch", text: "Warning signs present — keep watching, report again after the next rain and ask for a technical inspection." };
  return { score, level: "routine", text: "No strong signs recorded — continue routine monitoring." };
}

/** Compresses a photo to a small JPEG data URL so a few reports fit in browser storage. */
export async function compressPhoto(file: File, maxSide = 720, quality = 0.62): Promise<string | null> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", quality);
  } catch { return null; }
}

// ---------------------------------------------------------------- directory
export interface Contact { id: string; role: string; name: string; phone: string; district: string; note: string }
export const NATIONAL_NUMBERS: [string, string][] = [
  ["112", "National emergency response (ERSS)"], ["108", "Ambulance"], ["101", "Fire"], ["100", "Police"],
  ["1070", "State disaster helpline"], ["1077", "District disaster control room"],
];

// ---------------------------------------------------------------- csv
export function csvOf(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
}
