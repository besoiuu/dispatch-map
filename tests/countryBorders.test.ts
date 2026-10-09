// Resolving a point to a country, both ways.
//
// `activeCountry` had no writer at all, so it was Germany for ever. The first
// fix used bounding boxes, which cannot separate a town near a triple border:
// Bratislava sits inside both the Slovak and the Hungarian box. The real
// outlines in `borders.geojson` are already shipped and already fetched for
// the border lines, so they answer this properly - and the boxes stay as the
// fallback for the moments before they have loaded.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { FeatureCollection } from 'geojson';
import { enabledCountries } from '@/config/countries';
import {
  __setBordersForTests,
  COUNTRY_BOUNDS,
  countryAtCoord,
  countryAtCoordByBounds,
} from '@/lib/countryAtCoord';

const borders: FeatureCollection = JSON.parse(
  readFileSync(new URL('../public/data/borders.geojson', import.meta.url), 'utf-8')
);

const CITIES: [string, number, number, string][] = [
  ['Bremerhaven', 8.58, 53.55, 'de'],
  ['Munich', 11.58, 48.14, 'de'],
  ['Amsterdam', 4.9, 52.37, 'nl'],
  ['Brussels', 4.35, 50.85, 'be'],
  ['Vienna', 16.37, 48.21, 'at'],
  ['Prague', 14.42, 50.09, 'cz'],
  ['Kosice', 21.26, 48.72, 'sk'],
  ['Budapest', 19.04, 47.5, 'hu'],
  ['Bucharest', 26.1, 44.43, 'ro'],
  ['Warsaw', 21.01, 52.23, 'pl'],
  ['Rome', 12.5, 41.9, 'it'],
  ['Copenhagen', 12.57, 55.68, 'dk'],
  ['Lyon', 4.84, 45.76, 'fr'],
];

// ── The shipped outline data ──────────────────────────────────────

test('EVERY BORDER FEATURE CARRIES ITS COUNTRY CODE', () => {
  // Slovakia's did not: it had only `name`, while the other eleven had `code`.
  // Nothing noticed, because the border layer draws every feature as a line
  // regardless of its properties - but anything keyed on `code` silently
  // skipped Slovakia, and this lookup is keyed on `code`.
  const codes = borders.features.map((f) => String(f.properties?.code ?? '').toLowerCase());
  assert.equal(codes.filter(Boolean).length, borders.features.length, 'o tara fara cod');
  for (const c of enabledCountries) {
    assert.ok(codes.includes(c), `lipseste conturul pentru ${c}`);
  }
});

test('each outline has its European part inside its bounding box', () => {
  // The two tables have to agree on the mainland, because the box is a cheap
  // reject before the ring walk: a country whose outline fell entirely outside
  // its box would never be tested at all.
  //
  // Not every vertex, though - these are national outlines, so the Dutch one
  // carries Curacao at -68 and the French one Guadeloupe and French Guiana.
  // Overseas territory outside the box is correct data, and harmless: the box
  // rejects those points before the rings are walked.
  for (const f of borders.features) {
    const code = String(f.properties?.code ?? '').toLowerCase();
    const b = COUNTRY_BOUNDS[code as keyof typeof COUNTRY_BOUNDS];
    assert.ok(b, `nicio cutie pentru ${code}`);
    const g = f.geometry as { type: string; coordinates: number[][][] | number[][][][] };
    const outers: number[][][] =
      g.type === 'Polygon'
        ? [(g.coordinates as number[][][])[0]]
        : (g.coordinates as number[][][][]).map((poly) => poly[0]);
    const inside = outers.filter((ring) =>
      ring.every(([lng, lat]) => lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3])
    );
    assert.ok(inside.length > 0, `${code}: niciun contur nu intra in cutie`);
  }
});

// ── With the real outlines loaded ─────────────────────────────────

test('every capital resolves to its own country', () => {
  __setBordersForTests(borders);
  for (const [name, lng, lat, want] of CITIES) {
    assert.equal(countryAtCoord(lng, lat), want, name);
  }
});

test('A TOWN ON A TRIPLE BORDER RESOLVES CORRECTLY', () => {
  // Bratislava: inside both the Slovak and the Hungarian box, about 3 km from
  // Austria. No box-based rule gets this right; the outline does.
  __setBordersForTests(borders);
  assert.equal(countryAtCoord(17.11, 48.15), 'sk', 'Bratislava');
  // And the box path still gets it wrong, which is why the outlines matter.
  assert.notEqual(countryAtCoordByBounds(17.11, 48.15), 'sk');
});

test('A COASTAL CITY STILL RESOLVES, via the box fallback', () => {
  // `borders.geojson` is simplified for drawing, so Copenhagen sits a fraction
  // north of its own simplified coastline and matches no ring. Outline-only,
  // that returned null and left search ranked for wherever the dispatcher was
  // before - so the boxes are a fallback for a failed ring test, not only for
  // the moments before the outlines load.
  __setBordersForTests(borders);
  assert.equal(countryAtCoord(12.57, 55.68), 'dk', 'Copenhagen');
  assert.equal(countryAtCoord(4.9, 52.37), 'nl', 'Amsterdam');
});

test('the open sea is not a country', () => {
  __setBordersForTests(borders);
  assert.equal(countryAtCoord(3.0, 56.5), null, 'North Sea');
  assert.equal(countryAtCoord(-20, 45), null, 'Atlantic');
  assert.equal(countryAtCoord(35, 40), null, 'east of the map');
});

test('a country this map does not cover reads as its nearest neighbour', () => {
  // Zurich is inside Germany's box and inside no outline here. Attributing it
  // to Germany is the useful answer for the one thing this value does - biasing
  // postal-code search - because Switzerland has no codes in the index at all.
  __setBordersForTests(borders);
  assert.equal(countryAtCoord(8.54, 47.37), 'de', 'Zurich');
});

// ── Before they load ──────────────────────────────────────────────

test('the box fallback still answers, and still prefers the nearer country', () => {
  __setBordersForTests(null);
  // Germany's box covers most of the Netherlands and `de` comes first in
  // `enabledCountries`, so a first-match-wins loop answered "de" for Amsterdam.
  assert.equal(countryAtCoord(4.9, 52.37), 'nl', 'Amsterdam');
  assert.equal(countryAtCoord(8.58, 53.55), 'de', 'Bremerhaven');
  assert.equal(countryAtCoord(-20, 45), null, 'Atlantic');
});
