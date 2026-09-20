import { Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { SachetPanel } from "../../components/AlertControls";
import IndiaMap from "../../components/IndiaMap";
import { Bar, DistrictPicker, Stat, ZoneBadge } from "../../components/ui";
import { googlePlace } from "../../lib/geo";
import { NATIONAL_NUMBERS } from "../../lib/ops";
import { HAZARDS, HAZARD_BY_KEY, TIER_COLOR, TIER_LABEL, ZONES, ZONE_COLOR, compact, lakh, type Layer } from "../../lib/risk";
import { useEmergency } from "./context";

const ALL_ZONES = new Set(ZONES);

const SOURCES = [
  ["IMD — weather warnings", "https://mausam.imd.gov.in"],
  ["CWC — flood forecasts", "https://ffs.india-water.gov.in"],
  ["NDMA Sachet — CAP alerts", "https://sachet.ndma.gov.in"],
  ["NDRF", "https://ndrf.gov.in"],
];

/** The operations picture: hazard map, rescue priority, district brief and official alerts. */
export default function Operations() {
  const c = useEmergency();
  const navigate = useNavigate();
  const { data, mode, liveState, stateF, setStateF, hazard, setHazard, selId, setSelId, rows, counts, redPop, redExposed, escalated } = c;
  const live = liveState.live;
  const top = rows.slice(0, 15);

  return (
    <>
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Stat value={counts.RED} label="very-high-hazard districts" tone="red" />
        <Stat value={counts.ORANGE} label="high-hazard districts" tone="orange" />
        <Stat value={compact(redPop)} label={`people living in very-high-hazard districts · ${compact(redExposed)} exposed (screening)`} />
        <Stat value={live ? escalated : "—"} label={live ? "alerts raised by the forecast" : "switch to 72 h alert to see escalations"} />
      </div>

      <div className="card card-pad filters" style={{ marginBottom: 14 }}>
        <DistrictPicker states={data.states} byState={data.byState} allowAllStates allowAllDistricts stateValue={stateF} districtId={selId} onState={(s) => { setStateF(s); setSelId(null); }} onDistrict={setSelId} />
        <div className="field">
          <span className="label">Hazard focus</span>
          <div className="chips">
            <button className={`chip${hazard === "all" ? " on" : ""}`} onClick={() => setHazard("all" as Layer)}>All</button>
            {HAZARDS.map((h) => <button key={h.key} className={`chip${hazard === h.key ? " on" : ""}`} onClick={() => setHazard(h.key)}>{h.icon} {h.short}</button>)}
          </div>
        </div>
      </div>

      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="card">
          <div className="card-head"><h3>Hazard map</h3><span className="tiny muted">click a district to prioritise it</span></div>
          <div className="em-map">
            <IndiaMap districts={data.districts} layer={hazard} live={live} zoneOn={ALL_ZONES} stateFilter={stateF} selectedId={selId} onSelect={setSelId} base="light" />
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Rescue priority</h3><span className="tiny muted">hazard × (½ exposure + ½ vulnerability)</span></div>
          <div className="table-wrap" style={{ border: 0, borderRadius: 0, maxHeight: 470 }}>
            <table className="t">
              <thead><tr><th>#</th><th>District</th><th>Tier</th><th className="r">Risk</th><th>Threat</th><th className="r">Exposed</th><th style={{ minWidth: 90 }}>Priority</th><th /></tr></thead>
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
                <div className="label">72 h alert level / annual baseline</div>
                {HAZARDS.map((h) => (
                  <div key={h.key} className="row small" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                    <span>{h.icon} {h.label}</span><b className="num">{(lr?.P[h.key] ?? d.P[h.key]).toFixed(0)}% <span className="muted tiny">/ {d.P[h.key].toFixed(0)}%</span></b>
                  </div>
                ))}
              </div>
              <dl className="kv" style={{ alignContent: "start" }}>
                <dt>Population</dt><dd>{lakh(d.pop)}</dd><dt>Exposed</dt><dd>{lakh(d.expo.pop)}</dd><dt>Households</dt><dd>{lakh(d.hh)}</dd>
                <dt>Vulnerability</dt><dd>{d.vband}</dd><dt>Fallback receiving district</dt><dd>{d.reloc.safe_km <= 100 ? `${data.byId.get(d.reloc.safe)?.n} · ${d.reloc.safe_km} km` : "none within 100 km — resettle within the district"}</dd>
              </dl>
              <div className="small muted">Use the evacuation planner to choose a destination, check road exposure against the forecast and simulate a blocked route. Log what you find in the Incident log tab.</div>
            </div>
          </div>
        );
      })()}

      <div className="grid g2" style={{ marginTop: 14 }}>
        <div className="card card-pad stack" style={{ gap: 8 }}>
          <h3>Official alerts (NDMA SACHET)</h3>
          <SachetPanel districts={data.byId} onPick={setSelId} stateFilter={stateF} limit={4} />
        </div>
        <div className="card card-pad stack" style={{ gap: 8 }}>
          <h3>Official warning sources</h3>
          {SOURCES.map(([l, u]) => <a key={u} href={u} target="_blank" rel="noreferrer" className="small">{l} ↗</a>)}
          <h3 style={{ marginTop: 6 }}>Emergency numbers</h3>
          <dl className="kv">{NATIONAL_NUMBERS.map(([n, l]) => <Fragment key={n}><dt>{l}</dt><dd>{n}</dd></Fragment>)}</dl>
          <p className="tiny muted">TeraShield outlooks are decision support built on open data. They do not replace official IMD, CWC or state warnings. {mode === "live" ? "Baseline tiers never fall on a dry forecast." : ""}</p>
        </div>
      </div>
    </>
  );
}
