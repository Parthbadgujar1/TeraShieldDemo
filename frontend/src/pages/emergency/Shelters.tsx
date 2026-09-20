import { useEffect, useMemo, useState } from "react";
import { DistrictPicker, Stat } from "../../components/ui";
import { loadPilot } from "../../lib/data";
import { download } from "../../lib/plan";
import {
  KEYS, RESOURCE_TYPE, SHELTER_KIND, csvOf, shelterHeadroom, shelterSummary, uid, useStore,
  type Resource, type ResourceStatus, type ResourceType, type Shelter, type ShelterKind, type ShelterStatus,
} from "../../lib/ops";
import { compact, lakh } from "../../lib/risk";
import type { Pilot } from "../../lib/types";
import { useEmergency } from "./context";

const now = () => new Date().toISOString();

/** Shelter and resource registers. Nothing is pre-filled: numbers come from the people running the shelters. */
export default function Shelters() {
  const { data, stateF, setStateF, selId, setSelId } = useEmergency();
  const [shelters, setShelters] = useStore<Shelter>(KEYS.shelters);
  const [resources, setResources] = useStore<Resource>(KEYS.resources);
  const [pilot, setPilot] = useState<Pilot | null>(null);
  useEffect(() => { loadPilot().then(setPilot).catch(() => undefined); }, []);

  const d = selId != null ? data.byId.get(selId) ?? null : null;
  const inScope = (x: { districtId: number | null; state?: string }) => (selId != null ? x.districtId === selId : stateF ? x.state === stateF : true);
  const list = useMemo(() => shelters.filter((s) => inScope(s)), [shelters, selId, stateF]);
  const res = useMemo(() => resources.filter((r) => (selId != null ? r.districtId === selId : true)), [resources, selId]);
  const S = shelterSummary(list);

  // people who may need shelter: entered by the officer; for the pilot district a documented estimate is offered
  const [demand, setDemand] = useState<number | "">("");
  const pilotDemand = pilot && d && pilot.district.id === d.id ? pilot.summary.pop_red : null;
  const gap = demand === "" ? null : Number(demand) - S.headroom;

  // ---- add shelter
  const blank = { name: "", kind: "school" as ShelterKind, capacity: 200, occupied: 0, water: true, sanitation: true, power: false, contact: "", status: "standby" as ShelterStatus };
  const [f, setF] = useState(blank);
  const [where, setWhere] = useState<{ lat: number | null; lon: number | null }>({ lat: null, lon: null });
  const [msg, setMsg] = useState<string | null>(null);

  const locate = () => {
    if (!navigator.geolocation) { setMsg("This browser cannot give a location."); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => setWhere({ lat: +p.coords.latitude.toFixed(5), lon: +p.coords.longitude.toFixed(5) }),
      () => setMsg("Location permission was denied or unavailable."), { enableHighAccuracy: true, timeout: 12000 });
  };

  const add = () => {
    if (!d) { setMsg("Choose the district first."); return; }
    if (!f.name.trim()) { setMsg("Give the shelter a name."); return; }
    if (!(f.capacity > 0)) { setMsg("Capacity must be above zero."); return; }
    setShelters([{ id: uid("sh"), name: f.name.trim(), districtId: d.id, district: d.n, state: d.s, kind: f.kind, capacity: Math.round(f.capacity), occupied: Math.max(0, Math.round(f.occupied)), water: f.water, sanitation: f.sanitation, power: f.power, contact: f.contact.trim(), lat: where.lat, lon: where.lon, status: f.status, updated: now() }, ...shelters]);
    setF(blank); setWhere({ lat: null, lon: null }); setMsg(null);
  };
  const patch = (id: string, p: Partial<Shelter>) => setShelters(shelters.map((s) => (s.id === id ? { ...s, ...p, updated: now() } : s)));

  // ---- resources
  const [rf, setRf] = useState<{ type: ResourceType; label: string; count: number; status: ResourceStatus; note: string }>({ type: "bus", label: "", count: 1, status: "available", note: "" });
  const addRes = () => {
    if (!(rf.count > 0)) { setMsg("Resource count must be above zero."); return; }
    setResources([{ id: uid("rs"), type: rf.type, label: rf.label.trim(), count: Math.round(rf.count), districtId: d?.id ?? null, district: d?.n ?? "", status: rf.status, note: rf.note.trim(), updated: now() }, ...resources]);
    setRf({ ...rf, label: "", note: "", count: 1 }); setMsg(null);
  };
  const resTotals = (["available", "deployed", "unavailable"] as ResourceStatus[]).map((st) => [st, res.filter((r) => r.status === st).reduce((a, r) => a + r.count, 0)] as const);

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="notice info small">
        <b>Registers, not simulations.</b> Shelter and resource entries are typed in by the control room and shelter managers; nothing is estimated for you. A shelter without water <i>and</i> sanitation counts at half capacity
        (Sphere-style minimum), and capacity beyond that is flagged. In this demo the registers are stored in this browser — production would use a shared server database.
      </div>

      <div className="card card-pad filters">
        <DistrictPicker states={data.states} byState={data.byState} allowAllStates allowAllDistricts stateValue={stateF} districtId={selId} onState={(s) => { setStateF(s); setSelId(null); }} onDistrict={setSelId} />
        <span className="tiny muted">{d ? `Showing ${d.n}` : stateF ? `Showing ${stateF}` : "Showing everything registered"} · choose a district to add entries</span>
      </div>

      <div className="grid g4">
        <Stat value={S.count} label="shelters registered" />
        <Stat value={lakh(S.capacity)} label={`total capacity · ${lakh(S.occupied)} occupied`} />
        <Stat value={lakh(S.headroom)} label="usable headroom (water + sanitation rule)" tone={S.headroom === 0 && S.count > 0 ? "red" : undefined} />
        <Stat value={S.lacking + S.overloaded} label={`need attention · ${S.lacking} lack water/sanitation · ${S.overloaded} over capacity`} tone={S.lacking + S.overloaded ? "orange" : undefined} />
      </div>

      <div className="card card-pad stack" style={{ gap: 8 }}>
        <h3>Carrying-capacity check</h3>
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <div className="field" style={{ minWidth: 220 }}>
            <label htmlFor="demand">People who may need shelter</label>
            <input id="demand" type="number" min={0} value={demand} placeholder="enter a number" onChange={(e) => setDemand(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))} />
          </div>
          {pilotDemand != null && <button className="btn sm ghost" onClick={() => setDemand(pilotDemand)}>Use pilot estimate: {compact(pilotDemand)} people on red terrain</button>}
        </div>
        {gap == null ? <span className="small muted">Enter the number of people expected to need shelter (from a survey, evacuation plan or the pilot estimate) to see the gap.</span>
          : <div className={`notice ${gap > 0 ? "warn" : "info"} small`}>
            {gap > 0 ? <>⚠ Shortfall of <b>{lakh(gap)}</b> places: usable headroom {lakh(S.headroom)} vs {lakh(Number(demand))} people. Open more shelters, fix water/sanitation gaps, or plan onward movement.</>
              : <>✓ Usable headroom {lakh(S.headroom)} covers {lakh(Number(demand))} people with {lakh(-gap)} to spare.</>}
          </div>}
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Shelters</h3>
          <button className="btn sm" style={{ marginLeft: "auto" }} disabled={!list.length} onClick={() => download("terashield-shelters.csv", "text/csv", csvOf(list.map((s) => ({ name: s.name, district: s.district, state: s.state, type: SHELTER_KIND[s.kind], status: s.status, capacity: s.capacity, occupied: s.occupied, headroom: shelterHeadroom(s), water: s.water, sanitation: s.sanitation, power: s.power, contact: s.contact, lat: s.lat ?? "", lon: s.lon ?? "", updated: s.updated }))))}>Export CSV</button>
        </div>
        <div className="card-pad grid g4" style={{ borderBottom: "1px solid var(--line)" }}>
          <div className="field"><label htmlFor="sn">Name</label><input id="sn" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. GHSS Meppadi" /></div>
          <div className="field"><label htmlFor="sk">Type</label><select id="sk" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as ShelterKind })}>{Object.entries(SHELTER_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div className="field"><label htmlFor="sc">Capacity (people)</label><input id="sc" type="number" min={1} value={f.capacity} onChange={(e) => setF({ ...f, capacity: Number(e.target.value) })} /></div>
          <div className="field"><label htmlFor="so">Occupied now</label><input id="so" type="number" min={0} value={f.occupied} onChange={(e) => setF({ ...f, occupied: Number(e.target.value) })} /></div>
          <div className="field"><label htmlFor="ss">Status</label><select id="ss" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as ShelterStatus })}><option value="open">Open</option><option value="standby">Standby</option><option value="closed">Closed</option></select></div>
          <div className="field"><label htmlFor="sp">Manager contact</label><input id="sp" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} placeholder="name, phone" /></div>
          <div className="field"><span className="label">Facilities</span>
            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
              <label className="row small" style={{ gap: 4 }}><input type="checkbox" checked={f.water} onChange={(e) => setF({ ...f, water: e.target.checked })} /> water</label>
              <label className="row small" style={{ gap: 4 }}><input type="checkbox" checked={f.sanitation} onChange={(e) => setF({ ...f, sanitation: e.target.checked })} /> sanitation</label>
              <label className="row small" style={{ gap: 4 }}><input type="checkbox" checked={f.power} onChange={(e) => setF({ ...f, power: e.target.checked })} /> power</label>
            </div>
          </div>
          <div className="field"><span className="label">Location</span>
            <div className="row" style={{ gap: 6 }}><button type="button" className="btn sm ghost" onClick={locate}>Use my location</button><span className="tiny muted">{where.lat != null ? `${where.lat}, ${where.lon}` : "optional"}</span></div>
          </div>
          <div className="row" style={{ alignItems: "flex-end" }}><button className="btn saffron" onClick={add}>Add shelter</button></div>
        </div>
        {msg && <div className="notice warn small" style={{ margin: "10px 14px 0" }}>{msg}</div>}
        <div className="table-wrap" style={{ border: 0, borderRadius: 0, maxHeight: 420 }}>
          <table className="t">
            <thead><tr><th>Shelter</th><th>Status</th><th className="r">Occupied</th><th className="r">Capacity</th><th className="r">Headroom</th><th>Water · San. · Power</th><th>Contact</th><th /></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id}>
                  <td><b>{s.name}</b><div className="tiny muted">{s.district} · {SHELTER_KIND[s.kind]}{s.lat != null ? ` · ${s.lat}, ${s.lon}` : ""}</div></td>
                  <td><select value={s.status} onChange={(e) => patch(s.id, { status: e.target.value as ShelterStatus })} aria-label={`Status of ${s.name}`}><option value="open">Open</option><option value="standby">Standby</option><option value="closed">Closed</option></select></td>
                  <td className="r"><input type="number" min={0} value={s.occupied} style={{ width: 76 }} onChange={(e) => patch(s.id, { occupied: Math.max(0, Number(e.target.value)) })} aria-label={`Occupied at ${s.name}`} /></td>
                  <td className="r">{lakh(s.capacity)}</td>
                  <td className="r" style={{ color: s.occupied > s.capacity ? "var(--red)" : undefined }}><b>{lakh(shelterHeadroom(s))}</b></td>
                  <td className="small">{s.water ? "✓" : <b style={{ color: "var(--red)" }}>✗</b>} · {s.sanitation ? "✓" : <b style={{ color: "var(--red)" }}>✗</b>} · {s.power ? "✓" : "—"}</td>
                  <td className="small">{s.contact || "—"}</td>
                  <td><button className="btn ghost sm" onClick={() => setShelters(shelters.filter((x) => x.id !== s.id))} aria-label={`Remove ${s.name}`}>Remove</button></td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={8} className="muted small">No shelters registered for this selection.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Resources</h3>
          <span className="tiny muted">{resTotals.map(([k, v]) => `${v} ${k}`).join(" · ")}</span>
          <button className="btn sm" style={{ marginLeft: "auto" }} disabled={!res.length} onClick={() => download("terashield-resources.csv", "text/csv", csvOf(res.map((r) => ({ type: RESOURCE_TYPE[r.type], label: r.label, count: r.count, district: r.district, status: r.status, note: r.note, updated: r.updated }))))}>Export CSV</button>
        </div>
        <div className="card-pad grid g4" style={{ borderBottom: "1px solid var(--line)" }}>
          <div className="field"><label htmlFor="rt">Type</label><select id="rt" value={rf.type} onChange={(e) => setRf({ ...rf, type: e.target.value as ResourceType })}>{Object.entries(RESOURCE_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div className="field"><label htmlFor="rl">Label / unit</label><input id="rl" value={rf.label} onChange={(e) => setRf({ ...rf, label: e.target.value })} placeholder="e.g. 5th Bn NDRF, KSRTC depot" /></div>
          <div className="field"><label htmlFor="rn">Count</label><input id="rn" type="number" min={1} value={rf.count} onChange={(e) => setRf({ ...rf, count: Number(e.target.value) })} /></div>
          <div className="field"><label htmlFor="rs">Status</label><select id="rs" value={rf.status} onChange={(e) => setRf({ ...rf, status: e.target.value as ResourceStatus })}><option value="available">Available</option><option value="deployed">Deployed</option><option value="unavailable">Unavailable</option></select></div>
          <div className="field" style={{ gridColumn: "span 2" }}><label htmlFor="rk">Note</label><input id="rk" value={rf.note} onChange={(e) => setRf({ ...rf, note: e.target.value })} placeholder="location, driver contact…" /></div>
          <div className="row" style={{ alignItems: "flex-end" }}><button className="btn saffron" onClick={addRes}>Add resource</button></div>
        </div>
        <div className="table-wrap" style={{ border: 0, borderRadius: 0, maxHeight: 320 }}>
          <table className="t">
            <thead><tr><th>Resource</th><th className="r">Count</th><th>District</th><th>Status</th><th>Note</th><th /></tr></thead>
            <tbody>
              {res.map((r) => (
                <tr key={r.id}>
                  <td><b>{RESOURCE_TYPE[r.type]}</b>{r.label && <div className="tiny muted">{r.label}</div>}</td>
                  <td className="r">{r.count}</td>
                  <td>{r.district || "—"}</td>
                  <td><select value={r.status} onChange={(e) => setResources(resources.map((x) => (x.id === r.id ? { ...x, status: e.target.value as ResourceStatus, updated: now() } : x)))} aria-label={`Status of ${r.type}`}><option value="available">Available</option><option value="deployed">Deployed</option><option value="unavailable">Unavailable</option></select></td>
                  <td className="small">{r.note || "—"}</td>
                  <td><button className="btn ghost sm" onClick={() => setResources(resources.filter((x) => x.id !== r.id))}>Remove</button></td>
                </tr>
              ))}
              {res.length === 0 && <tr><td colSpan={6} className="muted small">No resources registered.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
