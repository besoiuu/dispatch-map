// Stop labels, and the drift that made the same route look different in two
// places.
//
// Both map renderers carried their own copy of this arithmetic. The PMTiles
// one numbered waypoints and lettered postal areas; the GeoJSON one lettered
// everything by its position in the list, so a route with a waypoint in the
// middle read A B C in development and A 1 B in production - and neither
// agreed with the sidebar when a waypoint came first. One function now serves
// all three, and these are the cases that separated them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { stopBadge, stopShortLabel } from '@/lib/stopBadge';
import type { RouteStop } from '@/types/route';

const plz = (code: string, label = code): RouteStop => ({
  id: `p-${code}`,
  type: 'plz',
  plz: `de:${code}`,
  label,
  coordinate: [0, 0],
});

const wp = (label = 'Waypoint'): RouteStop => ({
  id: `w-${label}`,
  type: 'waypoint',
  label,
  coordinate: [0, 0],
});

const badges = (stops: RouteStop[]) => stops.map((_, i) => stopBadge(stops, i).text);

test('postal areas are lettered in their own sequence', () => {
  assert.deepEqual(badges([plz('1'), plz('2'), plz('3')]), ['A', 'B', 'C']);
});

test('A WAYPOINT DOES NOT RELABEL THE PICKUPS AFTER IT', () => {
  // The GeoJSON renderer lettered by list position, so inserting a waypoint
  // shifted every later area's letter - the dispatcher's "B" became "C"
  // without anything about that pickup changing.
  assert.deepEqual(badges([plz('1'), wp(), plz('2'), plz('3')]), ['A', '1', 'B', 'C']);
});

test('a waypoint first still leaves the first area as A', () => {
  assert.deepEqual(badges([wp(), plz('1'), wp(), plz('2')]), ['1', 'A', '2', 'B']);
});

test('waypoints are numbered from one', () => {
  assert.deepEqual(badges([wp('a'), wp('b'), wp('c')]), ['1', '2', '3']);
});

test('the kind is reported alongside the text', () => {
  const stops = [plz('1'), wp()];
  assert.equal(stopBadge(stops, 0).isWaypoint, false);
  assert.equal(stopBadge(stops, 1).isWaypoint, true);
});

test('past the 26th area the label stays readable', () => {
  // `String.fromCharCode(64 + n)` runs past Z into "[", "\", "]" - punctuation
  // in a coloured circle. A long route is numbered instead.
  const long = Array.from({ length: 28 }, (_, i) => plz(String(i)));
  const out = badges(long);
  assert.equal(out[25], 'Z');
  assert.equal(out[26], '27');
  assert.equal(out[27], '28');
});

test('an out-of-range index does not throw', () => {
  // Called while a route is mid-edit, the list and the index can disagree for
  // one render.
  assert.doesNotThrow(() => stopBadge([plz('1')], 5));
});

// ── Pin labels ────────────────────────────────────────────────────

test('a pin label keeps the place, not the country prefix', () => {
  assert.equal(stopShortLabel(plz('27576', '27576 Bremerhaven')), '27576 Bremerhaven');
});

test('a long address is cut to two parts', () => {
  const stop = wp('Erfurter Strasse 76, 99423 Weimar, Thuringen, Germany');
  assert.equal(stopShortLabel(stop), 'Erfurter Strasse 76, 99423 Weima');
});

test('a stop with no label falls back to its code', () => {
  const bare: RouteStop = { id: 'x', type: 'plz', plz: 'de:27576', label: '', coordinate: [0, 0] };
  assert.equal(stopShortLabel(bare), '27576');
});
