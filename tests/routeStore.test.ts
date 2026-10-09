// The route store: adding a code, and what the caller is told.
//
// The worst bug in the app lived here. `addPlzToActiveRoute` pushed the code
// into `plzCodes` and returned `void`, and the stop - the thing that puts a
// pin on the map and a row in the sidebar - was built later, by RoutePanel,
// from the detail GeoJSON. That GeoJSON is fetched only after the map has
// been moved at zoom 7 or higher, so for the first minutes of a session there
// was none, and the code produced nothing visible. Worse, the duplicate guard
// then saw it as already present, so selecting it again did nothing, silently,
// for ever. These tests pin both halves: the stop exists in the same tick, and
// the caller always learns what happened.

import './memoryStorage';

import test from 'node:test';
import assert from 'node:assert/strict';
import { __setIndexForTests } from '@/lib/plzIndex';
import { useRouteStore } from '@/store/routeStore';

__setIndexForTests([
  ['de', '27576', 'Bremerhaven', 8.61, 53.57],
  ['de', '99423', 'Weimar', 11.32, 50.98],
  ['nl', '4214', 'Vuren', 5.09, 51.83],
]);

function freshRoute(name = 'Tour 1') {
  useRouteStore.setState({ routes: [], activeRouteId: null, undoStack: [] });
  useRouteStore.getState().addRoute(name);
  const route = useRouteStore.getState().routes[0];
  return route.id;
}

const routeNow = (id: string) => useRouteStore.getState().routes.find((r) => r.id === id)!;

// ── Adding a code ─────────────────────────────────────────────────

test('A CODE BECOMES A STOP IMMEDIATELY, with no map data loaded', () => {
  const id = freshRoute();
  const outcome = useRouteStore.getState().addPlzToActiveRoute('de:27576');

  assert.equal(outcome, 'added');
  const r = routeNow(id);
  assert.deepEqual(r.plzCodes, ['de:27576']);
  assert.equal(r.stops.length, 1, 'codul nu a produs niciun stop');
  assert.deepEqual(r.stops[0].coordinate, [8.61, 53.57]);
  assert.equal(r.stops[0].label, '27576 Bremerhaven');
  assert.equal(r.stops[0].type, 'plz');
});

test('a caller-supplied position is used as given', () => {
  // Search hands over the coordinate it already has, so nothing is looked up
  // twice and the pin cannot disagree with the result that was clicked.
  const id = freshRoute();
  useRouteStore
    .getState()
    .addPlzToActiveRoute('de:99423', { coordinate: [11.0, 51.0], label: 'Custom' });
  assert.deepEqual(routeNow(id).stops[0].coordinate, [11.0, 51.0]);
  assert.equal(routeNow(id).stops[0].label, 'Custom');
});

test('A DUPLICATE IS REPORTED, not swallowed', () => {
  // Returning silently was indistinguishable from success, which is what made
  // the invisible-code bug unrecoverable instead of merely annoying.
  const id = freshRoute();
  useRouteStore.getState().addPlzToActiveRoute('de:27576');
  assert.equal(useRouteStore.getState().addPlzToActiveRoute('de:27576'), 'duplicate');
  assert.equal(routeNow(id).plzCodes.length, 1, 'codul a fost adaugat de doua ori');
});

test('a code already on ANOTHER route is a duplicate too', () => {
  freshRoute('A');
  useRouteStore.getState().addPlzToActiveRoute('de:27576');
  useRouteStore.getState().addRoute('B');
  assert.equal(useRouteStore.getState().addPlzToActiveRoute('de:27576'), 'duplicate');
});

test('with no route selected the caller is told, not ignored', () => {
  useRouteStore.setState({ routes: [], activeRouteId: null, undoStack: [] });
  assert.equal(useRouteStore.getState().addPlzToActiveRoute('de:27576'), 'no-route');
});

test('an unplaceable code is added AND flagged', () => {
  // It still goes on the route - the dispatcher typed it deliberately - but
  // the panel can then say it is not on the map, instead of a count that
  // disagrees with what is drawn.
  const id = freshRoute();
  const outcome = useRouteStore.getState().addPlzToActiveRoute('de:00000');
  assert.equal(outcome, 'unknown-code');
  assert.deepEqual(routeNow(id).plzCodes, ['de:00000']);
  assert.equal(routeNow(id).stops.length, 0);
});

