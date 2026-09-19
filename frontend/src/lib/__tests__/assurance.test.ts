import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CSV_TEMPLATE, autoMap, parseCsv, parseGeoJson, validateRows, tierOf } from "../dataLab";
import { pointInGeometry, pointInPolygon } from "../geoPoly";
import { GENESIS, append, sha256, unitStates, verifyChain } from "../lifecycle";
import { LAND_INFO, RESETTLEMENT, householdsOf, monsoonOnset, recommend, relocateBefore, siteOptions, timeline } from "../permanent";
import { DEFAULT_COSTS, annualLoss, bestOption, breakEvenYears, compareOptions, moveCost, selectWithinBudget, toCsv, toExportRows, toGeoJSON, type PlanItem } from "../plan";
import type { AlertFeed, District, Pilot, ReplayPack, Validation } from "../types";

const DATA = resolve(__dirname, "../../../public/data");
const read = <T,>(f: string): T => JSON.parse(readFileSync(resolve(DATA, f), "utf-8"));
const districts = read<District[]>("districts.json");
const pilot = read<Pilot>("pilot_wayanad.json");
const validation = read<Validation>("validation.json");
const alerts = read<AlertFeed>("alerts.json");
const replays = read<ReplayPack>("replays.json");

describe("lifecycle register", () => {
  it("hashes like SHA-256", () => {
    expect(sha256("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256("a".repeat(1000))).toHaveLength(64);
  });

  const start = () => append([], { unit: "v1", name: "Village 1", kind: "create", zone: "RED", ts: "2026-01-01T00:00:00Z", snapshot: { slope: 34 } }).chain;

  it("chains entries and verifies them", () => {
    let c = start();
    expect(c[0].prev).toBe(GENESIS);
    c = append(c, { unit: "v1", name: "Village 1", kind: "advance", to: "VERIFIED", approver: "Dr A, GSI", evidence: "survey", ts: "2026-02-01T00:00:00Z" }).chain;
    expect(c).toHaveLength(2);
    expect(c[1].prev).toBe(c[0].hash);
    expect(verifyChain(c).ok).toBe(true);
    expect(unitStates(c).get("v1")!.state).toBe("VERIFIED");
  });

  it("detects an edited or removed entry", () => {
    let c = start();
    c = append(c, { unit: "v1", name: "Village 1", kind: "advance", to: "VERIFIED", approver: "A", ts: "2026-02-01T00:00:00Z" }).chain;
    c = append(c, { unit: "v1", name: "Village 1", kind: "advance", to: "NOTIFIED", approver: "DM", evidence: "Order 12/2026", ts: "2026-03-01T00:00:00Z" }).chain;
    const edited = c.map((e, i) => (i === 1 ? { ...e, approver: "someone else" } : e));
    expect(verifyChain(edited)).toMatchObject({ ok: false, brokenAt: 1 });
    const removed = [c[0], c[2]];
    expect(verifyChain(removed).ok).toBe(false);
    const snap = c.map((e, i) => (i === 0 ? { ...e, snapshot: { slope: 5 } } : e));
    expect(verifyChain(snap).ok).toBe(false);
  });

  it("only ratchets: stages cannot be skipped or reversed", () => {
    const c = start();
    expect(append(c, { unit: "v1", name: "V", kind: "advance", to: "NOTIFIED", approver: "x" }).error).toMatch(/next stage/);
    expect(append(c, { unit: "v1", name: "V", kind: "advance", to: "VERIFIED" }).error).toMatch(/approving officer/);
    expect(append(c, { unit: "ghost", name: "G", kind: "advance", to: "VERIFIED", approver: "x" }).error).toMatch(/first/);
  });

  it("lets live evidence raise a zone but blocks lowering without evidence and sign-off", () => {
    const orange = append([], { unit: "v2", name: "V2", kind: "create", zone: "ORANGE", ts: "2026-01-01T00:00:00Z" }).chain;
    expect(append(orange, { unit: "v2", name: "V2", kind: "escalate", zone: "RED", evidence: "new tension cracks after 180 mm rain" }).chain).toHaveLength(2);
    expect(append(orange, { unit: "v2", name: "V2", kind: "escalate", zone: "RED" }).error).toMatch(/evidence/);
    expect(append(orange, { unit: "v2", name: "V2", kind: "escalate", zone: "YELLOW", evidence: "x" }).error).toMatch(/raise/);
    expect(append(orange, { unit: "v2", name: "V2", kind: "downgrade", zone: "YELLOW", evidence: "dry week" }).error).toMatch(/needs evidence/);
    expect(append(orange, { unit: "v2", name: "V2", kind: "downgrade", zone: "YELLOW", evidenceKind: "field_survey", evidence: "GSI report 44/2026" }).error).toMatch(/sign-off/);
    const ok = append(orange, { unit: "v2", name: "V2", kind: "downgrade", zone: "YELLOW", evidenceKind: "mitigation_completed", evidence: "retaining wall completed, cert. 9", approver: "Executive Engineer" });
    expect(ok.error).toBeUndefined();
    expect(unitStates(ok.chain).get("v2")!.zone).toBe("YELLOW");
  });

  it("refuses to lower a zone once relocation is under way", () => {
    let c = append([], { unit: "v3", name: "V3", kind: "create", zone: "RED", ts: "2026-01-01T00:00:00Z" }).chain;
    for (const to of ["VERIFIED", "NOTIFIED", "RELOCATING"] as const) c = append(c, { unit: "v3", name: "V3", kind: "advance", to, approver: "DM", evidence: "order" }).chain;
    expect(append(c, { unit: "v3", name: "V3", kind: "downgrade", zone: "YELLOW", evidenceKind: "field_survey", evidence: "r", approver: "x" }).error).toMatch(/under way/);
  });
});

describe("state action plan economics", () => {
  const item = (o: Partial<PlanItem> = {}): PlanItem => ({
    id: "a", name: "Hab A", district: "D", state: "S", lat: 11, lon: 76, zone: "RED", tier: "immediate", score: 70, pop: 400, hh: 100, reasons: [],
    source: "pilot", level: "habitation", hills: false, annualP: 30, ...o,
  });

  it("prices a move with PMAY-G plus assumptions, hills costing more", () => {
    expect(moveCost(item(), DEFAULT_COSTS)).toBe(100 * (120000 + 250000 + 50000));
    expect(moveCost(item({ hills: true }), DEFAULT_COSTS)).toBe(100 * (130000 + 250000 + 50000));
  });

  it("computes expected loss, break-even and the cheapest option", () => {
    const loss = annualLoss(item(), DEFAULT_COSTS);
    expect(loss).toBeCloseTo(0.3 * (100 * 0.5 * 120000 + 400 * 0.003 * 400000), 6);
    expect(breakEvenYears(item(), DEFAULT_COSTS)).toBeCloseTo(moveCost(item(), DEFAULT_COSTS) / loss, 6);
    expect(annualLoss(item({ zone: "GREEN" }), DEFAULT_COSTS)).toBeLessThan(loss / 10);
    expect(breakEvenYears(item({ annualP: 0 }), DEFAULT_COSTS)).toBe(Infinity);
    const opts = compareOptions(item(), DEFAULT_COSTS);
    expect(opts.map((o) => o.key)).toEqual(["nothing", "adapt", "protect", "relocate"]);
    expect(opts.find((o) => o.key === "relocate")!.expectedLoss).toBe(0);
    // with a very high hazard the answer flips away from "do nothing"
    expect(bestOption(item({ annualP: 90, pop: 2000, hh: 400 }), DEFAULT_COSTS).key).not.toBe("nothing");
    expect(bestOption(item({ annualP: 0.5 }), DEFAULT_COSTS).key).toBe("nothing");
  });

  it("selects within a budget, never overspending and never splitting a habitation", () => {
    const items = [item({ id: "1", score: 80, hh: 100 }), item({ id: "2", score: 70, hh: 300 }), item({ id: "3", score: 60, hh: 50 }), item({ id: "4", tier: "monitor", hh: 5 })];
    const budget = 200 * 420000;
    for (const mode of ["value", "priority"] as const) {
      const s = selectWithinBudget(items, budget, DEFAULT_COSTS, mode);
      expect(s.spend).toBeLessThanOrEqual(budget);
      expect(s.chosen.some((i) => i.id === "4")).toBe(false); // monitor tier is not relocated
      expect(new Set(s.chosen.map((i) => i.id)).size).toBe(s.chosen.length);
      expect(s.chosen.length + s.skipped.length).toBe(3);
    }
    expect(selectWithinBudget(items, budget, DEFAULT_COSTS, "priority").chosen[0].id).toBe("1");
  });

  it("exports CSV and GeoJSON with the horizon and reasons", () => {
    const rows = toExportRows([item({ reasons: ["SLOPE_GE30_WITHIN_150M"] })], DEFAULT_COSTS, new Set(["a"]));
    const csv = toCsv(rows);
    expect(csv.split("\n")[0]).toContain("horizon");
    expect(csv).toContain("Immediate");
    expect(csv).toContain("Slope ≥ 30° within 150 m");
    expect(toGeoJSON(rows).features[0].geometry.coordinates).toEqual([76, 11]);
  });
});

describe("Data Lab", () => {
  it("parses quoted CSV and auto-maps columns", () => {
    const rows = parseCsv('Village,Latitude,Longitude,Pop\n"Kot, Upper",30.1,79.2,500\n');
    expect(rows[1][0]).toBe("Kot, Upper");
    const m = autoMap(rows[0]);
    expect(m).toMatchObject({ name: 0, lat: 1, lon: 2, population: 3 });
  });

  it("validates: skips bad rows, flags swapped coordinates and duplicates", () => {
    const csv = "name,lat,lon,population,households\nA,30.1,79.2,500,100\nA,30.1,79.2,500,100\nB,79.2,30.1,10,2\nC,abc,79,5,1\n,30,79,1,1\nD,30.2,79.3,,\nE,29.9,79.1,50,90\n";
    const r = validateRows(parseCsv(csv));
    expect(r.habitations.map((h) => h.name)).toEqual(["A", "D", "E"]);
    const text = r.issues.map((i) => i.text).join("\n");
    expect(text).toMatch(/swapped/);
    expect(text).toMatch(/duplicate/);
    expect(text).toMatch(/not numeric/);
    expect(text).toMatch(/Missing name/);
    expect(text).toMatch(/exceed population/);
    expect(text).toMatch(/no population/);
  });

  it("rejects a file without the required columns", () => {
    const r = validateRows(parseCsv("foo,bar\n1,2\n"));
    expect(r.habitations).toHaveLength(0);
    expect(r.issues.filter((i) => i.level === "error").length).toBeGreaterThanOrEqual(3);
  });

  it("ships a template that validates cleanly", () => {
    const r = validateRows(parseCsv(CSV_TEMPLATE));
    expect(r.issues.filter((i) => i.level === "error")).toHaveLength(0);
    expect(r.habitations.length).toBe(2);
  });

  it("reads GeoJSON points as habitations and polygons as a red-zone layer", () => {
    const gj = JSON.stringify({
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { name: "P", population: 120 }, geometry: { type: "Point", coordinates: [79.2, 30.1] } },
        { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[79, 30], [79.5, 30], [79.5, 30.5], [79, 30.5], [79, 30]]] } },
      ],
    });
    const r = parseGeoJson(gj);
    expect(r.habitations).toHaveLength(1);
    expect(r.zones).toHaveLength(1);
    expect(pointInGeometry(79.2, 30.1, r.zones[0].geometry)).toBe(true);
    expect(pointInGeometry(80, 30.1, r.zones[0].geometry)).toBe(false);
  });

  it("uses the same tier cut-offs as the national model", () => {
    expect(tierOf(62)).toBe("immediate");
    expect(tierOf(50)).toBe("short_term");
    expect(tierOf(38)).toBe("medium_term");
    expect(tierOf(10)).toBe("monitor");
  });

  it("handles polygons with holes", () => {
    const poly = [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]];
    expect(pointInPolygon(2, 2, poly)).toBe(true);
    expect(pointInPolygon(5, 5, poly)).toBe(false);
  });
});

