/**
 * The fleet's routes as lines the map can draw (components/fleet/FleetRoutes).
 *
 * Two lines per truck, from what the TMS hands in (lib/fleetBridge):
 *
 *   trail - where it DROVE this week, its GPS track. Solid.
 *   plan  - where it still has to GO: from where it is now through the stops
 *           the GPS has not seen done yet, in the order of the runs. Dashed.
 *           Along the roads for the selected truck once OSRM has answered
 *           (`roads`, one call per leg, cached by FleetRoutes); straight from
 *           stop to stop until then, and for every truck not selected.
 *
 * Each leg of the plan is marked LOADED or EMPTY. A truck is loaded between
 * a pickup and its delivery; at the start it already carries every order it
 * left the pickup of and has not delivered. Loaded and empty are what the
 * route sidebar colours too (lib/legEconomics), and the TMS's own fleet map.
 */

import type { FleetStop, FleetTruck } from './fleetBridge';

type Line = GeoJSON.Feature<GeoJSON.LineString, { key: string; sel: boolean; loaded?: boolean; run?: boolean }>;

export type FleetGeo = {
  trails: GeoJSON.FeatureCollection<GeoJSON.LineString>;
  plans: GeoJSON.FeatureCollection<GeoJSON.LineString>;
};

/**
 * Which leg this is, for the road cache. The start is rounded to ~1 km: the
 * first leg starts at the truck, which moves a little on every refresh, and a
 * new routing call every two minutes for the same leg would be waste.
 */
export function legKey(from: [number, number], to: { lon: number; lat: number }): string {
  return `${from[0].toFixed(2)},${from[1].toFixed(2)}>${to.lon.toFixed(4)},${to.lat.toFixed(4)}`;
}

/** The legs still ahead of one truck, with whether each is driven loaded. */
export function legsAhead(t: Pick<FleetTruck, 'lat' | 'lon' | 'stops'>): { from: [number, number]; to: FleetStop; loaded: boolean }[] {
  const delivered = new Set(t.stops.filter((s) => s.kind === 'delivery' && s.done).map((s) => s.order));
  const onBoard = new Set(
    t.stops.filter((s) => s.kind === 'pickup' && s.done && !delivered.has(s.order)).map((s) => s.order),
  );
  const out: { from: [number, number]; to: FleetStop; loaded: boolean }[] = [];
  let at: [number, number] = [t.lon, t.lat];
  for (const s of t.stops) {
    if (s.done) continue;
    out.push({ from: at, to: s, loaded: onBoard.size > 0 });
    if (s.kind === 'pickup') onBoard.add(s.order);
    else onBoard.delete(s.order);
    at = [s.lon, s.lat];
  }
  return out;
}

/**
 * Every truck's trail; the plan of the selected truck only, or of all of them
 * when none is selected. Ten dashed plans crossing Europe at once are noise
 * once a dispatcher is looking at one truck.
 */
export function fleetGeo(
  trucks: readonly FleetTruck[],
  selected: string | null,
  run: string | null,
  roads: ReadonlyMap<string, [number, number][]> = new Map(),
): FleetGeo {
  const trails: Line[] = [];
  const plans: Line[] = [];
  for (const t of trucks) {
    const sel = t.key === selected;
    // The trail ends where the truck is now, so the line meets the marker.
    const trail = t.trail.length ? [...t.trail, [t.lon, t.lat] as [number, number]] : [];
    if (trail.length >= 2) {
      trails.push({ type: 'Feature', properties: { key: t.key, sel }, geometry: { type: 'LineString', coordinates: trail } });
    }
    if (selected && !sel) continue;
    for (const leg of legsAhead(t)) {
      const road = sel ? roads.get(legKey(leg.from, leg.to)) : undefined;
      plans.push({
        type: 'Feature',
        properties: { key: t.key, sel, loaded: leg.loaded, run: run != null && leg.to.order === run },
        geometry: { type: 'LineString', coordinates: road && road.length >= 2 ? road : [leg.from, [leg.to.lon, leg.to.lat]] },
      });
    }
  }
  return { trails: { type: 'FeatureCollection', features: trails }, plans: { type: 'FeatureCollection', features: plans } };
}

/**
 * Where to frame the map for a truck. With a run picked: that run's two ends,
 * plus the truck only while it is ON the run (loaded, not yet delivered) -
 * a truck three countries away from a run it has not started would pull the
 * frame off the run the dispatcher asked to see. Without a run: the truck and
 * every stop still ahead.
 */
export function focusPoints(t: Pick<FleetTruck, 'lat' | 'lon' | 'stops'>, run: string | null): [number, number][] {
  const here: [number, number] = [t.lon, t.lat];
  if (!run) return [here, ...t.stops.filter((s) => !s.done).map((s) => [s.lon, s.lat] as [number, number])];
  const ends = t.stops.filter((s) => s.order === run);
  if (!ends.length) return [here];
  const pickedUp = ends.some((s) => s.kind === 'pickup' && s.done);
  const delivered = ends.some((s) => s.kind === 'delivery' && s.done);
  const pts = ends.map((s) => [s.lon, s.lat] as [number, number]);
  return pickedUp && !delivered ? [here, ...pts] : pts;
}