test('a bare, unqualified code cannot be placed', () => {
  // 27576 exists in more than one country in the real index; guessing one is
  // how the map used to fly to the wrong country.
  freshRoute();
  assert.equal(useRouteStore.getState().addPlzToActiveRoute('27576'), 'unknown-code');
});

// ── Moving a pin ──────────────────────────────────────────────────

test('MOVING A STOP EXISTS AT ALL', () => {
  // There was no action for this. No marker on the map could be dragged on
  // any device, because the store had nothing that could change a position.
  const id = freshRoute();
  useRouteStore.getState().addPlzToActiveRoute('de:27576');
  const stopId = routeNow(id).stops[0].id;

  useRouteStore.getState().moveStop(id, stopId, [9.0, 54.0]);
  assert.deepEqual(routeNow(id).stops[0].coordinate, [9.0, 54.0]);
});

test('moving a stop invalidates the drawn route', () => {
  const id = freshRoute();
  useRouteStore.getState().addPlzToActiveRoute('de:27576');
  useRouteStore.getState().addPlzToActiveRoute('de:99423');
  useRouteStore.getState().setRouteGeometry(id, {
    coordinates: [[0, 0]], distance: 1, duration: 1, legs: [],
  });
  const stopId = routeNow(id).stops[0].id;

  useRouteStore.getState().moveStop(id, stopId, [9.0, 54.0]);
  assert.equal(routeNow(id).geometry, undefined, 'linia veche a ramas pe harta');
});

test('moving a stop that is not there changes nothing', () => {
  const id = freshRoute();
  useRouteStore.getState().addPlzToActiveRoute('de:27576');
  const before = routeNow(id).stops;
  useRouteStore.getState().moveStop(id, 'no-such-stop', [1, 1]);
  assert.equal(routeNow(id).stops, before, 'referinta s-a schimbat degeaba');
});

// ── Undo ──────────────────────────────────────────────────────────

test('a removed stop can be put back where it was', () => {
  // This is what the Undo in the toast calls, after a mistaken tap on the map
  // removed an area - which used to happen silently, with Ctrl+Z as the only
  // way back and no phone able to press it.
  const id = freshRoute();
  useRouteStore.getState().addPlzToActiveRoute('de:27576');
  useRouteStore.getState().addPlzToActiveRoute('de:99423');
  useRouteStore.getState().addPlzToActiveRoute('nl:4214');

  const victim = routeNow(id).stops[1];
  useRouteStore.getState().removeStop(id, victim.id);
  assert.deepEqual(routeNow(id).plzCodes, ['de:27576', 'nl:4214']);

  useRouteStore.getState().restoreStop(id, victim, 1);
  assert.deepEqual(
    routeNow(id).stops.map((s) => s.plz),
    ['de:27576', 'de:99423', 'nl:4214']
  );
  assert.deepEqual(routeNow(id).plzCodes, ['de:27576', 'de:99423', 'nl:4214']);
});

test('restoring past the end appends instead of throwing', () => {
  const id = freshRoute();
  useRouteStore.getState().addPlzToActiveRoute('de:27576');
  const stop = routeNow(id).stops[0];
  useRouteStore.getState().removeStop(id, stop.id);
  useRouteStore.getState().restoreStop(id, stop, 99);
  assert.equal(routeNow(id).stops.length, 1);
});

// ── Order ─────────────────────────────────────────────────────────

test('reordering keeps plzCodes in step with the stops', () => {
  const id = freshRoute();
  useRouteStore.getState().addPlzToActiveRoute('de:27576');
  useRouteStore.getState().addPlzToActiveRoute('de:99423');

  useRouteStore.getState().reorderStop(id, 0, 1);
  assert.deepEqual(
    routeNow(id).stops.map((s) => s.plz),
    ['de:99423', 'de:27576']
  );
  assert.deepEqual(routeNow(id).plzCodes, ['de:99423', 'de:27576']);
});

test('a waypoint survives a reorder without becoming a code', () => {
  const id = freshRoute();
  useRouteStore.getState().addPlzToActiveRoute('de:27576');
  useRouteStore.getState().addWaypoint(id, [8.0, 53.0], undefined, 'Depot');
  useRouteStore.getState().addPlzToActiveRoute('de:99423');

  useRouteStore.getState().reorderStop(id, 1, 2);
  const r = routeNow(id);
  assert.equal(r.stops.length, 3);
  assert.equal(r.plzCodes.length, 2, 'waypoint-ul a intrat in plzCodes');
  assert.equal(r.stops[2].label, 'Depot');
});
