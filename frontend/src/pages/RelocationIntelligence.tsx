import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import RelocationMap, { type MapCandidate } from "../components/RelocationMap";
import { BASEMAPS, type Basemap } from "../components/IndiaMap";
import { Bar, DistrictPicker, ErrorBox, Loading, Provenance, ZoneBadge } from "../components/ui";
import { ARCHITECTURE, CORE_OBJECTIVES, RELOCATION_FRAMEWORK, RSTATUS_LABEL } from "../content/relocation";
import { loadCoast, useDataset, useDistrictParam } from "../lib/data";
import { compass, googleDirections, googleEmbed, googleEmbedRoute, googleStreetView, haversineKm } from "../lib/geo";
import { fetchForecasts } from "../lib/live";
import { liveOutlook } from "../lib/liveRisk";
import { fetchAmenities, fetchElevations, fetchPlaces, fetchWaterways, type BBox, type Place } from "../lib/osm";
import {
  CAPACITY_ASSUMPTIONS, PHASES, PHASE_WEIGHTS, buildCandidates, effectiveMinutes, movementPlan, rank, ringPoints,
  type Candidate, type Phase, type PlanOption, type Weights,
} from "../lib/relocation";
import { HAZARDS, HAZARD_BY_KEY, TIER_ACTION, TIER_COLOR, TIER_LABEL, ZONE_COLOR, compact, lakh } from "../lib/risk";
import { fetchRoutes, scoreRoutes, type RouteOption } from "../lib/routing";
import type { Forecast, LatLon } from "../lib/types";

interface Origin extends LatLon { name: string }
interface Run {
  cands: Candidate[];
  routes: Map<string, RouteOption[]>;
  notes: { terrain: boolean; water: boolean; amenities: boolean; coast: boolean; routed: number };
  at: Date;
}

