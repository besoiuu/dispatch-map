// What leaves the app: the CSV sheet and the clipboard.
//
// Both were wrong in the same way as the map pins, because both lettered
// stops by their position in the list. The clipboard was worse: it copied
// `plzCodes` raw, so a dispatcher pasted "de:27576, nl:4214" - internal keys -
// and every waypoint was missing, because waypoints have no postal code. The
// toast said "copied" either way.

import test from 'node:test';
import assert from 'node:assert/strict';
import { routeAsText, routeToCSV } from '@/lib/export';
import type { Route, RouteStop } from '@/types/route';

const plz = (code: string, label: string): RouteStop => ({
  id: `p-${code}`,
  type: 'plz',
  plz: `de:${code}`,
  label,
  coordinate: [8.61, 53.57],
});

const wp = (label: string): RouteStop => ({
  id: `w-${label}`,
  type: 'waypoint',
  label,
  coordinate: [9.12, 52.34],
});

const route = (stops: RouteStop[], geometry?: Route['geometry']): Route => ({
  id: 'r1',
  name: 'Tour Nord',
  color: '#2563eb',
  plzCodes: stops.filter((s) => s.plz).map((s) => s.plz!),
  stops,
  visible: true,
  geometry,
});

const GEOM: Route['geometry'] = {
  coordinates: [[8.61, 53.57]],
  distance: 412_300,
  duration: 15_120,
  legs: [
    { distance: 120_000, duration: 5_000 },
    { distance: 292_300, duration: 10_120 },
  ],
};

// ── CSV ───────────────────────────────────────────────────────────

test('THE SHEET AGREES WITH THE PINS', () => {
  // Lettering by list index gave the waypoint a letter and shifted the second
  // pickup from B to C, so the export and the map disagreed about which stop
  // was which.
  const stops = [plz('27576', '27576 Bremerhaven'), wp('Depot'), plz('99423', '99423 Weimar')];
  const rows = routeToCSV(route(stops), stops).split('\r\n');
  assert.equal(rows[1].split(',')[0], 'A');
  assert.equal(rows[2].split(',')[0], '1');
  assert.equal(rows[3].split(',')[0], 'B');
});

test('each row says whether it is an area or a waypoint', () => {
  const stops = [plz('27576', 'Bremerhaven'), wp('Depot')];
  const rows = routeToCSV(route(stops), stops).split('\r\n');
  assert.equal(rows[1].split(',')[1], 'Area');
  assert.equal(rows[2].split(',')[1], 'Waypoint');
});

test('A LABEL WITH A COMMA DOES NOT SHIFT THE COLUMNS', () => {
  // Commas used to be stripped out of the name; a quote was passed straight
  // through, which breaks any strict reader.
  const stops = [plz('99423', 'Erfurter Strasse 76, Weimar')];
  const rows = routeToCSV(route(stops), stops).split('\r\n');
  assert.match(rows[1], /"Erfurter Strasse 76, Weimar"/);
  // Nine columns, as the header declares.
  assert.equal(rows[0].split(',').length, 9);
});

test('a quote in a label is doubled, not dropped', () => {
  const stops = [plz('99423', 'Hof "Am See"')];
  const rows = routeToCSV(route(stops), stops).split('\r\n');
  assert.match(rows[1], /"Hof ""Am See"""/);
});

test('the country rides in its own column', () => {
  const stops = [plz('27576', 'Bremerhaven')];
  const cells = routeToCSV(route(stops), stops).split('\r\n')[1].split(',');
  assert.equal(cells[2], '27576');
  assert.equal(cells[4], 'DE');
});

test('leg figures stop at the last stop, and a total is added', () => {
  const stops = [plz('27576', 'A'), plz('99423', 'B'), plz('40474', 'C')];
  const rows = routeToCSV(route(stops, GEOM), stops).split('\r\n');
  assert.match(rows[1], /120\.0 km/);
  assert.match(rows[3], /,,$/, 'ultima oprire nu are etapa urmatoare');
  assert.match(rows[4], /TOTAL/);
  assert.match(rows[4], /412\.3 km/);
});

test('no geometry means no total row', () => {
  const stops = [plz('27576', 'A')];
  assert.equal(routeToCSV(route(stops), stops).split('\r\n').length, 2);
});

// ── Clipboard ─────────────────────────────────────────────────────

test('THE CLIPBOARD IS READABLE, not internal keys', () => {
  const stops = [plz('27576', '27576 Bremerhaven'), wp('Depot'), plz('99423', '99423 Weimar')];
  const text = routeAsText(route(stops, GEOM), stops);

  assert.ok(!text.includes('de:'), 'cheile interne au ajuns in clipboard');
  assert.match(text, /^Tour Nord - 412\.3 km, 4h 12m$/m);
  assert.match(text, /^A\. 27576 Bremerhaven$/m);
  assert.match(text, /^B\. 99423 Weimar$/m);
});

test('waypoints are in the copied text', () => {
  // They were skipped entirely, because the old version joined `plzCodes`.
  const stops = [plz('27576', 'Bremerhaven'), wp('Depot'), plz('99423', 'Weimar')];
  const text = routeAsText(route(stops), stops);
  assert.match(text, /^1\. Depot$/m);
});

test('a route with no distance yet still copies its stops', () => {
  const stops = [plz('27576', 'Bremerhaven')];
  const text = routeAsText(route(stops), stops);
  assert.equal(text.split('\n')[0], 'Tour Nord');
  assert.match(text, /^A\. Bremerhaven$/m);
});
