import { createContext, useContext } from "react";
import type { Dataset } from "../../lib/data";
import type { ZoneRow, Layer } from "../../lib/risk";
import type { LiveState, ViewMode } from "../../lib/useLive";
import type { HazardKey, Zone } from "../../lib/types";

export interface RescueRow extends ZoneRow { dom: HazardKey; priority: number }

/** Everything the emergency tabs share, so the map, the priority list and the situation report always agree. */
export interface EmergencyCtx {
  data: Dataset;
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
  replayId: string;
  setReplay: (id: string) => void;
  liveState: LiveState;
  stateF: string;
  setStateF: (s: string) => void;
  hazard: Layer;
  setHazard: (h: Layer) => void;
  selId: number | null;
  setSelId: (id: number | null) => void;
  rows: RescueRow[];
  counts: Record<Zone, number>;
  redPop: number;
  redExposed: number;
  escalated: number;
  user: string;
}

export const EmergencyContext = createContext<EmergencyCtx | null>(null);

export function useEmergency(): EmergencyCtx {
  const c = useContext(EmergencyContext);
  if (!c) throw new Error("useEmergency must be used inside the emergency portal");
  return c;
}
