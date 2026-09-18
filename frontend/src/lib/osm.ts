import type { LatLon } from "./types";

/** Public Overpass mirrors, tried in order. Both send CORS headers, so this works from a static site. */
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

async function overpass(query: string, timeoutMs = 45000): Promise<any> {
  let last: unknown = new Error("Overpass unavailable");
  for (const url of ENDPOINTS) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch(url, {
        method: "POST",
        body: "data=" + encodeURIComponent(query),
        signal: ctl.signal,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      if (!r.ok) throw new Error(`Overpass HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      last = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw last;
}

function cacheGet<T>(key: string, ttlMs: number): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { t, v } = JSON.parse(raw);
    return Date.now() - t < ttlMs ? (v as T) : null;
  } catch {
    return null;
  }
}
function cacheSet(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify({ t: Date.now(), v }));
  } catch {
    /* quota / private mode */
  }
}
const DAY = 24 * 3600 * 1000;

export type BBox = [number, number, number, number]; // south, west, north, east

export interface InfraItem { key: string; label: string; group: string; filter: string }

/** Infrastructure inventory queried live from OpenStreetMap for the Exposure module. */
export const INFRA: InfraItem[] = [
  { key: "hospital", label: "Hospitals", group: "Health", filter: '["amenity"="hospital"]' },
  { key: "clinic", label: "Clinics & doctors", group: "Health", filter: '["amenity"~"^(clinic|doctors)$"]' },
  { key: "pharmacy", label: "Pharmacies", group: "Health", filter: '["amenity"="pharmacy"]' },
  { key: "school", label: "Schools", group: "Education", filter: '["amenity"="school"]' },
  { key: "college", label: "Colleges & universities", group: "Education", filter: '["amenity"~"^(college|university)$"]' },
  { key: "fire", label: "Fire stations", group: "Emergency", filter: '["amenity"="fire_station"]' },
  { key: "police", label: "Police stations", group: "Emergency", filter: '["amenity"="police"]' },
  { key: "shelter", label: "Shelters & assembly points", group: "Emergency", filter: '["amenity"="shelter"]' },
  { key: "substation", label: "Electrical substations", group: "Utilities", filter: '["power"="substation"]' },
  { key: "powerplant", label: "Power plants", group: "Utilities", filter: '["power"="plant"]' },
  { key: "water", label: "Water works & towers", group: "Utilities", filter: '["man_made"~"^(water_works|water_tower|water_well)$"]' },
  { key: "sewage", label: "Wastewater plants", group: "Utilities", filter: '["man_made"="wastewater_plant"]' },
  { key: "mast", label: "Telecom masts", group: "Communication", filter: '["man_made"~"^(mast|tower)$"]["tower:type"="communication"]' },
  { key: "fuel", label: "Fuel stations", group: "Utilities", filter: '["amenity"="fuel"]' },
  { key: "bridge", label: "Bridges", group: "Transport", filter: '["man_made"="bridge"]' },
  { key: "rail", label: "Railway stations", group: "Transport", filter: '["railway"="station"]' },
  { key: "bus", label: "Bus stations", group: "Transport", filter: '["amenity"="bus_station"]' },
  { key: "airport", label: "Airports & aerodromes", group: "Transport", filter: '["aeroway"="aerodrome"]' },
  { key: "hotel", label: "Hotels & guest houses", group: "Tourism", filter: '["tourism"~"^(hotel|guest_house|hostel|resort|motel)$"]' },
  { key: "attraction", label: "Tourist attractions", group: "Tourism", filter: '["tourism"~"^(attraction|museum|viewpoint)$"]' },
  { key: "heritage", label: "Heritage sites & monuments", group: "Culture", filter: '["historic"]' },
  { key: "worship", label: "Places of worship", group: "Culture", filter: '["amenity"="place_of_worship"]' },
  { key: "protected", label: "Protected areas", group: "Environment", filter: '["boundary"="protected_area"]' },
];

/** -1 marks a category the public Overpass service could not answer (yet). */
export type InfraCounts = Record<string, number>;

/**
 * Counts each infrastructure category live from OpenStreetMap, one small query per category (a single combined query
 * overloads the free public service). Results stream in through `onUpdate` and are cached per district.
 */
export async function fetchInfraCounts(
  districtId: number,
  bbox: BBox,
  onUpdate?: (counts: InfraCounts, done: number, total: number) => void,
): Promise<InfraCounts> {
  const key = `ts_infra_v2_${districtId}`;
  const counts: InfraCounts = cacheGet<InfraCounts>(key, 7 * DAY) ?? {};
  const todo = INFRA.filter((i) => !(counts[i.key] >= 0));
  let done = INFRA.length - todo.length;
  onUpdate?.({ ...counts }, done, INFRA.length);
  if (!todo.length) return counts;
  const b = bbox.map((v) => v.toFixed(4)).join(",");
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const item = todo[next++];
      try {
        const json = await overpass(`[out:json][timeout:25];nwr${item.filter}(${b});out count;`, 30000);
        counts[item.key] = Number(json.elements?.[0]?.tags?.total ?? 0);
      } catch {
        counts[item.key] = -1;
      }
      done++;
      cacheSet(key, counts);
      onUpdate?.({ ...counts }, done, INFRA.length);
    }
  };
  await Promise.all([worker(), worker()]);
  return counts;
}

export interface Place { name: string; lat: number; lon: number; kind: string; population: number | null }

/** Real villages / hamlets / towns around a centre point. */
export async function fetchPlaces(center: LatLon, radiusKm: number): Promise<Place[]> {
  const key = `ts_places_v1_${center.lat.toFixed(2)}_${center.lon.toFixed(2)}_${radiusKm}`;
  const hit = cacheGet<Place[]>(key, 7 * DAY);
  if (hit) return hit;
  const json = await overpass(
    `[out:json][timeout:30];node["place"~"^(village|hamlet|town|suburb)$"]["name"](around:${radiusKm * 1000},${center.lat},${center.lon});out 300;`,
  );
  const out: Place[] = (json.elements ?? []).map((e: any) => ({
    name: e.tags.name,
    lat: e.lat,
    lon: e.lon,
    kind: e.tags.place,
    population: e.tags.population ? Number(String(e.tags.population).replace(/[^0-9]/g, "")) || null : null,
  }));
  cacheSet(key, out);
  return out;
}

export interface Amenity { type: string; lat: number; lon: number; name?: string }

const AMENITY_FILTER = "hospital|clinic|doctors|school|college|fire_station|police|shelter|community_centre|fuel|pharmacy";

export async function fetchAmenities(bbox: BBox): Promise<Amenity[]> {
  const key = `ts_amen_v1_${bbox.map((v) => v.toFixed(2)).join("_")}`;
  const hit = cacheGet<Amenity[]>(key, 7 * DAY);
  if (hit) return hit;
  const b = bbox.map((v) => v.toFixed(4)).join(",");
  const json = await overpass(`[out:json][timeout:30];nwr["amenity"~"^(${AMENITY_FILTER})$"](${b});out center 1500;`);
  const out: Amenity[] = (json.elements ?? [])
    .map((e: any) => ({ type: e.tags.amenity, name: e.tags.name, lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon }))
    .filter((a: Amenity) => a.lat != null && a.lon != null);
  cacheSet(key, out);
  return out;
}

export async function fetchWaterways(bbox: BBox): Promise<number[][][]> {
  const key = `ts_water_v1_${bbox.map((v) => v.toFixed(2)).join("_")}`;
  const hit = cacheGet<number[][][]>(key, 14 * DAY);
  if (hit) return hit;
  const b = bbox.map((v) => v.toFixed(4)).join(",");
  const json = await overpass(`[out:json][timeout:30];way["waterway"~"^(river|stream|canal)$"](${b});out geom 2500;`);
  const lines: number[][][] = (json.elements ?? [])
    .filter((e: any) => e.geometry?.length > 1)
    .map((e: any) => e.geometry.map((g: any) => [Math.round(g.lon * 1e4) / 1e4, Math.round(g.lat * 1e4) / 1e4]));
  cacheSet(key, lines);
  return lines;
}

/** SRTM elevation for many points (Open-Meteo, at most 100 per request). */
export async function fetchElevations(points: LatLon[]): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < points.length; i += 100) {
    const chunk = points.slice(i, i + 100);
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${chunk.map((p) => p.lat.toFixed(4)).join(",")}&longitude=${chunk.map((p) => p.lon.toFixed(4)).join(",")}`;
    let ok = false;
    for (let a = 0; a < 3 && !ok; a++) {
      try {
        const r = await fetch(url);
        if (r.status === 429) {
          await new Promise((res) => setTimeout(res, 1500 * (a + 1)));
          continue;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        out.push(...((await r.json()).elevation as number[]));
        ok = true;
      } catch {
        await new Promise((res) => setTimeout(res, 500));
      }
    }
    if (!ok) throw new Error("Elevation service unavailable");
  }
  return out;
}
