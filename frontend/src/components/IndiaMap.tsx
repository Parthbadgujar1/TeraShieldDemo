import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { loadDistrictGeo, loadStateGeo } from "../lib/data";
import type { LiveResult } from "../lib/liveRisk";
import { CLASS_NAME, HAZARD_BY_KEY, ZONE_COLOR, ZONE_LABEL, zoneAndValue, type Layer } from "../lib/risk";
import type { District, Zone } from "../lib/types";

export type { Layer };
export type Basemap = "light" | "street" | "terrain" | "satellite";

export const BASEMAPS: Record<Basemap, { url: string; attr: string; label: string; max: number }> = {
  light: { label: "Clean", url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", attr: "Tiles © Esri — Esri, HERE, Garmin, OpenStreetMap contributors", max: 16 },
  street: { label: "Street", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attr: "© OpenStreetMap contributors", max: 19 },
  terrain: { label: "Terrain", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}", attr: "Tiles © Esri — Esri, HERE, Garmin, USGS, NGA", max: 18 },
  satellite: { label: "Satellite", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr: "Tiles © Esri — Maxar, Earthstar Geographics", max: 18 },
};

export interface IndiaMapProps {
  districts: District[];
  layer: Layer;
  live: Map<number, LiveResult> | null;
  zoneOn: Set<Zone>;
  stateFilter: string;
  selectedId: number | null;
  onSelect: (id: number) => void;
  base: Basemap;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export default function IndiaMap(props: IndiaMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const geoRef = useRef<L.GeoJSON | null>(null);
  const byIdRef = useRef(new Map<number, L.Path>());
  const propsRef = useRef(props);
  propsRef.current = props;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const styleFor = (id: number): L.PathOptions => {
    const p = propsRef.current;
    const d = p.districts[id] && p.districts[id].id === id ? p.districts[id] : p.districts.find((x) => x.id === id);
    if (!d) return { fillOpacity: 0, opacity: 0 };
    const { zone } = zoneAndValue(d, p.layer, p.live);
    const shown = p.zoneOn.has(zone) && (!p.stateFilter || d.s === p.stateFilter);
    const sel = p.selectedId === id;
    return {
      fillColor: ZONE_COLOR[zone],
      fillOpacity: shown ? 0.74 : 0.05,
      color: sel ? "#072a4d" : "#ffffff",
      weight: sel ? 2.6 : 0.5,
      opacity: shown || sel ? 1 : 0.35,
    };
  };

  // one-time map + geometry
  useEffect(() => {
    if (!el.current) return;
    const map = L.map(el.current, {
      preferCanvas: true, minZoom: 4, maxZoom: 13, zoomSnap: 0.25, attributionControl: true,
      maxBounds: [[-2, 58], [44, 108]], maxBoundsViscosity: 0.7,
    });
    map.fitBounds([[6.2, 68.1], [36.8, 97.6]]);
    mapRef.current = map;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el.current);

    let dead = false;
    Promise.all([loadDistrictGeo(), loadStateGeo()])
      .then(([dg, sg]) => {
        if (dead) return;
        const layer = L.geoJSON(dg as any, {
          style: (f) => styleFor(Number(f!.id)),
          onEachFeature: (f, l) => {
            const id = Number(f.id);
            byIdRef.current.set(id, l as L.Path);
            l.on("click", () => propsRef.current.onSelect(id));
            l.on("mouseover", () => { if (propsRef.current.selectedId !== id) (l as L.Path).setStyle({ weight: 1.8, color: "#0b3d6e" }); });
            l.on("mouseout", () => (l as L.Path).setStyle(styleFor(id)));
            (l as L.Path).bindTooltip(() => {
              const p = propsRef.current;
              const d = p.districts.find((x) => x.id === id);
              if (!d) return "";
              const { zone, value, isLive } = zoneAndValue(d, p.layer, p.live);
              const what = p.layer === "all" ? "Multi-hazard probability" : `${HAZARD_BY_KEY[p.layer].label} probability`;
              return `<b>${esc(d.n)}</b><br><span style="color:#5a6b7b">${esc(d.s)}</span><br>`
                + `<span style="color:${ZONE_COLOR[zone]};font-weight:700">${ZONE_LABEL[zone]}</span> · ${CLASS_NAME[zone]}<br>`
                + `${what}: <b>${value.toFixed(0)}%</b>${isLive ? " (72 h outlook)" : " (annual)"}`;
            }, { sticky: true, direction: "top", className: "ts-tip" });
          },
        }).addTo(map);
        geoRef.current = layer;
        L.geoJSON(sg as any, { style: { color: "#072a4d", weight: 1, fill: false, opacity: 0.55 }, interactive: false }).addTo(map);
        setReady(true);
      })
      .catch(() => setFailed(true));

    return () => { dead = true; ro.disconnect(); map.remove(); mapRef.current = null; geoRef.current = null; byIdRef.current.clear(); };
  }, []);

  // basemap
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    tileRef.current?.remove();
    const b = BASEMAPS[props.base];
    tileRef.current = L.tileLayer(b.url, { attribution: b.attr, maxZoom: 13, maxNativeZoom: b.max }).addTo(map);
    tileRef.current.bringToBack();
  }, [props.base]);

  // restyle when any driver changes
  useEffect(() => {
    if (!ready) return;
    byIdRef.current.forEach((path, id) => path.setStyle(styleFor(id)));
    if (props.selectedId != null) byIdRef.current.get(props.selectedId)?.bringToFront();
  }, [ready, props.layer, props.live, props.zoneOn, props.stateFilter, props.selectedId, props.districts]);

  // fly to state
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (!props.stateFilter) { map.flyToBounds([[6.2, 68.1], [36.8, 97.6]], { duration: 0.6 }); return; }
    const b = L.latLngBounds([]);
    props.districts.forEach((d) => { if (d.s === props.stateFilter) { const p = byIdRef.current.get(d.id) as L.Polygon | undefined; if (p) b.extend(p.getBounds()); } });
    if (b.isValid()) map.flyToBounds(b, { padding: [24, 24], duration: 0.6, maxZoom: 8 });
  }, [ready, props.stateFilter]);

  // fly to selected district
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || props.selectedId == null) return;
    const p = byIdRef.current.get(props.selectedId) as L.Polygon | undefined;
    if (p) map.flyToBounds(p.getBounds(), { padding: [40, 40], duration: 0.6, maxZoom: 9 });
  }, [ready, props.selectedId]);

  return (
    <div className="map-shell">
      <div ref={el} className="map-canvas" role="application" aria-label="Interactive map of India hazard zones by district" />
      {!ready && !failed && <div className="map-overlay"><span className="spinner" /> Loading district boundaries…</div>}
      {failed && <div className="map-overlay err">Could not load map boundaries. Check your connection and reload.</div>}
    </div>
  );
}
