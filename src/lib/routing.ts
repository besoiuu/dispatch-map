import type { RouteGeometry, RouteLeg } from '@/types/route';

const OSRM_BASE = 'https://router.project-osrm.org';

export async function calculateRoute(
  coordinates: [number, number][]
): Promise<RouteGeometry | null> {
  if (coordinates.length < 2) return null;

  const coordStr = coordinates.map(([lng, lat]) => `${lng},${lat}`).join(';');
  const url = `${OSRM_BASE}/route/v1/driving/${coordStr}?overview=full&geometries=geojson&steps=false`;

  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.[0]) return null;

  const route = data.routes[0];
  const legs: RouteLeg[] = (route.legs ?? []).map((leg: { distance: number; duration: number }) => ({
    distance: leg.distance,
    duration: leg.duration,
  }));

  return {
    coordinates: route.geometry.coordinates,
    distance: route.distance,
    duration: route.duration,
    legs,
  };
}

export async function calculateTrip(
  coordinates: [number, number][]
): Promise<{ geometry: RouteGeometry; waypointOrder: number[] } | null> {
  if (coordinates.length < 3) return null;

  const coordStr = coordinates.map(([lng, lat]) => `${lng},${lat}`).join(';');
  const url = `${OSRM_BASE}/trip/v1/driving/${coordStr}?overview=full&geometries=geojson&roundtrip=false&source=first&destination=last`;

  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  if (data.code !== 'Ok' || !data.trips?.[0]) return null;

  const trip = data.trips[0];
  const legs: RouteLeg[] = (trip.legs ?? []).map((leg: { distance: number; duration: number }) => ({
    distance: leg.distance,
    duration: leg.duration,
  }));

  const waypointOrder = (data.waypoints ?? []).map((wp: { waypoint_index: number }) => wp.waypoint_index);

  return {
    geometry: {
      coordinates: trip.geometry.coordinates,
      distance: trip.distance,
      duration: trip.duration,
      legs,
    },
    waypointOrder,
  };
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function buildGoogleMapsUrl(
  stops: { coordinate: [number, number]; label?: string }[]
): string {
  if (stops.length < 2) return '';

  const fmt = (s: { coordinate: [number, number]; label?: string }) => {
    if (s.label) return encodeURIComponent(s.label);
    return `${s.coordinate[1]},${s.coordinate[0]}`;
  };

  const origin = fmt(stops[0]);
  const dest = fmt(stops[stops.length - 1]);
  const waypoints = stops.slice(1, -1).map(fmt).join('|');
  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=driving`;
  if (waypoints) url += `&waypoints=${waypoints}`;
  return url;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h}h ${m}m`;
}
