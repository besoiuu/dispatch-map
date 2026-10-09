// Routing: the numbers a dispatcher reads off the panel, and the request that
// produces them.
//
// `calculateRoute` talks to OSRM's public demo server by default - no key, no
// uptime promise, rate-limited - and nothing used to bound the wait, so a
// hanging request left the panel on "Calculating..." indefinitely. The fetch
// is now aborted and every failure shape returns null, which the panel reports
// rather than showing a stale distance.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGoogleMapsUrl, calculateRoute, formatDistance, formatDuration } from '@/lib/routing';

const COORDS: [number, number][] = [
  [8.61, 53.57],
  [11.32, 50.98],
];

/** Swaps global fetch for the duration of one test. */
async function withFetch(impl: typeof fetch, fn: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    await fn();
  } finally {
    globalThis.fetch = original;
  }
}

const okBody = {
  code: 'Ok',
  routes: [
    {
      geometry: { coordinates: [[8.61, 53.57], [11.32, 50.98]] },
      distance: 412_300,
      duration: 15_120,
      legs: [{ distance: 412_300, duration: 15_120 }],
    },
  ],
};

// ── Failure is reported, never faked ──────────────────────────────

test('a route is parsed out of a good answer', async () => {
  await withFetch(
    (async () => new Response(JSON.stringify(okBody), { status: 200 })) as typeof fetch,
    async () => {
      const r = await calculateRoute(COORDS);
      assert.equal(r?.distance, 412_300);
      assert.equal(r?.legs.length, 1);
    }
  );
});

test('AN HTTP ERROR RETURNS NULL rather than throwing', async () => {
  await withFetch(
    (async () => new Response('rate limited', { status: 429 })) as typeof fetch,
    async () => assert.equal(await calculateRoute(COORDS), null)
  );
});

test('a network failure returns null rather than throwing', async () => {
  // The panel catches this too, but an unhandled rejection here left
  // `calculating` stuck on, so the spinner never stopped.
  await withFetch(
    (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch,
    async () => assert.equal(await calculateRoute(COORDS), null)
  );
});

test('a body that is not JSON returns null', async () => {
  await withFetch(
    (async () => new Response('<html>502</html>', { status: 200 })) as typeof fetch,
    async () => assert.equal(await calculateRoute(COORDS), null)
  );
});

test("OSRM's own error code is respected even on a 200", async () => {
  await withFetch(
    (async () => new Response(JSON.stringify({ code: 'NoRoute' }), { status: 200 })) as typeof fetch,
    async () => assert.equal(await calculateRoute(COORDS), null)
  );
});

test('the request carries an abort signal, so it can time out', async () => {
  // This is the whole point of the change: without a signal there was no
  // bound on the wait at all.
  let sawSignal = false;
  await withFetch(
    (async (_url: string | URL | Request, init?: RequestInit) => {
      sawSignal = Boolean(init?.signal);
      return new Response(JSON.stringify(okBody), { status: 200 });
    }) as typeof fetch,
    async () => {
      await calculateRoute(COORDS);
      assert.ok(sawSignal, 'fetch-ul a plecat fara signal');
    }
  );
});

test('fewer than two stops is not a request', async () => {
  let called = false;
  await withFetch(
    (async () => {
      called = true;
      return new Response('{}', { status: 200 });
    }) as typeof fetch,
    async () => {
      assert.equal(await calculateRoute([[8.61, 53.57]]), null);
      assert.equal(called, false, 'am intrebat serverul degeaba');
    }
  );
});

// ── Formatting ────────────────────────────────────────────────────

test('distances read the way a dispatcher quotes them', () => {
  assert.equal(formatDistance(640), '640 m');
  assert.equal(formatDistance(1000), '1.0 km');
  assert.equal(formatDistance(412_300), '412.3 km');
});

test('durations read as hours and minutes', () => {
  assert.equal(formatDuration(540), '9 min');
  assert.equal(formatDuration(3600), '1h 0m');
  assert.equal(formatDuration(15_120), '4h 12m');
});

// ── The Google Maps hand-off ──────────────────────────────────────

test('a two-stop route becomes an origin and a destination', () => {
  const url = buildGoogleMapsUrl([
    { coordinate: [8.61, 53.57], label: '27576 Bremerhaven' },
    { coordinate: [11.32, 50.98], label: '99423 Weimar' },
  ]);
  assert.match(url, /origin=27576%20Bremerhaven/);
  assert.match(url, /destination=99423%20Weimar/);
  assert.match(url, /travelmode=driving/);
});

test('intermediate stops ride along as waypoints', () => {
  const url = buildGoogleMapsUrl([
    { coordinate: [8.61, 53.57], label: 'A' },
    { coordinate: [9.0, 52.0], label: 'B' },
    { coordinate: [11.32, 50.98], label: 'C' },
  ]);
  assert.match(url, /waypoints=B/);
});

test('an unnamed waypoint is sent as coordinates, not as the word', () => {
  // "Waypoint" as a search term lands somewhere arbitrary.
  const url = buildGoogleMapsUrl([
    { coordinate: [8.61, 53.57], label: 'Waypoint 1' },
    { coordinate: [11.32, 50.98], label: '99423 Weimar' },
  ]);
  assert.match(url, /origin=53\.57,8\.61/);
});

test('a single stop produces no link', () => {
  assert.equal(buildGoogleMapsUrl([{ coordinate: [8.61, 53.57] }]), '');
});
