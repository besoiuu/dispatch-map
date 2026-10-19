// Which part of a run is loaded, and what it is worth.
//
// These are the numbers a dispatcher decides on, so each rule here is one
// that would quietly change a decision if it drifted.

import test from 'node:test';
import assert from 'node:assert/strict';

import { splitLegs, runValue, splitRouteLine } from '@/lib/legEconomics';
import type { StopKind } from '@/lib/routeHash';
import type { RouteLeg } from '@/types/route';

const legs = (...km: number[]): RouteLeg[] =>
  km.map((k) => ({ distance: k * 1000, duration: k * 45 }));

/** "wpd" -> stops carrying those kinds. The kind lives on the stop now. */
const K = (s: string): { kind: StopKind; coordinate: [number, number] }[] =>
  s.split('').map((c, i) => ({
    kind: (c === 'p' ? 'pickup' : c === 'd' ? 'delivery' : 'waypoint') as StopKind,
    coordinate: [i, 0] as [number, number],
  }));

test('the approach and the run home are empty, the middle is loaded', () => {
  // 100 km to reach the first car, 400 loaded, 150 home.
  const s = splitLegs(legs(100, 400, 150), K('wpdw'));
  assert.equal(s?.loadedMeters, 400_000);
  assert.equal(s?.emptyMeters, 250_000);
  assert.deepEqual(s?.legLoaded, [false, true, false]);
});

test('a leg BETWEEN two pickups is loaded — the first car is already on', () => {
  // This is the rule that matters with several loads on one lorry. Testing
  // each leg's own endpoints would call this middle leg empty and make a
  // perfectly good tour look like a bad one.
  const s = splitLegs(legs(50, 80, 300, 60), K('ppddd'));
  // Every leg here is between the first pickup and the last delivery, so
  // every one is loaded - the lorry still has a car on it right up to the
  // final drop.
  assert.deepEqual(s?.legLoaded, [true, true, true, true]);
  assert.equal(s?.loadedMeters, 490_000);
  assert.equal(s?.emptyMeters, 0);
});

test('pickups and deliveries interleaved still give one loaded stretch', () => {
  // p d p d — the lorry is carrying something from the first pickup until
  // the last drop, even though it unloads in the middle.
  const s = splitLegs(legs(10, 20, 30), K('pdpd'));
  assert.deepEqual(s?.legLoaded, [true, true, true]);
  assert.equal(s?.emptyMeters, 0);
});

test('empty share is the number that flatters a run when it is hidden', () => {
  const s = splitLegs(legs(300, 300), K('wpd'.slice(0, 3)));
  // 300 empty of 600 total
  assert.equal(s?.emptyShare, 0.5);
});

test('nothing is carried: no pickup, or a drop before the pickup', () => {
  // Not an error and not loaded either - it is all deadhead, and saying so
  // is the honest answer.
  const none = splitLegs(legs(100, 100), K('www'));
  assert.equal(none?.loadedMeters, 0);
  assert.equal(none?.emptyShare, 1);

  const backwards = splitLegs(legs(100, 100), K('dwp'));
  assert.equal(backwards?.loadedMeters, 0);
  assert.deepEqual(backwards?.legLoaded, [false, false]);
});

test('kinds out of step with the legs gives null, never a guess', () => {
  // One kind too few would shift every flag by one and draw the empty legs
  // in the wrong place: a confident lie, worse than drawing nothing.
  assert.equal(splitLegs(legs(10, 20), K('pd')), null);
  assert.equal(splitLegs(legs(10, 20), K('pddd')), null);
  assert.equal(splitLegs(legs(10, 20), undefined), null);
  assert.equal(splitLegs(undefined, K('pdd')), null);
});

test('value per km is given on both bases', () => {
  // perLoadedKm is what the trade quotes; perTotalKm is what it costs you.
  // A run with a long approach looks fine on the first and poor on the
  // second, which is the whole point of showing both.
  const s = splitLegs(legs(300, 500), K('wpd'));
  const v = runValue(1000, s);
  assert.equal(Math.round(v!.perTotalKm * 100) / 100, 1.25);   // 1000 / 800
  assert.equal(Math.round(v!.perLoadedKm! * 100) / 100, 2);    // 1000 / 500
});

