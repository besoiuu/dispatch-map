'use client';

import { useEffect, useMemo, useState } from 'react';
import { Layer, Marker, Source } from 'react-map-gl/maplibre';
import { fleetGeo, legKey, legsAhead } from '@/lib/fleetRoutes';
import { calculateRoute } from '@/lib/routing';
import { useFleetStore } from '@/store/fleetStore';
import { useThemeStore } from '@/store/themeStore';

/**
 * The fleet's routes (lib/fleetRoutes), under the truck tags (HTML markers,
 * always on top).
 *
 *   driven    the selected truck's week, solid orange - the TMS's brand, the
 *             same as its selected tag. Other trucks' weeks are faint grey,
 *             there for "where has everyone been", and almost gone once one
 *             truck is picked.
 *   ahead     dashed, along the roads: green where it drives loaded, grey
 *             where it drives empty (the TMS's map colours). The picked run's
 *             legs are thicker.
 *   stops     numbered in the order they will be driven, pickups green with an
 *             up-arrow, deliveries dark with a down-arrow, done ones faded.
 *
 * Roads come from OSRM (lib/routing, the free public server), one call per leg
 * and only for the selected truck, cached for the session: a dozen trucks'
 * legs on every two-minute refresh would be the rate limit's problem. A leg
 * whose road has not arrived - or that the server could not route - is not
 * drawn at all: never a straight line standing in for a road. Its stops are
 * still pinned and numbered, so the order of the work is never lost.
 */
const ORANGE = '#ee7a1d';
const LOADED = '#2f8f5b';
const EMPTY = '#948b81';

const roadCache = new Map<string, [number, number][]>();
const pending = new Set<string>();

export function FleetRoutes() {
  const trucks = useFleetStore((s) => s.trucks);
  const selected = useFleetStore((s) => s.selected);
  const run = useFleetStore((s) => s.run);
  const dark = useThemeStore((s) => s.dark);
  const picked = selected ? trucks.find((t) => t.key === selected) ?? null : null;
  // Bumped when a road arrives, so the lines are rebuilt with it.
  const [roadsVersion, setRoadsVersion] = useState(0);

  const legs = useMemo(() => (picked ? legsAhead(picked) : []), [picked]);

  useEffect(() => {
    let live = true;
    (async () => {
      for (const leg of legs) {
        const k = legKey(leg.from, leg.to);
        if (roadCache.has(k) || pending.has(k)) continue;
        pending.add(k);
        const r = await calculateRoute([leg.from, [leg.to.lon, leg.to.lat]]).catch(() => null);
        pending.delete(k);
        // A failed leg is remembered as straight, so it is not asked again on every refresh.
        roadCache.set(k, r?.coordinates ?? []);
        if (live) setRoadsVersion((v) => v + 1);
      }
    })();
    return () => {
      live = false;
    };
  }, [legs]);

  const geo = useMemo(
    () => fleetGeo(trucks, selected, run, roadCache),
    // roadsVersion: the cache is a module Map, so a new road changes nothing React can see.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trucks, selected, run, roadsVersion],
  );

  // Stop numbers in driving order: done stops first (they were driven first), then the ones ahead.
  const numbered = useMemo(() => (picked ? picked.stops.map((s, i) => ({ s, n: i + 1 })) : []), [picked]);

  if (!trucks.length) return null;
  const casing = dark ? '#131110' : '#ffffff';

  return (
    <>
      <Source id="fleet-trails" type="geojson" data={geo.trails}>
        <Layer
          id="fleet-trail-casing"
          type="line"
          filter={['==', ['get', 'sel'], true]}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ 'line-color': casing, 'line-width': 8, 'line-opacity': 0.9 }}
        />
        <Layer
          id="fleet-trail"
          type="line"
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{
            'line-color': ['case', ['get', 'sel'], ORANGE, dark ? '#a39a90' : '#766d64'],
            'line-width': ['case', ['get', 'sel'], 4.5, 2],
            'line-opacity': ['case', ['get', 'sel'], 1, selected ? 0.12 : 0.45],
          }}
        />
      </Source>
      <Source id="fleet-plans" type="geojson" data={geo.plans}>
        <Layer
          id="fleet-plan-casing"
          type="line"
          filter={['==', ['get', 'sel'], true]}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ 'line-color': casing, 'line-width': ['case', ['get', 'run'], 9, 7], 'line-opacity': 0.85 }}
        />
        <Layer
          id="fleet-plan"
          type="line"
          layout={{ 'line-cap': 'butt', 'line-join': 'round' }}
          paint={{
            'line-color': ['case', ['get', 'loaded'], LOADED, EMPTY],
            'line-width': ['case', ['get', 'run'], 5, ['get', 'sel'], 3.5, 2],
            'line-dasharray': [2, 1.4],
            'line-opacity': ['case', ['get', 'sel'], ['case', ['get', 'run'], 1, run ? 0.55 : 1], 0.5],
          }}
        />
      </Source>
      {numbered.map(({ s, n }) => {
        const inRun = run != null && s.order === run;
        const pickup = s.kind === 'pickup';
        return (
          <Marker key={`fleet-stop-${s.id}`} longitude={s.lon} latitude={s.lat} anchor="left" offset={[-13, 0]} style={{ zIndex: inRun ? 2 : 1 }}>
            <div
              className={`pointer-events-none flex items-center gap-1.5 ${s.done ? 'opacity-55' : ''}`}
              title={`${n}. ${pickup ? 'Încărcare' : 'Descărcare'} ${s.order} · ${s.code}${s.day ? ` · ${s.day}` : ''}${s.done ? ' · făcut' : ''}`}
            >
              <span
                className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border-2 border-white text-[12px] font-bold shadow-md dark:border-gray-900 ${
                  pickup ? 'bg-green-600 text-white' : 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                } ${inRun ? 'ring-2 ring-orange-500 ring-offset-1 ring-offset-white dark:ring-offset-gray-900' : ''}`}
              >
                {n}
              </span>
              <span
                className={`flex items-center gap-1 whitespace-nowrap rounded-md border bg-white/95 px-1.5 py-0.5 text-[11px] font-semibold text-gray-900 shadow-sm dark:bg-gray-900/95 dark:text-gray-100 ${
                  inRun ? 'border-orange-300 dark:border-orange-800' : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
                  {pickup ? <path d="M5 1 L9.5 9 L0.5 9 Z" fill={LOADED} /> : <path d="M0.5 1 L9.5 1 L5 9 Z" fill="currentColor" />}
                </svg>
                <span className="font-mono">{s.code}</span>
                {s.day ? <span className="font-normal text-gray-500 dark:text-gray-400">{s.day}</span> : null}
              </span>
            </div>
          </Marker>
        );
      })}
    </>
  );
}
