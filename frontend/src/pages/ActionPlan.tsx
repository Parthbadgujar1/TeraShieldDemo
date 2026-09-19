import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorBox, Loading, Provenance, ZoneBadge } from "../components/ui";
import { loadPilot, useDataset } from "../lib/data";
import { householdsOf } from "../lib/permanent";
import {
  DEFAULT_COSTS, HORIZON, annualLoss, breakEvenYears, compareOptions, download, inr, moveCost, moveCostPerHh, reasonText, selectWithinBudget,
  toCsv, toExportRows, toGeoJSON, toMarkdown, type Costs, type PlanItem,
} from "../lib/plan";
import { HAZARD_BY_KEY, TIER_COLOR, ZONE_HAZARDS, compact, lakh } from "../lib/risk";
import type { Dataset } from "../lib/data";
import type { Pilot, Tier } from "../lib/types";

export const UPLOAD_KEY = "ts_upload_v1";
const HILL_STATES = new Set(["Himachal Pradesh", "Uttarakhand", "Jammu and Kashmir", "Ladakh", "Sikkim", "Arunachal Pradesh", "Nagaland", "Manipur", "Mizoram", "Tripura", "Meghalaya", "Assam"]);

type Source = "pilot" | "upload" | "district";

function pilotItems(p: Pilot, data: Dataset | null): PlanItem[] {
  const d = data?.byId.get(p.district.id);
  const annualP = d ? Math.max(...ZONE_HAZARDS.map((h) => d.P[h.key])) : 30;
  return p.villages.map((v) => ({
    id: `p-${v.id}`, name: v.name, district: p.district.name, state: p.district.state, lat: v.lat, lon: v.lon, zone: v.zone, tier: v.tier, score: v.score,
    pop: v.pop, hh: householdsOf(v, p), reasons: v.reasons, source: "pilot", level: "habitation", hills: HILL_STATES.has(p.district.state), annualP,
  }));
}

function districtItems(data: Dataset, state: string): PlanItem[] {
  return data.districts.filter((d) => !state || d.s === state).map((d) => ({
    id: `d-${d.id}`, name: d.n, district: d.n, state: d.s, lat: d.lat, lon: d.lon, zone: d.zone, tier: d.reloc.tier, score: d.reloc.score,
    pop: d.expo.pop, hh: Math.round(d.expo.pop / Math.max(d.pop / Math.max(d.hh, 1), 1)),
    reasons: [`Dominant hazard: ${HAZARD_BY_KEY[d.dom].label}`, `Tier holds in ${d.reloc.stab.toFixed(0)}% of weight sets`], source: "district", level: "district",
    hills: HILL_STATES.has(d.s), annualP: Math.max(...ZONE_HAZARDS.map((h) => d.P[h.key])),
  }));
}

function loadUploads(): PlanItem[] {
  try { return JSON.parse(localStorage.getItem(UPLOAD_KEY) ?? "[]") as PlanItem[]; } catch { return []; }
}

const num = (v: string, fallback: number) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };

