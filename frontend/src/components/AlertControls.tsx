import { useEffect, useState } from "react";
import { loadAlerts, loadReplays } from "../lib/data";
import type { LiveState, ViewMode } from "../lib/useLive";
import type { AlertFeed, AlertItem, District, ReplayPack } from "../lib/types";

export const ALERT_KIND_ICON: Record<string, string> = {
  cyclone: "🌀", flood: "🌊", landslide: "⛰️", heat: "🔥", lightning: "⚡", rain: "🌧️", wind: "💨", fog: "🌫️", other: "⚠️",
};

/**
 * Baseline-vs-alert switch, replay picker and data-source banner, shared by the admin dashboard and the emergency portal so both
 * always describe the layer the same way.
 */
export function AlertControls({
  mode, setMode, replayId, setReplay, state, escalated, compact = false,
}: {
  mode: ViewMode; setMode: (m: ViewMode) => void; replayId: string; setReplay: (id: string) => void;
  state: LiveState; escalated: number; compact?: boolean;
}) {
  const [pack, setPack] = useState<ReplayPack | null>(null);
  useEffect(() => { loadReplays().then(setPack).catch(() => undefined); }, []);
  const { live, progress, stamp, failed, source, replay } = state;
  return (
    <div>
      <div className="seg" role="group" aria-label="Time view">
        <button className={mode === "annual" ? "on" : ""} onClick={() => setMode("annual")}>Annual baseline</button>
        <button className={mode === "live" ? "on" : ""} onClick={() => setMode("live")}>72 h alert overlay</button>
      </div>
      {!compact && (
        <p className="tiny muted" style={{ marginTop: 6 }}>
          {mode === "annual"
            ? "Evidence-based baseline: climatology 2014–2023 × terrain, rivers, coast, cyclone and landslide history."
            : "Forecast rain, wind and heat can only raise an alert on top of the baseline — a dry week never turns a hazard-prone district safe."}
        </p>
      )}
      {mode === "live" && (
        <div className="field" style={{ marginTop: 8 }}>
          <label htmlFor="replay-pick">Data source</label>
          <select id="replay-pick" value={replayId} onChange={(e) => setReplay(e.target.value)}>
            <option value="">Live Open-Meteo forecast (next 72 h)</option>
            {pack?.events.map((e) => <option key={e.id} value={e.id}>Replay · {e.title} ({e.asof})</option>)}
          </select>
        </div>
      )}
      {progress && <div className="row small" style={{ marginTop: 6 }}><span className="spinner" /> Fetching forecasts… {progress.done}/{progress.total}</div>}
      {failed && <div className="notice warn tiny" style={{ marginTop: 6 }}>Forecast unreachable and no cached copy — showing the annual baseline.</div>}
      {live && source === "replay" && replay && (
        <div className="notice info tiny" style={{ marginTop: 6 }}>
          <b>REPLAY · {replay.title}, as of {replay.asof}.</b> {replay.note} ERA5 reanalysis (not the forecast issued then) · <b>{escalated}</b> district{escalated === 1 ? "" : "s"} escalated vs. baseline.
        </div>
      )}
      {live && source !== "replay" && stamp && (
        <div className={`notice tiny ${source === "stale" ? "warn" : "info"}`} style={{ marginTop: 6 }}>
          {source === "stale" ? <b>Using cached data (public API unavailable) · </b> : source === "cached" ? <b>Cached · </b> : null}
          Forecast from {stamp.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · <b>{escalated}</b> district{escalated === 1 ? "" : "s"} escalated vs. baseline
        </div>
      )}
    </div>
  );
}

/** Real NDMA SACHET (CAP) alerts, snapshotted at build time and refreshed by a scheduled workflow. */
export function SachetPanel({ districts, onPick, limit = 6, stateFilter = "" }: { districts: Map<number, District>; onPick: (id: number) => void; limit?: number; stateFilter?: string }) {
  const [feed, setFeed] = useState<AlertFeed | null>(null);
  const [err, setErr] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => { loadAlerts().then(setFeed).catch(() => setErr(true)); }, []);
  if (err) return <div className="notice info tiny">Official alert snapshot unavailable.</div>;
  if (!feed) return <div className="skeleton" style={{ height: 60 }} />;
  const inState = (a: AlertItem) => !stateFilter || a.states.includes(stateFilter) || a.districts.some((id) => districts.get(id)?.s === stateFilter);
  const list = feed.alerts.filter(inState);
  const shown = open ? list : list.slice(0, limit);
  const ageH = Math.max(0, Math.round((Date.now() - new Date(feed.fetched).getTime()) / 36e5));
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row tiny muted" style={{ justifyContent: "space-between" }}>
        <span>NDMA SACHET · {feed.count} active alerts · {feed.matched} matched to districts</span>
        <span className={ageH > 12 ? "down" : ""}>snapshot {ageH < 1 ? "<1" : ageH} h old</span>
      </div>
      {shown.length === 0 && <div className="tiny muted">No active official alerts for this selection in the snapshot.</div>}
      <ul className="alerts">
        {shown.map((a) => (
          <li key={a.id} className={`sev${a.severity}`}>
            <span className="ico">{ALERT_KIND_ICON[a.kind] ?? "⚠️"}</span>
            <span className="grow">
              <span className="tiny muted">{a.source}{a.time ? ` · ${new Date(a.time).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}</span>
              <span className="small" style={{ display: "block" }}>{a.title.length > 170 ? `${a.title.slice(0, 168)}…` : a.title}</span>
              {a.districts.length > 0 && (
                <span className="tiny">
                  {a.districts.slice(0, 4).map((id) => (
                    <button key={id} className="linklike" onClick={() => onPick(id)}>{districts.get(id)?.n ?? id}</button>
                  ))}
                  {a.districts.length > 4 && <span className="muted"> +{a.districts.length - 4}</span>}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {list.length > limit && <button className="btn ghost sm" onClick={() => setOpen(!open)}>{open ? "Show fewer" : `Show all ${list.length}`}</button>}
      <div className="tiny muted">Source: sachet.ndma.gov.in CAP feed. Official alerts are shown beside — never merged into — TeraShield's modelled tiers.</div>
    </div>
  );
}
