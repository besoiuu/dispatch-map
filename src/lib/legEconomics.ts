/**
 * Which part of a run is carrying cars, and what that makes it worth.
 *
 * A lorry loads everything and then unloads, so a run splits in three:
 *
 *   before the first pickup   empty - the approach, paid for by nobody
 *   first pickup -> last drop LOADED - the only stretch that earns
 *   after the last delivery   empty - and usually invisible in planning
 *
 * A route drawn as one line hides that completely. The board's own figures
 * are revenue over TOTAL kilometres, which flatters every run with a long
 * approach; the number a dispatcher should see is revenue over the
 * kilometres actually driven, with the empty share stated next to it.
 *
 * Why the rule is positional and not per-leg: with several loads on one
 * lorry the stops interleave (pickup, pickup, drop, drop), so a leg BETWEEN
 * two pickups is still loaded - the lorry already has the first car on it.
 * Only the legs before the first pickup and after the last delivery are
 * genuinely empty. Testing each leg's own endpoints would mark the middle
 * of a tour empty and make a good run look like a bad one.
 */

import type { StopKind } from '@/lib/routeHash';
import type { RouteLeg, RouteStop } from '@/types/route';

export interface LegSplit {
  /** Metres with cars on board. */
  loadedMeters: number;
  /** Metres running empty: the approach plus the run home. */
  emptyMeters: number;
  totalMeters: number;
  /** 0..1. The share of the distance that earns nothing. */
  emptyShare: number;
  /** One flag per leg, for drawing. */
  legLoaded: boolean[];
}

/**
 * Split a route's legs into loaded and empty.
 *
 * `legs[i]` is the leg from stop i to stop i+1, so there is one fewer leg
 * than stops. Returns null when the kinds are missing or out of step —
 * guessing here would mark the wrong legs empty, which is worse than
 * showing nothing.
 */
export function splitLegs(
  legs: readonly RouteLeg[] | undefined,
  stops: readonly Pick<RouteStop, 'kind'>[] | undefined
): LegSplit | null {
  if (!legs?.length || !stops?.length) return null;
  if (stops.length !== legs.length + 1) return null;
  // Read off the stops themselves: they are reorderable, so a parallel
  // array would point at the wrong ones the first time anyone dragged.
  const kinds: (StopKind | undefined)[] = stops.map((s) => s.kind);
  if (kinds.some((k) => !k)) return null;

  const firstPickup = kinds.indexOf('pickup');
  // Last delivery, searched from the end.
  let lastDelivery = -1;
  for (let i = kinds.length - 1; i >= 0; i--) {
    if (kinds[i] === 'delivery') { lastDelivery = i; break; }
  }
  // Nothing is being carried at all: no pickup, or nowhere to drop it.
  if (firstPickup === -1 || lastDelivery === -1 || lastDelivery <= firstPickup) {
    const totalMeters = legs.reduce((n, l) => n + l.distance, 0);
    return {
      loadedMeters: 0,
      emptyMeters: totalMeters,
      totalMeters,
      emptyShare: totalMeters > 0 ? 1 : 0,
      legLoaded: legs.map(() => false),
    };
  }

  let loadedMeters = 0;
  let emptyMeters = 0;
  const legLoaded: boolean[] = [];
  legs.forEach((leg, i) => {
    // Leg i runs from stop i to stop i+1. It is loaded once the first
    // pickup has happened and until the last delivery is done.
    const loaded = i >= firstPickup && i < lastDelivery;
    legLoaded.push(loaded);
    if (loaded) loadedMeters += leg.distance;
    else emptyMeters += leg.distance;
  });

  const totalMeters = loadedMeters + emptyMeters;
  return {
    loadedMeters,
    emptyMeters,
    totalMeters,
    emptyShare: totalMeters > 0 ? emptyMeters / totalMeters : 0,
    legLoaded,
  };
}

export interface RunValue {
  /** Revenue over every kilometre driven, empty ones included. */
  perTotalKm: number;
  /** Revenue over the loaded kilometres only. */
  perLoadedKm: number | null;
}

/**
 * What the run pays per kilometre.
 *
 * Both figures, deliberately. `perTotalKm` is what the run actually costs
 * you, because the empty kilometres burn the same diesel; `perLoadedKm` is
 * the headline the rest of the trade quotes. Showing only the second is how
 * a run with a 300 km approach looks fine on paper.
 */
export function runValue(revenue: number | undefined, split: LegSplit | null): RunValue | null {
  if (!revenue || revenue <= 0 || !split || split.totalMeters <= 0) return null;
  const totalKm = split.totalMeters / 1000;
  const loadedKm = split.loadedMeters / 1000;
  return {
    perTotalKm: revenue / totalKm,
    perLoadedKm: loadedKm > 0 ? revenue / loadedKm : null,
  };
}

/**
 * Cut the route polyline into the loaded stretch and the empty ones.
 *
 * OSRM is asked with `steps=false`, so there is one polyline for the whole
 * route and no per-leg geometry to colour. But the empty parts are always
 * the PREFIX - everything before the first pickup - and the SUFFIX, after
 * the last delivery. So two cuts are enough, and they are made at the
 * polyline vertex nearest each boundary stop.
 *
 * Nearest-vertex is approximate by a few metres, which is invisible at any
 * zoom a dispatcher uses and far cheaper than asking OSRM for every step's
 * geometry. The alternative - drawing a straight line between the stops -
 * would show a road that does not exist.
 */
export function splitRouteLine(
  coordinates: readonly [number, number][] | undefined,
  stops: readonly (Pick<RouteStop, 'kind'> & { coordinate: [number, number] })[] | undefined
): { loaded: [number, number][]; empty: [number, number][][] } | null {
  if (!coordinates?.length || !stops?.length) return null;
  const kinds: (StopKind | undefined)[] = stops.map((s) => s.kind);
  if (kinds.some((k) => !k)) return null;

  const firstPickup = kinds.indexOf('pickup');
  let lastDelivery = -1;
  for (let i = kinds.length - 1; i >= 0; i--) {
    if (kinds[i] === 'delivery') { lastDelivery = i; break; }
  }
  if (firstPickup === -1 || lastDelivery === -1 || lastDelivery <= firstPickup) return null;

  // Squared degrees is enough to rank candidates; no need for haversine.
  const nearestIndex = (target: [number, number]) => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < coordinates.length; i++) {
      const dx = coordinates[i][0] - target[0];
      const dy = coordinates[i][1] - target[1];
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  };

  const a = nearestIndex(stops[firstPickup].coordinate);
  const b = nearestIndex(stops[lastDelivery].coordinate);
  if (b <= a) return null;

  const empty: [number, number][][] = [];
  // `a + 1` and `b` overlap by one vertex on purpose: without the shared
  // point the dashed and solid lines leave a visible gap at the join.
  if (a > 0) empty.push(coordinates.slice(0, a + 1) as [number, number][]);
  if (b < coordinates.length - 1) empty.push(coordinates.slice(b) as [number, number][]);

  return { loaded: coordinates.slice(a, b + 1) as [number, number][], empty };
}