describe("Wayanad habitation-level pilot data", () => {
  it("is internally consistent", () => {
    expect(pilot.district.name).toBe("Wayanad");
    expect(pilot.villages.length).toBeGreaterThan(100);
    expect(pilot.red.length).toBeGreaterThan(0);
    const zc = { RED: 0, ORANGE: 0, YELLOW: 0, GREEN: 0 };
    pilot.villages.forEach((v) => zc[v.zone]++);
    expect(zc).toEqual(pilot.summary.villages);
    for (const v of pilot.villages) {
      expect(v.pop).toBeGreaterThanOrEqual(0);
      expect(v.lat).toBeGreaterThan(pilot.district.bbox[0] - 0.01);
      expect(v.lat).toBeLessThan(pilot.district.bbox[2] + 0.01);
      if (v.site != null) expect(pilot.sites[v.site]).toBeDefined();
    }
    expect(pilot.summary.terrain_share.RED).toBeGreaterThan(0.02);
    expect(pilot.summary.terrain_share.RED).toBeLessThan(0.25);
  });

  it("does not use hospitals or invent capacity: every site has a binding constraint and validation status", () => {
    for (const s of pilot.sites) {
      expect(["space", "water", "access"]).toContain(s.bind);
      expect(s.cap_hh).toBeGreaterThan(0);
      expect(s.cap_hh).toBeLessThanOrEqual(s.cap_space);
      expect(s.cap_status.sanitation).toBe("UNVALIDATED");
    }
  });

  const red = pilot.villages.filter((v) => v.zone === "RED" && v.pop > 200).sort((a, b) => b.score - a.score)[0];

  it("hard-rejects protected land and sites too close to red terrain", () => {
    const opts = siteOptions(red, pilot);
    expect(opts.length).toBeGreaterThan(0);
    for (const o of opts) {
      if (o.site.land === "PROTECTED") expect(o.rejects.length).toBeGreaterThan(0);
      if (o.site.risk_m < RESETTLEMENT.minRiskBufferM) expect(o.rejects.join()).toMatch(/red\/orange terrain/);
    }
    const rec = recommend(opts);
    if (rec.primary) {
      expect(rec.primary.rejects).toEqual([]);
      expect(rec.primary.site.land).not.toBe("PROTECTED");
      expect(rec.primary.distKm).toBeLessThanOrEqual(RESETTLEMENT.maxReachKm);
    }
    // rejected sites always sort after eligible ones
    const firstRejected = opts.findIndex((o) => o.rejects.length);
    if (firstRejected >= 0) expect(opts.slice(firstRejected).every((o) => o.rejects.length > 0)).toBe(true);
  });

  it("keeps one village on one site and only adds a second when capacity falls short", () => {
    const opts = siteOptions(red, pilot);
    const rec = recommend(opts);
    if (rec.primary?.capacity.covers) expect(rec.secondary).toBeNull();
    expect(householdsOf(red, pilot)).toBeGreaterThan(0);
  });

  it("builds a timeline where private land and forest take longer than revenue land", () => {
    const opts = siteOptions(red, pilot, 25).filter((o) => o.rejects.length === 0);
    const by = (land: string) => opts.find((o) => o.site.land === land);
    const rev = by("UNKNOWN") ?? by("COMMON");
    const forest = by("FOREST");
    if (rev && forest) expect(Math.max(...timeline(forest).map((t) => t.end))).toBeGreaterThan(Math.max(...timeline(rev).map((t) => t.end)));
    expect(LAND_INFO.PROTECTED.route).toBe("blocked");
    expect(LAND_INFO.PRIVATE_AGRI.months).toBeGreaterThanOrEqual(18);
  });

  it("computes the next monsoon onset and whether it can be beaten", () => {
    const from = new Date(2026, 8, 19);
    const on = monsoonOnset("Kerala", from);
    expect(on.getFullYear()).toBe(2027);
    expect(on.getMonth()).toBe(5);
    expect(relocateBefore("Kerala", 20, from).catchesNext).toBe(false);
    expect(relocateBefore("Kerala", 4, from).catchesNext).toBe(true);
  });
});

