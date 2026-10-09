import type { RouteStop } from '@/types/route';

export interface StopBadge {
  text: string;
  isWaypoint: boolean;
}

/**
 * The letter or number shown on a stop, in the sidebar and on the map.
 *
 * This lives here because the two map renderers had drifted apart: the
 * PMTiles one numbered waypoints and lettered postal areas, while the GeoJSON
 * one lettered everything by its position in the list, so the same route was
 * labelled A B C in development and A 1 B in production. One function, used
 * by all three call sites, is the only way that stays fixed.
 *
 * Postal areas are lettered A, B, C... in their own sequence; waypoints are
 * numbered 1, 2, 3... in theirs, so inserting a waypoint does not relabel
 * every pickup after it.
 */
export function stopBadge(stops: RouteStop[], index: number): StopBadge {
  let plzIdx = 0;
  let wpIdx = 0;
  for (let i = 0; i <= index && i < stops.length; i++) {
    if (stops[i].type === 'waypoint') wpIdx++;
    else plzIdx++;
  }
  if (stops[index]?.type === 'waypoint') return { text: String(wpIdx), isWaypoint: true };
  // Past Z the letters would wrap into punctuation; a route that long reads
  // better numbered than with a stray "[".
  return { text: plzIdx <= 26 ? String.fromCharCode(64 + plzIdx) : String(plzIdx), isWaypoint: false };
}

/** Short, human label for a pin tooltip: "27576 Bremerhaven" trimmed. */
export function stopShortLabel(stop: RouteStop): string {
  const raw = stop.plz || stop.label || '';
  const code = raw.includes(':') ? raw.split(':')[1] : raw;
  // `||`, not `??`: an empty label is not a label. With `??` a stop whose
  // label was cleared rendered a pin with no text under it at all.
  const full = stop.label || code;
  const parts = full.split(',');
  return parts.length > 1
    ? `${parts[0].trim()}, ${parts[1].trim()}`.slice(0, 32)
    : full.slice(0, 28);
}
