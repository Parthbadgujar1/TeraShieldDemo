import type { ReactNode } from "react";
import { CLASS_NAME, ZONE_COLOR, ZONE_LABEL, zoneForHazard } from "../lib/risk";
import type { District, HazardKey, Zone } from "../lib/types";
import { HAZARD_BY_KEY, ZONES } from "../lib/risk";

export function ZoneBadge({ zone, label }: { zone: Zone; label?: string }) {
  return <span className={`zone ${zone}`}>{label ?? ZONE_LABEL[zone]}</span>;
}

export function HazardClass({ pct }: { pct: number }) {
  const z = zoneForHazard(pct);
  return <span className={`zone ${z}`}>{CLASS_NAME[z]}</span>;
}

export function Bar({ value, max = 100, color, large }: { value: number; max?: number; color?: string; large?: boolean }) {
  const w = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`bar${large ? " lg" : ""}`} role="img" aria-label={`${value.toFixed(0)} of ${max}`}>
      <i style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

export function Stat({ value, label, tone }: { value: ReactNode; label: string; tone?: "red" | "orange" }) {
  return (
    <div className={`stat ${tone ?? ""}`}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

export function Provenance({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="prov">
      <summary>{title}</summary>
      <div>{children}</div>
    </details>
  );
}

export function Loading({ text = "Loading…" }: { text?: string }) {
  return (
    <div className="loading-screen" role="status">
      <span className="spinner" />
      <span>{text}</span>
    </div>
  );
}

export function ErrorBox({ text }: { text: string }) {
  return <div className="notice err" role="alert">{text}</div>;
}

export function HazardDot({ h }: { h: HazardKey }) {
  return <span className="dot" style={{ background: HAZARD_BY_KEY[h].color }} />;
}

export function LegendZones({ counts }: { counts?: Record<Zone, number> }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      {ZONES.map((z) => (
        <div key={z} className="row" style={{ gap: 8 }}>
          <span className="dot" style={{ background: ZONE_COLOR[z], width: 14, height: 14, borderRadius: 3 }} />
          <span className="small grow"><b>{ZONE_LABEL[z]}</b></span>
          {counts && <span className="small num muted">{counts[z]}</span>}
        </div>
      ))}
    </div>
  );
}

/** State → district cascading selectors shared by all four modules. */
export function DistrictPicker({
  states, byState, stateValue, districtId, onState, onDistrict, allowAllStates = false, allowAllDistricts = false, compact = false,
}: {
  states: string[];
  byState: Map<string, District[]>;
  stateValue: string;
  districtId: number | null;
  onState: (s: string) => void;
  onDistrict: (id: number | null) => void;
  allowAllStates?: boolean;
  allowAllDistricts?: boolean;
  compact?: boolean;
}) {
  const list = stateValue ? byState.get(stateValue) ?? [] : [];
  return (
    <>
      <div className="field" style={compact ? undefined : { minWidth: 190 }}>
        <label htmlFor="pick-state">State / UT</label>
        <select id="pick-state" value={stateValue} onChange={(e) => onState(e.target.value)}>
          {allowAllStates && <option value="">All India</option>}
          {states.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="field" style={compact ? undefined : { minWidth: 190 }}>
        <label htmlFor="pick-district">District</label>
        <select
          id="pick-district"
          value={districtId ?? ""}
          disabled={!stateValue}
          onChange={(e) => onDistrict(e.target.value === "" ? null : Number(e.target.value))}
        >
          {allowAllDistricts && <option value="">{stateValue ? "All districts" : "Select a state first"}</option>}
          {list.map((d) => <option key={d.id} value={d.id}>{d.n}</option>)}
        </select>
      </div>
    </>
  );
}