test('no revenue, no number — never zero', () => {
  // A run with no price is price-on-request, not a free one. Showing 0 €/km
  // would rank it below every real run.
  const s = splitLegs(legs(100, 100), K('wpd'));
  assert.equal(runValue(undefined, s), null);
  assert.equal(runValue(0, s), null);
  assert.equal(runValue(500, null), null);
});

test('the polyline is cut at the first pickup and the last delivery', () => {
  // A straight west-to-east line of vertices; the stops sit on three of them.
  const line: [number, number][] = [[0,0],[1,0],[2,0],[3,0],[4,0],[5,0]];
  const stops = K('wpdw').map((s, i) => ({ ...s, coordinate: [[0,0],[2,0],[4,0],[5,0]][i] as [number,number] }));
  const cut = splitRouteLine(line, stops);
  assert.deepEqual(cut?.loaded, [[2,0],[3,0],[4,0]]);
  // Two empty pieces: the approach and the run home.
  assert.equal(cut?.empty.length, 2);
  assert.deepEqual(cut?.empty[0], [[0,0],[1,0],[2,0]]);
  assert.deepEqual(cut?.empty[1], [[4,0],[5,0]]);
});

test('the cuts share a vertex with the loaded piece', () => {
  // Without the shared point the dashed and solid lines leave a visible gap
  // exactly where the lorry picks up.
  const line: [number, number][] = [[0,0],[1,0],[2,0],[3,0]];
  const stops = K('wpd').map((s, i) => ({ ...s, coordinate: [[0,0],[1,0],[3,0]][i] as [number,number] }));
  const cut = splitRouteLine(line, stops);
  assert.equal(cut!.empty[0][cut!.empty[0].length - 1][0], cut!.loaded[0][0]);
});

test('no pickup or no delivery means nothing to split', () => {
  const line: [number, number][] = [[0,0],[1,0]];
  const at = (ks: string) => K(ks).map((s, i) => ({ ...s, coordinate: [[0,0],[1,0]][i] as [number,number] }));
  assert.equal(splitRouteLine(line, at('ww')), null);
  assert.equal(splitRouteLine(line, at('dp')), null, 'a drop before the pickup');
  assert.equal(splitRouteLine(line, undefined), null);
  assert.equal(splitRouteLine(undefined, at('pd')), null);
  assert.equal(splitRouteLine(line, [{ coordinate: [0,0] }, { coordinate: [1,0] }]), null, 'no kinds at all');
});

test('a route that is entirely loaded has no empty pieces', () => {
  const line: [number, number][] = [[0,0],[1,0],[2,0]];
  const stops = K('pd').map((s, i) => ({ ...s, coordinate: [[0,0],[2,0]][i] as [number,number] }));
  const cut = splitRouteLine(line, stops);
  assert.equal(cut?.empty.length, 0);
  assert.equal(cut?.loaded.length, 3);
});

test('reordering the stops cannot misalign the split', () => {
  // The reason the kind lives ON the stop. This app reorders stops in three
  // ways - the store appends waypoints and codes differently, the user can
  // drag, and optimise rewrites the order outright - and a parallel array
  // of kinds would point at the wrong stops in all three cases, drawing the
  // empty legs somewhere they are not.
  const stops = K('wpd');                       // approach, pickup, drop
  const legs2 = legs(200, 500);
  const before = splitLegs(legs2, stops);
  assert.deepEqual(before?.legLoaded, [false, true]);

  // Same stops, shuffled the way a drag would: the kinds go with them.
  const dragged = [stops[1], stops[0], stops[2]];
  const after = splitLegs(legs2, dragged);
  // Now the FIRST leg is loaded (pickup -> waypoint) and the second still
  // is (waypoint -> drop): the lorry is carrying from the first pickup to
  // the last delivery whatever order the middle is in.
  assert.deepEqual(after?.legLoaded, [true, true]);
  assert.equal(after?.emptyMeters, 0);
});

test('a stop with no kind at all disables the split rather than guessing', () => {
  // Routes built by hand in the app have no kinds; they get one plain line
  // and no economics, which is honest. Treating "unknown" as "waypoint"
  // would mark real loaded legs empty.
  const mixed = [{ kind: 'pickup' as const }, {}, { kind: 'delivery' as const }];
  assert.equal(splitLegs(legs(10, 20), mixed), null);
});
