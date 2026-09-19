import { useEffect, useMemo, useState } from "react";
import { ZoneBadge } from "../../components/ui";
import { loadPilot } from "../../lib/data";
import {
  EVIDENCE_LABEL, LIFECYCLE, LIFECYCLE_LABEL, ZONE_RANK, append, loadRegister, saveRegister, unitStates, verifyChain,
  type EntryKind, type EvidenceKind, type LifecycleState, type RegisterEntry,
} from "../../lib/lifecycle";
import { download } from "../../lib/plan";
import type { Pilot, Zone } from "../../lib/types";

const ZONES: Zone[] = ["RED", "ORANGE", "YELLOW", "GREEN"];
const KIND_LABEL: Record<EntryKind, string> = { create: "Add to register", advance: "Advance a stage", escalate: "Raise the zone", downgrade: "Lower the zone", watch: "Add a watch note" };

export default function ZoneRegister() {
  const [chain, setChain] = useState<RegisterEntry[]>(loadRegister);
  const [pilot, setPilot] = useState<Pilot | null>(null);
  const [unit, setUnit] = useState("");
  const [kind, setKind] = useState<EntryKind>("advance");
  const [zone, setZone] = useState<Zone>("RED");
  const [evKind, setEvKind] = useState<EvidenceKind>("");
  const [evidence, setEvidence] = useState("");
  const [approver, setApprover] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tamper, setTamper] = useState<RegisterEntry[] | null>(null);
  const [newName, setNewName] = useState("");
  const [newZone, setNewZone] = useState<Zone>("RED");

  useEffect(() => { loadPilot().then(setPilot).catch(() => undefined); }, []);
  const units = useMemo(() => [...unitStates(chain).values()], [chain]);
  const cur = units.find((u) => u.unit === unit) ?? null;
  const shown = tamper ?? chain;
  const check = useMemo(() => verifyChain(shown), [shown]);

  const commit = (res: { chain: RegisterEntry[]; error?: string }, ok: string) => {
    if (res.error) { setMsg({ ok: false, text: res.error }); return; }
    setChain(res.chain); saveRegister(res.chain); setTamper(null); setMsg({ ok: true, text: ok });
  };

  const create = () => {
    const name = newName.trim();
    if (!name) { setMsg({ ok: false, text: "Enter a habitation name." }); return; }
    const id = `manual-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    commit(append(chain, { unit: id, name, kind: "create", zone: newZone, evidence: "Added manually in the Zone Register", snapshot: { source: "manual entry" } }), `${name} added as ${newZone} (Screened).`);
    setNewName(""); setUnit(id);
  };

  const addPilotTop = () => {
    if (!pilot) return;
    let c = chain; let n = 0;
    for (const v of [...pilot.villages].filter((x) => x.zone === "RED").sort((a, b) => b.score - a.score).slice(0, 5)) {
      const r = append(c, { unit: `wayanad-${v.id}`, name: v.name, kind: "create", zone: v.zone, evidence: "Screened by the habitation-level terrain model", snapshot: { slope_max: v.slope_max, hand: v.hand, red_f: v.red_f, pop: v.pop, buildings: v.bld, priority: v.score, dem: "Terrarium z12 37 m" } });
      if (!r.error) { c = r.chain; n++; }
    }
    if (n) commit({ chain: c }, `${n} top-priority RED Wayanad habitations added.`); else setMsg({ ok: false, text: "Those habitations are already in the register." });
  };

  const submit = () => {
    if (!cur) { setMsg({ ok: false, text: "Choose a habitation." }); return; }
    const snapshot = { prior_state: cur.state, prior_zone: cur.zone, note: "inputs as seen at this moment" };
    if (kind === "advance") {
      const next = LIFECYCLE[LIFECYCLE.indexOf(cur.state) + 1] as LifecycleState | undefined;
      commit(append(chain, { unit: cur.unit, name: cur.name, kind, to: next, evidence, evidenceKind: evKind, approver, snapshot }), `${cur.name}: advanced to ${next ? LIFECYCLE_LABEL[next] : "—"}.`);
    } else commit(append(chain, { unit: cur.unit, name: cur.name, kind, zone, evidence, evidenceKind: evKind, approver, snapshot }), `${cur.name}: ${KIND_LABEL[kind].toLowerCase()} recorded.`);
  };

  const simulateTamper = () => {
    if (chain.length < 2) { setMsg({ ok: false, text: "Add at least two entries to demonstrate tampering." }); return; }
    const copy = chain.map((e) => ({ ...e, snapshot: { ...e.snapshot } }));
    copy[Math.floor(copy.length / 2) - 0].evidence = "edited after the fact";
    setTamper(copy);
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="notice info small">
        <b>A red zone is a legal claim, so it should be defensible.</b> Each habitation is a state machine — <i>Screened → Verified → Notified → Relocating → Vacated → Monitored</i>. Live evidence can only push a zone <b>up</b> (or add a watch note).
        Lowering a zone needs recorded evidence <i>and</i> an officer's sign-off. Every step is chained with SHA-256 to the one before, with a snapshot of the inputs, so an edited or deleted entry is detectable — the “what did the system know that day” record that relocation orders are challenged on.
        In this static demo the chain lives in your browser; production would hold it in append-only server storage.
      </div>

      <div className="card card-pad">
        <div className="lifecycle" aria-label="Lifecycle stages">
          {LIFECYCLE.map((s, i) => (
            <span key={s} className="stage"><b>{i + 1}</b> {LIFECYCLE_LABEL[s]}{i < LIFECYCLE.length - 1 && <em>→</em>}</span>
          ))}
        </div>
      </div>

      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="card card-pad stack" style={{ gap: 10 }}>
          <h3>Habitations in the register</h3>
          <div className="row" style={{ gap: 6 }}>
            <input placeholder="Habitation name" value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="New habitation name" style={{ flex: 1, minWidth: 140 }} />
            <select value={newZone} onChange={(e) => setNewZone(e.target.value as Zone)} aria-label="Screened zone">{ZONES.map((z) => <option key={z}>{z}</option>)}</select>
            <button className="btn sm" onClick={create}>Add</button>
          </div>
          <button className="btn ghost sm" onClick={addPilotTop} disabled={!pilot}>Add the 5 highest-priority RED Wayanad habitations</button>
          {units.length === 0 && <div className="muted small">Nothing registered yet.</div>}
          <div className="table-wrap" style={{ border: 0, maxHeight: 260 }}>
            <table className="t">
              <thead><tr><th>Habitation</th><th>Zone</th><th>Stage</th></tr></thead>
              <tbody>
                {units.map((u) => (
                  <tr key={u.unit} className={`click${unit === u.unit ? " sel" : ""}`} onClick={() => { setUnit(u.unit); setZone(u.zone); }}>
                    <td><b>{u.name}</b>{u.watch && <div className="tiny" style={{ color: "var(--orange)" }}>watch: {u.watch}</div>}<div className="tiny muted">{u.entries} entr{u.entries === 1 ? "y" : "ies"}</div></td>
                    <td><ZoneBadge zone={u.zone} label={u.zone} /></td>
                    <td className="small">{LIFECYCLE_LABEL[u.state]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card card-pad stack" style={{ gap: 10 }}>
          <h3>Record a transition{cur ? ` — ${cur.name}` : ""}</h3>
          <div className="seg" role="group" aria-label="Action" style={{ flexWrap: "wrap" }}>
            {(["advance", "escalate", "downgrade", "watch"] as EntryKind[]).map((k) => <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>)}
          </div>
          {(kind === "escalate" || kind === "downgrade") && (
            <div className="field"><label htmlFor="rz">New zone</label>
              <select id="rz" value={zone} onChange={(e) => setZone(e.target.value as Zone)}>
                {ZONES.filter((z) => !cur || (kind === "escalate" ? ZONE_RANK[z] > ZONE_RANK[cur.zone] : ZONE_RANK[z] < ZONE_RANK[cur.zone])).map((z) => <option key={z}>{z}</option>)}
              </select>
            </div>
          )}
          <div className="field"><label htmlFor="ek">Evidence type</label>
            <select id="ek" value={evKind} onChange={(e) => setEvKind(e.target.value as EvidenceKind)}>
              <option value="">— none —</option>
              {(Object.keys(EVIDENCE_LABEL) as Exclude<EvidenceKind, "">[]).map((k) => <option key={k} value={k}>{EVIDENCE_LABEL[k]}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="ev">Evidence / order reference</label><input id="ev" value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="e.g. GSI report ref., DM order no., date" /></div>
          <div className="field"><label htmlFor="ap">Approving officer</label><input id="ap" value={approver} onChange={(e) => setApprover(e.target.value)} placeholder="Name and designation" /></div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn saffron" onClick={submit} disabled={!cur}>Record</button>
            {cur && <span className="tiny muted">Now: {LIFECYCLE_LABEL[cur.state]} · {cur.zone}</span>}
          </div>
          {msg && <div className={`notice ${msg.ok ? "info" : "err"} small`}>{msg.text}</div>}
          <ul className="plain tiny muted">
            <li>Stages move one step at a time and never backwards; advancing needs an approving officer (Notified also needs the order reference).</li>
            <li>Raising a zone needs a description of the evidence — a forecast alert, a new scar, a crack report.</li>
            <li>Lowering a zone needs completed mitigation, a field survey or an expert review, in words, plus sign-off — and is refused once relocation is under way.</li>
          </ul>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Tamper-evident log</h3>
          <span className={`tag ${check.ok ? "osm" : "gap"}`}>{check.ok ? `✓ chain verified · ${shown.length} entries` : `✗ broken at entry ${(check.brokenAt ?? 0) + 1}`}</span>
          <div className="row" style={{ gap: 6, marginLeft: "auto" }}>
            <button className="btn sm ghost" onClick={simulateTamper}>Simulate tampering</button>
            {tamper && <button className="btn sm ghost" onClick={() => setTamper(null)}>Restore</button>}
            <button className="btn sm" onClick={() => download("terashield-zone-register.json", "application/json", JSON.stringify(chain, null, 2))} disabled={!chain.length}>Export JSON</button>
            <button className="btn sm danger" onClick={() => { if (window.confirm("Clear the whole register from this browser?")) { setChain([]); saveRegister([]); setTamper(null); setMsg(null); } }} disabled={!chain.length}>Clear</button>
          </div>
        </div>
        {!check.ok && <div className="notice err small" style={{ margin: "10px 14px 0" }}>{check.reason}. {tamper ? "This is a simulation: an entry was edited in memory only, and verification caught it." : ""}</div>}
        <div className="table-wrap" style={{ border: 0, borderRadius: 0, maxHeight: 360 }}>
          <table className="t">
            <thead><tr><th>#</th><th>When</th><th>Habitation</th><th>Action</th><th>Stage / zone</th><th>Evidence · approver</th><th>Hash</th></tr></thead>
            <tbody>
              {[...shown].reverse().map((e) => (
                <tr key={e.seq} style={check.brokenAt != null && e.seq - 1 === check.brokenAt ? { background: "#fdeaea" } : undefined}>
                  <td className="muted">{e.seq}</td>
                  <td className="tiny">{new Date(e.ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  <td><b>{e.name}</b></td>
                  <td className="small">{KIND_LABEL[e.kind]}</td>
                  <td className="small">{LIFECYCLE_LABEL[e.to]} · <b>{e.zone}</b>{e.prevZone && e.prevZone !== e.zone ? ` (was ${e.prevZone})` : ""}</td>
                  <td className="tiny">{e.evidenceKind && <b>{EVIDENCE_LABEL[e.evidenceKind]}: </b>}{e.evidence || "—"}{e.approver ? ` · ${e.approver}` : ""}</td>
                  <td><code className="tiny">{e.hash.slice(0, 10)}…</code></td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={7} className="muted small">The log is empty.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
