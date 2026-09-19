import { useMemo, useState } from "react";
import DistrictDetail from "../components/DistrictDetail";
import ErrorBoundary from "../components/ErrorBoundary";
import IndiaMap, { BASEMAPS, type Basemap } from "../components/IndiaMap";
import { AlertControls, SachetPanel } from "../components/AlertControls";
import { DistrictPicker, ErrorBox, LegendZones, Loading } from "../components/ui";
import { useAlertDistricts, useDataset, useDistrictParam } from "../lib/data";
import { useLiveOutlook, useReplayChoice, useViewMode } from "../lib/useLive";
import { HAZARDS, ZONE_COLOR, ZONE_LABEL, ZONES, compact, zoneRows, zoneSummary, type Layer } from "../lib/risk";
import type { Zone } from "../lib/types";

export default function GisDashboard() {
  const { data, error } = useDataset();
  const [selectedId, setSelectedId] = useDistrictParam(data);
  const [layer, setLayer] = useState<Layer>("all");
  const [mode, setMode] = useViewMode();
  const [zoneOn, setZoneOn] = useState<Set<Zone>>(new Set(ZONES));
  const [stateF, setStateF] = useState("");
  const [base, setBase] = useState<Basemap>("light");
  const [panelOpen, setPanelOpen] = useState(() => window.matchMedia("(min-width: 901px)").matches);

  const [replayId, setReplay] = useReplayChoice();
  const liveState = useLiveOutlook(data, mode, setMode, replayId);
  const { live } = liveState;
  const [showAlerts, setShowAlerts] = useState(true);
  const alertIds = useAlertDistricts();

  const rows = useMemo(() => (data ? zoneRows(data.districts, layer, live, stateF) : []), [data, layer, live, stateF]);
  const { counts, redPop, escalated } = useMemo(() => zoneSummary(rows), [rows]);
  const top = useMemo(() => rows.filter((r) => zoneOn.has(r.zone)).sort((a, b) => b.value - a.value).slice(0, 8), [rows, zoneOn]);

  if (error) return <div className="page"><ErrorBox text={`Could not load the hazard dataset: ${error}`} /></div>;
  if (!data) return <Loading text="Loading India hazard dataset…" />;

  const selected = selectedId != null ? data.byId.get(selectedId) ?? null : null;
  const toggleZone = (z: Zone) => setZoneOn((s) => { const n = new Set(s); if (n.has(z)) { if (n.size > 1) n.delete(z); } else n.add(z); return n; });
  const pick = (id: number) => { const d = data.byId.get(id); if (d) { setSelectedId(id); if (stateF && d.s !== stateF) setStateF(d.s); } };
  const layerLabel = layer === "all" ? "multi-hazard" : HAZARDS.find((h) => h.key === layer)!.label.toLowerCase();

  return (
    <div className="gis">
      <button className="panel-toggle btn sm" onClick={() => setPanelOpen(!panelOpen)} aria-expanded={panelOpen}>
        {panelOpen ? "Hide controls" : "Show controls"}
      </button>
      <aside className={`gis-panel${panelOpen ? "" : " closed"}`} aria-label="Map controls">
        <div className="stack" style={{ gap: 16 }}>
          <div>
            <div className="label">Hazard layer</div>
            <div className="chips">
              <button className={`chip${layer === "all" ? " on" : ""}`} onClick={() => setLayer("all")}>◎ All hazards</button>
              {HAZARDS.map((h) => (
                <button key={h.key} className={`chip${layer === h.key ? " on" : ""}`} onClick={() => setLayer(h.key)}>{h.icon} {h.short}</button>
              ))}
            </div>
          </div>

          <div>
            <div className="label">Time view</div>
            <AlertControls mode={mode} setMode={setMode} replayId={replayId} setReplay={setReplay} state={liveState} escalated={escalated} />
          </div>

          <div>
            <div className="label">Find a place</div>
            <div className="stack" style={{ gap: 8 }}>
              <DistrictPicker
                compact
                allowAllStates allowAllDistricts
                states={data.states} byState={data.byState}
                stateValue={stateF}
                districtId={selected && (!stateF || selected.s === stateF) ? selected.id : null}
                onState={(s) => { setStateF(s); if (selected && s && selected.s !== s) setSelectedId(null); }}
                onDistrict={(id) => (id == null ? setSelectedId(null) : pick(id))}
              />
            </div>
          </div>

          <div>
            <div className="label">Hazard tier ({layerLabel})</div>
            <div className="chips">
              {ZONES.map((z) => (
                <button key={z} className={`chip zone-chip${zoneOn.has(z) ? " on" : ""}`} style={zoneOn.has(z) ? { background: ZONE_COLOR[z], borderColor: ZONE_COLOR[z], color: z === "YELLOW" ? "#3b2c00" : "#fff" } : undefined} onClick={() => toggleZone(z)}>
                  {ZONE_LABEL[z]} · {counts[z]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid g2" style={{ gap: 8 }}>
            <div className="stat red"><b>{counts.RED}</b><span>very-high-hazard districts</span></div>
            <div className="stat"><b>{compact(redPop)}</b><span>people living in them</span></div>
          </div>
          <p className="tiny muted" style={{ marginTop: -8 }}>
            A screening figure, <b>not</b> a relocation need. A district is a hazard tier; red zones (land unsuitable for permanent habitation) are decided per habitation — pilot: Wayanad, in Relocation Intelligence.
          </p>

          <div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="label" style={{ margin: 0 }}>Official alerts</div>
              <label className="tiny row" style={{ gap: 4 }}><input type="checkbox" checked={showAlerts} onChange={(e) => setShowAlerts(e.target.checked)} /> outline on map</label>
            </div>
            <SachetPanel districts={data.byId} onPick={pick} stateFilter={stateF} />
          </div>

          <div>
            <div className="label">Highest {layerLabel} risk {stateF ? `in ${stateF}` : "in India"}</div>
            <ol className="toplist">
              {top.map(({ d, zone, value }) => (
                <li key={d.id}>
                  <button className={selectedId === d.id ? "on" : ""} onClick={() => pick(d.id)}>
                    <span className="dot" style={{ background: ZONE_COLOR[zone] }} />
                    <span className="grow" style={{ textAlign: "left" }}>{d.n}<span className="muted tiny"> · {d.s}</span></span>
                    <b className="num">{value.toFixed(0)}%</b>
                  </button>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <div className="label">Legend</div>
            <LegendZones counts={counts} />
            <p className="tiny muted" style={{ marginTop: 6 }}>
              {layer === "all"
                ? "Tier = flood, landslide, cloudburst and cyclone probability (worst hazard blended with the next two). Heat feeds vulnerability; the coastal index can lift a district to High only."
                : layer === "coastal"
                  ? "Coastal erosion is a susceptibility index, not a probability (erosion is a retreat rate in m/yr)."
                  : `Tier = ${layerLabel} annual probability: ≥ 45% very high, ≥ 30% high, ≥ 15% moderate.`}
            </p>
          </div>
        </div>
      </aside>

      <section className="gis-map" aria-label="Hazard map">
        <IndiaMap districts={data.districts} layer={layer} live={live} zoneOn={zoneOn} stateFilter={stateF} selectedId={selectedId} onSelect={pick} base={base} alertIds={showAlerts ? alertIds : undefined} />
        <div className="map-tools">
          <div className="seg" role="group" aria-label="Base map">
            {(Object.keys(BASEMAPS) as Basemap[]).map((b) => (
              <button key={b} className={base === b ? "on" : ""} onClick={() => setBase(b)}>{BASEMAPS[b].label}</button>
            ))}
          </div>
        </div>
        <div className="map-badge">
          {mode === "live" && live ? <><span className="live-dot" /> 72 h alert overlay{liveState.source === "replay" ? " · replay" : ""}</> : "Annual baseline"} · {layer === "all" ? "multi-hazard" : layerLabel}
        </div>
        {!selected && <div className="map-hint">Click any district for hazards, exposure, relocation need and live conditions</div>}
        {selected && <ErrorBoundary label="The district panel" resetKey={selected.id}><DistrictDetail d={selected} live={live?.get(selected.id) ?? null} data={data} onClose={() => setSelectedId(null)} /></ErrorBoundary>}
      </section>
    </div>
  );
}

