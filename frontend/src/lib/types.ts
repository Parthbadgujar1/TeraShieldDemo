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
  vf: number[]; // 12 vulnerability factors (11 Census + heat stress), 0..100, order = meta.vuln_factors
  c: Census;
  expo: { frac: number; pop: number; idx: number };
  risk_idx: number;
  hist: { ls: number; lsf: number; cyc: number; cycs: number; kt: number; idx: number };
  /** stab = % of 1,000 random weight sets in which the district keeps its tier; top = % in which it is in the top 10% */
  reloc: { score: number; tier: Tier; safe: number; safe_km: number; stab: number; top: number };
  /** zonal terrain statistics over the district polygon (SRTM-derived): relief m (p95-p5), mean slope deg, share of area >=15 / >=30 deg, max elevation */
  terr: { relief: number; slope: number; s15: number; s30: number; emax: number };
  /** USGS M>=4.5 earthquakes within 100 km, 1990-2023 (context only, not the BIS zone) */
  seis: { n: number; m6: number; max: number };
  /** coastal-erosion susceptibility index reached the ORANGE trigger */
  cflag: boolean;
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


// ---------------------------------------------------------------- static data packs
export interface AlertItem {
  id: string; title: string; category: string; source: string; time: string | null;
  kind: string; severity: number; districts: number[]; states: string[]; link: string;
}
export interface AlertFeed { fetched: string; source: string; count: number; matched: number; unresolved_names: number; alerts: AlertItem[] }

export interface ReplayEvent { id: string; title: string; asof: string; note: string; f: Record<string, [number, number, number, number | null, number, number]> }
export interface ReplayPack { generated: string; source: string; events: ReplayEvent[] }

export type LandClass = "UNKNOWN" | "COMMON" | "PRIVATE_AGRI" | "BUILT" | "FOREST" | "PROTECTED" | "WATER";
export interface PilotVillage {
  id: number; name: string; kind: string; lat: number; lon: number; zone: Zone; elev: number; slope: number; slope_max: number; hand: number;
  red_f: number; org_f: number; bld: number; pop: number; pop_red: number; pop_org: number; bld_red: number; bld_org: number;
  ev: number; ev_year: number | null; ev_fat: number; reasons: string[]; score: number; tier: Tier; site: number | null;
}
export interface PilotSite {
  id: number; lat: number; lon: number; area: number; usable: number; land: LandClass; elev: number; slope: number; hand: number;
  risk_m: number; road_m: number; stream_m: number; school_km: number | null; health_km: number | null; water_km: number | null;
  cap_hh: number; cap_space: number; bind: "space" | "water" | "access";
  cap_status: { space: string; access: string; water: string; sanitation: string };
}
export interface Pilot {
  generated: string;
  district: { id: number; name: string; state: string; lat: number; lon: number; bbox: [number, number, number, number]; pop_census: number; hh: number; vuln: number; hist: number };
  method: Record<string, any>;
  summary: {
    area_km2: number; terrain_share: Record<Zone, number>; villages: Record<Zone, number>; tiers: Record<Tier, number>;
    buildings_mapped: number; buildings_red: number; buildings_orange: number; pop_worldpop: number; pop_assigned: number;
    pop_red: number; pop_orange: number; events: number; events_in_red_orange: number; sites: number; sites_by_land: Record<string, number>;
  };
  checks: { name: string; zone: Zone; slope_max: number; hand: number; reasons: string[] }[];
  red: number[][][][]; orange: number[][][][];
  villages: PilotVillage[]; sites: PilotSite[];
  events: { lat: number; lon: number; year: number | null; fat: number; title: string; trigger: string; cls?: Zone }[];
}

export interface Validation {
  generated: string;
  landslide: {
    split: { freeze_year: number; test_years: [number, number] };
    districts: number; districts_with_test_events: number; districts_with_calibration_events: number;
    model: { auc: number; ci: [number, number]; top20_capture: number; lift_top20: number };
    baselines: Record<"history_only" | "terrain_only" | "no_history" | "random", { auc: number; top20_capture: number }>;
    deciles: { decile: number; districts: number; hit_rate: number; mean_score: number }[];
    sensitivity: {
      runs: number; concentration: string; default_auc: number;
      auc: { min: number; p5: number; median: number; p95: number; max: number };
      top20: { min: number; median: number; max: number };
      histogram: number[]; histogram_range: [number, number];
    };
    logistic: { features: string[]; standardised_coef: number[]; relative_importance: number[]; research_relative: number[]; auc_holdout: number; auc_research_same_features: number };
  };
  cyclone: { split: { train: [number, number]; test: [number, number] }; districts: number; districts_with_test_storms: number; auc: number; ci: [number, number]; top20_capture: number; radius_km: number };
  not_validated: string[];
  caveats: string[];
}
