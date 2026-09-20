import { useEffect, useMemo, useState } from "react";
import { loadAlerts } from "../../lib/data";
import { HAZARD_BY_KEY } from "../../lib/risk";
import { KEYS, useStore, type FieldReport, type Incident, type Resource, type Shelter } from "../../lib/ops";
import { download } from "../../lib/plan";
import { buildSitrep } from "../../lib/sitrep";
import type { AlertFeed } from "../../lib/types";
import { useEmergency } from "./context";

/** One-click situation report from what is on screen and in the registers; nothing is filled in for you. */
export default function Sitrep() {
  const { data, mode, liveState, stateF, selId, rows, counts, escalated, user } = useEmergency();
  const [feed, setFeed] = useState<AlertFeed | null>(null);
  const [shelters] = useStore<Shelter>(KEYS.shelters);
  const [resources] = useStore<Resource>(KEYS.resources);
  const [incidents] = useStore<Incident>(KEYS.incidents);
  const [reports] = useStore<FieldReport>(KEYS.reports);
  const [copied, setCopied] = useState(false);
  useEffect(() => { loadAlerts().then(setFeed).catch(() => undefined); }, []);

  const d = selId != null ? data.byId.get(selId) ?? null : null;
  const scope = d ? `${d.n}, ${d.s}` : stateF || "All India";
  const inScope = (x: { districtId: number | null; state?: string }) => (selId != null ? x.districtId === selId : stateF ? x.state === stateF : true);

  const md = useMemo(() => buildSitrep({
    scope, generated: new Date(), prepared: user,
    viewLabel: mode === "live" ? (liveState.source === "replay" ? `72 h alert overlay — replay of ${liveState.replay?.title}` : `72 h alert overlay (Open-Meteo forecast${liveState.source === "stale" ? ", cached" : ""})`) : "Annual baseline",
    tiers: counts, escalated: mode === "live" && liveState.live ? escalated : null,
    concern: rows.slice(0, 10).map((r) => ({ name: r.d.n, state: r.d.s, zone: r.zone, value: r.value, dom: HAZARD_BY_KEY[r.dom].label, exposed: r.d.expo.pop })),
    alerts: (feed?.alerts ?? []).filter((a) => (selId != null ? a.districts.includes(selId) : stateF ? a.states.includes(stateF) || a.districts.some((id) => data.byId.get(id)?.s === stateF) : true)),
    shelters: shelters.filter(inScope), resources: resources.filter((r) => (selId != null ? r.districtId === selId : true)),
    incidents: incidents.filter(inScope), reports: reports.filter((r) => (selId != null ? r.districtId === selId : stateF ? r.state === stateF : true)),
  }), [scope, user, mode, liveState, counts, escalated, rows, feed, shelters, resources, incidents, reports, selId, stateF, data]);

  return (
    <div className="stack print-report" style={{ gap: 14 }}>
      <div className="notice info small no-print">The report follows the district / state you selected on the Operations tab and the baseline / alert view chosen above. Edit the Markdown in any editor after downloading, or print to PDF.</div>
      <div className="card">
        <div className="card-head no-print">
          <h3>Situation report — {scope}</h3>
          <div className="row" style={{ gap: 6, marginLeft: "auto" }}>
            <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(md).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => undefined); }}>{copied ? "Copied ✓" : "Copy"}</button>
            <button className="btn sm" onClick={() => download(`terashield-sitrep-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.md`, "text/markdown", md)}>Download .md</button>
            <button className="btn sm saffron" onClick={() => window.print()}>PDF (print)</button>
          </div>
        </div>
        <pre className="sitrep">{md}</pre>
      </div>
    </div>
  );
}
