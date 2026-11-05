// The fleet arrives by postMessage from the TMS. What comes in ends up as
// marker positions and on-screen text, so the checks are pinned here.

import test from 'node:test';
import assert from 'node:assert/strict';

import { allowedFleetOrigin, fleetOrigins, parseFleetMessage, seenAgo } from '@/lib/fleetBridge';

const truck = {
  key: 'AR87GLI',
  plate: 'AR 87 GLI',
  driver: 'STOICANESCU MARIUS',
  phone: '+40 333 222 111',
  lat: 50.17,
  lon: 5.79,
  at: '2026-11-06T08:00:00Z',
  moving: false,
  place: 'Houffalize, BE',
  base: '2.431 km de la bază',
  run: { id: '#58617', route: 'DE40221 -> NL5466', stage: 'Planificat', gps: 'descărcat joi 06:34' },
};

test('only the TMS origins are accepted, plus any configured', () => {
  assert.equal(allowedFleetOrigin('https://remro.herokuapp.com'), true);
  assert.equal(allowedFleetOrigin('https://evil.example'), false);
  // A trailing slash in the setting is the commonest way to write it.
  assert.ok(fleetOrigins('https://tms.remro.ro/, ').includes('https://tms.remro.ro'));
});

test('a fleet message is read field by field', () => {
  const m = parseFleetMessage({ source: 'remro-tms', type: 'fleet', at: '2026-11-06T08:01:00Z', trucks: [truck], focus: 'AR87GLI' });
  assert.equal(m?.type, 'fleet');
  if (m?.type !== 'fleet') return;
  assert.equal(m.trucks.length, 1);
  assert.equal(m.trucks[0].run?.route, 'DE40221 -> NL5466');
  assert.equal(m.focus, 'AR87GLI');
});

test('a truck with no usable position is left out, never put at 0,0', () => {
  const m = parseFleetMessage({
    source: 'remro-tms',
    type: 'fleet',
    trucks: [truck, { ...truck, key: 'AR01GLI', lat: null }, { ...truck, key: 'AR06GLI', lon: Number.NaN }, { ...truck, key: 'X', lat: 120 }],
  });
  assert.equal(m?.type === 'fleet' && m.trucks.map((t) => t.key).join(), 'AR87GLI');
});

test('anything not from the TMS, or not well formed, is ignored', () => {
  assert.equal(parseFleetMessage({ type: 'fleet', trucks: [truck] }), null);
  assert.equal(parseFleetMessage({ source: 'remro-tms', type: 'fleet', trucks: 'x' }), null);
  assert.equal(parseFleetMessage('fleet'), null);
  assert.deepEqual(parseFleetMessage({ source: 'remro-tms', type: 'fleet-focus', key: 'AR18GLI' }), { type: 'fleet-focus', key: 'AR18GLI' });
});

test('a run without a route is dropped, the truck kept', () => {
  const m = parseFleetMessage({ source: 'remro-tms', type: 'fleet', trucks: [{ ...truck, run: { id: '#1' } }] });
  assert.equal(m?.type === 'fleet' && m.trucks[0].run, null);
});

test('how old a position is', () => {
  const now = Date.parse('2026-11-06T12:00:00Z');
  assert.equal(seenAgo('2026-11-06T11:56:00Z', now), 'acum 4 min');
  assert.equal(seenAgo('2026-11-06T10:00:00Z', now), 'acum 2 ore');
  assert.equal(seenAgo('2026-11-03T12:00:00Z', now), 'acum 3 zile');
});