describe("static packs shipped with the site", () => {
  it("has a landslide backtest that beats random and reports honest baselines", () => {
    const L = validation.landslide;
    expect(L.split.freeze_year).toBeLessThan(L.split.test_years[0]);
    expect(L.model.auc).toBeGreaterThan(0.6);
    expect(L.model.ci[0]).toBeLessThan(L.model.auc);
    expect(L.model.ci[1]).toBeGreaterThan(L.model.auc);
    expect(L.sensitivity.auc.min).toBeLessThanOrEqual(L.sensitivity.auc.max);
    expect(L.sensitivity.histogram.reduce((a, b) => a + b, 0)).toBe(L.sensitivity.runs);
    expect(L.deciles).toHaveLength(10);
    expect(validation.cyclone.auc).toBeGreaterThan(0.6);
    expect(validation.not_validated).toContain("flood");
  });

  it("has official alerts that reference real districts", () => {
    expect(alerts.count).toBe(alerts.alerts.length);
    for (const a of alerts.alerts) for (const id of a.districts) expect(districts[id]).toBeDefined();
    expect(alerts.matched).toBe(alerts.alerts.filter((a) => a.districts.length).length);
  });

  it("has replay packs with one forecast per district", () => {
    expect(replays.events.length).toBeGreaterThanOrEqual(3);
    for (const e of replays.events) {
      expect(Object.keys(e.f)).toHaveLength(districts.length);
      const wet = Object.values(e.f).filter((f) => f[0] >= 100).length;
      expect(wet).toBeGreaterThan(0);
    }
    const wayanad = replays.events.find((e) => e.id === "wayanad-2024")!;
    const wy = districts.find((d) => d.n === "Wayanad")!;
    expect(wayanad.f[String(wy.id)][0]).toBeGreaterThan(100); // heavy 3-day rain around 30 Jul 2024 (ERA5 smooths the extreme)
  });
});
