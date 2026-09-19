import { clamp01, destination, distToPolylineKm, haversineKm } from "./geo";
import type { Amenity } from "./osm";
import type { RouteOption } from "./routing";
import type { District, LatLon } from "./types";

export type Phase = "predicted" | "imminent" | "active";

export interface Weights { safety: number; route: number; capacity: number; services: number; cost: number; community: number }

/** Objective weights per relocation phase — what matters shifts from cost/fit early to speed/route safety late. */
export const PHASE_WEIGHTS: Record<Phase, Weights> = {
  predicted: { safety: 0.30, route: 0.15, capacity: 0.20, services: 0.15, cost: 0.10, community: 0.10 },
  imminent: { safety: 0.30, route: 0.35, capacity: 0.20, services: 0.10, cost: 0.0, community: 0.05 },
  active: { safety: 0.25, route: 0.40, capacity: 0.15, services: 0.15, cost: 0.0, community: 0.05 },
};

export const PHASES: { key: Phase; label: string; horizon: string; defaultTtiHours: number; goal: string; inputs: string[] }[] = [
  {
    key: "predicted", label: "1 · Predicted hazard", horizon: "Hours to days before", defaultTtiHours: 48,
    goal: "Pre-position people and resources; recommend safe destinations.",
    inputs: ["Forecast hazard probability & intensity", "Hazard arrival time", "Candidate shelter capacity", "Population exposure", "Route availability & travel time", "Future hazard progression"],
  },
  {
    key: "imminent", label: "2 · Imminent hazard", horizon: "30–60 minutes before impact", defaultTtiHours: 1,
    goal: "Generate immediate evacuation routes for the people at highest risk.",
    inputs: ["Current hazard probability", "Time-to-impact", "Current road status", "Route safety", "Remaining shelter capacity", "Vulnerable population", "Emergency-service proximity"],
  },
  {
    key: "active", label: "3 · Active event", horizon: "During the disaster", defaultTtiHours: 0,
    goal: "Continuously update and dynamically reroute if the original route becomes unsafe.",
    inputs: ["Real-time hazard location & movement", "Road closures", "Flood depth / water level", "Landslide occurrence", "Shelter occupancy", "Emergency-service availability", "Remaining travel time"],
  },
];

export interface Candidate {
  id: string;
  lat: number;
  lon: number;
  distKm: number;
  bearingDeg: number;
  elev: number;
  slope: number;
  hand: number; // height above the lowest nearby ground, m
  riverKm: number | null;
  coastKm: number | null;
  local: { flood: number; landslide: number; cloudburst: number; coastal: number; cyclone: number };
  risk: number; // 0..1 weighted local hazard
  safety: number; // 0..1
  services: { hospitalKm: number | null; schoolKm: number | null; emergencyKm: number | null; fuelKm: number | null; pharmacyKm: number | null; known: boolean };
  servicesScore: number;
  /** people the site can hold = min(space, water, access) constraints; hospitals are never counted as shelter */
  capacity: { shelter: number; land: number; total: number; schools: number; halls: number; bind: "space" | "water"; water: "PARTIAL" | "UNVALIDATED" };
  capacityScore: number;
  /** hard rejects: a permanent or long-stay site must not be in a high-susceptibility spot, whatever else it scores */
  reject: string[];
}

/** Hard-reject thresholds on local susceptibility (0..1) and terrain. High susceptibility is a veto, not a 30% weight. */
export const HARD_REJECT = { landslide: 0.4, flood: 0.55, slope: 20, handM: 2 };

export function hardRejects(local: { flood: number; landslide: number }, slopeDeg: number, handM: number, riverKm: number | null): string[] {
  const r: string[] = [];
  if (local.landslide >= HARD_REJECT.landslide) r.push(`landslide susceptibility ${Math.round(local.landslide * 100)}/100 ≥ ${HARD_REJECT.landslide * 100}`);
  if (local.flood >= HARD_REJECT.flood) r.push(`flood susceptibility ${Math.round(local.flood * 100)}/100 ≥ ${HARD_REJECT.flood * 100}`);
  if (slopeDeg >= HARD_REJECT.slope) r.push(`slope ${slopeDeg.toFixed(0)}° ≥ ${HARD_REJECT.slope}°`);
  if (riverKm != null && riverKm < 0.3 && handM <= HARD_REJECT.handM) r.push("river bank (≤ 2 m above nearby low ground)");
  return r;
}

