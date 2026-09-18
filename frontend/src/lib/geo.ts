import type { LatLon } from "./types";

const R = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Point `km` away from `p` on compass bearing `deg`. */
export function destination(p: LatLon, deg: number, km: number): LatLon {
  const br = rad(deg);
  const lat1 = rad(p.lat);
  const lon1 = rad(p.lon);
  const d = km / R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br));
  const lon2 = lon1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: (lat2 * 180) / Math.PI, lon: (lon2 * 180) / Math.PI };
}

export function bearing(a: LatLon, b: LatLon): number {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export function compass(deg: number): string {
  return COMPASS[Math.round(deg / 45) % 8];
}

/** Distance (km) from p to a polyline given as [lon,lat] pairs — nearest-vertex approximation on a densified line. */
export function distToPolylineKm(p: LatLon, line: number[][]): number {
  let best = Infinity;
  const k = Math.cos(rad(p.lat));
  for (let i = 0; i < line.length - 1; i++) {
    const [x1, y1] = [(line[i][0] - p.lon) * k * 111.32, (line[i][1] - p.lat) * 110.57];
    const [x2, y2] = [(line[i + 1][0] - p.lon) * k * 111.32, (line[i + 1][1] - p.lat) * 110.57];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(x1 * dx + y1 * dy) / l2));
    const d = Math.hypot(x1 + t * dx, y1 + t * dy);
    if (d < best) best = d;
  }
  return best;
}

export function bboxOf(coords: number[][][][] | number[][][]): [number, number, number, number] {
  let minLat = 90, minLon = 180, maxLat = -90, maxLon = -180;
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number") {
      const [lon, lat] = c as number[];
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
      minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
    } else if (Array.isArray(c)) c.forEach(walk);
  };
  walk(coords);
  return [minLat, minLon, maxLat, maxLon];
}

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number, a: number, b: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function googleDirections(o: LatLon, d: LatLon, mode: "driving" | "walking" = "driving"): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${o.lat},${o.lon}&destination=${d.lat},${d.lon}&travelmode=${mode}`;
}
export function googlePlace(p: LatLon): string {
  return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`;
}
export function googleStreetView(p: LatLon): string {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.lat},${p.lon}`;
}
/** Keyless Google Maps embed (satellite optional). */
export function googleEmbed(p: LatLon, zoom = 11, sat = false): string {
  return `https://maps.google.com/maps?q=${p.lat},${p.lon}&z=${zoom}&t=${sat ? "k" : "m"}&output=embed`;
}
export function googleEmbedRoute(o: LatLon, d: LatLon): string {
  return `https://maps.google.com/maps?saddr=${o.lat},${o.lon}&daddr=${d.lat},${d.lon}&dirflg=d&output=embed`;
}
