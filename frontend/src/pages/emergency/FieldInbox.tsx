import { useMemo, useState } from "react";
import { Stat } from "../../components/ui";
import { FIELD_CHECKS, INCIDENT_KIND, KEYS, REPORT_STATUS, assessReport, uid, useStore, type FieldReport, type Incident, type ReportStatus } from "../../lib/ops";
import { useEmergency } from "./context";

const LEVEL_COLOR = { routine: "var(--good)", watch: "var(--orange)", urgent: "var(--red)" } as const;

/** Reports filed by the field team. The emergency team acknowledges them, escalates the serious ones to the District Collector, or logs them as incidents. */
export default function FieldInbox() {
  const { stateF, selId, user } = useEmergency();
  const [reports, setReports] = useStore<FieldReport>(KEYS.reports);
  const [incidents, setIncidents] = useStore<Incident>(KEYS.incidents);
  const [show, setShow] = useState<"action" | "all">("action");
  const [msg, setMsg] = useState<string | null>(null);

  const scoped = useMemo(() => reports.filter((r) => (selId != null ? r.districtId === selId : stateF ? r.state === stateF : true)), [reports, selId, stateF]);
  const list = useMemo(
    () => scoped.filter((r) => show === "all" || ["submitted", "acknowledged", "escalated"].includes(r.status))
      .sort((a, b) => ({ urgent: 0, watch: 1, routine: 2 })[assessReport(a.checks).level] - ({ urgent: 0, watch: 1, routine: 2 })[assessReport(b.checks).level] || b.ts.localeCompare(a.ts)),
    [scoped, show],
  );
  const counts = { total: scoped.length, urgent: scoped.filter((r) => assessReport(r.checks).level === "urgent" && ["submitted", "acknowledged"].includes(r.status)).length, escalated: scoped.filter((r) => r.status === "escalated").length };

  const setStatus = (id: string, status: ReportStatus, note = "") =>
    setReports(reports.map((r) => (r.id === id ? { ...r, status, review: { by: user, ts: new Date().toISOString(), note } } : r)));

  const toIncident = (r: FieldReport) => {
    const a = assessReport(r.checks);
    const on = FIELD_CHECKS.filter((c) => r.checks[c.key]).map((c) => c.en.toLowerCase());
    setIncidents([{
      id: uid("in"), ts: new Date().toISOString(), districtId: r.districtId, district: r.district, state: r.state,
      kind: r.checks.slope_movement ? "landslide" : r.checks.water_rising ? "flood" : "other", severity: a.level === "urgent" ? 4 : a.level === "watch" ? 3 : 2,
      text: `Field report from ${r.habitation}: ${on.join(", ") || "no signs ticked"}${r.note ? ` — ${r.note}` : ""}`, status: "open", by: user, lat: r.lat, lon: r.lon,
    }, ...incidents]);
    setMsg(`Logged as ${INCIDENT_KIND[r.checks.slope_movement ? "landslide" : r.checks.water_rising ? "flood" : "other"]} in the incident log.`);
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="notice info small">Reports come from Aapda Mitra volunteers, ASHA / anganwadi workers and surveyors using the <b>Field Survey</b> dashboard (login <code>field / field2026</code>). Each report is scored by a transparent checklist rule — it is triage, not a diagnosis. In this demo, reports reach this inbox through the same browser.</div>
      <div className="grid g4">
        <Stat value={counts.total} label="reports in this selection" />
        <Stat value={counts.urgent} label="urgent, not yet handled" tone={counts.urgent ? "red" : undefined} />
        <Stat value={counts.escalated} label="escalated to the District Collector" tone={counts.escalated ? "orange" : undefined} />
        <Stat value={scoped.filter((r) => r.status === "verified").length} label="verified by a district officer" />
      </div>
      {msg && <div className="notice info small">{msg}</div>}
      <div className="card">
        <div className="card-head">
          <h3>Field-report inbox</h3>
          <div className="seg" role="group" aria-label="Filter"><button className={show === "action" ? "on" : ""} onClick={() => setShow("action")}>Needs action</button><button className={show === "all" ? "on" : ""} onClick={() => setShow("all")}>All</button></div>
        </div>
        <ul className="incidents">
          {list.map((r) => {
            const a = assessReport(r.checks);
            return (
              <li key={r.id} style={{ borderLeftColor: LEVEL_COLOR[a.level] }}>
                <div className="row small" style={{ justifyContent: "space-between", gap: 8 }}>
                  <span><b>{r.habitation}</b> · {r.district || "district not set"}{r.state ? `, ${r.state}` : ""} · <b style={{ color: LEVEL_COLOR[a.level] }}>{a.level.toUpperCase()}</b> (score {a.score})</span>
                  <span className="tiny muted">{new Date(r.ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {r.by} · <b>{REPORT_STATUS[r.status]}</b></span>
                </div>
                <div className="small">{FIELD_CHECKS.filter((c) => r.checks[c.key]).map((c) => c.en).join(" · ") || "No warning signs ticked"}</div>
                {r.note && <div className="small muted">“{r.note}”</div>}
                <div className="tiny muted">{a.text}{r.lat != null && <> · <a href={`https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lon}`} target="_blank" rel="noreferrer">location ↗</a></>}</div>
                {r.photo && <a href={r.photo} target="_blank" rel="noreferrer"><img src={r.photo} alt={`Photo from ${r.habitation}`} style={{ height: 76, borderRadius: 6, border: "1px solid var(--line)" }} /></a>}
                {r.review && <div className="tiny muted">{REPORT_STATUS[r.status]} by {r.review.by}{r.review.note ? `: ${r.review.note}` : ""}</div>}
                <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  {r.status === "submitted" && <button className="btn sm" onClick={() => setStatus(r.id, "acknowledged")}>Acknowledge</button>}
                  {["submitted", "acknowledged"].includes(r.status) && <button className="btn sm saffron" onClick={() => setStatus(r.id, "escalated", "Escalated for verification and a zone decision")}>Escalate to District Collector</button>}
                  <button className="btn sm ghost" onClick={() => toIncident(r)}>Log as incident</button>
                  {["submitted", "acknowledged"].includes(r.status) && <button className="btn sm ghost" onClick={() => setStatus(r.id, "rejected", "Not actionable")}>Close as not actionable</button>}
                </div>
              </li>
            );
          })}
          {list.length === 0 && <li className="muted small" style={{ borderLeftColor: "transparent" }}>No field reports {show === "action" ? "waiting for action" : "yet"}.</li>}
        </ul>
      </div>
    </div>
  );
}