/** Rings of candidate destinations around the affected habitation. */
export function ringPoints(origin: LatLon, radii = [8, 16, 26], bearings = 16): { lat: number; lon: number; distKm: number; bearingDeg: number }[] {
  const out = [];
  for (const r of radii) {
    for (let k = 0; k < bearings; k++) {
      const b = (360 / bearings) * k + (r === radii[1] ? 360 / bearings / 2 : 0);
      const p = destination(origin, b, r);
      out.push({ ...p, distKm: r, bearingDeg: b });
    }
  }
  return out;
}

/** Terrain statistics from the SRTM samples of the ring grid: local slope and height above nearby low ground. */
export function analyseTerrain(pts: { lat: number; lon: number }[], elev: number[]): { slope: number; hand: number }[] {
  return pts.map((p, i) => {
    let sum = 0;
    let n = 0;
    let low = elev[i];
    for (let j = 0; j < pts.length; j++) {
      if (j === i) continue;
      const d = haversineKm(p, pts[j]);
      if (d <= 10) low = Math.min(low, elev[j]);
      if (d <= 9.5) {
        sum += Math.abs(elev[j] - elev[i]) / (d * 1000);
        n++;
      }
    }
    const grade = n ? sum / n : 0;
    return { slope: (Math.atan(grade) * 180) / Math.PI, hand: Math.max(0, elev[i] - low) };
  });
}

/** Weights for combining hazards, proportional to the district's own annual probabilities. */
export function hazardMix(d: District): Record<"flood" | "landslide" | "cloudburst" | "coastal" | "cyclone", number> {
  const raw = { flood: d.P.flood, landslide: d.P.landslide, cloudburst: d.P.cloudburst, coastal: d.P.coastal, cyclone: d.P.cyclone };
  const total = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v / total])) as ReturnType<typeof hazardMix>;
}

/** Local hazard score (0..1) at a candidate — the same factor structure as the district model, with local terrain in place of district averages. */
export function localHazards(d: District, slopeDeg: number, handM: number, riverKm: number | null, coastKm: number | null) {
  const rain = d.F.flood[0] / 100;
  const flood = clamp01(
    0.35 * rain + 0.25 * (1 - clamp01(handM / 40)) + 0.2 * (riverKm != null ? 1 - clamp01(riverKm / 3) : d.F.flood[2] / 100)
    + 0.1 * (1 - clamp01(slopeDeg / 6)) + 0.1 * (d.F.flood[4] / 100),
  );
  const landslide = clamp01(
    0.45 * clamp01(slopeDeg / 30) + 0.25 * (d.F.landslide[1] / 100) + 0.2 * (d.F.landslide[2] / 100)
    + 0.1 * (riverKm != null ? 1 - clamp01(riverKm / 1.5) : d.F.landslide[3] / 100),
  );
  const cloudburst = clamp01((d.S.cloudburst / 100) * (0.3 + clamp01(slopeDeg / 25)));
  const coastal = coastKm != null ? clamp01((d.S.coastal / 100) * (1 - clamp01(coastKm / 40))) : 0;
  const cyclone = coastKm != null ? clamp01((d.P.cyclone / 100) * (1 - clamp01(coastKm / 80))) : 0;
  return { flood, landslide, cloudburst, coastal, cyclone };
}

function nearestKm(p: LatLon, list: Amenity[], types: string[]): number | null {
  let best: number | null = null;
  for (const a of list) {
    if (!types.includes(a.type)) continue;
    const dLat = Math.abs(a.lat - p.lat);
    if (dLat > 0.4) continue;
    const km = haversineKm(p, { lat: a.lat, lon: a.lon });
    if (best == null || km < best) best = km;
  }
  return best;
}

function countWithin(p: LatLon, list: Amenity[], types: string[], km: number): number {
  let n = 0;
  for (const a of list) {
    if (!types.includes(a.type) || Math.abs(a.lat - p.lat) > km / 100) continue;
    if (haversineKm(p, { lat: a.lat, lon: a.lon }) <= km) n++;
  }
  return n;
}

/** Sphere / NDMA-style planning assumptions for capacity (documented in the UI). Hospital beds are deliberately absent. */
export const CAPACITY_ASSUMPTIONS = { school: 230, college: 400, hall: 120, parcelHa: 40, peoplePerHa: 55, netShare: 0.55 };

