// The Dispecerat routes: what each truck drove (trail) and what is still
// ahead (plan), loaded or empty. Both come from the TMS by postMessage.

import test from 'node:test';
import assert from 'node:assert/strict';

import { parseFleetMessage, type FleetStop, type FleetTruck } from '@/lib/fleetBridge';
import { fleetGeo, legsAhead } from '@/lib/fleetRoutes';

const stop = (order: string, kind: 'pickup' | 'delivery', lon: number, lat: number, done = false): FleetStop => ({
  id: `${order.slice(1)}:${kind}`,
  order,
  kind,
  code: kind === 'pickup' ? 'DE40221' : 'NL5466',
  lat,
  lon,
  day: 'Jo 6',
  done,
});

const truck = (stops: FleetStop[], trail: [number, number][] = []): FleetTruck => ({
  key: 'AR87GLI',
  plate: 'AR 87 GLI',
  driver: null,
  phone: null,
  lat: 50,
  lon: 6,
  at: '2026-11-17T08:00:00Z',
  moving: true,
  place: null,
  base: null,
  run: null,
  trail,
  stops,
});

test('a truck that already loaded drives the next leg full, then empty to the next pickup', () => {
  const legs = legsAhead(
    truck([
      stop('#1', 'pickup', 6.8, 51.2, true),
      stop('#1', 'delivery', 5.7, 51.5),
      stop('#2', 'pickup', 7, 50.9),
      stop('#2', 'delivery', 21.3, 46.2),
    ]),
  );
  assert.deepEqual(
    legs.map((l) => [l.to.id, l.loaded]),
    [
      ['1:delivery', true],
      ['2:pickup', false],
      ['2:delivery', true],
    ],
  );
  // The first leg starts at the truck, not at the stop already done.
  assert.deepEqual(legs[0].from, [6, 50]);
});

test('a delivered order is no longer on board', () => {
  const legs = legsAhead(truck([stop('#1', 'pickup', 6.8, 51.2, true), stop('#1', 'delivery', 5.7, 51.5, true), stop('#2', 'pickup', 7, 50.9)]));
  assert.deepEqual(
    legs.map((l) => l.loaded),
    [false],
  );
});

test('with a truck selected, only its plan is drawn; every trail stays', () => {
  const a = truck([stop('#1', 'pickup', 6.8, 51.2)], [[5, 49], [5.5, 49.5]]);
  const b = { ...a, key: 'B', stops: [stop('#9', 'pickup', 8, 52)] };
  const all = fleetGeo([a, b], null, null);
  assert.equal(all.plans.features.length, 2);
  const one = fleetGeo([a, b], 'B', '#9');
  assert.deepEqual(one.plans.features.map((f) => f.properties?.key), ['B']);
  assert.equal(one.plans.features[0].properties?.run, true);
  assert.equal(one.trails.features.length, 2);
  // The trail ends at the truck's position, where its tag is.
  assert.deepEqual(one.trails.features[0].geometry.coordinates.at(-1), [6, 50]);
});

test('trail and stops are read field by field from the TMS message', () => {
  const m = parseFleetMessage({
    source: 'remro-tms',
    type: 'fleet',
    at: '2026-11-17T08:00:00Z',
    trucks: [
      {
        key: 'AR87GLI',
        lat: 50,
        lon: 6,
        trail: [[5, 49], ['x', 1], [200, 10], [5.5, 49.5]],
        stops: [
          { id: '1:pickup', order: '#1', kind: 'pickup', code: 'DE40221', lat: 51.2, lon: 6.8, day: 'Jo 6', done: true },
          { id: '1:delivery', order: '#1', kind: 'unloading', lat: 51.5, lon: 5.7 },
          { id: '2:pickup', order: '#2', kind: 'pickup', lat: NaN, lon: 7 },
        ],
      },
    ],
  });
  assert.equal(m?.type, 'fleet');
  if (m?.type !== 'fleet') return;
  const t = m.trucks[0];
  // A point that is not two numbers, or is off the globe, is dropped.
  assert.deepEqual(t.trail, [[5, 49], [5.5, 49.5]]);
  // A stop of an unknown kind or with no position is left out, not drawn at 0,0.
  assert.deepEqual(t.stops.map((s) => s.id), ['1:pickup']);
  assert.equal(t.stops[0].done, true);
});

test('a focus from the TMS can name a run', () => {
  assert.deepEqual(parseFleetMessage({ source: 'remro-tms', type: 'fleet-focus', key: 'AR87GLI', run: '#58617' }), {
    type: 'fleet-focus',
    key: 'AR87GLI',
    run: '#58617',
  });
});