export default function ActionPlan() {
  const { data, error } = useDataset();
  const navigate = useNavigate();
  const [source, setSource] = useState<Source>("pilot");
  const [pilot, setPilot] = useState<Pilot | null>(null);
  const [uploads, setUploads] = useState<PlanItem[]>(loadUploads);
  const [state, setState] = useState("");
  const [costs, setCosts] = useState<Costs>(DEFAULT_COSTS);
  const [budgetCr, setBudgetCr] = useState(25);
  const [useBudget, setUseBudget] = useState(true);
  const [mode, setMode] = useState<"value" | "priority">("value");
  const [horizonF, setHorizonF] = useState<Tier | "all">("all");
  const [sel, setSel] = useState<string | null>(null);

  useEffect(() => { loadPilot().then(setPilot).catch(() => undefined); }, []);
  useEffect(() => { const on = () => setUploads(loadUploads()); window.addEventListener("storage", on); return () => window.removeEventListener("storage", on); }, []);

  const items = useMemo(() => {
    if (source === "pilot") return pilot ? pilotItems(pilot, data) : [];
    if (source === "upload") return uploads;
    return data ? districtItems(data, state) : [];
  }, [source, pilot, data, uploads, state]);

  const ranked = useMemo(() => [...items].sort((a, b) => b.score - a.score), [items]);
  const habitation = source !== "district";
  const selection = useMemo(() => (habitation && useBudget ? selectWithinBudget(ranked, budgetCr * 1e7, costs, mode) : null), [ranked, habitation, useBudget, budgetCr, costs, mode]);
  const chosenIds = useMemo(() => new Set(selection?.chosen.map((i) => i.id) ?? []), [selection]);
  const rows = useMemo(() => toExportRows(ranked, costs, chosenIds), [ranked, costs, chosenIds]);

  if (error) return <div className="page"><ErrorBox text={error} /></div>;
  if (!data || (source === "pilot" && !pilot)) return <Loading text="Preparing the action plan…" />;

  const tiers: Exclude<Tier, "monitor">[] = ["immediate", "short_term", "medium_term"];
  const by = (t: Tier) => ranked.filter((i) => i.tier === t);
  const shown = ranked.filter((i) => horizonF === "all" ? i.tier !== "monitor" : i.tier === horizonF).slice(0, 200);
  const picked = sel ? ranked.find((i) => i.id === sel) ?? null : null;
  const scope = source === "pilot" ? `${pilot?.district.name}, ${pilot?.district.state} — habitation level` : source === "upload" ? "Uploaded habitations" : `${state || "All India"} — district screening`;
  const sourceNote = source === "pilot" ? "Wayanad pilot: 240 named OpenStreetMap settlements classified on terrain; population WorldPop 2020 apportioned." : source === "upload" ? "Habitations you uploaded in the Data Lab, classified against district hazard and pilot polygons." : "Districts ranked by relocation priority — a survey-first list, not a household count.";
  const ctx = { title: `State Action Plan — ${scope}`, scope, source: sourceNote, generated: new Date().toISOString().slice(0, 10), budget: selection ? budgetCr * 1e7 : null, costs };
  const setCost = (k: keyof Costs) => (e: React.ChangeEvent<HTMLInputElement>) => setCosts({ ...costs, [k]: num(e.target.value, costs[k]) });

  return (
    <div className="page print-report">
      <div className="page-head no-print">
        <div className="grow">
          <h1>State Action Plan</h1>
          <p>
            Turns ranked habitations into <b>Immediate / Short-term / Medium-term</b> relocation lists with reasons, prices them with editable, labelled assumptions,
            picks the best set under a budget cap and exports it for the SDMA: CSV, GeoJSON, Markdown and a print-ready PDF.
          </p>
        </div>
      </div>

      <div className="print-only"><h1>{ctx.title}</h1><p>Generated {ctx.generated} · TeraShield (SIH 2026, PS 26191) · screening output for analyst review — not a notified red-zone list.</p></div>

      <div className="card card-pad filters no-print" style={{ marginBottom: 14 }}>
        <div className="field">
          <span className="label">Habitations</span>
          <div className="seg" role="group" aria-label="Source">
            <button className={source === "pilot" ? "on" : ""} onClick={() => setSource("pilot")}>Wayanad pilot</button>
            <button className={source === "upload" ? "on" : ""} onClick={() => setSource("upload")}>My uploads ({uploads.length})</button>
            <button className={source === "district" ? "on" : ""} onClick={() => setSource("district")}>District screening</button>
          </div>
        </div>
        {source === "district" && (
          <div className="field" style={{ minWidth: 190 }}>
            <label htmlFor="plan-state">State / UT</label>
            <select id="plan-state" value={state} onChange={(e) => setState(e.target.value)}>
              <option value="">All India</option>
              {data.states.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}
        {habitation && (
          <>
            <div className="field" style={{ minWidth: 150 }}>
              <label htmlFor="budget">Budget cap (₹ crore)</label>
              <input id="budget" type="number" min={0.1} step={1} value={budgetCr} onChange={(e) => setBudgetCr(Math.max(0.1, num(e.target.value, budgetCr)))} disabled={!useBudget} />
            </div>
            <div className="field">
              <span className="label">Selection</span>
              <div className="seg" role="group" aria-label="Selection mode">
                <button className={!useBudget ? "on" : ""} onClick={() => setUseBudget(false)}>No cap</button>
                <button className={useBudget && mode === "value" ? "on" : ""} onClick={() => { setUseBudget(true); setMode("value"); }}>Best value</button>
                <button className={useBudget && mode === "priority" ? "on" : ""} onClick={() => { setUseBudget(true); setMode("priority"); }}>Strict priority</button>
              </div>
            </div>
          </>
        )}
      </div>

      {source === "upload" && uploads.length === 0 && (
        <div className="notice warn" style={{ marginBottom: 14 }}>
          No uploaded habitations yet. <button className="linklike" onClick={() => navigate("/validation")}>Open the Data Lab</button> to upload a CSV or GeoJSON, then come back here.
        </div>
      )}

      <div className="grid g4" style={{ marginBottom: 14 }}>
        {tiers.map((t) => {
          const list = by(t);
          const people = list.reduce((s, i) => s + i.pop, 0);
          return (
            <div key={t} className="stat" style={{ borderTop: `4px solid ${TIER_COLOR[t]}` }}>
              <b>{list.length}</b><span>{HORIZON[t].label} · {compact(people)} people{habitation ? ` · ${inr(list.reduce((s, i) => s + moveCost(i, costs), 0))}` : ""}</span>
              <span className="tiny muted">{HORIZON[t].window}</span>
            </div>
          );
        })}
        <div className="stat">
          {selection ? (<><b>{inr(selection.spend)}</b><span>{selection.chosen.length} habitations · {compact(selection.people)} people within the {inr(budgetCr * 1e7)} cap</span><span className="tiny muted">{selection.skipped.length} more wait for the next allocation</span></>)
            : (<><b>{ranked.filter((i) => i.tier === "monitor").length}</b><span>monitor only</span></>)}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <h3>Ranked relocation list</h3>
          <div className="seg no-print" role="group" aria-label="Horizon filter">
            <button className={horizonF === "all" ? "on" : ""} onClick={() => setHorizonF("all")}>All</button>
            {tiers.map((t) => <button key={t} className={horizonF === t ? "on" : ""} onClick={() => setHorizonF(t)}>{HORIZON[t].label}</button>)}
          </div>
          <div className="row no-print" style={{ gap: 6, marginLeft: "auto" }}>
            <button className="btn sm" onClick={() => download(`terashield-action-plan-${ctx.generated}.csv`, "text/csv", toCsv(rows))}>CSV</button>
            <button className="btn sm" onClick={() => download(`terashield-action-plan-${ctx.generated}.geojson`, "application/geo+json", JSON.stringify(toGeoJSON(rows)))}>GeoJSON</button>
            <button className="btn sm" onClick={() => download(`terashield-action-plan-${ctx.generated}.md`, "text/markdown", toMarkdown(ctx, rows, selection))}>Markdown</button>
            <button className="btn sm saffron" onClick={() => window.print()}>PDF (print)</button>
          </div>
        </div>
        <div className="table-wrap" style={{ border: 0, borderRadius: 0, maxHeight: 520 }}>
          <table className="t">
            <thead><tr><th>#</th><th>Horizon</th><th>{habitation ? "Habitation" : "District"}</th><th>Zone</th><th className="r">Priority</th><th className="r">People</th><th>Why</th>{habitation && <><th className="r">Move cost</th><th className="r">Break-even</th><th>In cap</th></>}</tr></thead>
            <tbody>
              {shown.map((it, k) => {
                const be = breakEvenYears(it, costs);
                return (
                  <tr key={it.id} className={`click${sel === it.id ? " sel" : ""}`} onClick={() => setSel(it.id)}>
                    <td className="muted">{k + 1}</td>
                    <td><span className="chip static" style={{ background: TIER_COLOR[it.tier], color: "#fff", borderColor: TIER_COLOR[it.tier], fontSize: "0.7rem", padding: "1px 7px" }}>{it.tier === "monitor" ? "Monitor" : HORIZON[it.tier].label}</span></td>
                    <td><b>{it.name}</b>{it.source !== "district" && <div className="tiny muted">{it.district}, {it.state}</div>}{it.source === "district" && <div className="tiny muted">{it.state}</div>}</td>
                    <td><ZoneBadge zone={it.zone} label={it.zone[0] + it.zone.slice(1).toLowerCase()} /></td>
                    <td className="r"><b>{it.score.toFixed(0)}</b></td>
                    <td className="r">{lakh(it.pop)}</td>
                    <td className="small">{it.reasons.slice(0, 2).map(reasonText).join("; ") || "—"}</td>
                    {habitation && <><td className="r">{inr(moveCost(it, costs))}</td><td className="r">{Number.isFinite(be) ? `${be.toFixed(0)} yr` : "—"}</td><td>{chosenIds.has(it.id) ? <span className="tag osm">✓</span> : <span className="muted tiny">—</span>}</td></>}
                  </tr>
                );
              })}
              {shown.length === 0 && <tr><td colSpan={10} className="muted small">Nothing in this horizon.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card-pad tiny muted">{sourceNote} Showing up to 200 rows; exports contain every row.</div>
      </div>

      {picked && habitation && (
        <div className="card no-print" style={{ marginBottom: 14 }}>
          <div className="card-head"><h3>Protect, adapt or relocate — {picked.name}</h3><span className="tiny muted">{costs.horizonYears}-year cost, undiscounted, editable assumptions</span></div>
          <div className="card-pad">
            {(() => {
              const opts = compareOptions(picked, costs);
              const max = Math.max(...opts.map((o) => o.total), 1);
              const best = opts.reduce((a, b) => (b.total < a.total ? b : a));
              return (
                <div className="stack" style={{ gap: 8 }}>
                  {opts.map((o) => (
                    <div key={o.key}>
                      <div className="row small" style={{ justifyContent: "space-between" }}>
                        <span>{o.label}{o.key === best.key && <span className="tag osm" style={{ marginLeft: 6 }}>cheapest</span>}</span>
                        <b className="num">{inr(o.total)} <span className="muted tiny">= {inr(o.upfront)} spend + {inr(o.expectedLoss)} expected loss</span></b>
                      </div>
                      <div className="bar lg"><i style={{ width: `${(o.total / max) * 100}%`, background: o.key === best.key ? "var(--good)" : "var(--navy)" }} /></div>
                    </div>
                  ))}
                  <p className="small muted">
                    Expected annual loss if it stays: <b>{inr(annualLoss(picked, costs))}</b> ({picked.annualP.toFixed(0)}% district hazard × zone factor). Relocating repays itself in <b>{Number.isFinite(breakEvenYears(picked, costs)) ? `${breakEvenYears(picked, costs).toFixed(0)} years` : "never at this hazard level"}</b>;
                    a house lasts 30–50 years. Per-household move cost {inr(moveCostPerHh(picked, costs))}. Officials ask "can we just build a wall?" first — this is the answer with numbers.
                  </p>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {habitation && (
        <details className="card card-pad no-print" style={{ marginBottom: 14 }}>
          <summary><b>Cost assumptions</b> <span className="tiny muted">— PMAY-G unit assistance and SDRF ex-gratia are published norms; everything else is an editable assumption</span></summary>
          <div className="grid g4" style={{ marginTop: 10 }}>
            {([
              ["pmayPlains", "PMAY-G per house — plains (₹)"], ["pmayHills", "PMAY-G per house — hills / NE (₹)"], ["landServices", "Land + services per household (₹, assumption)"], ["livelihood", "Livelihood transition per household (₹, assumption)"],
              ["exGratiaDeath", "SDRF ex-gratia per death (₹)"], ["houseDamage", "House damage payout (₹)"], ["damageShare", "Homes damaged in an event (share)"], ["fatalityRate", "Fatality rate among residents"],
              ["protectPerHh", "Protect works per household (₹)"], ["protectEffect", "Loss avoided by protect (share)"], ["adaptPerHh", "Adapt per household (₹)"], ["adaptEffect", "Loss avoided by adapt (share)"], ["horizonYears", "Horizon (years)"],
            ] as [keyof Costs, string][]).map(([k, label]) => (
              <div className="field" key={k}><label htmlFor={`c-${k}`}>{label}</label><input id={`c-${k}`} type="number" step="any" value={costs[k]} onChange={setCost(k)} /></div>
            ))}
          </div>
          <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => setCosts(DEFAULT_COSTS)}>Reset to defaults</button>
        </details>
      )}

      <Provenance title="How the horizons, costs and selection are worked out">
        <ul className="plain small">
          <li>Priority = 0.35 zone + 0.25 vulnerability + 0.15 exposure + 0.15 disaster history + 0.10 feasibility. Tiers: ≥ 62 Immediate (before the next monsoon), ≥ 50 Short-term (within a year), ≥ 38 Medium-term (1–3 years). On the national list, each tier holds in the stated share of 1,000 random weight sets.</li>
          <li>Selection under a budget is a transparent greedy heuristic (benefit per rupee, or strict priority order) — not a proven optimum. It never splits a habitation.</li>
          <li>Expected annual loss = hazard probability × zone factor (Red 1.0, Orange 0.5, Yellow 0.2, Green 0.05 — an assumption) × (damaged homes + ex-gratia). Break-even is undiscounted.</li>
          <li>District-level rows are for deciding where to survey first; households and rupees are only meaningful with habitation-level data (pilot or upload).</li>
          <li>Exports state the assumptions and carry the "for analyst review" status. Nothing here notifies a red zone.</li>
        </ul>
      </Provenance>
    </div>
  );
}
