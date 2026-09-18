import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dataset } from "./data";
import { fetchForecasts } from "./live";
import { liveOutlook, type LiveResult } from "./liveRisk";
import type { Forecast } from "./types";

export type ViewMode = "annual" | "live";

const KEY = "ts_view_mode";

/**
 * The annual-vs-live choice is shared by every portal and persisted, so the admin dashboard and the emergency
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

export interface LiveState {
  live: Map<number, LiveResult> | null;
  progress: { done: number; total: number } | null;
  stamp: Date | null;
  failed: boolean;
}

/** Fetches (and caches) the 72-hour forecast for every district while the live view is on, and scores it. */
export function useLiveOutlook(data: Dataset | null, mode: ViewMode, setMode: (m: ViewMode) => void): LiveState {
  const [forecasts, setForecasts] = useState<Map<number, Forecast> | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [stamp, setStamp] = useState<Date | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (mode !== "live" || !data || forecasts) return;
    let alive = true;
    setFailed(false);
    setProgress({ done: 0, total: data.districts.length });
    fetchForecasts(data.districts.map((d) => ({ id: d.id, lat: d.lat, lon: d.lon })), (done, total) => alive && setProgress({ done, total }))
      .then((m) => {
        if (!alive) return;
        setProgress(null);
        if (m.size === 0) { setFailed(true); setMode("annual"); return; }
        setForecasts(m);
        setStamp(new Date());
      })
      .catch(() => { if (alive) { setProgress(null); setFailed(true); setMode("annual"); } });
    return () => { alive = false; };
  }, [mode, data, forecasts, setMode]);

  const live = useMemo(() => {
    if (mode !== "live" || !forecasts || !data) return null;
    const m = new Map<number, LiveResult>();
    for (const d of data.districts) { const f = forecasts.get(d.id); if (f) m.set(d.id, liveOutlook(d, f)); }
    return m;
  }, [mode, forecasts, data]);

  return { live, progress, stamp, failed };
}
