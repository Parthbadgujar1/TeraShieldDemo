export type Zone = "RED" | "ORANGE" | "YELLOW" | "GREEN";
export type HazardKey = "flood" | "landslide" | "cloudburst" | "coastal" | "cyclone" | "heatwave";
export type Tier = "immediate" | "short_term" | "medium_term" | "monitor";
export type VBand = "LOW" | "MEDIUM" | "HIGH";

/** Census-2011 derived shares, all 0..1 */
export interface Census {
  lit: number; urb: number; scst: number; agri: number; work: number; fwork: number;
  elec: number; lpg: number; net: number; phone: number; car: number; two: number; bike: number;
  dil: number; tap: number; far: number; latrine: number; a50: number; a30: number;
}

export interface District {
  id: number;
  s: string; // state
  n: string; // district name
  lat: number;
  lon: number;
  pop: number;
  hh: number;
  area: number; // km2
  dens: number; // people / km2
  elev: number; // m
  relief: number; // m within ~14 km window
  slope: number; // deg
  coast: number; // km to coast
  river: number; // km to nearest major river
  clim: { rain: number; rx1: number; rx5: number; hot: number; tmax: number; hthr: number };
  /** annual occurrence probability, % */
  P: Record<HazardKey, number>;
  /** susceptibility index, % */
  S: { flood: number; landslide: number; cloudburst: number; coastal: number };
  /** factor values, % — flood[rain,low_elev,river,flat,lulc] landslide[slope,rain,history,stream] cloudburst[intensity,orographic] coastal[distance,cyclone,shoreline] */
  F: { flood: number[]; landslide: number[]; cloudburst: number[]; coastal: number[] };
  risk: number; // composite multi-hazard probability, %
  zone: Zone;
  dom: HazardKey;
  vuln: number; // 0..100
  vband: VBand;
  vf: number[]; // 11 vulnerability factors, 0..100, order = meta.vuln_factors
  c: Census;
  expo: { frac: number; pop: number; idx: number };
  risk_idx: number;
  hist: { ls: number; lsf: number; cyc: number; cycs: number; kt: number; idx: number };
  reloc: { score: number; tier: Tier; safe: number; safe_km: number };
}

export interface Meta {
  generated: string;
  districts: number;
  states: number;
  zone_counts: Record<Zone, number>;
  tier_counts: Record<Tier, number>;
  weights: Record<string, Record<string, number>>;
  vuln_factors: string[];
  zone_cuts: { red: number; orange: number; yellow: number };
  tier_cuts: { immediate: number; short_term: number; medium_term: number };
  cyclone_radius_km: number;
  cyclone_seasons: [number, number];
  climate_years: [number, number];
}

export interface HistoryEvent { year: number | null; fat: number; where: string; trigger: string; kind: string }

export interface Forecast {
  rain: number[]; // daily mm, next 3 days
  rain3: number;
  rainMax: number;
  hourlyMax: number; // mm/h
  peakHour?: number | null; // hours from now until the heaviest forecast hour (null when no intense rain)
  tmaxMax: number;
  gustMax: number; // km/h
}

export interface LatLon { lat: number; lon: number }
