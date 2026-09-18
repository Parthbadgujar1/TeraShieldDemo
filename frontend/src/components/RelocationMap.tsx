import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { RouteOption } from "../lib/routing";
import type { LatLon } from "../lib/types";
import { BASEMAPS, type Basemap } from "./IndiaMap";

export interface MapCandidate {
  id: string;
  lat: number;
  lon: number;
  safe: boolean;
  rank: number | null; // 1-based among routed options
  score: number | null;
  label: string;
}

export interface RelocationMapProps {
  center: LatLon;
  origin: LatLon | null;
  cands: MapCandidate[];
  selectedId: string | null;
  routes: RouteOption[];
  activeRoute: number | null;
  blocked: Set<string>;
  blockedPrefix: string; // "<candidateId>:"
  onSelect: (id: string) => void;
  onPick: (p: LatLon) => void;
  base: Basemap;
  fitKey: number;
}

const riskColor = (r: number) => (r > 0.6 ? "#d32f2f" : r > 0.3 ? "#f57c00" : "#2e9e4f");

export default function RelocationMap(props: RelocationMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    if (!el.current) return;
    const map = L.map(el.current, { preferCanvas: false, zoomSnap: 0.25, minZoom: 5, maxZoom: 16 }).setView([props.center.lat, props.center.lon], 9);
    layerRef.current = L.layerGroup().addTo(map);
    map.on("click", (e) => propsRef.current.onPick({ lat: e.latlng.lat, lon: e.latlng.lng }));
    mapRef.current = map;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el.current);
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    tileRef.current?.remove();
    const b = BASEMAPS[props.base];
    tileRef.current = L.tileLayer(b.url, { attribution: b.attr, maxZoom: 16, maxNativeZoom: b.max }).addTo(map);
    tileRef.current.bringToBack();
  }, [props.base]);

  useEffect(() => {
    const map = mapRef.current;
    const g = layerRef.current;
    if (!map || !g) return;
    g.clearLayers();
    const p = propsRef.current;

    // routes
    p.routes.forEach((r) => {
      const key = `${p.blockedPrefix}${r.index}`;
      const isBlocked = p.blocked.has(key);
      const active = p.activeRoute === r.index && !isBlocked;
      L.polyline(r.path, {
        color: isBlocked ? "#7a1212" : active ? riskColor(r.risk) : "#5b6f86",
        weight: active ? 6 : 3, opacity: active ? 0.95 : 0.65, dashArray: isBlocked ? "2 8" : active ? undefined : "8 8",
        lineCap: "round",
      }).bindTooltip(`${isBlocked ? "BLOCKED · " : ""}${r.distanceKm.toFixed(0)} km · ${r.durationMin.toFixed(0)} min · hazard exposure ${(r.risk * 100).toFixed(0)}%`, { sticky: true }).addTo(g);
    });
    const act = p.routes.find((r) => r.index === p.activeRoute && !p.blocked.has(`${p.blockedPrefix}${r.index}`));
    act?.samples.forEach((s) => {
      L.circleMarker([s.lat, s.lon], { radius: 5, color: "#fff", weight: 1.5, fillColor: riskColor(s.risk), fillOpacity: 1 })
        .bindTooltip(`Road hazard exposure ${(s.risk * 100).toFixed(0)}%`).addTo(g);
    });

    // candidates
    p.cands.forEach((c) => {
      const sel = p.selectedId === c.id;
      if (c.rank != null) {
        L.marker([c.lat, c.lon], {
          icon: L.divIcon({ className: "", html: `<div class="rk${sel ? " sel" : ""}">${c.rank}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] }),
          zIndexOffset: 500,
        }).bindTooltip(`${c.label}${c.score != null ? ` · score ${(c.score * 100).toFixed(0)}` : ""}`).on("click", () => p.onSelect(c.id)).addTo(g);
      } else {
        L.circleMarker([c.lat, c.lon], {
          radius: 5, weight: 1, color: c.safe ? "#0b3d6e" : "#8a96a3", fillColor: c.safe ? "#7fb2e5" : "#c9d0d8", fillOpacity: c.safe ? 0.85 : 0.6,
        }).bindTooltip(c.safe ? `${c.label} · passed safety screen` : `${c.label} · screened out (local hazard too high)`).on("click", () => p.onSelect(c.id)).addTo(g);
      }
    });

    // origin
    if (p.origin) {
      L.marker([p.origin.lat, p.origin.lon], {
        icon: L.divIcon({ className: "", html: '<div class="origin-pin">🏘️</div>', iconSize: [34, 34], iconAnchor: [17, 17] }),
        zIndexOffset: 1000,
      }).bindTooltip("Affected habitation").addTo(g);
    }
  }, [props.origin, props.cands, props.selectedId, props.routes, props.activeRoute, props.blocked]);

  // fit to the analysed area once per run
  useEffect(() => {
    const map = mapRef.current;
    const p = propsRef.current;
    if (!map || !p.origin) return;
    const pts: [number, number][] = [[p.origin.lat, p.origin.lon], ...p.cands.filter((c) => c.rank != null).map((c) => [c.lat, c.lon] as [number, number])];
    if (pts.length > 1) map.flyToBounds(L.latLngBounds(pts), { padding: [50, 50], duration: 0.6, maxZoom: 12 });
    else map.flyTo([p.origin.lat, p.origin.lon], 10, { duration: 0.6 });
  }, [props.fitKey, props.center.lat, props.center.lon]);

  return <div ref={el} className="rmap" role="application" aria-label="Relocation planning map" />;
}
