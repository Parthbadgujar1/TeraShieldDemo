import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { VULN_FACTORS } from "../../content/exposure";
import { login } from "../auth";
import { summariseStates } from "../data";
import { FACTORS } from "../explain";
import { bearing, clamp01, compass, destination, distToPolylineKm, haversineKm, smooth } from "../geo";
import { liveOutlook, multiplier, triggers } from "../liveRisk";
import { applyMeta, returnPeriod, zoneForComposite, zoneForHazard } from "../risk";
import {
  PHASE_WEIGHTS, analyseTerrain, buildCandidates, effectiveMinutes, hazardMix, localHazards, movementPlan, rank, ringPoints,
  type Candidate,
} from "../relocation";
import { routeRiskNote, sampleRisk, samplePath, type RouteOption } from "../routing";
import type { District, Forecast, Meta } from "../types";

const DATA = resolve(__dirname, "../../../public/data");
const districts: District[] = JSON.parse(readFileSync(resolve(DATA, "districts.json"), "utf-8"));
const meta: Meta = JSON.parse(readFileSync(resolve(DATA, "meta.json"), "utf-8"));
applyMeta(meta);

const chamoli = districts.find((d) => d.n === "Chamoli")!;
const puri = districts.find((d) => d.n === "Puri")!;

const calm: Forecast = { rain: [0, 0, 0], rain3: 0, rainMax: 0, hourlyMax: 0, tmaxMax: 25, gustMax: 15, peakHour: null };
const storm: Forecast = { rain: [120, 90, 40], rain3: 250, rainMax: 120, hourlyMax: 45, tmaxMax: 26, gustMax: 95, peakHour: 6 };

