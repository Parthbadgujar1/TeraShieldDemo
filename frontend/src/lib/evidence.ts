import { EXPOSURE_CATEGORIES, type Status } from "../content/exposure";

export interface Evidence {
  /** share of framework variables that have a real value (census + derived + OSM live), 0..100 */
  completeness: number;
  counts: Record<Status, number>;
  total: number;
  /** hazard-score inputs the research weights call for but that are not free/available, with how the score compensates */
  missingHazardInputs: { input: string; used: string }[];
}

/**
 * Evidence completeness for the exposure/vulnerability framework, plus the hazard inputs that had to be substituted.
 * Scores are computed only from inputs that exist; a missing input never counts as zero.
 */
export function evidenceSummary(osmLive = false): Evidence {
  const counts: Record<Status, number> = { census: 0, derived: 0, osm: 0, gap: 0 };
  for (const c of EXPOSURE_CATEGORIES) for (const v of c.vars) counts[v.status]++;
  const total = counts.census + counts.derived + counts.osm + counts.gap;
  const have = counts.census + counts.derived + (osmLive ? counts.osm : 0);
  return {
    completeness: (100 * have) / total, counts, total,
    missingHazardInputs: [
      { input: "NDVI / land cover (landslide 0.15)", used: "weight folded into observed landslide history (NASA GLC)" },
      { input: "Lithology (landslide 0.05)", used: "weight folded into observed landslide history (NASA GLC)" },
      { input: "Shoreline-change rate (coastal erosion)", used: "susceptibility index only; cannot raise a district above High" },
      { input: "Sub-hourly rainfall (cloudburst)", used: "reanalysis daily extremes; labelled 'potential'" },
    ],
  };
}
