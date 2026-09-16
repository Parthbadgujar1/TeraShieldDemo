/**
 * Google Maps deep links — no API key needed, just the documented
 * `?api=1` URL scheme. Opens the user's own Google Maps (app or web) with
 * turn-by-turn navigation already set up from the village to the assigned
 * relocation site.
 */
export function googleMapsDirectionsUrl(
  origin: { lat: number; lon: number },
  destination: { lat: number; lon: number },
  travelMode: "driving" | "walking" = "driving"
): string {
  const params = new URLSearchParams({
    api: "1",
    origin: `${origin.lat},${origin.lon}`,
    destination: `${destination.lat},${destination.lon}`,
    travelmode: travelMode,
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function googleMapsPinUrl(point: { lat: number; lon: number }): string {
  return `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lon}`;
}
