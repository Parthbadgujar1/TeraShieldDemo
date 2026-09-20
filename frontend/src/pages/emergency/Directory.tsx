import { useState } from "react";
import { download } from "../../lib/plan";
import { KEYS, NATIONAL_NUMBERS, csvOf, uid, useStore, type Contact } from "../../lib/ops";

const SOURCES: [string, string][] = [
  ["IMD — weather warnings", "https://mausam.imd.gov.in"], ["CWC — flood forecasts", "https://ffs.india-water.gov.in"],
  ["NDMA SACHET — CAP alerts", "https://sachet.ndma.gov.in"], ["NDMA", "https://ndma.gov.in"], ["NDRF", "https://ndrf.gov.in"],
];

/** National emergency numbers (fixed) plus the district's own contact list, which the control room fills in. */
export default function Directory() {
  const [list, setList] = useStore<Contact>(KEYS.directory);
  const [f, setF] = useState({ role: "", name: "", phone: "", district: "", note: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const add = () => {
    if (!f.role.trim() || !f.phone.trim()) { setMsg("A role and a phone number are required."); return; }
    setList([{ id: uid("ct"), ...f, role: f.role.trim(), name: f.name.trim(), phone: f.phone.trim() }, ...list]); setF({ role: "", name: "", phone: "", district: f.district, note: "" }); setMsg(null);
  };
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="card card-pad stack" style={{ gap: 8 }}>
          <h3>National numbers</h3>
          <dl className="kv">{NATIONAL_NUMBERS.map(([n, l]) => [<dt key={`l${n}`}>{l}</dt>, <dd key={`n${n}`}><a href={`tel:${n.replace(/\s/g, "")}`}>{n}</a></dd>])}</dl>
        </div>
        <div className="card card-pad stack" style={{ gap: 8 }}>
          <h3>Official sources</h3>
          {SOURCES.map(([l, u]) => <a key={u} href={u} target="_blank" rel="noreferrer" className="small">{l} ↗</a>)}
          <p className="tiny muted">Use these for warnings and orders. TeraShield's numbers are decision support, not a substitute.</p>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h3>District and unit contacts</h3><button className="btn sm" style={{ marginLeft: "auto" }} disabled={!list.length} onClick={() => download("terashield-contacts.csv", "text/csv", csvOf(list.map((c) => ({ role: c.role, name: c.name, phone: c.phone, district: c.district, note: c.note }))))}>Export CSV</button></div>
        <div className="card-pad grid g4" style={{ borderBottom: "1px solid var(--line)" }}>
          <div className="field"><label htmlFor="cr">Role / unit</label><input id="cr" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} placeholder="e.g. District Collector, NDRF Bn, DFO" /></div>
          <div className="field"><label htmlFor="cn">Name</label><input id="cn" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="field"><label htmlFor="cp">Phone</label><input id="cp" type="text" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
          <div className="field"><label htmlFor="cd">District</label><input id="cd" value={f.district} onChange={(e) => setF({ ...f, district: e.target.value })} /></div>
          <div className="field" style={{ gridColumn: "span 3" }}><label htmlFor="ck">Note</label><input id="ck" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="hours, alternate number…" /></div>
          <div className="row" style={{ alignItems: "flex-end" }}><button className="btn saffron" onClick={add}>Add contact</button></div>
        </div>
        {msg && <div className="notice warn small" style={{ margin: "10px 14px" }}>{msg}</div>}
        <div className="table-wrap" style={{ border: 0, borderRadius: 0, maxHeight: 340 }}>
          <table className="t">
            <thead><tr><th>Role</th><th>Name</th><th>Phone</th><th>District</th><th>Note</th><th /></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}><td><b>{c.role}</b></td><td>{c.name || "—"}</td><td><a href={`tel:${c.phone.replace(/\s/g, "")}`}>{c.phone}</a></td><td>{c.district || "—"}</td><td className="small">{c.note || "—"}</td>
                  <td><button className="btn ghost sm" onClick={() => setList(list.filter((x) => x.id !== c.id))}>Remove</button></td></tr>
              ))}
              {list.length === 0 && <tr><td colSpan={6} className="muted small">No local contacts yet. Nothing is pre-filled — add the real numbers for your district.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
