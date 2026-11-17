/**
 * The fleet's routes as lines the map can draw (components/fleet/FleetRoutes).
 *
 * Two lines per truck, from what the TMS hands in (lib/fleetBridge):
 *
 *   trail - where it DROVE this week, its GPS track. Solid.
 *   plan  - where it still has to GO: from where it is now through the stops
 *           the GPS has not seen done yet, in the order of the runs. Dashed,
 *           and straight from stop to stop: it is the order of the work, not
 *           a road route (that needs a routing call per truck; see CLAUDE.md
 *           on OSRM).
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
export function fleetGeo(trucks: readonly FleetTruck[], selected: string | null, run: string | null): FleetGeo {
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
      plans.push({
        type: 'Feature',
        properties: { key: t.key, sel, loaded: leg.loaded, run: run != null && leg.to.order === run },
        geometry: { type: 'LineString', coordinates: [leg.from, [leg.to.lon, leg.to.lat]] },
      });
    }
  }
  return { trails: { type: 'FeatureCollection', features: trails }, plans: { type: 'FeatureCollection', features: plans } };
}
