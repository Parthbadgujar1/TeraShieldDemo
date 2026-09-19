import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { BASEMAPS, type Basemap } from "./IndiaMap";
import { ZONE_COLOR } from "../lib/risk";
import type { LandClass, Pilot } from "../lib/types";

export const LAND_COLOR: Record<LandClass, string> = {
  UNKNOWN: "#43a047", COMMON: "#7cb342", BUILT: "#00897b", PRIVATE_AGRI: "#f9a825", FOREST: "#1b5e20", PROTECTED: "#6a1b9a", WATER: "#1e6fd9",
};

export interface PilotMapProps {
  pilot: Pilot;
  base: Basemap;
  layers: { red: boolean; orange: boolean; villages: boolean; sites: boolean; events: boolean };
  villageId: number | null;
  siteId: number | null;
  /** extra emphasised site ids (e.g. the recommended primary/secondary) */
  highlightSites?: number[];
  onVillage: (id: number) => void;
  onSite: (id: number) => void;
  fitKey: number;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export default function PilotMap(props: PilotMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const groups = useRef<Record<string, L.LayerGroup>>({});
  const overlay = useRef<L.LayerGroup | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    if (!el.current) return;
    const p = propsRef.current.pilot;
    const map = L.map(el.current, { preferCanvas: true, minZoom: 8, maxZoom: 17, zoomSnap: 0.25 });
    map.fitBounds([[p.district.bbox[0], p.district.bbox[1]], [p.district.bbox[2], p.district.bbox[3]]]);
    mapRef.current = map;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el.current);
    const canvas = L.canvas({ padding: 0.3 });

    const polys = (list: number[][][][], color: string, opacity: number) => L.layerGroup(list.map((rings) =>
      L.polygon(rings.map((r) => r.map(([lon, lat]) => [lat, lon] as [number, number])), { renderer: canvas, color, weight: 0.6, fillColor: color, fillOpacity: opacity, interactive: false })));
    groups.current.orange = polys(p.orange, ZONE_COLOR.ORANGE, 0.32);
    groups.current.red = polys(p.red, ZONE_COLOR.RED, 0.5);

    groups.current.events = L.layerGroup(p.events.map((e) =>
      L.circleMarker([e.lat, e.lon], { renderer: canvas, radius: 6, color: "#000", weight: 1.5, fillColor: "#ffeb3b", fillOpacity: 1 })
        .bindTooltip(`<b>Catalogued landslide${e.year ? ` ${e.year}` : ""}</b><br>${esc(e.title)}${e.fat ? `<br>${e.fat} killed` : ""}${e.cls ? `<br>model class here: ${e.cls}` : ""}`)));

    groups.current.villages = L.layerGroup(p.villages.map((v) =>
      L.circleMarker([v.lat, v.lon], {
        renderer: canvas, radius: Math.max(4, Math.min(13, 2 + Math.sqrt(v.pop) / 6)), color: "#fff", weight: 1.2, fillColor: ZONE_COLOR[v.zone], fillOpacity: 0.95,
      }).bindTooltip(`<b>${esc(v.name)}</b> · ${v.zone}<br>${v.pop.toLocaleString("en-IN")} people (est.) · ${v.bld} mapped buildings`).on("click", () => propsRef.current.onVillage(v.id))));

    groups.current.sites = L.layerGroup(p.sites.map((s) =>
      L.circleMarker([s.lat, s.lon], {
        renderer: canvas, radius: Math.max(4, Math.min(11, 2 + Math.sqrt(s.area) / 1.6)), color: "#0b3d6e", weight: 1.2, fillColor: LAND_COLOR[s.land], fillOpacity: 0.85,
      }).bindTooltip(`<b>Site ${s.id}</b> · ${s.area} ha · ${s.land.replace("_", " ").toLowerCase()}<br>holds ~${s.cap_hh} households`).on("click", () => propsRef.current.onSite(s.id))));

    overlay.current = L.layerGroup().addTo(map);
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; groups.current = {}; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    tileRef.current?.remove();
    const b = BASEMAPS[props.base];
    tileRef.current = L.tileLayer(b.url, { attribution: b.attr, maxZoom: 17, maxNativeZoom: b.max }).addTo(map);
    tileRef.current.bringToBack();
  }, [props.base]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const order: [string, boolean][] = [["orange", props.layers.orange], ["red", props.layers.red], ["events", props.layers.events], ["sites", props.layers.sites], ["villages", props.layers.villages]];
    for (const [k, on] of order) {
      const g = groups.current[k];
      if (!g) continue;
      if (on && !map.hasLayer(g)) g.addTo(map);
      if (!on && map.hasLayer(g)) map.removeLayer(g);
    }
  }, [props.layers]);

  // selection overlay: ring around the chosen village, ring(s) around highlighted sites and a dashed line between them
  useEffect(() => {
    const map = mapRef.current;
    const ov = overlay.current;
    if (!map || !ov) return;
    ov.clearLayers();
    const p = props.pilot;
    const v = props.villageId != null ? p.villages.find((x) => x.id === props.villageId) : null;
    if (v) L.circleMarker([v.lat, v.lon], { radius: 16, color: "#072a4d", weight: 3, fillOpacity: 0, interactive: false }).addTo(ov);
    for (const sid of props.highlightSites ?? []) {
      const s = p.sites.find((x) => x.id === sid);
      if (!s) continue;
      L.circleMarker([s.lat, s.lon], { radius: 15, color: "#ff9933", weight: 4, fillOpacity: 0, interactive: false }).addTo(ov);
      if (v) L.polyline([[v.lat, v.lon], [s.lat, s.lon]], { color: "#ff9933", weight: 3, dashArray: "6 6", interactive: false }).addTo(ov);
    }
    const sel = props.siteId != null ? p.sites.find((x) => x.id === props.siteId) : null;
    if (sel) L.circleMarker([sel.lat, sel.lon], { radius: 14, color: "#0b3d6e", weight: 3, fillOpacity: 0, interactive: false }).addTo(ov);
  }, [props.villageId, props.siteId, props.highlightSites, props.pilot]);

  // fly to the selected village (and its recommended site)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || props.villageId == null) return;
    const p = props.pilot;
    const v = p.villages.find((x) => x.id === props.villageId);
    if (!v) return;
    const pts: [number, number][] = [[v.lat, v.lon]];
    for (const sid of props.highlightSites ?? []) { const s = p.sites.find((x) => x.id === sid); if (s) pts.push([s.lat, s.lon]); }
    map.flyToBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 14, duration: 0.6 });
  }, [props.villageId, props.fitKey]);

  return <div ref={el} className="map-canvas" role="application" aria-label={`Habitation-level red-zone map of ${props.pilot.district.name}`} style={{ position: "absolute", inset: 0 }} />;
}