const WEIGHT_LABEL: Record<keyof Weights, string> = { safety: "Hazard safety", route: "Route speed & safety", capacity: "Capacity", services: "Destination services", cost: "Cost (distance)", community: "Community closeness" };
const mins = (m: number) => (m >= 90 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`);
const norm = (w: Weights): Weights => {
  const t = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v / t])) as unknown as Weights;
};

export default function RelocationIntelligence({ scope }: { scope: string }) {
  const { data, error } = useDataset();
  const navigate = useNavigate();
  const [id, setId] = useDistrictParam(data, true);
  const d = data && id != null ? data.byId.get(id) ?? null : null;
  const emergency = scope === "emergency_team";

  const [places, setPlaces] = useState<Place[] | null>(null);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [pop, setPop] = useState(800);
  const [phase, setPhase] = useState<Phase>(emergency ? "active" : "predicted");
  const [weights, setWeights] = useState<Weights>(PHASE_WEIGHTS[emergency ? "active" : "predicted"]);
  const [tti, setTti] = useState(PHASES.find((p) => p.key === (emergency ? "active" : "predicted"))!.defaultTtiHours);
  const [prep, setPrep] = useState(60);
  const [fleet, setFleet] = useState(6);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [stage, setStage] = useState(0);
  const [details, setDetails] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [events, setEvents] = useState<string[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [base, setBase] = useState<Basemap>("terrain");
  const [view, setView] = useState<"analysis" | "google">("analysis");
  const [fitKey, setFitKey] = useState(0);

  // new district → reset habitation, load real villages and the live forecast signal
  useEffect(() => {
    if (!d) return;
    setOrigin({ lat: d.lat, lon: d.lon, name: `${d.n} district centre` });
    setRun(null); setStage(0); setDetails([]); setBlocked(new Set()); setEvents([]); setSelId(null); setErr(null); setForecast(null); setPlaces(null);
    setPop(Math.max(200, Math.round(Math.min(2500, d.pop / Math.max(d.hh, 1) * 160))));
    let alive = true;
    fetchPlaces(d, 25).then((p) => alive && setPlaces(p)).catch(() => alive && setPlaces([]));
    fetchForecasts([{ id: d.id, lat: d.lat, lon: d.lon }]).then((m) => alive && setForecast(m.get(d.id) ?? null)).catch(() => undefined);
    setFitKey((k) => k + 1);
    return () => { alive = false; };
  }, [d?.id]);

  const applyPhase = (p: Phase) => {
    setPhase(p);
    setWeights(PHASE_WEIGHTS[p]);
    setTti(PHASES.find((x) => x.key === p)!.defaultTtiHours);
  };

  const options: PlanOption[] = useMemo(
    () => (run ? rank(run.cands, run.routes, { weights: norm(weights), blocked, ttiHours: tti, prepMin: prep }).filter((o) => run.routes.has(o.candidate.id)) : []),
    [run, weights, blocked, tti, prep],
  );
  const sel = options.find((o) => o.candidate.id === selId) ?? options[0] ?? null;

  const nameOf = (c: Candidate) => {
    let best: Place | null = null;
    let bd = 8;
    for (const p of places ?? []) {
      const km = haversineKm(c, p);
      if (km < bd) { bd = km; best = p; }
    }
    return best ? `near ${best.name}` : `${c.distKm} km ${compass(c.bearingDeg)} of the habitation`;
  };

  if (error) return <div className="page"><ErrorBox text={error} /></div>;
  if (!data || !d || !origin) return <Loading text="Loading relocation engine…" />;

  const live = forecast ? liveOutlook(d, forecast) : null;

  async function analyse() {
    if (!d || !origin) return;
    setErr(null); setRun(null); setBlocked(new Set()); setEvents([]); setSelId(null); setStage(1); setDetails([]);
    const log: string[] = [];
    const step = (n: number, text: string) => { log[n] = text; setDetails([...log]); setStage(n + 1); };
    try {
      setBusy("Reading hazard model and 72-hour forecast…");
      step(0, `${d.zone} zone, ${d.risk.toFixed(0)}% annual multi-hazard${live ? ` · 72 h ${live.risk.toFixed(0)}%` : ""}`);
      step(1, `Vulnerability ${d.vband.toLowerCase()} (${d.vuln.toFixed(0)}/100)`);
      step(2, `${lakh(pop)} people · ${lakh(Math.round(pop * d.c.a50))} aged 50+`);

      setBusy("Sampling terrain, rivers, facilities and coast…");
      const pts = ringPoints(origin);
      const k = Math.cos((origin.lat * Math.PI) / 180);
      const bbox: BBox = [origin.lat - 0.29, origin.lon - 0.29 / k, origin.lat + 0.29, origin.lon + 0.29 / k];
      const notes = { terrain: true, water: false, amenities: false, coast: false, routed: 0 };
      const elevP = fetchElevations(pts.map((p) => ({ lat: p.lat, lon: p.lon })));
      const waterP = fetchWaterways(bbox).then((x) => { notes.water = true; return x; }).catch(() => null);
      const amenP = fetchAmenities(bbox).then((x) => { notes.amenities = true; return x; }).catch(() => null);
      const coastP = d.coast < 200 ? loadCoast().then((c) => { notes.coast = true; return c; }).catch(() => null) : Promise.resolve(null);
      // OpenStreetMap's public service can be slow: wait a while, then plan on terrain alone and upgrade when it answers.
      const soon = <T,>(p: Promise<T | null>) => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), 12000))]);
      const elevations = await elevP;
      const [water, amen, coast] = await Promise.all([soon(waterP), soon(amenP), coastP]);
      const cands = buildCandidates({ origin, district: d, pts, elevations, waterways: water, coast, amenities: amen, population: pop });
      const safe = cands.filter((c) => c.safety >= 0.5);
      step(3, `${cands.length} candidate sites in 3 rings (8 / 16 / 26 km)`);
      step(4, `${safe.length} pass the local hazard screen (safety ≥ 50%)${water ? "" : " · rivers still loading, district value used"}`);

      setBusy("Routing on the real road network…");
      const prelim = rank(cands, new Map(), { weights: norm(weights), blocked: new Set(), ttiHours: tti, prepMin: prep }).filter((o) => o.candidate.safety >= 0.5).slice(0, 6);
      const routes = new Map<string, RouteOption[]>();
      let done = 0;
      const queue = [...prelim];
      const worker = async () => {
        while (queue.length) {
          const o = queue.shift()!;
          try {
            const rs = await fetchRoutes(origin, o.candidate);
            await scoreRoutes(rs);
            routes.set(o.candidate.id, rs);
          } catch { /* candidate stays unrouted and is dropped from the ranking */ }
          done++;
          setBusy(`Routing on the real road network… ${done}/${prelim.length}`);
        }
      };
      await Promise.all([worker(), worker()]);
      notes.routed = routes.size;
      if (routes.size === 0) throw new Error("No road route could be computed from this location — try another habitation or check your connection.");
      step(5, `${[...routes.values()].reduce((s, r) => s + r.length, 0)} road routes for ${routes.size} sites, scored against forecast rain and terrain`);
      step(6, amen ? "Shelter capacity counted from mapped schools, halls and hospitals within 5 km" : "Facilities still loading — capacity uses land parcel only, upgrades when they arrive");
      step(7, "Objectives combined with the phase weights below; Pareto set marked");
      const stamp = new Date();
      setRun({ cands, routes, notes, at: stamp });
      setFitKey((x) => x + 1);
      if (!water || !amen) {
        Promise.all([waterP, amenP]).then(([w2, a2]) => {
          const w = water ?? w2;
          const a = amen ?? a2;
          if (!w && !a) return;
          const upgraded = buildCandidates({ origin, district: d, pts, elevations, waterways: w, coast, amenities: a, population: pop });
          setRun((prev) => (prev && prev.at === stamp ? { ...prev, cands: upgraded, notes: { ...prev.notes, water: !!w, amenities: !!a } } : prev));
          setEvents((e) => [`${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · OpenStreetMap ${[w && !water ? "rivers" : "", a && !amen ? "facilities" : ""].filter(Boolean).join(" and ")} arrived — scores upgraded`, ...e]);
        });
      }
      step(8, "Recommendation ready");
      step(9, "Use the blockage buttons to see the plan re-route");
      setStage(10);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setBusy(null);
    }
  }

  const mapCands: MapCandidate[] = run
    ? run.cands.map((c) => {
      const idx = options.findIndex((o) => o.candidate.id === c.id);
      return { id: c.id, lat: c.lat, lon: c.lon, safe: c.safety >= 0.5, rank: idx >= 0 && idx < 6 ? idx + 1 : null, score: idx >= 0 ? options[idx].total : null, label: nameOf(c) };
    })
    : [];

  const block = (kind: string) => {
    if (!sel || !sel.route) return;
    const key = `${sel.candidate.id}:${sel.route.index}`;
    const next = new Set(blocked); next.add(key);
    setBlocked(next);
    setEvents((e) => [`${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · ${kind} on route ${sel.route!.index + 1} to ${nameOf(sel.candidate)} — re-optimising`, ...e]);
    setSelId(null);
  };
  const reset = () => { setBlocked(new Set()); setEvents([]); setSelId(null); };

  const plan = sel ? movementPlan(pop, d, sel.route, fleet) : null;
  const capOk = sel ? sel.candidate.capacity.total >= pop : false;
  const activeRoutes = sel ? run?.routes.get(sel.candidate.id) ?? [] : [];
  const rerouted = blocked.size > 0 && sel && sel.route;
  const nearest = (places ?? []).map((p) => ({ p, km: haversineKm(origin, p) })).sort((a, b) => a.km - b.km).slice(0, 60);
  const canSee = (k: keyof Weights) => (norm(weights)[k] * 100).toFixed(0);
  const info = PHASES.find((p) => p.key === phase)!;

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>{emergency ? "Evacuation Planner" : "Relocation Intelligence"}</h1>
          <p>
            Module 3 decides where people can safely move, how many can be accommodated, how quickly they can get there, and whether the route stays
            usable as the hazard evolves — using real terrain, the road network, mapped facilities and the live forecast.
          </p>
        </div>
        <ZoneBadge zone={d.zone} label={`${d.n}: ${d.zone.toLowerCase()} zone`} />
      </div>

      <div className="stepper" aria-label="Decision pipeline" style={{ marginBottom: 14 }}>
        {ARCHITECTURE.map((s, i) => (
          <div key={s} className={`step${i < stage ? " done" : ""}${busy && i === stage ? " now" : ""}`} title={details[i] ?? ""}>
            <b>{s}</b>
            {details[i] ? <span className="tiny">{details[i]}</span> : <span className="tiny">{i < 3 ? "reads Modules 1–2" : "pending"}</span>}
          </div>
        ))}
      </div>

      <div className="grid g-side">
        <div className="stack" style={{ minWidth: 0 }}>
          <div className="card">
            <div className="card-head">
              <h3>Planning map</h3>
              <div className="seg" role="group" aria-label="Map view">
                <button className={view === "analysis" ? "on" : ""} onClick={() => setView("analysis")}>Analysis</button>
                <button className={view === "google" ? "on" : ""} onClick={() => setView("google")}>Google Maps</button>
              </div>
              {view === "analysis" && (
                <div className="seg" role="group" aria-label="Base map">
                  {(["light", "street", "terrain", "satellite"] as Basemap[]).map((b) => <button key={b} className={base === b ? "on" : ""} onClick={() => setBase(b)}>{BASEMAPS[b].label}</button>)}
                </div>
              )}
            </div>
            <div className="rmap-wrap">
              {view === "analysis" ? (
                <RelocationMap
                  center={d} origin={origin} cands={mapCands} selectedId={sel?.candidate.id ?? null}
                  routes={activeRoutes} activeRoute={sel?.route?.index ?? null} blocked={blocked} blockedPrefix={`${sel?.candidate.id ?? ""}:`}
                  onSelect={(x) => setSelId(x)} onPick={(p) => { setOrigin({ ...p, name: "Selected location" }); setRun(null); setStage(0); setDetails([]); setBlocked(new Set()); setEvents([]); }}
                  base={base} fitKey={fitKey}
                />
              ) : (
                <iframe className="gframe" title="Google Maps route" loading="lazy" referrerPolicy="no-referrer-when-downgrade"
                  src={sel ? googleEmbedRoute(origin, sel.candidate) : googleEmbed(origin, 11, false)} />
              )}
            </div>
            <div className="card-pad small muted">
              {view === "analysis"
                ? <>Click the map to place the affected habitation anywhere. <span className="legend-dot" style={{ background: "#2e9e4f" }} />low <span className="legend-dot" style={{ background: "#f57c00" }} />medium <span className="legend-dot" style={{ background: "#d32f2f" }} />high hazard exposure on the road. Numbered pins are the ranked destinations.</>
                : <>Google Maps shows the recommended road route. Use “Open in Google Maps” for turn-by-turn navigation on a phone.</>}
            </div>
          </div>

          {busy && <div className="notice info row"><span className="spinner" /> {busy}</div>}
          {err && <ErrorBox text={err} />}

          {sel && plan && (
            <div className="card" style={{ borderTop: `4px solid ${rerouted ? "var(--orange)" : "var(--good)"}` }}>
              <div className="card-head">
                <h3>{rerouted ? "Re-routed plan" : "Recommended relocation plan"}</h3>
                {sel.pareto && <span className="tag derived">Pareto-optimal</span>}
                <span className={`tag ${sel.feasible ? "osm" : "gap"}`}>{sel.feasible ? "Feasible" : "Check constraints"}</span>
              </div>
              <div className="card-pad stack" style={{ gap: 14 }}>
                <div className="plan-head">
                  <div>
                    <div className="label">Move {lakh(pop)} people from</div>
                    <b>{origin.name}</b>
                    <div className="label" style={{ marginTop: 8 }}>to</div>
                    <b>{nameOf(sel.candidate)}</b>
                    <div className="small muted">{sel.candidate.distKm} km {compass(sel.candidate.bearingDeg)} · {sel.candidate.elev.toFixed(0)} m elevation · slope {sel.candidate.slope.toFixed(1)}°</div>
                  </div>
                  <div className="score-ring" style={{ ["--p" as string]: `${Math.round(sel.total * 100)}` }}><b>{Math.round(sel.total * 100)}</b><span>score</span></div>
                </div>

                <div className="grid g4" style={{ gap: 8 }}>
                  <div className="mini"><b>{sel.route ? `${sel.route.distanceKm.toFixed(0)} km` : "—"}</b><span>road distance</span></div>
                  <div className="mini"><b>{sel.route ? mins(sel.route.durationMin) : "—"}</b><span>drive time</span></div>
                  <div className="mini"><b style={{ color: sel.route && sel.route.risk > 0.6 ? "var(--red)" : sel.route && sel.route.risk > 0.3 ? "var(--orange)" : "var(--good)" }}>{sel.route ? `${(sel.route.risk * 100).toFixed(0)}%` : "—"}</b><span>road hazard exposure</span></div>
                  <div className="mini"><b style={{ color: sel.windowMin != null && tti > 0 && sel.windowMin < 0 ? "var(--red)" : undefined }}>{tti === 0 ? "live" : sel.windowMin != null ? (sel.windowMin >= 0 ? mins(sel.windowMin) : "none") : "—"}</b><span>{tti === 0 ? "active event" : "evacuation window left"}</span></div>
                </div>
                {sel.route && <div className="small"><b>Road:</b> {sel.route.riskNote}. Hazard-adjusted travel time {mins(effectiveMinutes(sel.route))}.{tti > 0 && sel.windowMin != null && ` Time-to-impact ${tti} h − preparation ${prep} min − travel leaves ${sel.windowMin >= 0 ? mins(sel.windowMin) : "no margin"}.`}</div>}

                <div className="grid g2">
                  <div className="stack" style={{ gap: 6 }}>
                    <div className="label">Why this site — objective scores</div>
                    {(Object.keys(WEIGHT_LABEL) as (keyof Weights)[]).map((k) => (
                      <div key={k}>
                        <div className="row small" style={{ justifyContent: "space-between" }}><span>{WEIGHT_LABEL[k]} <span className="muted tiny">weight {canSee(k)}%</span></span><b className="num">{(sel.scores[k] * 100).toFixed(0)}</b></div>
                        <Bar value={sel.scores[k] * 100} color={sel.scores[k] > 0.66 ? "var(--good)" : sel.scores[k] > 0.4 ? "var(--orange)" : "var(--red)"} />
                      </div>
                    ))}
                  </div>
                  <div className="stack" style={{ gap: 8 }}>
                    <div className="label">Local hazard at the site (0–100)</div>
                    <div className="hz-mini">
                      {HAZARDS.filter((h) => h.key !== "heatwave").map((h) => {
                        const v = sel.candidate.local[h.key as keyof Candidate["local"]] * 100;
                        return <div key={h.key} className="row small" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}><span>{h.icon} {h.label}</span><b className="num">{v.toFixed(0)}</b></div>;
                      })}
                    </div>
                    <div className="label">Capacity check</div>
                    <div className={`notice ${capOk ? "info" : "warn"} small`}>
                      {capOk ? "✓ " : "⚠ "}
                      Temporary shelter {lakh(sel.candidate.capacity.shelter)} ({sel.candidate.capacity.schools} schools, {sel.candidate.capacity.halls} halls nearby) + planned parcel {lakh(sel.candidate.capacity.land)} = <b>{lakh(sel.candidate.capacity.total)}</b> vs {lakh(pop)} people.
                    </div>
                    <div className="label">Services near the site</div>
                    <dl className="kv">
                      <dt>Hospital</dt><dd>{sel.candidate.services.hospitalKm != null ? `${sel.candidate.services.hospitalKm.toFixed(1)} km` : run?.notes.amenities ? "none mapped" : "n/a"}</dd>
                      <dt>Fire / police</dt><dd>{sel.candidate.services.emergencyKm != null ? `${sel.candidate.services.emergencyKm.toFixed(1)} km` : run?.notes.amenities ? "none mapped" : "n/a"}</dd>
                      <dt>Pharmacy</dt><dd>{sel.candidate.services.pharmacyKm != null ? `${sel.candidate.services.pharmacyKm.toFixed(1)} km` : run?.notes.amenities ? "none mapped" : "n/a"}</dd>
                      <dt>Fuel</dt><dd>{sel.candidate.services.fuelKm != null ? `${sel.candidate.services.fuelKm.toFixed(1)} km` : run?.notes.amenities ? "none mapped" : "n/a"}</dd>
                    </dl>
                  </div>
                </div>

                <div className="grid g2">
                  <div className="stack" style={{ gap: 6 }}>
                    <div className="label">Movement plan</div>
                    <dl className="kv">
                      <dt>Households</dt><dd>{lakh(plan.households)}</dd>
                      <dt>Buses (50 seats)</dt><dd>{plan.buses}</dd>
                      <dt>Waves with a fleet of {fleet}</dt><dd>{plan.waves}</dd>
                      <dt>Time to move everyone</dt><dd>{plan.totalMin != null ? mins(plan.totalMin) : "—"}</dd>
                      <dt>Aged 50+</dt><dd>{lakh(plan.elderly)}</dd>
                      <dt>Persons with disabilities (national rate)</dt><dd>{lakh(plan.disabled)}</dd>
                      <dt>Children (0–14, national share ≈ 29%)</dt><dd>{lakh(Math.round(pop * 0.29))}</dd>
                    </dl>
                  </div>
                  <div className="stack" style={{ gap: 6 }}>
                    <div className="label">Boarding priority</div>
                    <ol className="plain small">{plan.priorityOrder.map((x) => <li key={x}>{x}</li>)}</ol>
                    <div className="row" style={{ gap: 6 }}>
                      <a className="btn sm" href={googleDirections(origin, sel.candidate)} target="_blank" rel="noreferrer">Open in Google Maps ↗</a>
                      <a className="btn sm ghost" href={googleStreetView(sel.candidate)} target="_blank" rel="noreferrer">Street View ↗</a>
                    </div>
                  </div>
                </div>

                <div className="reroute">
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <b className="small">Dynamic rerouting — simulate the hazard changing the road</b>
                    {blocked.size > 0 && <button className="btn ghost sm" onClick={reset}>Reset simulation</button>}
                  </div>
                  <div className="row" style={{ gap: 6, marginTop: 6 }}>
                    <button className="btn sm danger" onClick={() => block("Landslide blocks the road")} disabled={!sel.route}>⛰️ Landslide blocks this road</button>
                    <button className="btn sm danger" onClick={() => block("Flood cuts the low-lying stretch")} disabled={!sel.route}>🌊 Flood cuts this road</button>
                  </div>
                  {events.length > 0 && <ul className="plain small" style={{ marginTop: 8 }}>{events.map((e, i) => <li key={i}>{e}</li>)}</ul>}
                  {rerouted && sel.route && <div className="notice warn small" style={{ marginTop: 6 }}>Now recommending {nameOf(sel.candidate)} via route {sel.route.index + 1} ({mins(sel.route.durationMin)}).</div>}
                </div>
              </div>
            </div>
          )}

          {options.length > 0 && (
            <div className="card">
              <div className="card-head"><h3>Ranked destinations</h3><span className="tiny muted">{run?.at.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · re-ranks instantly as you move the priority sliders</span></div>
              <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
                <table className="t">
                  <thead><tr><th>#</th><th>Destination</th><th className="r">Score</th><th className="r">Safety</th><th className="r">Route</th><th className="r">Capacity</th><th className="r">Services</th><th className="r">Drive</th><th>Status</th></tr></thead>
                  <tbody>
                    {options.map((o, i) => (
                      <tr key={o.candidate.id} className={`click${sel?.candidate.id === o.candidate.id ? " sel" : ""}`} onClick={() => setSelId(o.candidate.id)}>
                        <td className="muted">{i + 1}</td>
                        <td><b>{nameOf(o.candidate)}</b><div className="tiny muted">{o.candidate.distKm} km {compass(o.candidate.bearingDeg)}</div></td>
                        <td className="r"><b>{Math.round(o.total * 100)}</b></td>
                        <td className="r">{Math.round(o.scores.safety * 100)}</td><td className="r">{Math.round(o.scores.route * 100)}</td>
                        <td className="r">{Math.round(o.scores.capacity * 100)}</td><td className="r">{Math.round(o.scores.services * 100)}</td>
                        <td className="r">{o.route ? mins(o.route.durationMin) : "blocked"}</td>
                        <td>{o.blocked ? <span className="tag gap">All routes blocked</span> : o.feasible ? <span className="tag osm">Feasible</span> : <span className="tag gap">Constraint</span>}{o.pareto && <span className="tag derived" style={{ marginLeft: 4 }}>Pareto</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="card-pad tiny muted">
                Pareto = no other site is at least as good on safety, route, capacity and services and better on one. {run && `${run.cands.length - run.cands.filter((c) => c.safety >= 0.5).length} of ${run.cands.length} sampled sites were screened out as locally unsafe.`}
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-head"><h3>Three-phase relocation logic</h3></div>
            <div className="card-pad grid g3">
              {PHASES.map((p) => (
                <div key={p.key} className={`phase${phase === p.key ? " on" : ""}`}>
                  <b>{p.label}</b>
                  <div className="tiny muted">{p.horizon}</div>
                  <p className="small" style={{ margin: "6px 0" }}>{p.goal}</p>
                  <ul className="plain tiny">{p.inputs.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>Module 3 variable framework</h3><span className="tiny muted">{RELOCATION_FRAMEWORK.reduce((s, c) => s + c.vars.length, 0)} variables · {RELOCATION_FRAMEWORK.reduce((s, c) => s + c.vars.filter((v) => v.status !== "gap").length, 0)} wired to live, computed or operator-input values</span></div>
            <div className="card-pad grid g3">
              {RELOCATION_FRAMEWORK.map((c) => (
                <details key={c.title} className="fw">
                  <summary><span>{c.icon} <b>{c.title}</b></span><span className="tiny muted">{c.vars.filter((v) => v.status !== "gap").length}/{c.vars.length}</span></summary>
                  <ul className="varlist">{c.vars.map((v) => <li key={v.name}><span className="grow small">{v.name}</span><span className={`tag ${v.status === "live" ? "live" : v.status === "model" ? "derived" : v.status === "input" ? "census" : "gap"}`}>{RSTATUS_LABEL[v.status]}</span></li>)}</ul>
                </details>
              ))}
            </div>
            <div className="card-pad" style={{ borderTop: "1px solid var(--line)" }}>
              <div className="label">Core optimisation variables — the compact set the ranking is built around</div>
              <div className="grid g4" style={{ marginTop: 6 }}>
                {CORE_OBJECTIVES.map((g) => <div key={g.title}><b className="small">{g.title}</b><ul className="plain tiny">{g.items.map((x) => <li key={x}>{x}</li>)}</ul></div>)}
              </div>
            </div>
          </div>
        </div>

        <aside className="stack info-panel" aria-label="Planner controls" style={{ top: 62 }}>
          <div className="card">
            <div className="card-head"><h3>1 · Affected community</h3></div>
            <div className="card-pad stack" style={{ gap: 10 }}>
              <DistrictPicker states={data.states} byState={data.byState} stateValue={d.s} districtId={d.id} onState={(s) => { const f = data.byState.get(s)?.[0]; if (f) setId(f.id); }} onDistrict={(x) => x != null && setId(x)} compact />
              <div className="field">
                <label htmlFor="hab">Habitation (real villages from OpenStreetMap)</label>
                <select id="hab" value={origin.name} onChange={(e) => {
                  const p = (places ?? []).find((x) => x.name === e.target.value);
                  if (p) { setOrigin({ lat: p.lat, lon: p.lon, name: p.name }); if (p.population) setPop(p.population); } else setOrigin({ lat: d.lat, lon: d.lon, name: `${d.n} district centre` });
                  setRun(null); setStage(0); setDetails([]); setBlocked(new Set()); setEvents([]);
                }}>
                  <option value={`${d.n} district centre`}>{d.n} district centre</option>
                  {origin.name === "Selected location" && <option value="Selected location">Selected location (map click)</option>}
                  {nearest.map(({ p, km }) => <option key={`${p.name}${p.lat}`} value={p.name}>{p.name} · {p.kind} · {km.toFixed(0)} km</option>)}
                </select>
                <span className="tiny muted">{places == null ? "Looking up villages…" : places.length ? `${places.length} villages and towns within 25 km` : "Village list unavailable — click the map to place the habitation."}</span>
              </div>
              <div className="field">
                <label htmlFor="pop">People to relocate</label>
                <input id="pop" type="number" min={20} max={50000} value={pop} onChange={(e) => setPop(Math.max(1, Number(e.target.value) || 1))} />
                <input type="range" min={50} max={5000} step={50} value={Math.min(pop, 5000)} onChange={(e) => setPop(Number(e.target.value))} aria-label="People to relocate" />
              </div>
              <dl className="kv">
                <dt>District vulnerability</dt><dd>{d.vband} · {d.vuln.toFixed(0)}</dd>
                <dt>Relocation priority (district)</dt><dd style={{ color: TIER_COLOR[d.reloc.tier] }}>{TIER_LABEL[d.reloc.tier]}</dd>
              </dl>
              <div className="tiny muted">{TIER_ACTION[d.reloc.tier]}</div>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>2 · Phase &amp; priorities</h3></div>
            <div className="card-pad stack" style={{ gap: 10 }}>
              <div className="seg" role="group" aria-label="Relocation phase" style={{ display: "flex" }}>
                {PHASES.map((p) => <button key={p.key} style={{ flex: 1 }} className={phase === p.key ? "on" : ""} onClick={() => applyPhase(p.key)}>{p.label.split(" · ")[1]}</button>)}
              </div>
              <div className="small muted">{info.horizon} — {info.goal}</div>
              {(Object.keys(WEIGHT_LABEL) as (keyof Weights)[]).map((k) => (
                <div key={k} className="field">
                  <div className="row small" style={{ justifyContent: "space-between" }}><label htmlFor={`w-${k}`} style={{ textTransform: "none", letterSpacing: 0, fontSize: "0.8rem" }}>{WEIGHT_LABEL[k]}</label><b className="num">{canSee(k)}%</b></div>
                  <input id={`w-${k}`} type="range" min={0} max={100} value={Math.round(weights[k] * 100)} onChange={(e) => setWeights({ ...weights, [k]: Number(e.target.value) / 100 })} />
                </div>
              ))}
              <button className="btn ghost sm" onClick={() => setWeights(PHASE_WEIGHTS[phase])}>Reset to phase defaults</button>
              <div className="grid g2" style={{ gap: 8 }}>
                <div className="field"><label htmlFor="tti">Time to impact (h)</label><input id="tti" type="number" min={0} max={72} step={0.5} value={tti} onChange={(e) => setTti(Math.max(0, Number(e.target.value) || 0))} /></div>
                <div className="field"><label htmlFor="prep">Preparation (min)</label><input id="prep" type="number" min={0} max={600} value={prep} onChange={(e) => setPrep(Math.max(0, Number(e.target.value) || 0))} /></div>
                <div className="field"><label htmlFor="fleet">Buses available</label><input id="fleet" type="number" min={1} max={200} value={fleet} onChange={(e) => setFleet(Math.max(1, Number(e.target.value) || 1))} /></div>
              </div>
              {forecast && (
                <div className="notice info small">
                  <b>Live signal:</b> {forecast.peakHour != null ? <>heaviest forecast rain in about <b>{forecast.peakHour} h</b> ({forecast.hourlyMax.toFixed(0)} mm/h). </> : <>no intense rain in the next 72 h (peak {forecast.hourlyMax.toFixed(1)} mm/h). </>}
                  {forecast.peakHour != null && <button className="btn sm ghost" onClick={() => setTti(forecast.peakHour ?? 0)}>Use as time-to-impact</button>}
                </div>
              )}
            </div>
          </div>

          <div className="card card-pad stack" style={{ gap: 10 }}>
            <h3>3 · Run the analysis</h3>
            <button className="btn saffron" style={{ justifyContent: "center", padding: "11px 14px" }} onClick={analyse} disabled={!!busy}>
              {busy ? <><span className="spinner" /> Working…</> : run ? "Re-run analysis" : "Find safe destinations"}
            </button>
            <p className="tiny muted">
              Samples 48 sites around {origin.name}, screens them for local flood, landslide, cloudburst and coastal hazard, then routes the best six on the real road network and scores each road against forecast rain and terrain.
            </p>
            {run && (
              <div className="tiny muted">
                Data used: SRTM terrain ✓ · rivers {run.notes.water ? "✓" : "district value"} · facilities {run.notes.amenities ? "✓" : "—"} · coast {run.notes.coast ? "✓" : "n/a"} · roads {run.notes.routed} routed
              </div>
            )}
            {live && (
              <div className="tiny">
                <b>72 h outlook for {d.n}:</b> <span style={{ color: ZONE_COLOR[live.zone], fontWeight: 700 }}>{live.zone}</span> · dominant {HAZARD_BY_KEY[live.dom].label.toLowerCase()} {live.P[live.dom].toFixed(0)}% {live.escalated ? "· escalated vs. annual" : ""}
              </div>
            )}
            <Provenance title="Assumptions & limits">
              <ul className="plain">
                <li>Shelter capacity: school {CAPACITY_ASSUMPTIONS.school}, college {CAPACITY_ASSUMPTIONS.college}, hall {CAPACITY_ASSUMPTIONS.hall}, hospital {CAPACITY_ASSUMPTIONS.hospitalBeds} beds within 5 km; planned parcel {CAPACITY_ASSUMPTIONS.parcelHa} ha × {CAPACITY_ASSUMPTIONS.peoplePerHa} people/ha × {(CAPACITY_ASSUMPTIONS.netShare * 100).toFixed(0)}% net, scaled by flatness.</li>
                <li>Local hazard uses the district's own factor scores with the site's slope, height above nearby low ground, river and coast distance.</li>
                <li>Road risk: forecast rain × low-lying or steep road samples; traffic, road width and bridge condition need department data.</li>
                <li>OpenStreetMap coverage varies; a missing facility may be unmapped, not absent. Always verify a site in the field.</li>
              </ul>
            </Provenance>
          </div>

          <div className="row" style={{ gap: 8 }}>
            {!emergency && <button className="btn ghost sm" onClick={() => navigate({ pathname: "/gis", search: `?d=${d.id}` })}>← Map</button>}
            <span className="tiny muted">{compact(d.expo.pop)} exposed in district</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