export interface BuildInput {
  origin: LatLon;
  district: District;
  pts: ReturnType<typeof ringPoints>;
  elevations: number[];
  waterways: number[][][] | null;
  coast: number[][][] | null;
  amenities: Amenity[] | null;
  population: number;
}

export function buildCandidates(input: BuildInput): Candidate[] {
  const { origin, district: d, pts, elevations, waterways, coast, amenities, population } = input;
  const terrain = analyseTerrain(pts, elevations);
  const mix = hazardMix(d);
  const A = CAPACITY_ASSUMPTIONS;
  return pts
    .map((p, i): Candidate | null => {
      // Drop sea / water cells: a zero-metre reading close to the coast.
      const coastKm = coast ? Math.min(...coast.filter((l) => l.length > 1).map((l) => distToPolylineKm(p, l))) : null;
      if (elevations[i] <= 0.5 && coastKm != null && coastKm < 25) return null;
      const riverKm = waterways && waterways.length ? Math.min(...waterways.map((l) => distToPolylineKm(p, l))) : null;
      const t = terrain[i];
      const local = localHazards(d, t.slope, t.hand, riverKm, coastKm != null && coastKm < 120 ? coastKm : null);
      const risk = (Object.keys(mix) as (keyof typeof mix)[]).reduce((s, k) => s + mix[k] * local[k], 0);
      const safety = 0.8 * (1 - risk) + 0.2 * clamp01(p.distKm / 20);
      const ll = { lat: p.lat, lon: p.lon };
      const known = amenities != null;
      const svc = known
        ? {
          hospitalKm: nearestKm(ll, amenities!, ["hospital"]) ?? nearestKm(ll, amenities!, ["clinic", "doctors"]),
          schoolKm: nearestKm(ll, amenities!, ["school", "college"]),
          emergencyKm: nearestKm(ll, amenities!, ["fire_station", "police"]),
          fuelKm: nearestKm(ll, amenities!, ["fuel"]),
          pharmacyKm: nearestKm(ll, amenities!, ["pharmacy"]),
          known,
        }
        : { hospitalKm: null, schoolKm: null, emergencyKm: null, fuelKm: null, pharmacyKm: null, known };
      const q = (v: number | null, span: number) => (v == null ? 0.25 : 1 - clamp01(v / span));
      const servicesScore = known
        ? 0.35 * q(svc.hospitalKm, 25) + 0.15 * q(svc.schoolKm, 6) + 0.2 * q(svc.emergencyKm, 25) + 0.1 * q(svc.fuelKm, 25) + 0.2 * q(svc.pharmacyKm, 20)
        : 0.5;
      const schools = known ? countWithin(ll, amenities!, ["school"], 5) : 0;
      const colleges = known ? countWithin(ll, amenities!, ["college"], 5) : 0;
      const halls = known ? countWithin(ll, amenities!, ["community_centre", "shelter"], 5) : 0;
      const shelter = schools * A.school + colleges * A.college + halls * A.hall;
      const flat = 1 - clamp01((t.slope - 3) / 12);
      const land = Math.round(flat * A.parcelHa * A.peoplePerHa * A.netShare);
      // capacity is the minimum of space and water: a stream/river within ~2 km is a partial (proxy) water source, otherwise unvalidated
      const waterOk = riverKm != null && riverKm <= 2;
      const space = shelter + land;
      const total = Math.round(waterOk ? space : space * 0.6);
      const reject = hardRejects(local, t.slope, t.hand, riverKm);
      return {
        id: `c${i}`, lat: p.lat, lon: p.lon, distKm: p.distKm, bearingDeg: p.bearingDeg,
        elev: elevations[i], slope: t.slope, hand: t.hand, riverKm, coastKm: coastKm != null && coastKm < 200 ? coastKm : null,
        local, risk, safety, services: svc, servicesScore,
        capacity: { shelter, land, total, schools, halls, bind: waterOk ? "space" : "water", water: waterOk ? "PARTIAL" : "UNVALIDATED" },
        // saturates at 3x the people to be housed, so sites with more headroom score higher instead of all clipping at 100
        capacityScore: clamp01(total / (3 * Math.max(population, 1))),
        reject,
      };
    })
    .filter((c): c is Candidate => c !== null);
}

