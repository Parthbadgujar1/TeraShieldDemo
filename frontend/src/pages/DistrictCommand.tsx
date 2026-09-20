import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SachetPanel } from "../components/AlertControls";
import { DistrictPicker, ErrorBox, Loading, Stat, ZoneBadge } from "../components/ui";
import { draftNotification, nextStage, signsOf, verifyFieldReport } from "../lib/approvals";
import { currentSession } from "../lib/auth";
import { loadAlerts, loadPilot, useDataset, useDistrictParam } from "../lib/data";
import { LIFECYCLE_LABEL, append, loadRegister, saveRegister, unitStates, verifyChain, type RegisterEntry } from "../lib/lifecycle";
import { KEYS, REPORT_STATUS, assessReport, useStore, type FieldReport, type Incident } from "../lib/ops";
import { download } from "../lib/plan";
import { TIER_COLOR, TIER_LABEL, compact, lakh } from "../lib/risk";
import type { AlertFeed, Pilot } from "../lib/types";

const LEVEL_COLOR = { routine: "var(--good)", watch: "var(--orange)", urgent: "var(--red)" } as const;

/**
 * District Command — the District Collector's screen: what is happening in the district, what field evidence is waiting for a decision,
 * and which red-zone stage each habitation is at. Approvals are written to the hash-chained Zone Register under the officer's name.
 */
