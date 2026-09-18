import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, DistrictPicker, ErrorBox, HazardClass, Loading, Provenance, Stat, ZoneBadge } from "../components/ui";
import { HAZARD_INFO } from "../content/hazards";
import { summariseStates, useDataset, useDistrictParam } from "../lib/data";
import { contributions, whyText } from "../lib/explain";
import { HAZARDS, HAZARD_BY_KEY, HAZARD_CUTS, ZONE_COLOR, ZONE_CUTS, ZONES, compact, lakh, returnPeriod, zoneForHazard } from "../lib/risk";
import type { District, HazardKey, Zone } from "../lib/types";

type Focus = "overview" | HazardKey;
type SortKey = "value" | "name" | "pop";
type Tab = "about" | "method" | "precautions" | "warnings";
const PAGE = 12;

const valueOf = (d: District, f: Focus) => (f === "overview" ? d.risk : d.P[f]);
const zoneOfD = (d: District, f: Focus): Zone => (f === "overview" ? d.zone : zoneForHazard(d.P[f]));

export default function HazardIntelligence() {
  const { data, error } = useDataset();
  const navigate = useNavigate();
  const [selId, setSelId] = useDistrictParam(data);
  const [focus, setFocus] = useState<Focus>("overview");
  const [stateF, setStateF] = useState("");
  const [cls, setCls] = useState<Set<Zone>>(new Set(ZONES));
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("value");
  const [page, setPage] = useState(0);
  const [tab, setTab] = useState<Tab>("about");

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    const out = data.districts.filter((d) => {
      if (stateF && d.s !== stateF) return false;
      if (!cls.has(zoneOfD(d, focus))) return false;
      return !needle || d.n.toLowerCase().includes(needle) || d.s.toLowerCase().includes(needle);
    });
    out.sort((a, b) => (sort === "name" ? a.n.localeCompare(b.n) : sort === "pop" ? b.pop - a.pop : valueOf(b, focus) - valueOf(a, focus)));
    return out;
  }, [data, stateF, cls, q, focus, sort]);

  const stateRows = useMemo(() => (data ? summariseStates(data.districts) : []), [data]);

  if (error) return <div className="page"><ErrorBox text={error} /></div>;
  if (!data) return <Loading text="Loading India hazard dataset…" />;

  const info = focus === "overview" ? null : HAZARD_INFO[focus];
  const selected = selId != null ? data.byId.get(selId) ?? null : null;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const view = rows.slice(page * PAGE, page * PAGE + PAGE);
  const high = rows.filter((d) => zoneOfD(d, focus) === "RED" || zoneOfD(d, focus) === "ORANGE");
  const popHigh = high.reduce((s, d) => s + d.pop, 0);
  const mean = rows.length ? rows.reduce((s, d) => s + valueOf(d, focus), 0) / rows.length : 0;

  // state ranking bars (mean probability of the focused hazard)
  const stateBars = stateRows
    .map((s) => ({ state: s.state, v: focus === "overview" ? s.meanRisk : s.meanP[focus] }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 10);

  const nationalCounts = (h: HazardKey) => data.districts.filter((d) => d.P[h] >= HAZARD_CUTS.orange).length;
  const toggleCls = (z: Zone) => setCls((s) => { const n = new Set(s); if (n.has(z)) { if (n.size > 1) n.delete(z); } else n.add(z); return n; });
  const setFocusReset = (f: Focus) => { setFocus(f); setPage(0); setTab("about"); };

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>Hazard Intelligence</h1>
          <p>
            Annual occurrence probability of six hazards for every district in India — built from 2014–2023 climatology, SRTM terrain,
            river and coast geometry, and cyclone and landslide event history. Choose a hazard, then filter by state, district and risk level.
          </p>
        </div>
        <span className="tag census">Static national dataset · {data.meta.districts} districts · {data.meta.states} states/UTs</span>
      </div>

      <div className="hz-cards" role="tablist" aria-label="Hazard">
        <button role="tab" aria-selected={focus === "overview"} className={`hz-card${focus === "overview" ? " on" : ""}`} onClick={() => setFocusReset("overview")}>
          <span className="ico">◎</span><b>All hazards</b><span className="tiny muted">{data.meta.zone_counts.RED} red-zone districts</span>
        </button>
        {HAZARDS.map((h) => (
          <button key={h.key} role="tab" aria-selected={focus === h.key} className={`hz-card${focus === h.key ? " on" : ""}`} style={focus === h.key ? { borderColor: h.color } : undefined} onClick={() => setFocusReset(h.key)}>
            <span className="ico">{h.icon}</span><b>{h.label}</b><span className="tiny muted">{nationalCounts(h.key)} districts ≥ {HAZARD_CUTS.orange}%</span>
          </button>
        ))}
      </div>

      <div className="card card-pad filters">
        <DistrictPicker
          states={data.states} byState={data.byState} allowAllStates allowAllDistricts
          stateValue={stateF}
          districtId={selected && (!stateF || selected.s === stateF) ? selected.id : null}
          onState={(s) => { setStateF(s); setPage(0); }}
          onDistrict={(id) => setSelId(id)}
        />
        <div className="field" style={{ minWidth: 200 }}>
          <label htmlFor="q">Search</label>
          <input id="q" type="search" placeholder="District or state" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        </div>
        <div className="field">
          <span className="label">Risk level</span>
          <div className="chips">
            {ZONES.map((z) => (
              <button key={z} className="chip" aria-pressed={cls.has(z)} onClick={() => { toggleCls(z); setPage(0); }}
                style={cls.has(z) ? { background: ZONE_COLOR[z], borderColor: ZONE_COLOR[z], color: z === "YELLOW" ? "#3b2c00" : "#fff" } : undefined}>
                {focus === "overview" ? z[0] + z.slice(1).toLowerCase() : { RED: "Very high", ORANGE: "High", YELLOW: "Moderate", GREEN: "Low" }[z]}
              </button>
            ))}
          </div>
        </div>
        <button className="btn ghost sm" onClick={() => { setStateF(""); setQ(""); setCls(new Set(ZONES)); setSelId(null); setPage(0); }}>Reset</button>
      </div>

      <div className="grid g-side" style={{ marginTop: 14 }}>
        <div className="stack" style={{ minWidth: 0 }}>
          <div className="grid g4">
            <Stat value={rows.length} label="districts match filters" />
            <Stat value={high.length} label={focus === "overview" ? "red or orange zone" : "very high or high"} tone="red" />
            <Stat value={compact(popHigh)} label="people living there (Census 2011)" tone="orange" />
            <Stat value={`${mean.toFixed(0)}%`} label={focus === "overview" ? "mean multi-hazard probability" : "mean annual probability"} />
          </div>

          <div className="grid g2">
            <div className="card">
              <div className="card-head"><h3>{focus === "overview" ? "Most exposed states (mean multi-hazard)" : `States with the highest ${HAZARD_BY_KEY[focus as HazardKey].label.toLowerCase()} probability`}</h3></div>
              <div className="card-pad stack" style={{ gap: 8 }}>
                {stateBars.map((s) => (
                  <button key={s.state} className="bar-row" onClick={() => { setStateF(s.state); setPage(0); }} title={`Filter to ${s.state}`}>
                    <span className="small grow" style={{ textAlign: "left" }}>{s.state}</span>
                    <span style={{ width: "44%" }}><Bar value={s.v} color={focus === "overview" ? "var(--navy)" : HAZARD_BY_KEY[focus as HazardKey].color} large /></span>
                    <b className="small num" style={{ width: 38, textAlign: "right" }}>{s.v.toFixed(0)}%</b>
                  </button>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-head"><h3>State × hazard matrix</h3><span className="tiny muted">mean probability · click a cell</span></div>
              <div className="matrix-wrap">
                <table className="t matrix">
                  <thead><tr><th>State / UT</th>{HAZARDS.map((h) => <th key={h.key} title={h.label}>{h.icon}</th>)}</tr></thead>
                  <tbody>
                    {stateRows.map((s) => (
                      <tr key={s.state} className={stateF === s.state ? "sel" : ""}>
                        <td className="small">{s.state}</td>
                        {HAZARDS.map((h) => {
                          const v = s.meanP[h.key] ?? 0;
                          const z = zoneForHazard(v);
                          return (
                            <td key={h.key} className="mcell">
                              <button onClick={() => { setStateF(s.state); setFocusReset(h.key); }} style={{ background: v < 1 ? "#f0f3f6" : ZONE_COLOR[z], color: z === "YELLOW" || v < 1 ? "#3b2c00" : "#fff", opacity: v < 1 ? 0.6 : 0.55 + Math.min(v, 60) / 130 }} aria-label={`${s.state} ${h.label} ${v.toFixed(0)} percent`}>
                                {v.toFixed(0)}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>District ranking — {focus === "overview" ? "multi-hazard" : HAZARD_BY_KEY[focus].label.toLowerCase()} probability</h3>
              <div className="seg" role="group" aria-label="Sort by">
                <button className={sort === "value" ? "on" : ""} onClick={() => setSort("value")}>Risk</button>
                <button className={sort === "pop" ? "on" : ""} onClick={() => setSort("pop")}>Population</button>
                <button className={sort === "name" ? "on" : ""} onClick={() => setSort("name")}>A–Z</button>
              </div>
            </div>
            <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
              <table className="t">
                <thead>
                  <tr>
                    <th>#</th><th>District</th><th>State / UT</th><th style={{ minWidth: 160 }}>{focus === "overview" ? "Multi-hazard" : "Annual probability"}</th>
                    <th>Class</th><th>{focus === "overview" ? "Dominant" : "Return period"}</th><th className="r">Population</th>
                  </tr>
                </thead>
                <tbody>
                  {view.map((d, i) => {
                    const v = valueOf(d, focus);
                    return (
                      <tr key={d.id} className={`click${selId === d.id ? " sel" : ""}`} onClick={() => setSelId(d.id)}>
                        <td className="muted">{page * PAGE + i + 1}</td>
                        <td><b>{d.n}</b></td>
                        <td className="small">{d.s}</td>
                        <td>
                          <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                            <span style={{ flex: 1 }}><Bar value={v} color={focus === "overview" ? ZONE_COLOR[d.zone] : HAZARD_BY_KEY[focus].color} /></span>
                            <b className="num small" style={{ width: 34, textAlign: "right" }}>{v.toFixed(0)}%</b>
                          </div>
                        </td>
                        <td>{focus === "overview" ? <ZoneBadge zone={d.zone} label={d.zone[0] + d.zone.slice(1).toLowerCase()} /> : <HazardClass pct={v} />}</td>
                        <td className="small">{focus === "overview" ? `${HAZARD_BY_KEY[d.dom].icon} ${HAZARD_BY_KEY[d.dom].label}` : returnPeriod(v)}</td>
                        <td className="r">{lakh(d.pop)}</td>
                      </tr>
                    );
                  })}
                  {view.length === 0 && <tr><td colSpan={7} className="muted" style={{ padding: 24, textAlign: "center" }}>No districts match these filters.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="row pager">
              <span className="small muted">{rows.length ? `${page * PAGE + 1}–${Math.min(rows.length, (page + 1) * PAGE)} of ${rows.length}` : "0 districts"}</span>
              <span className="spacer" />
              <button className="btn ghost sm" disabled={page === 0} onClick={() => setPage(page - 1)}>← Prev</button>
              <span className="small num">{page + 1} / {pages}</span>
              <button className="btn ghost sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next →</button>
            </div>
          </div>

          {selected && (
            <div className="card" id="profile">
              <div className="card-head">
                <h3>{selected.n}, {selected.s}</h3>
                <ZoneBadge zone={selected.zone} />
                <button className="btn sm" onClick={() => navigate({ pathname: "/gis", search: `?d=${selected.id}` })}>Open on map</button>
                <button className="btn sm ghost" onClick={() => navigate({ pathname: "/relocation", search: `?d=${selected.id}` })}>Relocation planner</button>
              </div>
              <div className="card-pad grid g2">
                <div className="stack" style={{ gap: 8 }}>
                  <div className="label">All six hazards</div>
                  {HAZARDS.map((h) => (
                    <button key={h.key} className={`hz-row${focus === h.key ? " on" : ""}`} onClick={() => setFocusReset(h.key)}>
                      <span className="hz-ico">{h.icon}</span>
                      <span className="grow" style={{ textAlign: "left" }}>
                        <span className="row" style={{ justifyContent: "space-between" }}><b className="small">{h.label}</b><b className="small num">{selected.P[h.key].toFixed(0)}%</b></span>
                        <Bar value={selected.P[h.key]} color={h.color} />
                      </span>
                      <HazardClass pct={selected.P[h.key]} />
                    </button>
                  ))}
                </div>
                <div className="stack" style={{ gap: 8 }}>
                  {(() => {
                    const h: HazardKey = focus === "overview" ? selected.dom : focus;
                    const factored = h === "flood" || h === "landslide" || h === "cloudburst" || h === "coastal";
                    return (
                      <>
                        <div className="label">Why {HAZARD_BY_KEY[h].label.toLowerCase()} is {selected.P[h].toFixed(0)}% ({returnPeriod(selected.P[h])})</div>
                        <p className="small muted">{whyText(selected, h)}</p>
                        {factored && contributions(selected, h).map((c) => (
                          <div key={c.label} title={c.hint}>
                            <div className="row small" style={{ justifyContent: "space-between" }}><span>{c.label} <span className="muted tiny">×{c.weight.toFixed(2)}</span></span><b className="num">{c.value.toFixed(0)}</b></div>
                            <Bar value={c.value} color={HAZARD_BY_KEY[h].color} />
                          </div>
                        ))}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>

        <aside className="stack info-panel" aria-label="Hazard knowledge">
          {info ? (
            <div className="card">
              <div className="card-head" style={{ borderTop: `4px solid ${HAZARD_BY_KEY[info.key].color}` }}>
                <span style={{ fontSize: "1.5rem" }}>{HAZARD_BY_KEY[info.key].icon}</span>
                <div className="grow"><h3>{info.name}</h3><div className="tiny muted">{info.tagline}</div></div>
              </div>
              <div className="tabs" role="tablist">
                {([["about", "About"], ["method", "How we estimate"], ["precautions", "Precautions"], ["warnings", "Warnings"]] as [Tab, string][]).map(([k, l]) => (
                  <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
                ))}
              </div>
              <div className="card-pad stack" style={{ gap: 12 }}>
                {tab === "about" && (
                  <>
                    <p className="small">{info.definition}</p>
                    <dl className="kv" style={{ gridTemplateColumns: "auto", gap: 2 }}>
                      <dt>Season</dt><dd style={{ textAlign: "left", fontWeight: 500 }}>{info.season}</dd>
                      <dt style={{ marginTop: 6 }}>Most affected</dt><dd style={{ textAlign: "left", fontWeight: 500 }}>{info.regions}</dd>
                    </dl>
                    <div>
                      <div className="label">{info.scale.title}</div>
                      <table className="t small"><tbody>{info.scale.rows.map(([a, b]) => <tr key={a}><td><b>{a}</b></td><td>{b}</td></tr>)}</tbody></table>
                    </div>
                    <div className="notice info small">
                      <b>Estimated occurrence under the current filter:</b> {rows.filter((d) => d.P[info.key] >= HAZARD_CUTS.orange).length} of {rows.length} districts have an annual probability of {HAZARD_CUTS.orange}% or more; the highest is {rows.length ? Math.max(...rows.map((d) => d.P[info.key])).toFixed(0) : 0}%.
                    </div>
                  </>
                )}
                {tab === "method" && (
                  <>
                    <code className="formula">{info.method.formula}</code>
                    <div className="stack" style={{ gap: 8 }}>
                      {info.method.inputs.map((i) => (
                        <div key={i.factor} className="input-row">
                          <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                            <b className="small">{i.factor}</b>{i.weight && <span className="tag">×{i.weight}</span>}
                          </div>
                          <div className="tiny muted">{i.source}</div>
                        </div>
                      ))}
                    </div>
                    <p className="small muted">{info.method.occurrence}</p>
                  </>
                )}
                {tab === "precautions" && (
                  <>
                    {([["Before", info.before], ["During", info.during], ["After", info.after]] as [string, string[]][]).map(([t, list]) => (
                      <div key={t}><div className="label">{t}</div><ul className="plain small">{list.map((x) => <li key={x}>{x}</li>)}</ul></div>
                    ))}
                  </>
                )}
                {tab === "warnings" && (
                  <>
                    <div className="stack" style={{ gap: 8 }}>
                      {info.warnings.map((w) => <div key={w.agency}><b className="small">{w.agency}</b><div className="tiny muted">{w.what}</div></div>)}
                    </div>
                    <div className="notice warn small">Emergency: dial <b>112</b> (national emergency number). State control rooms also run <b>1070/1077</b> disaster helplines.</div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="card card-pad stack">
              <h3>How to read this page</h3>
              <p className="small">
                Every probability is the modelled chance that the hazard occurs in the district in a given year. The class colours follow the
                red-zone convention used across TeraShield.
              </p>
              <div className="stack" style={{ gap: 6 }}>
                {ZONES.map((z) => (
                  <div key={z} className="row small" style={{ gap: 8, flexWrap: "nowrap" }}>
                    <span className="dot" style={{ background: ZONE_COLOR[z], width: 14, height: 14, borderRadius: 3 }} />
                    <b style={{ width: 82 }}>{{ RED: "Very high", ORANGE: "High", YELLOW: "Moderate", GREEN: "Low" }[z]}</b>
                    <span className="muted">
                      {z === "RED" ? `≥ ${HAZARD_CUTS.red}% single hazard · ≥ ${ZONE_CUTS.red.toFixed(0)}% multi` : z === "ORANGE" ? `≥ ${HAZARD_CUTS.orange}% · ≥ ${ZONE_CUTS.orange.toFixed(0)}%` : z === "YELLOW" ? `≥ ${HAZARD_CUTS.yellow}% · ≥ ${ZONE_CUTS.yellow.toFixed(0)}%` : "below"}
                    </span>
                  </div>
                ))}
              </div>
              <Provenance title="Data sources & limits">
                <ul className="plain">
                  <li>Rain and temperature: NASA POWER (MERRA-2) daily, 2014–2023</li>
                  <li>Terrain: SRTM via Open-Meteo, sampled ±13 km around each district centre</li>
                  <li>Cyclones: NOAA IBTrACS, 1990–2023; landslides: NASA Global Landslide Catalog</li>
                  <li>Rivers and coast: Natural Earth 10 m; population: Census of India 2011</li>
                  <li>District-scale estimates — they rank districts, they do not replace local surveys.</li>
                </ul>
              </Provenance>
              <p className="tiny muted">Pick a hazard above for its definition, drivers, precautions and the agencies that issue warnings.</p>
            </div>
          )}
          {!info && (
            <div className="card card-pad stack">
              <h3>What makes TeraShield different</h3>
              <ul className="plain small">
                <li><b>Dynamic red zones.</b> The annual map is re-scored every 45 minutes from the live 72-hour forecast — zones move with the weather.</li>
                <li><b>Hazard-aware evacuation routing.</b> Real road routes are scored against forecast rain and terrain, so a road that will flood or slip is priced in before people are sent down it.</li>
                <li><b>Multi-objective relocation.</b> Safety, road, capacity, services, cost and community are traded off with adjustable weights; Pareto-optimal sites are flagged.</li>
                <li><b>Three-phase logic.</b> Predicted, imminent and active-event modes change the priorities, and blocked roads trigger instant re-optimisation.</li>
                <li><b>Explainable and honest.</b> Every score shows its factors, and every variable states whether it is live, Census, computed or still needs survey data.</li>
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