export interface PlanOption {
  candidate: Candidate;
  route: RouteOption | null;
  scores: Weights;
  total: number;
  feasible: boolean;
  rejected: boolean;
  blocked: boolean;
  effectiveMin: number | null;
  windowMin: number | null; // remaining evacuation window after preparation + travel
  pareto: boolean;
}

/** Travel time stretched by hazard exposure: a risky road is a slow road. */
export function effectiveMinutes(r: RouteOption): number {
  return r.durationMin * (1 + 1.5 * r.risk);
}

export function routeScore(r: RouteOption | null): number {
  if (!r) return 0.35;
  const q = 1 - clamp01(effectiveMinutes(r) / 180);
  return r.risk > 0.85 ? q * 0.3 : q;
}

export interface RankOptions {
  weights: Weights;
  blocked: Set<string>; // "candidateId:routeIndex"
  ttiHours: number;
  prepMin: number;
}

export function rank(cands: Candidate[], routes: Map<string, RouteOption[]>, opts: RankOptions): PlanOption[] {
  const { weights: w, blocked, ttiHours, prepMin } = opts;
  const options: PlanOption[] = cands.map((c) => {
    const all = routes.get(c.id) ?? [];
    const usable = all.filter((r) => !blocked.has(`${c.id}:${r.index}`));
    const best = usable.length ? usable.reduce((a, b) => (effectiveMinutes(a) <= effectiveMinutes(b) ? a : b)) : null;
    const isBlocked = all.length > 0 && usable.length === 0;
    const scores: Weights = {
      safety: c.safety,
      route: isBlocked ? 0 : routeScore(best),
      capacity: c.capacityScore,
      services: c.servicesScore,
      cost: 1 - clamp01(c.distKm / 40),
      community: 1 - clamp01(c.distKm / 45),
    };
    const total = (Object.keys(w) as (keyof Weights)[]).reduce((s, k) => s + w[k] * scores[k], 0);
    const eff = best ? effectiveMinutes(best) : null;
    const window = eff != null ? ttiHours * 60 - prepMin - eff : null;
    const rejected = c.reject.length > 0;
    const feasible = !rejected && c.safety >= 0.5 && !isBlocked && (best ? best.risk < 0.85 : true) && (window == null || ttiHours === 0 || window >= 0);
    return { candidate: c, route: best, scores, total, feasible, rejected, blocked: isBlocked, effectiveMin: eff, windowMin: window, pareto: false };
  });
  const dims: (keyof Weights)[] = ["safety", "route", "capacity", "services"];
  for (const a of options) {
    a.pareto = !options.some(
      (b) => b !== a && dims.every((k) => b.scores[k] >= a.scores[k]) && dims.some((k) => b.scores[k] > a.scores[k]),
    );
  }
  return options.sort((a, b) => Number(b.feasible) - Number(a.feasible) || b.total - a.total);
}

export interface MovementPlan {
  households: number;
  buses: number;
  fleet: number;
  waves: number;
  totalMin: number | null;
  elderly: number;
  disabled: number;
  /** Census 2011 age band 0-29 (the only youth band in the district table; 0-6 needs the PCA village tables) */
  young: number;
  priorityOrder: string[];
}

/** Evacuation logistics for the recommended option. */
export function movementPlan(pop: number, d: District, route: RouteOption | null, fleet: number, seats = 50, loadingMin = 30): MovementPlan {
  const buses = Math.ceil(pop / seats);
  const waves = Math.ceil(buses / Math.max(fleet, 1));
  const oneWay = route ? effectiveMinutes(route) : 0;
  const totalMin = route ? waves * (loadingMin + oneWay) + (waves - 1) * oneWay : null;
  return {
    households: Math.round(pop / Math.max(pop && d.hh ? d.pop / d.hh : 5, 1)),
    buses, fleet, waves, totalMin,
    elderly: Math.round(pop * d.c.a50), // Census 2011 age 50+
    disabled: Math.round(pop * 0.0221), // Census 2011 national prevalence (district table C-20 not integrated)
    young: Math.round(pop * d.c.a30),
    priorityOrder: ["Hospitalised & bed-ridden", "Persons with disabilities & reduced mobility", "Elderly (50+) and pregnant women", "Young people with guardians", "Remaining households by hazard proximity"],
  };
}