export default function DistrictCommand() {
  const { data, error } = useDataset();
  const navigate = useNavigate();
  const user = currentSession()?.user ?? "district_officer";
  const [id, setId] = useDistrictParam(data, true);
  const d = data && id != null ? data.byId.get(id) ?? null : null;

  const [reports, setReports] = useStore<FieldReport>(KEYS.reports);
  const [incidents] = useStore<Incident>(KEYS.incidents);
  const [chain, setChain] = useState<RegisterEntry[]>(loadRegister);
  const [pilot, setPilot] = useState<Pilot | null>(null);
  const [feed, setFeed] = useState<AlertFeed | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<string | null>(null);
  const [zoneHint, setZoneHint] = useState<Record<string, string>>({});

  useEffect(() => { loadPilot().then(setPilot).catch(() => undefined); loadAlerts().then(setFeed).catch(() => undefined); }, []);
  useEffect(() => { const on = () => setChain(loadRegister()); window.addEventListener("storage", on); return () => window.removeEventListener("storage", on); }, []);

  const units = useMemo(() => [...unitStates(chain).values()].sort((a, b) => b.last.localeCompare(a.last)), [chain]);
  const check = useMemo(() => verifyChain(chain), [chain]);
  const inDistrict = (r: { districtId: number | null }) => d != null && r.districtId === d.id;
  const districtReports = useMemo(() => reports.filter(inDistrict), [reports, d]);
  const queue = useMemo(
    () => districtReports.filter((r) => ["submitted", "acknowledged", "escalated"].includes(r.status))
      .sort((a, b) => Number(b.status === "escalated") - Number(a.status === "escalated") || ({ urgent: 0, watch: 1, routine: 2 })[assessReport(a.checks).level] - ({ urgent: 0, watch: 1, routine: 2 })[assessReport(b.checks).level]),
    [districtReports],
  );
  const openInc = incidents.filter((i) => inDistrict(i) && i.status === "open");
  const alerts = feed && d ? feed.alerts.filter((a) => a.districts.includes(d.id)) : [];
  const isPilot = !!(pilot && d && pilot.district.id === d.id);

  if (error) return <div className="page"><ErrorBox text={error} /></div>;
  if (!data || !d) return <Loading text="Loading district command…" />;

  const commit = (next: RegisterEntry[], ok: string) => { setChain(next); saveRegister(next); setMsg({ ok: true, text: ok }); };

  const verify = (r: FieldReport) => {
    const res = verifyFieldReport(chain, r, user, d.zone);
    if (res.error) { setMsg({ ok: false, text: res.error }); return; }
    setReports(reports.map((x) => (x.id === r.id ? { ...x, status: "verified", review: { by: user, ts: new Date().toISOString(), note: "Verified; recorded in the Zone Register" } } : x)));
    commit(res.chain, `${r.habitation}: field report accepted as evidence and recorded in the Zone Register (${signsOf(r)}).`);
  };
  const reject = (r: FieldReport) => {
    const note = (evidence[`rej-${r.id}`] ?? "").trim();
    if (!note) { setMsg({ ok: false, text: "Give a reason for rejecting the report." }); return; }
    setReports(reports.map((x) => (x.id === r.id ? { ...x, status: "rejected", review: { by: user, ts: new Date().toISOString(), note } } : x)));
    setMsg({ ok: true, text: `${r.habitation}: report rejected — the surveyor will see the reason.` });
  };
  const advance = (unit: string, name: string) => {
    const st = unitStates(chain).get(unit);
    const to = st ? nextStage(st.state) : null;
    if (!st || !to) { setMsg({ ok: false, text: "This habitation is already at the final stage." }); return; }
    const res = append(chain, { unit, name, kind: "advance", to, approver: user, evidence: (evidence[unit] ?? "").trim(), snapshot: { decided_in: "District Command", district: d.n } });
    if (res.error) setMsg({ ok: false, text: res.error }); else { commit(res.chain, `${name}: advanced to ${LIFECYCLE_LABEL[to]} under ${user}.`); setEvidence({ ...evidence, [unit]: "" }); }
  };
  const showDraft = (unit: string, name: string, stage: RegisterEntry["to"], zone: RegisterEntry["zone"]) => {
    const pv = unit.startsWith("wayanad-") && pilot ? pilot.villages.find((v) => v.id === Number(unit.slice(8))) : null;
    setDraft(draftNotification({ unit, name, district: d.n, state: d.s, zone, stage, reasons: [...(pv?.reasons ?? [])].map((x) => x.replace(/_/g, " ").toLowerCase()), approver: user, date: new Date() }));
  };

  const tierCounts = isPilot && pilot ? pilot.summary.tiers : null;

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>District Command</h1>
          <p>The Collector's view: hazard picture, field evidence waiting for a decision, and the stage each red-zone habitation has reached. Every approval is recorded under your name in the tamper-evident Zone Register.</p>
        </div>
        <ZoneBadge zone={d.zone} label={`${d.n}: ${d.zone[0] + d.zone.slice(1).toLowerCase()} tier`} />
      </div>

      <div className="card card-pad filters" style={{ marginBottom: 14 }}>
        <DistrictPicker states={data.states} byState={data.byState} stateValue={d.s} districtId={d.id} onState={(s) => { const f = data.byState.get(s)?.[0]; if (f) setId(f.id); }} onDistrict={(x) => x != null && setId(x)} />
        <button className="btn sm ghost" onClick={() => setId(data.districts.find((x) => x.n === "Wayanad")?.id ?? d.id)}>Wayanad (habitation pilot)</button>
      </div>

      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Stat value={`${d.risk.toFixed(0)}%`} label="annual multi-hazard (district tier, screening)" tone={d.zone === "RED" ? "red" : d.zone === "ORANGE" ? "orange" : undefined} />
        <Stat value={compact(d.expo.pop)} label={`people exposed of ${compact(d.pop)}`} />
        <Stat value={alerts.length} label="official SACHET alerts naming this district" tone={alerts.length ? "orange" : undefined} />
        <Stat value={queue.length} label={`field reports awaiting a decision · ${openInc.length} open incidents`} tone={queue.some((r) => r.status === "escalated") ? "red" : undefined} />
      </div>

      {msg && <div className={`notice ${msg.ok ? "info" : "err"} small`} role="status" style={{ marginBottom: 12 }}>{msg.text}</div>}

      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="card">
          <div className="card-head"><h3>Field evidence awaiting a decision</h3><span className="tiny muted">{queue.length}</span></div>
          <ul className="incidents">
            {queue.map((r) => {
              const a = assessReport(r.checks);
              return (
                <li key={r.id} style={{ borderLeftColor: LEVEL_COLOR[a.level] }}>
                  <div className="row small" style={{ justifyContent: "space-between", gap: 8 }}>
                    <span><b>{r.habitation}</b> · <b style={{ color: LEVEL_COLOR[a.level] }}>{a.level.toUpperCase()}</b>{r.status === "escalated" && <span className="tag gap" style={{ marginLeft: 6 }}>escalated</span>}</span>
                    <span className="tiny muted">{new Date(r.ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {r.by}</span>
                  </div>
                  <div className="small">{signsOf(r)}{r.note ? ` — “${r.note}”` : ""}</div>
                  <div className="tiny muted">{a.text} · status {REPORT_STATUS[r.status]}{r.lat != null && <> · <a href={`https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lon}`} target="_blank" rel="noreferrer">location ↗</a></>}</div>
                  {r.photo && <a href={r.photo} target="_blank" rel="noreferrer"><img src={r.photo} alt={`Photo from ${r.habitation}`} style={{ height: 76, borderRadius: 6, border: "1px solid var(--line)" }} /></a>}
                  <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                    <button className="btn sm saffron" onClick={() => verify(r)}>Verify &amp; record in register</button>
                    <input type="text" placeholder="reason to reject" value={evidence[`rej-${r.id}`] ?? ""} onChange={(e) => setEvidence({ ...evidence, [`rej-${r.id}`]: e.target.value })} style={{ flex: 1, minWidth: 120 }} aria-label={`Reason to reject report from ${r.habitation}`} />
                    <button className="btn sm ghost" onClick={() => reject(r)}>Reject</button>
                  </div>
                </li>
              );
            })}
            {queue.length === 0 && <li className="muted small" style={{ borderLeftColor: "transparent" }}>Nothing waiting. Field reports for {d.n} appear here once the field team files them.</li>}
          </ul>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Red-zone register — stage decisions</h3>
            <span className={`tag ${check.ok ? "osm" : "gap"}`}>{check.ok ? `chain verified · ${chain.length}` : "chain broken"}</span>
          </div>
          <div className="table-wrap" style={{ border: 0, borderRadius: 0, maxHeight: 460 }}>
            <table className="t">
              <thead><tr><th>Habitation</th><th>Zone</th><th>Stage</th><th>Next step (approver: you)</th></tr></thead>
              <tbody>
                {units.map((u) => {
                  const nx = nextStage(u.state);
                  return (
                    <tr key={u.unit}>
                      <td><b>{u.name}</b>{u.watch && <div className="tiny" style={{ color: "var(--orange)" }}>watch: {u.watch.slice(0, 80)}</div>}</td>
                      <td><ZoneBadge zone={u.zone} label={u.zone} /></td>
                      <td className="small">{LIFECYCLE_LABEL[u.state]}</td>
                      <td>
                        {nx ? (
                          <div className="stack" style={{ gap: 4 }}>
                            <input type="text" placeholder={nx === "NOTIFIED" ? "order reference (required)" : "evidence / note"} value={evidence[u.unit] ?? ""} onChange={(e) => setEvidence({ ...evidence, [u.unit]: e.target.value })} aria-label={`Evidence to advance ${u.name}`} />
                            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                              <button className="btn sm" onClick={() => advance(u.unit, u.name)}>→ {LIFECYCLE_LABEL[nx].split(" (")[0]}</button>
                              {(u.state === "VERIFIED" || u.state === "NOTIFIED") && <button className="btn sm ghost" onClick={() => showDraft(u.unit, u.name, u.state, u.zone)}>Draft notification</button>}
                            </div>
                          </div>
                        ) : <span className="tiny muted">final stage</span>}
                      </td>
                    </tr>
                  );
                })}
                {units.length === 0 && <tr><td colSpan={4} className="muted small">The register is empty. Add habitations from the Wayanad pilot (Relocation Intelligence → Add to Zone Register) or verify a field report.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="card-pad tiny muted">Stages move one step at a time; the register refuses a missing approver or a Notified stage without an order reference. Lowering a zone is done in Validation &amp; Data → Zone Register with evidence.</div>
        </div>
      </div>

      {draft && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-head"><h3>Draft notification (for legal review)</h3>
            <div className="row" style={{ gap: 6, marginLeft: "auto" }}>
              <button className="btn sm" onClick={() => navigator.clipboard?.writeText(draft)}>Copy</button>
              <button className="btn sm" onClick={() => download("draft-notification.txt", "text/plain", draft)}>Download</button>
              <button className="btn sm ghost" onClick={() => setDraft(null)}>Close</button>
            </div>
          </div>
          <pre className="sitrep">{draft}</pre>
        </div>
      )}

      <div className="grid g2" style={{ marginTop: 14, alignItems: "start" }}>
        <div className="card card-pad stack" style={{ gap: 8 }}>
          <h3>Relocation plan snapshot — {d.n}</h3>
          {tierCounts ? (
            <>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                {(["immediate", "short_term", "medium_term", "monitor"] as const).map((t) => (
                  <span key={t} className="chip static" style={{ background: TIER_COLOR[t], color: "#fff", borderColor: TIER_COLOR[t] }}>{TIER_LABEL[t].split(" (")[0]} · {tierCounts[t]}</span>
                ))}
              </div>
              <p className="small">Habitation-level screening of {pilot!.villages.length} settlements: {pilot!.summary.villages.RED} red, {pilot!.summary.villages.ORANGE} orange; about {compact(pilot!.summary.pop_red)} people on red terrain (estimate).</p>
            </>
          ) : (
            <p className="small">Only district-level screening exists for {d.n}: relocation priority <b style={{ color: TIER_COLOR[d.reloc.tier] }}>{TIER_LABEL[d.reloc.tier]}</b> (score {d.reloc.score.toFixed(0)}, holds in {d.reloc.stab.toFixed(0)}% of weight sets). Habitation-level red zones need a survey list or the Data Lab upload.</p>
          )}
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <button className="btn sm saffron" onClick={() => navigate({ pathname: "/plan" })}>Open the Action Plan →</button>
            <button className="btn sm" onClick={() => navigate({ pathname: "/relocation", search: `?d=${d.id}` })}>Relocation Intelligence →</button>
            <button className="btn sm ghost" onClick={() => navigate({ pathname: "/gis", search: `?d=${d.id}` })}>Map →</button>
          </div>
          <p className="tiny muted">Population {lakh(d.pop)} · households {lakh(d.hh)} · vulnerability {d.vband.toLowerCase()} ({d.vuln.toFixed(0)}/100).</p>
        </div>
        <div className="card card-pad stack" style={{ gap: 8 }}>
          <h3>Official alerts</h3>
          <SachetPanel districts={data.byId} onPick={(x) => setId(x)} stateFilter={d.s} limit={4} />
        </div>
      </div>
    </div>
  );
}
