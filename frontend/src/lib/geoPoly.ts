import { bboxOf } from "./geo";

type Ring = number[][];

/** Ray-casting point-in-ring, ring = [lon,lat][] */
export function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Polygon = [outer, ...holes] */
export function pointInPolygon(lon: number, lat: number, poly: Ring[]): boolean {
  if (!poly.length || !pointInRing(lon, lat, poly[0])) return false;
  for (let h = 1; h < poly.length; h++) if (pointInRing(lon, lat, poly[h])) return false;
  return true;
}

export function pointInGeometry(lon: number, lat: number, g: { type: string; coordinates: any }): boolean {
  if (g.type === "Polygon") return pointInPolygon(lon, lat, g.coordinates);
  if (g.type === "MultiPolygon") return (g.coordinates as Ring[][]).some((p) => pointInPolygon(lon, lat, p));
  return false;
}

/** Which district polygon contains the point (bounding-box prefilter first). Returns the feature id or null. */
export function districtAt(
  lon: number, lat: number, features: { id?: number | string; geometry: any }[], boxes?: Map<number, [number, number, number, number]>,
): number | null {
  for (const f of features) {
    const id = Number(f.id);
    let b = boxes?.get(id);
    if (!b) { b = bboxOf(f.geometry.coordinates); boxes?.set(id, b); }
    if (lat < b[0] || lat > b[2] || lon < b[1] || lon > b[3]) continue;
    if (pointInGeometry(lon, lat, f.geometry)) return id;
  }
  return null;
}
