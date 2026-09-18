import { Fragment, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import IndiaMap from "../components/IndiaMap";
import { Bar, DistrictPicker, ErrorBox, Loading, Stat, ZoneBadge } from "../components/ui";
import { useDataset } from "../lib/data";
import { googlePlace } from "../lib/geo";
import { useLiveOutlook, useViewMode } from "../lib/useLive";
import { HAZARDS, HAZARD_BY_KEY, TIER_COLOR, TIER_LABEL, ZONES, ZONE_COLOR, compact, lakh, zoneRows, zoneSummary, type Layer } from "../lib/risk";

const ALL_ZONES = new Set(ZONES);

const CONTACTS = [
  ["112", "National emergency response (ERSS)"],
  ["108", "Ambulance"],
  ["101", "Fire"],
  ["100", "Police"],
  ["1070 / 1077", "State / district disaster control room"],
];

const SOURCES = [
  ["IMD — weather warnings", "https://mausam.imd.gov.in"],
  ["CWC — flood forecasts", "https://ffs.india-water.gov.in"],
  ["NDMA Sachet — CAP alerts", "https://sachet.ndma.gov.in"],
  ["NDRF", "https://ndrf.gov.in"],
];

export default function EmergencyPortal() {
  const { data, error } = useDataset();
  const navigate = useNavigate();
  const [mode, setMode] = useViewMode();
  const [stateF, setStateF] = useState("");
  const [hazard, setHazard] = useState<Layer>("all");
  const [selId, setSelId] = useState<number | null>(null);
  const { live, progress, stamp, failed } = useLiveOutlook(data, mode, setMode);

  // Same zone maths as the admin dashboard (lib/risk.ts) — the two portals cannot disagree.
  const all = useMemo(() => (data ? zoneRows(data.districts, hazard, live, stateF) : []), [data, hazard, live, stateF]);
  const rows = useMemo(
    () => all
      .map((r) => ({ ...r, dom: live?.get(r.d.id)?.dom ?? r.d.dom, priority: (r.value / 100) * (0.5 * (r.d.expo.idx / 100) + 0.5 * (r.d.vuln / 100)) * 100 }))
      .sort((a, b) => b.priority - a.priority),
    [all, live],
  );

  if (error) return <div className="page"><ErrorBox text={error} /></div>;
  if (!data) return <Loading text="Loading emergency data…" />;

  const { counts, redPop, redExposed, escalated } = zoneSummary(all);
  const top = rows.slice(0, 15);
  const loading = mode === "live" && progress !== null;

  return (
    <div className="page">
      <div className="em-banner">
        <div>
          <b>Emergency Response Team — operational view</b>
          <div className="small">
            {loading ? <><span className="spinner" /> Pulling the live 72-hour forecast for {data.districts.length} districts… {progress?.done}/{progress?.total}</>
              : live ? <>Live 72-hour outlook updated {stamp?.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · Open-Meteo forecast</>
                : <>Annual hazard probability — the same figures the state dashboard shows{failed ? " (live forecast unreachable)" : ""}</>}
          </div>
        </div>
        <div className="seg em-seg" role="group" aria-label="Time view">
          <button className={mode === "annual" ? "on" : ""} onClick={() => setMode("annual")}>Annual</button>
          <button className={mode === "live" ? "on" : ""} onClick={() => setMode("live")}>Live 72 h</button>
        </div>
        {live && <span className="live-pill"><span className="live-dot" /> LIVE</span>}
      </div>

      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Stat value={counts.RED} label="red-zone districts" tone="red" />
        <Stat value={counts.ORANGE} label="orange-zone districts" tone="orange" />
        <Stat value={compact(redPop)} label={`people in red-zone districts · ${compact(redExposed)} exposed`} />
        <Stat value={live ? escalated : "—"} label={live ? "escalated by the forecast" : "switch to Live 72 h to see escalations"} />
      </div>

      <div className="card card-pad filters" style={{ marginBottom: 14 }}>
        <DistrictPicker states={data.states} byState={data.byState} allowAllStates allowAllDistricts stateValue={stateF} districtId={selId} onState={(s) => { setStateF(s); setSelId(null); }} onDistrict={setSelId} />
        <div className="field">
          <span className="label">Hazard focus</span>
          <div className="chips">
            <button className={`chip${hazard === "all" ? " on" : ""}`} onClick={() => setHazard("all")}>All</button>
            {HAZARDS.map((h) => <button key={h.key} className={`chip${hazard === h.key ? " on" : ""}`} onClick={() => setHazard(h.key)}>{h.icon} {h.short}</button>)}
          </div>
        </div>
      </div>

      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="card">
          <div className="card-head"><h3>Live risk map</h3><span className="tiny muted">click a district to prioritise it</span></div>
          <div className="em-map">
            <IndiaMap districts={data.districts} layer={hazard} live={live} zoneOn={ALL_ZONES} stateFilter={stateF} selectedId={selId} onSelect={setSelId} base="light" />
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Rescue priority</h3><span className="tiny muted">live risk × (½ exposure + ½ vulnerability)</span></div>
          <div className="table-wrap" style={{ border: 0, borderRadius: 0, maxHeight: 470 }}>
            <table className="t">
              <thead><tr><th>#</th><th>District</th><th>Zone</th><th className="r">Risk</th><th>Threat</th><th className="r">Exposed</th><th style={{ minWidth: 90 }}>Priority</th><th /></tr></thead>
              <tbody>
                {top.map((r, i) => (
                  <tr key={r.d.id} className={`click${selId === r.d.id ? " sel" : ""}`} onClick={() => setSelId(r.d.id)}>
                    <td className="muted">{i + 1}</td>
                    <td><b>{r.d.n}</b><div className="tiny muted">{r.d.s}</div></td>
                    <td><ZoneBadge zone={r.zone} label={r.zone[0] + r.zone.slice(1).toLowerCase()} /></td>
                    <td className="r">{r.value.toFixed(0)}%{r.escalated && <span className="up" title="Escalated by forecast"> ▲</span>}</td>
                    <td className="small">{HAZARD_BY_KEY[r.dom].icon} {HAZARD_BY_KEY[r.dom].label}</td>
                    <td className="r">{compact(r.d.expo.pop)}</td>
                    <td><Bar value={r.priority} max={Math.max(...top.map((x) => x.priority), 1)} color={ZONE_COLOR[r.zone]} /></td>
                    <td><button className="btn sm" onClick={(e) => { e.stopPropagation(); navigate({ pathname: "/relocation", search: `?d=${r.d.id}` }); }}>Plan evacuation</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selId != null && data.byId.get(selId) && (() => {
        const d = data.byId.get(selId)!;
        const lr = live?.get(d.id);
        return (
          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-head"><h3>{d.n}, {d.s}</h3><ZoneBadge zone={lr?.zone ?? d.zone} />
              <span className="chip static" style={{ background: TIER_COLOR[d.reloc.tier], color: "#fff", borderColor: TIER_COLOR[d.reloc.tier] }}>{TIER_LABEL[d.reloc.tier]}</span>
              <button className="btn sm saffron" onClick={() => navigate({ pathname: "/relocation", search: `?d=${d.id}` })}>Open evacuation planner →</button>
              <a className="btn sm ghost" href={googlePlace(d)} target="_blank" rel="noreferrer">Google Maps ↗</a>
            </div>
            <div className="card-pad grid g3">
              <div className="stack" style={{ gap: 6 }}>
                <div className="label">Hazards now (72 h) vs. annual</div>
                {HAZARDS.map((h) => (
                  <div key={h.key} className="row small" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                    <span>{h.icon} {h.label}</span><b className="num">{(lr?.P[h.key] ?? d.P[h.key]).toFixed(0)}% <span className="muted tiny">/ {d.P[h.key].toFixed(0)}%</span></b>
                  </div>
                ))}
              </div>
              <dl className="kv" style={{ alignContent: "start" }}>
                <dt>Population</dt><dd>{lakh(d.pop)}</dd><dt>Exposed</dt><dd>{lakh(d.expo.pop)}</dd><dt>Households</dt><dd>{lakh(d.hh)}</dd>
                <dt>Vulnerability</dt><dd>{d.vband}</dd><dt>Nearest safe district</dt><dd>{data.byId.get(d.reloc.safe)?.n} · {d.reloc.safe_km} km</dd>
              </dl>
              <div className="small muted">Use the evacuation planner to choose a destination, check road exposure against the forecast and simulate a blocked route.</div>
            </div>
          </div>
        );
      })()}

      <div className="grid g2" style={{ marginTop: 14 }}>
        <div className="card card-pad stack" style={{ gap: 8 }}>
          <h3>Emergency numbers</h3>
          <dl className="kv">{CONTACTS.map(([n, l]) => <Fragment key={n}><dt>{l}</dt><dd>{n}</dd></Fragment>)}</dl>
        </div>
        <div className="card card-pad stack" style={{ gap: 8 }}>
          <h3>Official warning sources</h3>
          {SOURCES.map(([l, u]) => <a key={u} href={u} target="_blank" rel="noreferrer" className="small">{l} ↗</a>)}
          <p className="tiny muted">TeraShield outlooks are decision support built on open data. They do not replace official IMD, CWC or state warnings.</p>
        </div>
      </div>
    </div>
  );
}
