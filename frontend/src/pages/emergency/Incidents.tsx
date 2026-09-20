import { useMemo, useState } from "react";
import { DistrictPicker, Stat } from "../../components/ui";
import { download } from "../../lib/plan";
import { INCIDENT_KIND, KEYS, csvOf, uid, useStore, type Incident, type IncidentKind } from "../../lib/ops";
import { useEmergency } from "./context";

const SEV_LABEL = { 1: "Minor", 2: "Moderate", 3: "Serious", 4: "Critical" } as const;
const SEV_COLOR = { 1: "#9aa7b5", 2: "#f2c230", 3: "#f57c00", 4: "#d32f2f" } as const;

/** A time-stamped log of what is actually happening on the ground, entered by the control room and responders. */
export default function Incidents() {
  const { data, stateF, setStateF, selId, setSelId, user } = useEmergency();
  const [items, setItems] = useStore<Incident>(KEYS.incidents);
  const [kind, setKind] = useState<IncidentKind>("road_blocked");
  const [sev, setSev] = useState<1 | 2 | 3 | 4>(2);
  const [text, setText] = useState("");
  const [where, setWhere] = useState<{ lat: number | null; lon: number | null }>({ lat: null, lon: null });
  const [show, setShow] = useState<"open" | "all">("open");
  const [msg, setMsg] = useState<string | null>(null);

  const d = selId != null ? data.byId.get(selId) ?? null : null;
  const list = useMemo(
    () => items.filter((x) => (show === "all" || x.status === "open") && (selId != null ? x.districtId === selId : stateF ? x.state === stateF : true))
      .sort((a, b) => Number(b.status === "open") - Number(a.status === "open") || b.severity - a.severity || b.ts.localeCompare(a.ts)),
    [items, show, selId, stateF],
  );
  const open = items.filter((x) => x.status === "open");

  const locate = () => {
    if (!navigator.geolocation) { setMsg("This browser cannot give a location."); return; }
    navigator.geolocation.getCurrentPosition((p) => setWhere({ lat: +p.coords.latitude.toFixed(5), lon: +p.coords.longitude.toFixed(5) }), () => setMsg("Location permission was denied or unavailable."), { enableHighAccuracy: true, timeout: 12000 });
  };
  const add = () => {
    if (!d) { setMsg("Choose the district the incident is in."); return; }
    if (!text.trim()) { setMsg("Describe the incident."); return; }
    setItems([{ id: uid("in"), ts: new Date().toISOString(), districtId: d.id, district: d.n, state: d.s, kind, severity: sev, text: text.trim(), status: "open", by: user, lat: where.lat, lon: where.lon }, ...items]);
    setText(""); setWhere({ lat: null, lon: null }); setMsg(null);
  };
  const toggle = (id: string) => setItems(items.map((x) => (x.id === id ? { ...x, status: x.status === "open" ? "closed" : "open", closedTs: x.status === "open" ? new Date().toISOString() : undefined } : x)));

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="notice info small">The incident log is the shared record of the response: what happened, where, how serious, who logged it and when it was closed. It feeds the situation report. In this demo it is stored in this browser.</div>

      <div className="grid g4">
        <Stat value={open.length} label="open incidents" tone={open.length ? "orange" : undefined} />
        <Stat value={open.filter((x) => x.severity >= 3).length} label="serious or critical" tone={open.some((x) => x.severity >= 3) ? "red" : undefined} />
        <Stat value={open.filter((x) => x.kind === "road_blocked").length} label="roads blocked (feed evacuation route choices)" />
        <Stat value={items.length - open.length} label="closed" />
      </div>

      <div className="card">
        <div className="card-head"><h3>Log an incident</h3></div>
        <div className="card-pad stack" style={{ gap: 10 }}>
          <div className="filters">
            <DistrictPicker states={data.states} byState={data.byState} allowAllStates allowAllDistricts stateValue={stateF} districtId={selId} onState={(s) => { setStateF(s); setSelId(null); }} onDistrict={setSelId} />
            <div className="field"><label htmlFor="ik">Type</label><select id="ik" value={kind} onChange={(e) => setKind(e.target.value as IncidentKind)}>{Object.entries(INCIDENT_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div className="field"><label htmlFor="is">Severity</label><select id="is" value={sev} onChange={(e) => setSev(Number(e.target.value) as 1 | 2 | 3 | 4)}>{([1, 2, 3, 4] as const).map((s) => <option key={s} value={s}>{s} · {SEV_LABEL[s]}</option>)}</select></div>
          </div>
          <div className="field"><label htmlFor="it">What happened, where</label><textarea id="it" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Landslide across NH-766 near Lakkidi, one lane open, JCB en route" style={{ width: "100%", padding: 8, border: "1px solid var(--line-strong)", borderRadius: "var(--radius-sm)", font: "inherit" }} /></div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="btn sm ghost" type="button" onClick={locate}>Use my location</button><span className="tiny muted">{where.lat != null ? `${where.lat}, ${where.lon}` : "optional"}</span>
            <button className="btn saffron" style={{ marginLeft: "auto" }} onClick={add}>Add to log</button>
          </div>
          {msg && <div className="notice warn small">{msg}</div>}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Log</h3>
          <div className="seg" role="group" aria-label="Filter"><button className={show === "open" ? "on" : ""} onClick={() => setShow("open")}>Open</button><button className={show === "all" ? "on" : ""} onClick={() => setShow("all")}>All</button></div>
          <button className="btn sm" style={{ marginLeft: "auto" }} disabled={!list.length} onClick={() => download("terashield-incident-log.csv", "text/csv", csvOf(list.map((x) => ({ time: x.ts, district: x.district, state: x.state, type: INCIDENT_KIND[x.kind], severity: x.severity, status: x.status, text: x.text, logged_by: x.by, lat: x.lat ?? "", lon: x.lon ?? "", closed: x.closedTs ?? "" }))))}>Export CSV</button>
        </div>
        <ul className="incidents">
          {list.map((x) => (
            <li key={x.id} style={{ borderLeftColor: SEV_COLOR[x.severity], opacity: x.status === "closed" ? 0.6 : 1 }}>
              <div className="row small" style={{ justifyContent: "space-between", gap: 8 }}>
                <span><b>{INCIDENT_KIND[x.kind]}</b> · <span style={{ color: SEV_COLOR[x.severity], fontWeight: 700 }}>{SEV_LABEL[x.severity]}</span> · {x.district}, {x.state}</span>
                <span className="tiny muted">{new Date(x.ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {x.by}</span>
              </div>
              <div className="small">{x.text}{x.lat != null && <> · <a href={`https://www.google.com/maps/search/?api=1&query=${x.lat},${x.lon}`} target="_blank" rel="noreferrer">map ↗</a></>}</div>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn sm ghost" onClick={() => toggle(x.id)}>{x.status === "open" ? "Mark closed" : "Reopen"}</button>
                <button className="btn sm ghost" onClick={() => setItems(items.filter((y) => y.id !== x.id))}>Delete</button>
              </div>
            </li>
          ))}
          {list.length === 0 && <li className="muted small" style={{ borderLeftColor: "transparent" }}>Nothing logged for this selection.</li>}
        </ul>
      </div>
    </div>
  );
}
