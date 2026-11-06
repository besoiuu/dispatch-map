'use client';

import { useEffect } from 'react';
import { allowedFleetOrigin, baseText, parseFleetMessage, truckFromApi, type FleetTruck } from '@/lib/fleetBridge';
import { clearLink, hashWithoutLink, linkFromHash, loadLink, saveLink, type FleetLink } from '@/lib/fleetLink';
import { focusTruck, useFleetStore } from '@/store/fleetStore';

const POSITIONS_MS = 2 * 60_000;
const BASE_MS = 10 * 60_000;

/**
 * Where the fleet comes from (lib/fleetBridge, lib/fleetLink). Renders nothing.
 *
 * Inside the TMS's popup: the TMS hands it in, and with it a key, which is
 * kept. Opened on its own with a key: the map asks the TMS itself, positions
 * every two minutes and "km since the base" every ten (one truck per call,
 * which is what that route takes). A link from the TMS with `#fleet-key=`
 * stores the key as well. Without a key it does nothing; the panel offers to
 * connect.
 */
export function FleetBridge() {
  useEffect(() => {
    const embedded = window.parent !== window;

    // A link from the TMS: keep the key, and take it out of the address bar.
    const fromHash = linkFromHash(window.location.hash);
    if (fromHash) {
      const before = loadLink();
      saveLink({ ...fromHash, exp: Date.now() + 30 * 86_400_000, drivers: before?.drivers ?? {} });
      window.history.replaceState(null, '', window.location.pathname + window.location.search + hashWithoutLink(window.location.hash));
    }
    showLink(loadLink());

    if (embedded) {
      const onMessage = (e: MessageEvent) => {
        if (!allowedFleetOrigin(e.origin)) return;
        const m = parseFleetMessage(e.data);
        if (!m) return;
        if (m.type === 'fleet') {
          const first = useFleetStore.getState().source !== 'tms';
          useFleetStore.getState().setFleet('tms', m.at, m.trucks);
          remember(m.trucks, m.link);
          // A focus is honoured when it is new, so a two-minute refresh does not pull the map back.
          if (m.focus && (first || m.focus !== useFleetStore.getState().selected)) focusTruck(m.focus);
          else if (first && m.trucks.length) fitFleet();
        } else {
          focusTruck(m.key);
        }
      };
      window.addEventListener('message', onMessage);
      // No data in it, so any parent may hear it; the parent answers with the fleet.
      window.parent.postMessage({ source: 'dispatch-map', type: 'fleet-ready' }, '*');
      return () => window.removeEventListener('message', onMessage);
    }

    // On its own: read with the key, if there is one.
    let stopped = false;
    let bases: Record<string, string | null> = {};
    let basesAt = 0;
    let first = true;

    const tick = async () => {
      const link = loadLink();
      if (!link || stopped) return;
      try {
        const r = await call(link, '/api/cargotrack/trucks');
        if (stopped) return;
        const body = (await r.json()) as { at?: string; trucks?: unknown[] };
        const trucks = (body.trucks ?? [])
          .map((t) => truckFromApi(t, link.drivers))
          .filter((t): t is FleetTruck => t !== null)
          .map((t) => ({ ...t, base: bases[t.key] ?? null }));
        useFleetStore.getState().setFleet('key', body.at ?? new Date().toISOString(), trucks);
        if (first && trucks.length) fitFleet();
        first = false;
        if (Date.now() - basesAt > BASE_MS) {
          basesAt = Date.now();
          bases = await readBases(link, trucks.map((t) => t.key), () => stopped);
          if (stopped) return;
          const now = useFleetStore.getState();
          useFleetStore.setState({ trucks: now.trucks.map((t) => ({ ...t, base: bases[t.key] ?? t.base })) });
        }
      } catch (e) {
        if (stopped) return;
        if (e instanceof Refused) {
          clearLink();
          useFleetStore.setState({ link: null, linkRefused: true, source: null, trucks: [] });
        } else {
          useFleetStore.setState({ error: e instanceof Error ? e.message : 'TMS nu a răspuns' });
        }
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), POSITIONS_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, []);

  return null;
}

class Refused extends Error {}

/** A call to the TMS with the key. A 401 means the key is no good any more. */
async function call(link: FleetLink, path: string, init: RequestInit = {}): Promise<Response> {
  const r = await fetch(`${link.api}${path}`, {
    ...init,
    cache: 'no-store',
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${link.token}`, Accept: 'application/json' },
  });
  if (r.status === 401) throw new Refused('Cheia a expirat');
  if (!r.ok) throw new Error(`TMS: ${r.status}`);
  return r;
}

/** Monday of this week in Bucharest, "2026-11-02": the planner route wants a week. */
function mondayIso(now = Date.now()): string {
  const today = new Date(new Date(now).toLocaleDateString('en-CA', { timeZone: 'Europe/Bucharest' }) + 'T00:00:00Z');
  const back = (today.getUTCDay() + 6) % 7;
  return new Date(today.getTime() - back * 86_400_000).toISOString().slice(0, 10);
}

/** "Km since the base" for each truck, one at a time: the route reads one truck per call. */
async function readBases(link: FleetLink, keys: string[], stopped: () => boolean): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (const key of keys) {
    if (stopped()) break;
    try {
      const r = await call(link, '/api/cargotrack/planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStart: mondayIso(), truck: key, stops: [] }),
      });
      const body = (await r.json()) as { trucks?: Record<string, { base?: unknown }> };
      out[key] = baseText(body.trucks?.[key]?.base);
    } catch (e) {
      if (e instanceof Refused) throw e;
      out[key] = null;
    }
  }
  return out;
}

/** Keeps the key and the driver names the TMS just sent. */
function remember(trucks: FleetTruck[], link: { token: string; exp: number; api: string } | null) {
  const before = loadLink();
  const drivers = { ...(before?.drivers ?? {}) };
  for (const t of trucks) drivers[t.key] = { driver: t.driver, phone: t.phone };
  const next = link ? { ...link, drivers } : before ? { ...before, drivers } : null;
  if (next) {
    saveLink(next);
    showLink(next);
  }
}

function showLink(link: FleetLink | null) {
  useFleetStore.setState({ link: link ? { api: link.api, exp: link.exp } : null, ...(link ? { linkRefused: false } : {}) });
}

/** Frames every truck, for the first look with nothing focused. */
export function fitFleet() {
  const trucks = useFleetStore.getState().trucks;
  if (!trucks.length) return;
  const lons = trucks.map((t) => t.lon);
  const lats = trucks.map((t) => t.lat);
  const pad = 0.4;
  window.dispatchEvent(
    new CustomEvent('map:flyto', {
      detail: { bbox: [Math.min(...lons) - pad, Math.min(...lats) - pad, Math.max(...lons) + pad, Math.max(...lats) + pad] },
    })
  );
}
