/**
 * The `#route=` link: how another app hands this one a route to draw.
 *
 * The loadboard builds these from a selection of loads, so this is a
 * contract between two repos and not an internal detail. It is parsed here,
 * away from the component, so it can be tested — the version that lived
 * inside `MapShell`'s effect could not be, and it was wrong.
 *
 *   #route=<urlencoded name>:<item>,<item>,…
 *
 * An item is a prefixed postal code — `de:40721`, country first, the form
 * `lookupPrefixed` needs because 3,423 codes exist in more than one country
 * — or a coordinate, `@lat;lng`.
 *
 * ── THE BUG THIS REPLACES ────────────────────────────────────────────────
 * Coordinates were documented as `@lat,lng` and could never work. The items
 * are split on commas FIRST, so `@51.2277,6.7735` arrived as two items:
 * `@51.2277`, which then had no comma left to split and produced a NaN
 * longitude, and a bare `6.7735`, which fell through to the postcode branch
 * and was added to `plzCodes` as if it were a postal code. So the waypoint
 * vanished AND left a junk code behind — which is the failure `routeStore`
 * calls the worst bug it had: a code in `plzCodes` that never becomes a
 * stop, is invisible on screen, and blocks the duplicate guard afterwards.
 *
 * `@lat;lng` is the form to write. `@lat,lng` is still accepted, by taking
 * the number that follows as the longitude: that is what every link written
 * against the old documentation looks like, and silently dropping those
 * would repeat the bug in a quieter way.
 */

export type RouteHashItem =
  | { kind: 'plz'; code: string }
  /** `[lng, lat]`, the order the store and MapLibre both use. */
  | { kind: 'waypoint'; lngLat: [number, number] };

export interface ParsedRouteHash {
  name: string;
  items: RouteHashItem[];
}

const num = (s: string) => {
  // `Number('')` is 0 and `Number(' ')` is 0; neither is a coordinate.
  const t = s.trim();
  if (!t) return NaN;
  return Number(t);
};

const isLat = (n: number) => Number.isFinite(n) && n >= -90 && n <= 90;
const isLng = (n: number) => Number.isFinite(n) && n >= -180 && n <= 180;

/**
 * Parse the value of the `route` parameter. Returns null when there is no
 * name, or nothing to put on the map.
 */
export function parseRouteHash(param: string | null | undefined): ParsedRouteHash | null {
  if (!param) return null;

  // The FIRST colon ends the name; the codes carry colons of their own.
  const colon = param.indexOf(':');
  if (colon <= 0) return null;
  const name = decodeURIComponent(param.slice(0, colon)).trim();
  if (!name) return null;

  const tokens = param
    .slice(colon + 1)
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const items: RouteHashItem[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token.startsWith('@')) {
      items.push({ kind: 'plz', code: token });
      continue;
    }

    const body = token.slice(1);
    // `@lat;lng` — self-contained, nothing to guess.
    if (body.includes(';')) {
      const [a, b] = body.split(';');
      const lat = num(a);
      const lng = num(b);
      if (isLat(lat) && isLng(lng)) items.push({ kind: 'waypoint', lngLat: [lng, lat] });
      continue;
    }

    // `@lat,lng` — the comma split already separated them, so the longitude
    // is the next token. Only consume it if it really is a bare number;
    // otherwise `@48.1,de:80939` would eat a postcode.
    const lat = num(body);
    const next = tokens[i + 1];
    const lng = next !== undefined && /^-?\d+(\.\d+)?$/.test(next) ? num(next) : NaN;
    if (isLat(lat) && isLng(lng)) {
      items.push({ kind: 'waypoint', lngLat: [lng, lat] });
      i++; // the longitude was its own token
    }
    // A coordinate we cannot read is dropped, never passed on as a postcode.
  }

  return items.length ? { name, items } : null;
}

/**
 * Build the parameter, so anything generating these links in this repo
 * agrees with the parser by construction.
 */
export function buildRouteHash(name: string, items: RouteHashItem[]): string {
  const parts = items.map((it) =>
    it.kind === 'plz' ? it.code : `@${it.lngLat[1]};${it.lngLat[0]}`
  );
  return `route=${encodeURIComponent(name)}:${parts.join(',')}`;
}