describe("shipped dataset", () => {
  it("has every district with sequential ids", () => {
    expect(districts).toHaveLength(meta.districts);
    districts.forEach((d, i) => expect(d.id).toBe(i));
  });

  it("keeps probabilities and indices on their scales", () => {
    for (const d of districts) {
      for (const p of Object.values(d.P)) expect(p).toBeGreaterThanOrEqual(0), expect(p).toBeLessThanOrEqual(100);
      expect(d.risk).toBeGreaterThanOrEqual(0);
      expect(d.vuln).toBeGreaterThanOrEqual(0);
      expect(d.vuln).toBeLessThanOrEqual(100);
      expect(d.pop).toBeGreaterThan(0);
    }
  });

  it("assigns zones consistent with the published cut-offs", () => {
    for (const d of districts) expect(zoneForComposite(d.risk)).toBe(d.zone);
    const counts = { RED: 0, ORANGE: 0, YELLOW: 0, GREEN: 0 };
    districts.forEach((d) => counts[d.zone]++);
    expect(counts).toEqual(meta.zone_counts);
  });

  it("has one vulnerability score per framework factor, in the same order", () => {
    expect(meta.vuln_factors).toHaveLength(VULN_FACTORS.length);
    VULN_FACTORS.forEach((f, i) => {
      expect(f.id).toBe(meta.vuln_factors[i]);
      expect(f.weight).toBeCloseTo(meta.weights.vulnerability[f.id], 6);
    });
    for (const d of districts) expect(d.vf).toHaveLength(VULN_FACTORS.length);
    expect(VULN_FACTORS.reduce((s, f) => s + f.weight, 0)).toBeCloseTo(1, 6);
  });

  it("uses factor weights in the UI that match the pipeline weights", () => {
    (["flood", "landslide", "cloudburst", "coastal"] as const).forEach((h) => {
      const ui = FACTORS[h].map((f) => f.weight);
      const pipeline = Object.values(meta.weights[h]);
      expect(ui).toEqual(pipeline);
      expect(ui.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
      districts.forEach((d) => expect(d.F[h]).toHaveLength(ui.length));
    });
  });

  it("points every district at an existing safe district", () => {
    for (const d of districts) expect(districts[d.reloc.safe]).toBeDefined();
  });

  it("scores well-known hotspots as high risk and arid plains lower", () => {
    expect(["RED", "ORANGE"]).toContain(puri.zone);
    expect(chamoli.dom).toBe("landslide");
    expect(districts.find((d) => d.n === "Jaisalmer")!.dom).toBe("heatwave");
  });
});

describe("geo helpers", () => {
  it("computes great-circle distance", () => {
    expect(haversineKm({ lat: 28.6139, lon: 77.209 }, { lat: 19.076, lon: 72.8777 })).toBeGreaterThan(1100);
    expect(haversineKm({ lat: 30, lon: 79 }, { lat: 30, lon: 79 })).toBe(0);
  });
  it("round-trips a destination point", () => {
    const o = { lat: 30.4, lon: 79.3 };
    const p = destination(o, 45, 20);
    expect(haversineKm(o, p)).toBeCloseTo(20, 1);
    expect(compass(bearing(o, p))).toBe("NE");
  });
  it("measures distance to a polyline", () => {
    const line = [[79.0, 30.0], [79.5, 30.0]];
    expect(distToPolylineKm({ lat: 30.1, lon: 79.25 }, line)).toBeGreaterThan(10);
    expect(distToPolylineKm({ lat: 30.0, lon: 79.25 }, line)).toBeLessThan(0.5);
  });
  it("keeps smoothstep and clamp in range", () => {
    expect(clamp01(-3)).toBe(0);
    expect(smooth(0, 10, 20)).toBe(0);
    expect(smooth(30, 10, 20)).toBe(1);
    expect(smooth(15, 10, 20)).toBeCloseTo(0.5, 6);
  });
});

describe("risk classes", () => {
  it("classifies single-hazard probabilities", () => {
    expect(zoneForHazard(60)).toBe("RED");
    expect(zoneForHazard(35)).toBe("ORANGE");
    expect(zoneForHazard(20)).toBe("YELLOW");
    expect(zoneForHazard(5)).toBe("GREEN");
  });
  it("describes return periods", () => {
    expect(returnPeriod(90)).toBe("every year");
    expect(returnPeriod(10)).toBe("~1 in 10 yr");
    expect(returnPeriod(0)).toBe("—");
  });
});

describe("live 72-hour outlook", () => {
  it("multiplier runs from its floor to 2x", () => {
    expect(multiplier("flood", 0)).toBeCloseTo(0.5, 6);
    expect(multiplier("flood", 1)).toBeCloseTo(2, 6);
    expect(multiplier("heatwave", 0)).toBe(0);
  });
  it("fires triggers only when the forecast supports them", () => {
    const t0 = triggers(puri, calm);
    const t1 = triggers(puri, storm);
    expect(t0.flood).toBe(0);
    expect(t1.flood).toBeGreaterThan(0.9);
    expect(t1.cyclone).toBeGreaterThan(0.8);
    expect(triggers(chamoli, storm).cyclone).toBeLessThan(0.1); // inland: wind alone does not make a cyclone
  });
  it("raises risk under a storm and lowers it on a dry day", () => {
    const dry = liveOutlook(puri, calm);
    const wet = liveOutlook(puri, storm);
    expect(wet.risk).toBeGreaterThan(dry.risk);
    expect(wet.risk).toBeGreaterThan(puri.risk - 1);
    for (const p of Object.values(wet.P)) expect(p).toBeLessThanOrEqual(95);
    expect(liveOutlook(chamoli, storm).escalated).toBe(true);
  });
});

describe("relocation planner", () => {
  const origin = { lat: chamoli.lat, lon: chamoli.lon };
  const pts = ringPoints(origin);

  it("generates three rings of sixteen candidates at the right distances", () => {
    expect(pts).toHaveLength(48);
    pts.forEach((p) => expect(Math.abs(haversineKm(origin, p) - p.distKm)).toBeLessThan(0.2));
  });

  it("mixes hazards into weights that sum to one", () => {
    const mix = hazardMix(puri);
    expect(Object.values(mix).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(mix.coastal + mix.cyclone).toBeGreaterThan(mix.landslide);
  });

  it("scores steep, low, riverside ground as more hazardous than high flat ground", () => {
    const bad = localHazards(chamoli, 35, 0, 0.2, null);
    const good = localHazards(chamoli, 3, 60, 8, null);
    expect(bad.landslide).toBeGreaterThan(good.landslide);
    expect(bad.flood).toBeGreaterThan(good.flood);
    Object.values(bad).forEach((v) => expect(v).toBeLessThanOrEqual(1));
  });

  it("derives slope and height above low ground from elevations", () => {
    const small = [{ lat: 30, lon: 79 }, { lat: 30, lon: 79.05 }, { lat: 30.05, lon: 79 }];
    const t = analyseTerrain(small, [100, 200, 100]);
    expect(t[1].hand).toBe(100);
    expect(t[0].hand).toBe(0);
    expect(t[1].slope).toBeGreaterThan(t[0].slope * 0.5);
  });

  const cands = buildCandidates({
    origin, district: chamoli, pts, elevations: pts.map((_, i) => 1500 + (i % 7) * 60), waterways: null, coast: null, amenities: [], population: 500,
  });

  it("builds candidates with bounded scores", () => {
    expect(cands.length).toBe(48);
    for (const c of cands) {
      expect(c.safety).toBeGreaterThanOrEqual(0);
      expect(c.safety).toBeLessThanOrEqual(1);
      expect(c.capacityScore).toBeLessThanOrEqual(1);
    }
  });

  const mkRoute = (index: number, min: number, risk: number): RouteOption => ({ index, distanceKm: min / 2, durationMin: min, path: [], risk, riskNote: "", samples: [] });

  it("ranks by weighted objectives and re-ranks when a road is blocked", () => {
    const top = cands.slice(0, 3);
    const routes = new Map<string, RouteOption[]>(top.map((c, i) => [c.id, [mkRoute(0, 20 + i * 10, 0.1), mkRoute(1, 40 + i * 10, 0.1)]]));
    const opts = { weights: PHASE_WEIGHTS.active, blocked: new Set<string>(), ttiHours: 0, prepMin: 60 };
    const before = rank(top, routes, opts);
    expect(before).toHaveLength(3);
    const best = before[0];
    const blocked = new Set([`${best.candidate.id}:${best.route!.index}`]);
    const after = rank(top, routes, { ...opts, blocked });
    const again = after.find((o) => o.candidate.id === best.candidate.id)!;
    expect(again.route!.index).toBe(1); // fell back to the alternative road
    const allBlocked = new Set([`${best.candidate.id}:0`, `${best.candidate.id}:1`]);
    const dead = rank(top, routes, { ...opts, blocked: allBlocked }).find((o) => o.candidate.id === best.candidate.id)!;
    expect(dead.blocked).toBe(true);
    expect(dead.feasible).toBe(false);
  });

  it("flags Pareto-optimal options and never marks a dominated one", () => {
    const top: Candidate[] = cands.slice(0, 4).map((c, i) => ({ ...c, safety: 0.9 - i * 0.1, capacityScore: 0.9 - i * 0.1, servicesScore: 0.9 - i * 0.1 }));
    const routes = new Map<string, RouteOption[]>(top.map((c, i) => [c.id, [mkRoute(0, 20 + i * 15, 0.05)]]));
    const res = rank(top, routes, { weights: PHASE_WEIGHTS.predicted, blocked: new Set(), ttiHours: 48, prepMin: 60 });
    expect(res.filter((o) => o.pareto)).toHaveLength(1);
    expect(res.find((o) => o.pareto)!.candidate.id).toBe(top[0].id);
  });

  it("penalises risky roads with longer effective time", () => {
    expect(effectiveMinutes(mkRoute(0, 30, 0))).toBe(30);
    expect(effectiveMinutes(mkRoute(0, 30, 1))).toBe(75);
  });

  it("plans buses, waves and priority groups", () => {
    const plan = movementPlan(500, chamoli, mkRoute(0, 30, 0), 5);
    expect(plan.buses).toBe(10);
    expect(plan.waves).toBe(2);
    expect(plan.totalMin).toBe(2 * (30 + 30) + 30);
    expect(plan.priorityOrder[0]).toMatch(/Hospitalised/);
  });
});

describe("road hazard scoring", () => {
  it("only rates a road risky when it is wet and low or steep", () => {
    expect(sampleRisk(0, 1, 1, 0)).toBe(0);
    expect(sampleRisk(1, 1, 0, 0)).toBeGreaterThan(0.8);
    expect(sampleRisk(1, 0, 1, 0)).toBe(1);
    expect(sampleRisk(0.2, 0.2, 0.2, 0)).toBeLessThan(0.3);
  });
  it("words the risk", () => {
    expect(routeRiskNote(0.1)).toMatch(/No forecast hazard/);
    expect(routeRiskNote(0.5)).toMatch(/Watch/);
    expect(routeRiskNote(0.9)).toMatch(/cut by flooding/);
  });
  it("samples a path without exceeding the cap and keeps its ends", () => {
    const path: [number, number][] = Array.from({ length: 200 }, (_, i) => [30 + i * 0.01, 79] as [number, number]);
    const s = samplePath(path, 10);
    expect(s.length).toBeLessThanOrEqual(10);
    expect(s[0].lat).toBeCloseTo(30, 3);
    expect(s[s.length - 1].lat).toBeCloseTo(31.99, 2);
  });
});

describe("aggregation and auth", () => {
  it("summarises states", () => {
    const s = summariseStates(districts);
    expect(s.reduce((n, x) => n + x.districts, 0)).toBe(districts.length);
    expect(s.find((x) => x.state === "Odisha")!.meanP.cyclone).toBeGreaterThan(s.find((x) => x.state === "Rajasthan")!.meanP.cyclone);
  });
  it("accepts the two demo accounts and rejects anything else", () => {
    expect(login("sih", "sih2026")?.scope).toBe("admin");
    expect(login("rescue", "rescue2026")?.scope).toBe("emergency_team");
    expect(login("sih", "nope")).toBeNull();
    expect(login("nobody", "sih2026")).toBeNull();
  });
});
