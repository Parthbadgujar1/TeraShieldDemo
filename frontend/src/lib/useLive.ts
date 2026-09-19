import { useCallback, useEffect, useMemo, useState } from "react";
import { loadReplays, type Dataset } from "./data";
import { fetchForecasts, forecastMeta, type ForecastSource } from "./live";
import { liveOutlook, type LiveResult } from "./liveRisk";
import type { Forecast, ReplayEvent } from "./types";

export type ViewMode = "annual" | "live";

const KEY = "ts_view_mode";
const REPLAY_KEY = "ts_replay";

/**
 * The annual-vs-alert choice is shared by every portal and persisted, so the admin dashboard and the emergency
 * team always look at the same numbers unless someone deliberately changes the view.
 */
export function useViewMode(): [ViewMode, (m: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(() => {
    try { return localStorage.getItem(KEY) === "live" ? "live" : "annual"; } catch { return "annual"; }
  });
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) setMode(e.newValue === "live" ? "live" : "annual"); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const set = useCallback((m: ViewMode) => {
    setMode(m);
    try { localStorage.setItem(KEY, m); } catch { /* private mode */ }
  }, []);
  return [mode, set];
}

/** Replay = a stored real event (ERA5) fed through the same alert engine, for demos with no network dependency. */
export function useReplayChoice(): [string, (id: string) => void] {
  const [id, setId] = useState<string>(() => { try { return localStorage.getItem(REPLAY_KEY) ?? ""; } catch { return ""; } });
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === REPLAY_KEY) setId(e.newValue ?? ""); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const set = useCallback((v: string) => {
    setId(v);
    try { if (v) localStorage.setItem(REPLAY_KEY, v); else localStorage.removeItem(REPLAY_KEY); } catch { /* private mode */ }
  }, []);
  return [id, set];
}

export interface LiveState {
  live: Map<number, LiveResult> | null;
  progress: { done: number; total: number } | null;
  stamp: Date | null;
  failed: boolean;
  source: ForecastSource | "replay";
  replay: ReplayEvent | null;
}

/**
 * Fetches (and caches) the 72-hour forecast for every district while the alert view is on, and scores it. The result is an
 * overlay: zones never fall below their evidence-based baseline (see liveRisk.ts).
 */
export function useLiveOutlook(data: Dataset | null, mode: ViewMode, setMode: (m: ViewMode) => void, replayId = ""): LiveState {
  const [forecasts, setForecasts] = useState<Map<number, Forecast> | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [stamp, setStamp] = useState<Date | null>(null);
  const [failed, setFailed] = useState(false);
  const [source, setSource] = useState<ForecastSource | "replay">("live");
  const [replay, setReplay] = useState<ReplayEvent | null>(null);

  // a different replay (or leaving replay) invalidates the loaded forecast set
  useEffect(() => { setForecasts(null); setReplay(null); }, [replayId]);

  useEffect(() => {
    if (mode !== "live" || !data || forecasts) return;
    let alive = true;
    setFailed(false);
    if (replayId) {
      loadReplays().then((pack) => {
        if (!alive) return;
        const ev = pack.events.find((e) => e.id === replayId);
        if (!ev) { setFailed(true); return; }
        const m = new Map<number, Forecast>();
        for (const [id, f] of Object.entries(ev.f)) {
          m.set(Number(id), { rain: [], rain3: f[0], rainMax: f[1], hourlyMax: f[2], peakHour: f[3], tmaxMax: f[4], gustMax: f[5] });
        }
        setReplay(ev); setSource("replay"); setStamp(new Date(ev.asof)); setForecasts(m);
      }).catch(() => alive && setFailed(true));
      return () => { alive = false; };
    }
    setProgress({ done: 0, total: data.districts.length });
    fetchForecasts(data.districts.map((d) => ({ id: d.id, lat: d.lat, lon: d.lon })), (done, total) => alive && setProgress({ done, total }))
      .then((m) => {
        if (!alive) return;
        setProgress(null);
        if (m.size === 0) { setFailed(true); setMode("annual"); return; }
        setSource(forecastMeta.source);
        setForecasts(m);
        setStamp(new Date(forecastMeta.t || Date.now()));
      })
      .catch(() => { if (alive) { setProgress(null); setFailed(true); setMode("annual"); } });
    return () => { alive = false; };
  }, [mode, data, forecasts, setMode, replayId]);

  const live = useMemo(() => {
    if (mode !== "live" || !forecasts || !data) return null;
    const m = new Map<number, LiveResult>();
    for (const d of data.districts) { const f = forecasts.get(d.id); if (f) m.set(d.id, liveOutlook(d, f)); }
    return m;
  }, [mode, forecasts, data]);

  return { live, progress, stamp, failed, source, replay };
}
