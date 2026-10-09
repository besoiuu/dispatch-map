// The bounding-box approximation, on its own.
//
// This is the fallback path: what answers before `borders.geojson` has loaded,
// and when a point matches no outline. The real outlines are covered in
// countryBorders.test.ts; these are the cases the boxes alone must still get
// right - above all that overlapping boxes resolve to the nearer country,
// because Germany's box covers most of the Netherlands.

import test from 'node:test';
import assert from 'node:assert/strict';
import { countryAtCoordByBounds } from '@/lib/countryAtCoord';

test('a city resolves to its own country', () => {
  const cases: [string, number, number, string][] = [
    ['Bremerhaven', 8.58, 53.55, 'de'],
    ['Amsterdam', 4.9, 52.37, 'nl'],
    ['Vienna', 16.37, 48.21, 'at'],
    ['Bucharest', 26.1, 44.43, 'ro'],
    ['Rome', 12.5, 41.9, 'it'],
    ['Copenhagen', 12.57, 55.68, 'dk'],
    ['Warsaw', 21.01, 52.23, 'pl'],
    ['Budapest', 19.04, 47.5, 'hu'],
  ];
  for (const [name, lng, lat, want] of cases) {
    assert.equal(countryAtCoordByBounds(lng, lat), want, name);
  }
});

test('WHERE BOXES OVERLAP, THE NEARER COUNTRY WINS', () => {
  // The German and Dutch boxes overlap over most of the Netherlands, and
  // Germany is first in `enabledCountries` - so a first-match-wins loop would
  // answer "de" for Amsterdam and rank German codes for a Dutch route.
  assert.equal(countryAtCoordByBounds(4.9, 52.37), 'nl', 'Amsterdam');
  assert.equal(countryAtCoordByBounds(4.35, 50.85), 'be', 'Brussels');
  assert.equal(countryAtCoordByBounds(14.42, 50.09), 'cz', 'Prague');
  assert.equal(countryAtCoordByBounds(21.26, 48.72), 'sk', 'Kosice');
});

test('a city on a triple border is NOT resolved by boxes alone', () => {
  // Bratislava is about 3 km from Austria and inside both the Slovak and the
  // Hungarian box, and no centre-distance rule picks the right one. This
  // function only biases search ranking and centres the zoom pills, so a
  // border town landing on a neighbour is acceptable - but it is a real limit,
  // not an oversight, and resolving it properly needs the border polygons in
  // `public/data/borders.geojson` rather than boxes.
  const answer = countryAtCoordByBounds(17.11, 48.15);
  assert.ok(['sk', 'hu', 'at'].includes(answer!), `Bratislava a dat ${answer}`);
});

test('outside every box the answer is null, not a guess', () => {
  // The caller keeps whatever it had rather than flipping to a neighbour when
  // the map is over the sea or zoomed out across Europe.
  assert.equal(countryAtCoordByBounds(-20, 45), null, 'Atlantic');
  assert.equal(countryAtCoordByBounds(3.0, 56.5), null, 'North Sea');
  assert.equal(countryAtCoordByBounds(35, 40), null, 'east of the map');
});
