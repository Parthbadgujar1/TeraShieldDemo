import type { District, HazardKey } from "./types";

export interface FactorDef { label: string; weight: number; hint: string }

/** Factor order matches the arrays in districts.json (`F`). Weights mirror data-pipeline/build_india_dataset.py. */
export const FACTORS: Record<"flood" | "landslide" | "cloudburst" | "coastal", FactorDef[]> = {
  flood: [
    { label: "Extreme 5-day rainfall", weight: 0.35, hint: "Mean annual maximum 5-day rain (NASA POWER, 2014–23)" },
    { label: "Low-lying ground", weight: 0.25, hint: "Mean SRTM elevation over the district polygon (flash-flood score used instead in steep basins)" },
    { label: "River / floodplain", weight: 0.2, hint: "Distance to a major river, or wide flat alluvium" },
    { label: "Flat terrain", weight: 0.1, hint: "Low relief holds water" },
    { label: "Built-up area", weight: 0.1, hint: "Population density as a runoff proxy" },
  ],
  landslide: [
    { label: "Terrain: relief & steep-slope share", weight: 0.45, hint: "Polygon-wide relief (p95–p5) and share of area over 15° and 30° (SRTM zonal statistics)" },
    { label: "Extreme daily + wet-season rain", weight: 0.25, hint: "Annual-maximum daily rain and total rainfall as antecedent moisture" },
    { label: "Observed landslide history", weight: 0.2, hint: "NASA Global Landslide Catalog events within 30 km" },
    { label: "Stream proximity", weight: 0.1, hint: "Distance to a major river" },
  ],
  cloudburst: [
    { label: "Rain intensity", weight: 0.7, hint: "Annual maximum daily rainfall (coarse ~50 km grid: potential, not event location)" },
    { label: "Orographic lift", weight: 0.3, hint: "Elevation and relief" },
  ],
  coastal: [
    { label: "Closeness to the coast", weight: 0.5, hint: "Distance from district centre to the shoreline (index, not a retreat rate)" },
    { label: "Cyclone frequency", weight: 0.3, hint: "IBTrACS storms within 150 km" },
    { label: "Shoreline-change class", weight: 0.2, hint: "State-level erosion class (indicative)" },
  ],
};

export function contributions(d: District, h: "flood" | "landslide" | "cloudburst" | "coastal") {
  return FACTORS[h].map((f, i) => ({ ...f, value: d.F[h][i] ?? 0, contribution: f.weight * (d.F[h][i] ?? 0) }));
}

/** One-sentence "why" for the selected hazard, built from the district's actual numbers. */
export function whyText(d: District, h: HazardKey): string {
  const f = (n: number) => n.toLocaleString("en-IN");
  switch (h) {
    case "flood":
    case "landslide":
    case "cloudburst":
    case "coastal": {
      const top = [...contributions(d, h)].sort((a, b) => b.contribution - a.contribution).slice(0, 2).map((c) => c.label.toLowerCase());
      return `Driven mainly by ${top.join(" and ")}. Relief ${f(d.terr.relief)} m, ${d.terr.s15.toFixed(0)}% of the area steeper than 15°, mean elevation ${f(d.elev)} m, ${f(d.clim.rx1)} mm annual-maximum daily rain.`;
    }
    case "cyclone":
      return d.hist.cyc
        ? `${d.hist.cyc} cyclonic storm${d.hist.cyc > 1 ? "s" : ""} passed within 150 km between 1990 and 2023 (${d.hist.cycs} severe or stronger; peak ${d.hist.kt} kt).`
        : "No cyclonic storm has passed within 150 km of this district between 1990 and 2023.";
    case "heatwave":
      return `Averages ${d.clim.hot} days a year at or above ${d.clim.hthr} °C; the annual peak Tmax averages ${d.clim.tmax} °C (reanalysis grid). Heat is treated as vulnerability stress, not as a reason to relocate.`;
  }
}
