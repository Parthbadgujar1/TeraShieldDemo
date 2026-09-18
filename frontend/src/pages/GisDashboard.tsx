import { useMemo, useState } from "react";
import DistrictDetail from "../components/DistrictDetail";
import IndiaMap, { BASEMAPS, type Basemap } from "../components/IndiaMap";
import { DistrictPicker, ErrorBox, LegendZones, Loading } from "../components/ui";
import { useDataset, useDistrictParam } from "../lib/data";
import { useLiveOutlook, useViewMode } from "../lib/useLive";
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

  const { live, progress, stamp, failed } = useLiveOutlook(data, mode, setMode);

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
            <div className="seg" role="group" aria-label="Time view">
              <button className={mode === "annual" ? "on" : ""} onClick={() => setMode("annual")}>Annual probability</button>
              <button className={mode === "live" ? "on" : ""} onClick={() => setMode("live")}>Live 72 h outlook</button>
            </div>
            <p className="tiny muted" style={{ marginTop: 6 }}>
              {mode === "annual"
                ? "Climatology 2014–2023 × terrain, rivers, coast, cyclone and landslide history."
                : "Annual probability re-scored from today's Open-Meteo rain, wind and temperature forecast."}
            </p>
            {progress && (
              <div className="row small" style={{ marginTop: 6 }}><span className="spinner" /> Fetching forecasts… {progress.done}/{progress.total}</div>
            )}
            {failed && <div className="notice warn tiny" style={{ marginTop: 6 }}>Live forecast is unreachable right now — showing annual probability.</div>}
            {live && stamp && (
              <div className="notice info tiny" style={{ marginTop: 6 }}>
                Updated {stamp.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · <b>{escalated}</b> district{escalated === 1 ? "" : "s"} escalated vs. baseline
              </div>
            )}
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
            <div className="label">Risk level ({layerLabel})</div>
            <div className="chips">
              {ZONES.map((z) => (
                <button key={z} className={`chip zone-chip${zoneOn.has(z) ? " on" : ""}`} style={zoneOn.has(z) ? { background: ZONE_COLOR[z], borderColor: ZONE_COLOR[z], color: z === "YELLOW" ? "#3b2c00" : "#fff" } : undefined} onClick={() => toggleZone(z)}>
                  {ZONE_LABEL[z].replace(" zone", "")} · {counts[z]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid g2" style={{ gap: 8 }}>
            <div className="stat red"><b>{counts.RED}</b><span>red-zone districts</span></div>
            <div className="stat"><b>{compact(redPop)}</b><span>people in red zones</span></div>
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
                ? "Zone = multi-hazard probability (worst hazard weighted with the next two; heatwave at 40%)."
                : `Zone = ${layerLabel} annual probability: ≥ 45% red, ≥ 30% orange, ≥ 15% yellow.`}
            </p>
          </div>
        </div>
      </aside>

      <section className="gis-map" aria-label="Hazard map">
        <IndiaMap districts={data.districts} layer={layer} live={live} zoneOn={zoneOn} stateFilter={stateF} selectedId={selectedId} onSelect={pick} base={base} />
        <div className="map-tools">
          <div className="seg" role="group" aria-label="Base map">
            {(Object.keys(BASEMAPS) as Basemap[]).map((b) => (
              <button key={b} className={base === b ? "on" : ""} onClick={() => setBase(b)}>{BASEMAPS[b].label}</button>
            ))}
          </div>
        </div>
        <div className="map-badge">
          {mode === "live" && live ? <><span className="live-dot" /> Live 72 h outlook</> : "Annual probability"} · {layer === "all" ? "multi-hazard" : layerLabel}
        </div>
        {!selected && <div className="map-hint">Click any district for hazards, exposure, relocation need and live conditions</div>}
        {selected && <DistrictDetail d={selected} live={live?.get(selected.id) ?? null} data={data} onClose={() => setSelectedId(null)} />}
      </section>
    </div>
  );
}

