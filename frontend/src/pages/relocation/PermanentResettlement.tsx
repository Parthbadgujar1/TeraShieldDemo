import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BASEMAPS, type Basemap } from "../../components/IndiaMap";
import PilotMap, { LAND_COLOR } from "../../components/PilotMap";
import { Bar, ErrorBox, Loading, Provenance } from "../../components/ui";
import { loadPilot, useDataset } from "../../lib/data";
import { googleDirections, googlePlace, googleStreetView } from "../../lib/geo";
import { append, loadRegister, saveRegister, unitStates } from "../../lib/lifecycle";
import { LAND_INFO, RESETTLEMENT, householdsOf, landHorizon, recommend, relocateBefore, siteOptions, timeline } from "../../lib/permanent";
import { reasonText } from "../../lib/plan";
import { RED_ZONE_DEF, TIER_COLOR, TIER_LABEL, ZONES, ZONE_COLOR, compact, lakh } from "../../lib/risk";
import type { Pilot, PilotVillage, Zone } from "../../lib/types";

const tag = (s: string) => (s === "VALIDATED" ? "osm" : s === "PARTIAL" ? "derived" : "gap");

export default function PermanentResettlement() {
  const { data } = useDataset();
  const navigate = useNavigate();
  const [pilot, setPilot] = useState<Pilot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [base, setBase] = useState<Basemap>("terrain");
  const [layers, setLayers] = useState({ red: true, orange: true, villages: true, sites: false, events: true });
  const [zoneF, setZoneF] = useState<Set<Zone>>(new Set(["RED", "ORANGE"]));
  const [q, setQ] = useState("");
  const [vid, setVid] = useState<number | null>(null);
  const [sid, setSid] = useState<number | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const [reach, setReach] = useState<number>(RESETTLEMENT.maxReachKm);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { loadPilot().then(setPilot).catch((e) => setErr(String(e.message || e))); }, []);

  const villages = useMemo(() => (pilot ? [...pilot.villages].sort((a, b) => b.score - a.score) : []), [pilot]);
  const list = useMemo(
    () => villages.filter((v) => zoneF.has(v.zone) && (!q || v.name.toLowerCase().includes(q.toLowerCase()))).slice(0, 120),
    [villages, zoneF, q],
  );
  const v: PilotVillage | null = pilot && vid != null ? pilot.villages.find((x) => x.id === vid) ?? null : null;

  const opts = useMemo(() => (pilot && v ? siteOptions(v, pilot, reach) : []), [pilot, v, reach]);
  const rec = useMemo(() => recommend(opts), [opts]);
  const district = data && pilot ? data.byId.get(pilot.district.id) ?? null : null;
  const fra = (district?.c.scst ?? 0) >= 0.1;

  if (err) return <ErrorBox text={`Could not load the pilot dataset: ${err}`} />;
  if (!pilot) return <Loading text="Loading the Wayanad habitation-level pilot…" />;

  const S = pilot.summary;
  const pickVillage = (id: number) => { setVid(id); setSid(null); setFitKey((k) => k + 1); setMsg(null); };
  const primary = rec.primary;
  const tl = primary ? timeline(primary, { fra }) : [];
  const months = tl.length ? Math.max(...tl.map((t) => t.end)) : 0;
  const rb = primary ? relocateBefore(pilot.district.state, months) : null;
  const bestRaw = opts.length ? [...opts].sort((a, b) => b.score - a.score)[0] : null;
  const selSite = sid != null ? opts.find((o) => o.site.id === sid) ?? null : null;

  const register = () => {
    if (!v) return;
    const chain = loadRegister();
    const res = append(chain, {
      unit: `wayanad-${v.id}`, name: v.name, kind: "create", zone: v.zone,
      evidenceKind: "", evidence: "Screened by the habitation-level terrain model", approver: "",
      snapshot: { slope_max: v.slope_max, hand: v.hand, red_f: v.red_f, pop: v.pop, buildings: v.bld, priority: v.score, dem: "Terrarium z12 37 m", district_tier: district?.zone ?? null },
    });
    if (res.error) setMsg(res.error);
    else { saveRegister(res.chain); setMsg(`${v.name} added to the Zone Register (entry ${res.chain.length}).`); }
  };
  const inRegister = v ? unitStates(loadRegister()).has(`wayanad-${v.id}`) : false;

  const toggle = (k: keyof typeof layers) => setLayers({ ...layers, [k]: !layers[k] });
  const z = (zn: Zone) => setZoneF((s) => { const n = new Set(s); if (n.has(zn)) { if (n.size > 1) n.delete(zn); } else n.add(zn); return n; });

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="notice info small">
        <b>Permanent resettlement is not evacuation.</b> This track plans a planned move that takes months to years — land, approvals, livelihood, housing — for a habitation
        whose land is unsuitable for permanent habitation. {RED_ZONE_DEF} Pilot district: <b>{pilot.district.name}, {pilot.district.state}</b>; the national map stays the screening layer.
      </div>

      <div className="grid g4">
        <div className="stat red"><b>{S.villages.RED}</b><span>RED habitations of {pilot.villages.length} mapped</span></div>
        <div className="stat orange"><b>{S.villages.ORANGE}</b><span>ORANGE habitations</span></div>
        <div className="stat"><b>{compact(S.pop_red + S.pop_orange)}</b><span>people on red/orange terrain (est.) · {compact(S.pop_red)} on red</span></div>
        <div className="stat"><b>{lakh(S.buildings_red + S.buildings_orange)}</b><span>OSM-mapped buildings on red/orange terrain</span></div>
      </div>

      <div className="grid g-side" style={{ alignItems: "start" }}>
        <div className="card" style={{ minWidth: 0 }}>
          <div className="card-head">
            <h3>Red zones below village level</h3>
            <div className="seg" role="group" aria-label="Base map">
              {(["light", "street", "terrain", "satellite"] as Basemap[]).map((b) => <button key={b} className={base === b ? "on" : ""} onClick={() => setBase(b)}>{BASEMAPS[b].label}</button>)}
            </div>
          </div>
          <div className="chips" style={{ padding: "8px 14px" }}>
            <button className={`chip${layers.red ? " on" : ""}`} onClick={() => toggle("red")}><span className="legend-dot" style={{ background: ZONE_COLOR.RED }} />Red terrain</button>
            <button className={`chip${layers.orange ? " on" : ""}`} onClick={() => toggle("orange")}><span className="legend-dot" style={{ background: ZONE_COLOR.ORANGE }} />Orange terrain</button>
            <button className={`chip${layers.villages ? " on" : ""}`} onClick={() => toggle("villages")}>Habitations</button>
            <button className={`chip${layers.sites ? " on" : ""}`} onClick={() => toggle("sites")}>Candidate sites</button>
            <button className={`chip${layers.events ? " on" : ""}`} onClick={() => toggle("events")}>Catalogued landslides</button>
          </div>
          <div className="rmap-wrap" style={{ height: 560 }}>
            <PilotMap pilot={pilot} base={base} layers={layers} villageId={vid} siteId={sid} highlightSites={[rec.primary?.site.id, rec.secondary?.site.id].filter((x): x is number => x != null)} onVillage={pickVillage} onSite={setSid} fitKey={fitKey} />
          </div>
          <div className="card-pad tiny muted">
            {ZONES.slice(0, 2).map((zn) => <span key={zn}><span className="legend-dot" style={{ background: ZONE_COLOR[zn] }} />{zn} </span>)}
            habitation dots are coloured by their own zone and sized by estimated population. Site dots use the land-status colours:
            {(["UNKNOWN", "COMMON", "BUILT", "PRIVATE_AGRI", "FOREST", "PROTECTED"] as const).map((k) => <span key={k}><span className="legend-dot" style={{ background: LAND_COLOR[k] }} />{k.replace("_", " ").toLowerCase()} </span>)}
          </div>
        </div>

        <aside className="stack info-panel" style={{ top: 62 }}>
          <div className="card">
            <div className="card-head"><h3>Habitations, ranked</h3><span className="tiny muted">{list.length} shown</span></div>
            <div className="card-pad stack" style={{ gap: 8 }}>
              <div className="chips">
                {ZONES.map((zn) => <button key={zn} className={`chip zone-chip${zoneF.has(zn) ? " on" : ""}`} style={zoneF.has(zn) ? { background: ZONE_COLOR[zn], borderColor: ZONE_COLOR[zn], color: zn === "YELLOW" ? "#3b2c00" : "#fff" } : undefined} onClick={() => z(zn)}>{zn} · {S.villages[zn]}</button>)}
              </div>
              <input type="search" placeholder="Search habitation…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search habitation" />
            </div>
            <div className="table-wrap" style={{ border: 0, borderRadius: 0, maxHeight: 360 }}>
              <table className="t">
                <thead><tr><th>Habitation</th><th>Horizon</th><th className="r">People</th></tr></thead>
                <tbody>
                  {list.map((x) => (
                    <tr key={x.id} className={`click${vid === x.id ? " sel" : ""}`} onClick={() => pickVillage(x.id)}>
                      <td><span className="dot" style={{ background: ZONE_COLOR[x.zone], marginRight: 6 }} /><b>{x.name}</b><div className="tiny muted">score {x.score.toFixed(0)} · {x.reasons.slice(0, 1).map(reasonText).join("")}</div></td>
                      <td><span className="chip static" style={{ background: TIER_COLOR[x.tier], color: "#fff", borderColor: TIER_COLOR[x.tier], fontSize: "0.7rem", padding: "1px 7px" }}>{x.tier === "monitor" ? "Monitor" : TIER_LABEL[x.tier].split(" (")[0]}</span></td>
                      <td className="r">{lakh(x.pop)}</td>
                    </tr>
                  ))}
                  {list.length === 0 && <tr><td colSpan={3} className="muted small">No habitation matches these filters.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card card-pad stack" style={{ gap: 8 }}>
            <h3>Reality check on known events</h3>
            <p className="tiny muted">Settlements named in reports of the 30 July 2024 Mundakkai–Chooralmala landslides that exist as named places in OpenStreetMap (Mundakkai and Punchirimattam are not mapped as places), and how this terrain model classified them from terrain alone:</p>
            <ul className="plain small">
              {pilot.checks.map((c) => <li key={c.name}><span className="dot" style={{ background: ZONE_COLOR[c.zone], marginRight: 6 }} /><b>{c.name}</b> → {c.zone}{c.reasons.length ? ` (${c.reasons.map(reasonText).join("; ")})` : ""}</li>)}
            </ul>
            <p className="tiny muted">
              {pilot.checks.filter((c) => c.zone === "RED" || c.zone === "ORANGE").length} of {pilot.checks.length} were flagged RED/ORANGE — a terrain-only screen with no lithology or rainfall-threshold data will miss some, which is why the field verification stage exists.
              {" "}{S.events_in_red_orange} of {S.events} NASA-catalogued landslides inside the district fall on red/orange terrain (too few for statistics).
            </p>
          </div>
        </aside>
      </div>

      {v && (
        <div className="card" style={{ borderTop: `4px solid ${ZONE_COLOR[v.zone]}` }}>
          <div className="card-head">
            <h3>{v.name}</h3>
            <span className={`zone ${v.zone}`}>{v.zone} habitation</span>
            <span className="chip static" style={{ background: TIER_COLOR[v.tier], color: "#fff", borderColor: TIER_COLOR[v.tier] }}>{TIER_LABEL[v.tier]}</span>
            <button className="btn sm saffron" onClick={register} disabled={inRegister}>{inRegister ? "In Zone Register ✓" : "Add to Zone Register"}</button>
            <a className="btn sm ghost" href={googlePlace(v)} target="_blank" rel="noreferrer">Google Maps ↗</a>
            <a className="btn sm ghost" href={googleStreetView(v)} target="_blank" rel="noreferrer">Street View ↗</a>
          </div>
          {msg && <div className="notice info small" style={{ margin: "10px 14px 0" }}>{msg}</div>}
          <div className="card-pad grid g3">
            <div className="stack" style={{ gap: 8 }}>
              <div className="label">Why this habitation is {v.zone}</div>
              <ul className="plain small">
                {v.reasons.length ? v.reasons.map((r) => <li key={r}>{reasonText(r)}</li>) : <li>No terrain trigger within 150 m; classification rests on the surrounding terrain mix.</li>}
                <li>Elevation {v.elev} m · slope here {v.slope}° (steepest within 150 m: {v.slope_max}°) · {v.hand} m above the nearest mapped stream</li>
                <li>{(v.red_f * 100).toFixed(0)}% red and {(v.org_f * 100).toFixed(0)}% orange terrain within 150 m</li>
              </ul>
              <dl className="kv">
                <dt>People (WorldPop, apportioned)</dt><dd>{lakh(v.pop)} (≈ {lakh(householdsOf(v, pilot))} households)</dd>
                <dt>OSM-mapped buildings</dt><dd>{lakh(v.bld)} ({v.bld_red} red, {v.bld_org} orange)</dd>
                <dt>People on red / orange terrain</dt><dd>{lakh(v.pop_red)} / {lakh(v.pop_org)}</dd>
                <dt>Catalogued landslides ≤ 5 km</dt><dd>{v.ev}{v.ev_year ? ` (latest ${v.ev_year})` : ""}</dd>
                <dt>Priority score</dt><dd><b>{v.score.toFixed(0)}</b>/100 — {TIER_LABEL[v.tier]}</dd>
              </dl>
              <p className="tiny muted">Population is WorldPop 2020 (1 km) shared equally among the OSM buildings in each cell; unmapped buildings mean a village can be under-counted. Vulnerability and disaster history use the district proxy until a survey supplies habitation values.</p>
            </div>

            <div className="stack" style={{ gap: 8 }}>
              <div className="label">Receiving site — one village, one site</div>
              {!primary && <div className="notice err small">No eligible site within {reach} km after hard rejects. Widen the reach or survey for land.</div>}
              {primary && (
                <>
                  <div className="notice info small">
                    <b>Site {primary.site.id}</b> · {primary.site.usable} ha usable{primary.site.area > primary.site.usable ? ` of ${primary.site.area} contiguous` : ""} · {primary.distKm.toFixed(1)} km from {v.name} · {LAND_INFO[primary.site.land].label}
                    <div className="tiny" style={{ marginTop: 4 }}>{landHorizon(primary.site.land)} · {primary.site.risk_m} m from red/orange terrain · slope {primary.site.slope}° · {primary.site.hand} m above drainage</div>
                  </div>
                  <div className="label">Capacity = min(space, water, access)</div>
                  <div className={`notice ${primary.capacity.covers ? "info" : "warn"} small`}>
                    {primary.capacity.covers ? "✓ " : "⚠ "}holds <b>{lakh(primary.capacity.hh)}</b> of {lakh(primary.hh)} households · binding constraint: <b>{primary.capacity.bind}</b>
                    {!primary.capacity.covers && <> · shortfall {lakh(primary.capacity.shortfall)} households{rec.secondary ? <>; a second site {rec.secondary.site.id} within 5 km ({rec.secondary.site.area} ha) can take the rest — split by ward only if unavoidable</> : "; no second site within 5 km"}</>}
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    {Object.entries(primary.capacity.status).map(([k, s]) => <span key={k} className={`tag ${tag(s)}`} title={s}>{k}: {s.toLowerCase()}</span>)}
                  </div>
                  <div className="label">Relocation durability — will families stay?</div>
                  <div className="stack" style={{ gap: 4 }}>
                    {([["Livelihood reach", primary.durability.reach], ["Services (school / health)", primary.durability.services], ["Land-tenure ease", primary.durability.tenure], ["Capacity coverage", primary.durability.capacity]] as const).map(([k, val]) => (
                      <div key={k}><div className="row small" style={{ justifyContent: "space-between" }}><span>{k}</span><b className="num">{(val * 100).toFixed(0)}</b></div><Bar value={val * 100} color={val > 0.66 ? "var(--good)" : val > 0.4 ? "var(--orange)" : "var(--red)"} /></div>
                    ))}
                    <div className="row small" style={{ justifyContent: "space-between" }}><b>Durability</b><b className="num">{(primary.durability.score * 100).toFixed(0)}/100</b></div>
                    <div className="row small" style={{ justifyContent: "space-between" }}><b>Site safety</b><b className="num">{(primary.safety * 100).toFixed(0)}/100</b></div>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <a className="btn sm" href={googleDirections(v, primary.site)} target="_blank" rel="noreferrer">Directions ↗</a>
                    <a className="btn sm ghost" href={googlePlace(primary.site)} target="_blank" rel="noreferrer">Site on Google Maps ↗</a>
                  </div>
                </>
              )}
              <div className="field">
                <label htmlFor="reach">Livelihood reach cap: {reach} km</label>
                <input id="reach" type="range" min={3} max={20} value={reach} onChange={(e) => setReach(Number(e.target.value))} />
                <span className="tiny muted">Farmland, market and the same Gram Panchayat should stay reachable, or families drift back.</span>
              </div>
            </div>

            <div className="stack" style={{ gap: 8 }}>
              <div className="label">Timeline — months from the decision</div>
              {tl.map((t) => (
                <div key={t.key} title={t.note}>
                  <div className="row small" style={{ justifyContent: "space-between" }}><span>{t.label}</span><span className="muted tiny">{t.start}–{t.end} mo</span></div>
                  <div className="gantt"><i style={{ left: `${(t.start / (months + 2)) * 100}%`, width: `${((t.end - t.start) / (months + 2)) * 100}%` }} /></div>
                </div>
              ))}
              {primary && rb && (
                <div className={`notice ${rb.catchesNext ? "info" : "warn"} small`}>
                  <b>About {months} months</b> to move-in. {rb.catchesNext
                    ? <>The next monsoon (~{rb.nextOnset.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}) can still be beaten if work starts now.</>
                    : <>The next monsoon (~{rb.nextOnset.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}, in {rb.monthsToNext.toFixed(1)} months) cannot be beaten. The first monsoon a move can realistically finish before is <b>~{rb.onset.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</b>; until then keep the evacuation plan, warning triggers and re-entry watch live.</>}
                  {fra && <> Scheduled Tribe share here is {((district?.c.scst ?? 0) * 100).toFixed(0)}%: Forest Rights Act / Gram Sabha consent should be checked.</>}
                </div>
              )}
              <p className="tiny muted">Onset dates are IMD normals (approximate). Hill states also have a construction window (roughly Oct–May).</p>
            </div>
          </div>

          <div className="card-pad" style={{ borderTop: "1px solid var(--line)" }}>
            <div className="label">Candidate sites within reach — safety is a veto, not a weight</div>
            {bestRaw && bestRaw.rejects.length > 0 && (
              <div className="notice warn small" style={{ margin: "6px 0" }}>
                The highest-scoring site on raw numbers, <b>Site {bestRaw.site.id}</b> ({bestRaw.site.usable} ha usable, {bestRaw.site.land.replace("_", " ").toLowerCase()}), is <b>rejected</b>: {bestRaw.rejects.join("; ")}. {bestRaw.land.route === "forest" ? "Approval needed: " + bestRaw.land.approval : ""}
              </div>
            )}
            <div className="table-wrap">
              <table className="t">
                <thead><tr><th>Site</th><th>Land status (proxy)</th><th className="r">Usable ha</th><th className="r">Km</th><th className="r">Safety</th><th className="r">Durability</th><th className="r">Holds hh</th><th>Approval route / time</th><th>Verdict</th></tr></thead>
                <tbody>
                  {opts.slice(0, 12).map((o) => (
                    <tr key={o.site.id} className={`click${(selSite?.site.id ?? primary?.site.id) === o.site.id ? " sel" : ""}`} onClick={() => setSid(o.site.id)}>
                      <td><b>#{o.site.id}</b></td>
                      <td><span className="legend-dot" style={{ background: LAND_COLOR[o.site.land], margin: "0 5px 0 0" }} />{o.site.land.replace("_", " ").toLowerCase()}</td>
                      <td className="r">{o.site.usable}</td><td className="r">{o.distKm.toFixed(1)}</td>
                      <td className="r">{(o.safety * 100).toFixed(0)}</td><td className="r">{(o.durability.score * 100).toFixed(0)}</td><td className="r">{lakh(o.capacity.hh)}</td>
                      <td className="small">{landHorizon(o.site.land)} · ~{o.months} mo</td>
                      <td>{o.rejects.length ? <span className="tag gap" title={o.rejects.join("; ")}>Rejected</span> : o === primary ? <span className="tag osm">Recommended</span> : <span className="tag derived">Eligible</span>}</td>
                    </tr>
                  ))}
                  {opts.length === 0 && <tr><td colSpan={9} className="muted small">No mapped candidate site within reach.</td></tr>}
                </tbody>
              </table>
            </div>
            {(selSite ?? primary) && (
              <p className="small" style={{ marginTop: 8 }}>
                <b>Site {(selSite ?? primary)!.site.id}:</b> {(selSite ?? primary)!.land.approval}
                {(selSite ?? primary)!.rejects.length > 0 && <> <b>Rejected because</b> {(selSite ?? primary)!.rejects.join("; ")}.</>}
              </p>
            )}
          </div>
        </div>
      )}
      {!v && <div className="card card-pad muted">Click a habitation on the map or in the list to see why it is a red zone, where it could move, what approvals that needs and how long it takes.</div>}

      <Provenance title="Method, sources and limits of the pilot">
        <ul className="plain small">
          <li><b>Terrain:</b> {pilot.method.dem}; slope from a 3×3-smoothed gradient. Class rules — RED: {pilot.method.rules.RED}. ORANGE: {pilot.method.rules.ORANGE}. YELLOW: {pilot.method.rules.YELLOW}.</li>
          <li><b>Habitation rule:</b> {pilot.method.village_rule}. <b>Site rule:</b> {pilot.method.site_rule}.</li>
          <li><b>Population:</b> {pilot.method.population}. <b>Land status:</b> {pilot.method.land_proxy}.</li>
          <li><b>Not modelled:</b> {pilot.method.not_modelled.join(", ")}. A terrain screen finds where slopes and streams put settlements at risk; a geotechnical survey decides.</li>
          <li>Housing assumption: {pilot.method.hh_per_ha} households per usable hectare; capacity = min(space, water, access), water/sanitation marked partial or unvalidated until surveyed.</li>
          <li>Built {pilot.generated} by <code>data-pipeline/build_pilot.py</code>; add a district by running it with another name and adding its slug to <code>PILOT_SLUGS</code>.</li>
        </ul>
      </Provenance>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn ghost sm" onClick={() => navigate("/plan")}>Open the State Action Plan →</button>
        <button className="btn ghost sm" onClick={() => navigate("/validation")}>Zone Register &amp; Data Lab →</button>
      </div>
    </div>
  );
}
