// The `#route=` link is a contract with another repo — the loadboard builds
// these from a selection of loads — so it is pinned here rather than left to
// whoever next edits the component.

import test from 'node:test';
import assert from 'node:assert/strict';

import { parseRouteHash, buildRouteHash } from '@/lib/routeHash';

test('name and prefixed codes', () => {
  const r = parseRouteHash('Dresden%20run:de:40721,nl:2291,de:80939');
  assert.equal(r?.name, 'Dresden run');
  assert.deepEqual(r?.items, [
    { kind: 'plz', code: 'de:40721' },
    { kind: 'plz', code: 'nl:2291' },
    { kind: 'plz', code: 'de:80939' },
  ]);
});

test('only the FIRST colon ends the name', () => {
  // Every code carries a colon of its own; splitting on all of them would
  // leave the name as "Dresden" and the first code as "run".
  const r = parseRouteHash('Dresden:de:40721');
  assert.equal(r?.name, 'Dresden');
  assert.deepEqual(r?.items, [{ kind: 'plz', code: 'de:40721' }]);
});

test('a coordinate written @lat;lng becomes one waypoint, lng first', () => {
  // The store and MapLibre both take [lng, lat]; the URL reads lat first
  // because that is how a person says a coordinate.
  const r = parseRouteHash('x:@51.2277;6.7735');
  assert.deepEqual(r?.items, [{ kind: 'waypoint', lngLat: [6.7735, 51.2277] }]);
});

test('the old @lat,lng form still works — THE BUG', () => {
  // This is what shipped and could never work: items are split on commas
  // first, so "@51.2277,6.7735" arrived as "@51.2277" (NaN longitude,
  // dropped) and a bare "6.7735", which was then added to plzCodes as if it
  // were a postal code. The waypoint vanished and left a junk code behind.
  const r = parseRouteHash('x:@51.2277,6.7735');
  assert.deepEqual(r?.items, [{ kind: 'waypoint', lngLat: [6.7735, 51.2277] }]);
  // and nothing was left over pretending to be a postcode
  assert.equal(r?.items.length, 1);
});

test('a bare number is never swallowed from a real code', () => {
  // The longitude is only taken from the next token when that token really
  // is a bare number - otherwise "@48.1,de:80939" would eat a postcode and
  // put the route somewhere nobody asked for.
  const r = parseRouteHash('x:@48.1,de:80939');
  assert.deepEqual(r?.items, [{ kind: 'plz', code: 'de:80939' }]);
});

test('coordinates out of range are dropped, not passed on as postcodes', () => {
  // The failure routeStore calls its worst: a code that reaches plzCodes,
  // never becomes a stop, shows nothing on screen, and then blocks the
  // duplicate guard so it can never be added again.
  assert.equal(parseRouteHash('x:@999;6.7'), null);
  assert.equal(parseRouteHash('x:@51.2;999'), null);
  assert.equal(parseRouteHash('x:@abc;def'), null);
});

test('codes and coordinates mix', () => {
  const r = parseRouteHash('Tur:de:40721,@52.0907;5.1214,nl:2291');
  assert.deepEqual(r?.items, [
    { kind: 'plz', code: 'de:40721' },
    { kind: 'waypoint', lngLat: [5.1214, 52.0907] },
    { kind: 'plz', code: 'nl:2291' },
  ]);
});

test('nothing usable gives null rather than an empty route', () => {
  assert.equal(parseRouteHash(null), null);
  assert.equal(parseRouteHash(''), null);
  assert.equal(parseRouteHash('no-colon'), null);
  assert.equal(parseRouteHash(':de:40721'), null, 'empty name');
  assert.equal(parseRouteHash('name:'), null, 'no items');
  assert.equal(parseRouteHash('name:,,,'), null, 'only separators');
});

test('negative and zero coordinates survive', () => {
  // Spain and Ireland are west of Greenwich; a falsy-check on 0 or a lost
  // minus sign puts a stop in the wrong hemisphere.
  const r = parseRouteHash('x:@53.35;-6.26,@0;0');
  assert.deepEqual(r?.items, [
    { kind: 'waypoint', lngLat: [-6.26, 53.35] },
    { kind: 'waypoint', lngLat: [0, 0] },
  ]);
});

test('build and parse agree', () => {
  // Anything in this repo generating a link uses buildRouteHash, so the two
  // cannot drift apart.
  const items = [
    { kind: 'plz' as const, code: 'de:40721' },
    { kind: 'waypoint' as const, lngLat: [6.7735, 51.2277] as [number, number] },
  ];
  const built = buildRouteHash('Tur de proba', items);
  assert.match(built, /^route=/);
  const back = parseRouteHash(built.slice('route='.length));
  assert.equal(back?.name, 'Tur de proba');
  assert.deepEqual(back?.items, items);
});

test('a name with a comma or spaces survives the round trip', () => {
  const built = buildRouteHash('Dresden, dupa-amiaza', [{ kind: 'plz', code: 'de:01067' }]);
  const back = parseRouteHash(built.slice('route='.length));
  assert.equal(back?.name, 'Dresden, dupa-amiaza');
});
