import { lazy, Suspense, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertControls } from "../components/AlertControls";
import ErrorBoundary from "../components/ErrorBoundary";
import { ErrorBox, Loading } from "../components/ui";
import { currentSession } from "../lib/auth";
import { useDataset } from "../lib/data";
import { KEYS, useStore, type FieldReport, type Incident } from "../lib/ops";
import { zoneRows, zoneSummary, type Layer } from "../lib/risk";
import { useLiveOutlook, useReplayChoice, useViewMode } from "../lib/useLive";
import { EmergencyContext, type RescueRow } from "./emergency/context";

const Operations = lazy(() => import("./emergency/Operations"));
const Shelters = lazy(() => import("./emergency/Shelters"));
const Incidents = lazy(() => import("./emergency/Incidents"));
const FieldInbox = lazy(() => import("./emergency/FieldInbox"));
const Sitrep = lazy(() => import("./emergency/Sitrep"));
const Directory = lazy(() => import("./emergency/Directory"));

type Tab = "ops" | "shelters" | "incidents" | "field" | "sitrep" | "directory";
const TAB_KEY = "ts_em_tab";

/**
 * Emergency Operations console: the hazard picture (same shared maths as the admin dashboard), plus the registers a control room
 * actually runs on — shelters, resources, incidents, field reports — a situation-report generator and a contact directory.
 */
export default function EmergencyPortal() {
  const { data, error } = useDataset();
  const navigate = useNavigate();
  const user = currentSession()?.user ?? "control_room";
  const [tab, setTab] = useState<Tab>(() => { try { return (localStorage.getItem(TAB_KEY) as Tab) || "ops"; } catch { return "ops"; } });
  const pick = (t: Tab) => { setTab(t); try { localStorage.setItem(TAB_KEY, t); } catch { /* private mode */ } };

  const [mode, setMode] = useViewMode();
  const [stateF, setStateF] = useState("");
  const [hazard, setHazard] = useState<Layer>("all");
  const [selId, setSelId] = useState<number | null>(null);
  const [replayId, setReplay] = useReplayChoice();
  const liveState = useLiveOutlook(data, mode, setMode, replayId);
  const { live, progress, stamp, failed } = liveState;
  const [incidents] = useStore<Incident>(KEYS.incidents);
  const [reports] = useStore<FieldReport>(KEYS.reports);

  // Same zone maths as the admin dashboard (lib/risk.ts) — the two portals cannot disagree.
  const all = useMemo(() => (data ? zoneRows(data.districts, hazard, live, stateF) : []), [data, hazard, live, stateF]);
  const rows: RescueRow[] = useMemo(
    () => all
      .map((r) => ({ ...r, dom: live?.get(r.d.id)?.dom ?? r.d.dom, priority: (r.value / 100) * (0.5 * (r.d.expo.idx / 100) + 0.5 * (r.d.vuln / 100)) * 100 }))
      .sort((a, b) => b.priority - a.priority),
    [all, live],
  );

  if (error) return <div className="page"><ErrorBox text={error} /></div>;
  if (!data) return <Loading text="Loading emergency data…" />;

  const { counts, redPop, redExposed, escalated } = zoneSummary(all);
  const loading = mode === "live" && progress !== null;
  const openInc = incidents.filter((i) => i.status === "open").length;
  const pendingRep = reports.filter((r) => ["submitted", "acknowledged", "escalated"].includes(r.status)).length;

  const ctx = { data, mode, setMode, replayId, setReplay, liveState, stateF, setStateF, hazard, setHazard, selId, setSelId, rows, counts, redPop, redExposed, escalated, user };
  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: "ops", label: "Operations" },
    { key: "shelters", label: "Shelters & resources" },
    { key: "incidents", label: "Incident log", badge: openInc },
    { key: "field", label: "Field reports", badge: pendingRep },
    { key: "sitrep", label: "Situation report" },
    { key: "directory", label: "Directory" },
  ];

  return (
    <div className="page">
      <div className="em-banner">
        <div>
          <b>Emergency Operations Console</b>
          <div className="small">
            {loading ? <><span className="spinner" /> Pulling the live 72-hour forecast for {data.districts.length} districts… {progress?.done}/{progress?.total}</>
              : live ? <>72-hour alert overlay · {liveState.source === "replay" ? `replay of ${liveState.replay?.title}` : `updated ${stamp?.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}${liveState.source === "stale" ? " (cached — API unavailable)" : ""}`} · baseline tiers never fall</>
                : <>Annual baseline — the same figures the state dashboard shows{failed ? " (forecast unreachable)" : ""}</>}
          </div>
        </div>
        <button className="btn sm saffron no-print" onClick={() => navigate({ pathname: "/relocation", search: selId != null ? `?d=${selId}` : "" })}>Evacuation planner →</button>
        {live && <span className="live-pill"><span className="live-dot" /> LIVE</span>}
      </div>

      <div className="card card-pad no-print" style={{ marginBottom: 14 }}>
        <AlertControls mode={mode} setMode={setMode} replayId={replayId} setReplay={setReplay} state={liveState} escalated={escalated} />
      </div>

      <div className="tabs no-print" role="tablist" aria-label="Emergency console" style={{ marginBottom: 14 }}>
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? "on" : ""} onClick={() => pick(t.key)}>
            {t.label}{t.badge ? <span className="badge-n">{t.badge}</span> : null}
          </button>
        ))}
      </div>

      <EmergencyContext.Provider value={ctx}>
        <ErrorBoundary label="This tab" resetKey={tab}>
          <Suspense fallback={<Loading text="Loading…" />}>
            {tab === "ops" && <Operations />}
            {tab === "shelters" && <Shelters />}
            {tab === "incidents" && <Incidents />}
            {tab === "field" && <FieldInbox />}
            {tab === "sitrep" && <Sitrep />}
            {tab === "directory" && <Directory />}
          </Suspense>
        </ErrorBoundary>
      </EmergencyContext.Provider>
    </div>
  );
}
