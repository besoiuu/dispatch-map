import type { FeatureCollection, Position } from 'geojson';
import type { CountryCode } from '@/types/country';
import { countries, enabledCountries } from '@/config/countries';

/**
 * Bounding boxes, [west, south, east, north].
 *
 * Derived from the outlines in `borders.geojson` (European rings only) plus
 * 0.1 degrees of padding, which is what the test asserts. The hand-written
 * values they replace were slightly too SMALL: Romania's outline reached
 * 29.706 against an east edge of 29.7, Slovakia's 49.614 against 49.6, and
 * Austria's 49.001 against 49.0. Those boxes are a cheap reject before the
 * ring walk here AND the trigger for prefetching a country's detail data, so
 * a few kilometres of the Danube delta and the northern Tatras resolved to no
 * country and loaded no data.
 *
 * France reaches 9.66 east because Corsica is France.
 */
export const COUNTRY_BOUNDS: Record<CountryCode, [number, number, number, number]> = {
  de: [5.76, 47.18, 15.12, 55.16],
  nl: [3.25, 50.65, 7.3, 53.73],
  fr: [-5.2, 41.28, 9.66, 51.2],
  be: [2.42, 49.41, 6.46, 51.59],
  dk: [8.0, 54.5, 15.24, 57.84],
  at: [9.42, 46.3, 17.25, 49.1],
  cz: [11.99, 48.48, 19.0, 51.14],
  sk: [16.73, 47.63, 22.67, 49.71],
  pl: [14.03, 48.92, 24.21, 54.94],
  hu: [15.99, 45.65, 22.98, 48.65],
  ro: [20.14, 43.57, 29.81, 48.36],
  it: [6.53, 36.0, 18.59, 47.18],
};

function inBox(b: [number, number, number, number], lng: number, lat: number): boolean {
  return lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3];
}

// ── The real borders ──────────────────────────────────────────────

type Ring = Position[];
let rings: { code: CountryCode; rings: Ring[] }[] | null = null;
let bordersData: FeatureCollection | null = null;
let loadPromise: Promise<FeatureCollection | null> | null = null;
const listeners = new Set<() => void>();

function ingest(data: FeatureCollection) {
  const out: { code: CountryCode; rings: Ring[] }[] = [];
  for (const f of data.features) {
    const code = String(f.properties?.code ?? '').toLowerCase() as CountryCode;
    if (!enabledCountries.includes(code)) continue;
    const g = f.geometry;
    const polys: Ring[] = [];
    if (g.type === 'Polygon') {
      // Outer ring only: the holes in these outlines are enclaves, and
      // treating one as "not this country" is worse than ignoring it.
      polys.push(g.coordinates[0] as Ring);
    } else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates) polys.push(poly[0] as Ring);
    }
    if (polys.length > 0) out.push({ code, rings: polys });
  }
  rings = out;
  bordersData = data;
  for (const fn of listeners) fn();
}

/**
 * Loads `borders.geojson` once, for both the outline layer and this lookup.
 *
 * Each map renderer used to fetch it in its own copy of a `CountryBorders`
 * component; there is one component and one fetch now.
 */
export function loadCountryBorders(): Promise<FeatureCollection | null> {
  if (bordersData) return Promise.resolve(bordersData);
  if (loadPromise) return loadPromise;
  if (typeof window === 'undefined') return Promise.resolve(null);
  loadPromise = fetch('/data/borders.geojson')
    .then((r) => r.json())
    .then((data: FeatureCollection) => {
      ingest(data);
      return data;
    })
    .catch(() => {
      loadPromise = null;
      return null;
    });
  return loadPromise;
}

export function getCountryBorders(): FeatureCollection | null {
  return bordersData;
}

export function subscribeCountryBorders(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Ray casting. `ring` is a closed linear ring of [lng, lat]. */
function inRing(ring: Ring, lng: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Which country a point is in.
 *
 * `activeCountry` had no writer at all - `setActiveCountry` existed on the
 * store and nothing ever called it - so it was permanently Germany. That made
 * the zoom pills re-centre on Germany from anywhere, and ranked German codes
 * first even for a dispatcher working the Netherlands.
 *
 * The real outline answers first, so a town near a triple border resolves
 * correctly - Bratislava sits inside both the Slovak and the Hungarian
 * bounding box, and no box-based rule can tell which is right.
 *
 * The boxes remain the fallback, for two cases rather than one. Before the
 * outlines have loaded, obviously. But also when no outline contains the point:
 * `borders.geojson` is simplified for drawing, so a coastal city can land a
 * fraction outside its own coastline - Copenhagen is about 0.001 degrees north
 * of the simplified shore and matches no ring at all. Falling back to the box
 * answers "Denmark" there, which is the useful answer; returning null would
 * leave the dispatcher's search ranked for wherever they were before.
 *
 * Only a point outside every box - the open sea - comes back null. A country
 * this map does not cover is attributed to the nearest box that contains it
 * (Zurich reads as Germany), which is right for the one thing this value does:
 * biasing postal-code search, where Switzerland has no codes to offer anyway.
 */
export function countryAtCoord(lng: number, lat: number): CountryCode | null {
  if (rings) {
    for (const { code, rings: polys } of rings) {
      // The box is a cheap reject before the ring walk.
      if (!inBox(COUNTRY_BOUNDS[code], lng, lat)) continue;
      for (const ring of polys) {
        if (inRing(ring, lng, lat)) return code;
      }
    }
  }
  return countryAtCoordByBounds(lng, lat);
}

/** The bounding-box approximation, exported so the tests can pin both paths. */
export function countryAtCoordByBounds(lng: number, lat: number): CountryCode | null {
  let best: CountryCode | null = null;
  let bestDist = Infinity;
  for (const code of enabledCountries) {
    if (!inBox(COUNTRY_BOUNDS[code], lng, lat)) continue;
    const [clng, clat] = countries[code].center;
    const d = (clng - lng) ** 2 + (clat - lat) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = code;
    }
  }
  return best;
}

/** Test seam: load an outline set without fetching. */
export function __setBordersForTests(data: FeatureCollection | null): void {
  if (data === null) {
    rings = null;
    bordersData = null;
    loadPromise = null;
    return;
  }
  ingest(data);
}
