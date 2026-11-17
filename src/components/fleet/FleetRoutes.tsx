'use client';

import { useMemo } from 'react';
import { Layer, Marker, Source } from 'react-map-gl/maplibre';
import { fleetGeo } from '@/lib/fleetRoutes';
import { useFleetStore } from '@/store/fleetStore';
import { useThemeStore } from '@/store/themeStore';

/**
 * The fleet's routes (lib/fleetRoutes): what each truck drove this week, and
 * for the selected truck what is still ahead, with its pickups and
 * deliveries marked. Under the truck tags, which are HTML markers and always
 * sit on top.
 *
 * Colours: the selected truck's driven line is orange (the TMS's brand, the
 * same as its selected tag); the others are grey and faint, there for "where
 * has everyone been" without competing. Ahead, loaded legs are green and
 * empty legs grey - the TMS's fleet map uses the same two.
 */
const ORANGE = '#ee7a1d';
const LOADED = '#2f8f5b';
const EMPTY = '#948b81';

export function FleetRoutes() {
  const trucks = useFleetStore((s) => s.trucks);
  const selected = useFleetStore((s) => s.selected);
  const run = useFleetStore((s) => s.run);
  const dark = useThemeStore((s) => s.dark);
  const geo = useMemo(() => fleetGeo(trucks, selected, run), [trucks, selected, run]);
  const picked = selected ? trucks.find((t) => t.key === selected) : null;
  if (!trucks.length) return null;

  return (
    <>
      <Source id="fleet-trails" type="geojson" data={geo.trails}>
        <Layer
          id="fleet-trail-casing"
          type="line"
          filter={['==', ['get', 'sel'], true]}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ 'line-color': dark ? '#111111' : '#ffffff', 'line-width': 7, 'line-opacity': 0.9 }}
        />
        <Layer
          id="fleet-trail"
          type="line"
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{
            'line-color': ['case', ['get', 'sel'], ORANGE, dark ? '#9ca3af' : '#6b7280'],
            'line-width': ['case', ['get', 'sel'], 4, 2],
            'line-opacity': ['case', ['get', 'sel'], 1, selected ? 0.2 : 0.45],
          }}
        />
      </Source>
      <Source id="fleet-plans" type="geojson" data={geo.plans}>
        <Layer
          id="fleet-plan"
          type="line"
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{
            'line-color': ['case', ['get', 'loaded'], LOADED, EMPTY],
            'line-width': ['case', ['get', 'run'], 5, ['get', 'sel'], 3.5, 2],
            'line-dasharray': [2, 1.5],
            'line-opacity': ['case', ['get', 'sel'], 0.95, 0.5],
          }}
        />
      </Source>
      {picked
        ? picked.stops.map((s) => {
            const inRun = run != null && s.order === run;
            return (
              <Marker key={`fleet-stop-${s.id}`} longitude={s.lon} latitude={s.lat} anchor="bottom" style={{ zIndex: inRun ? 2 : 1 }}>
                <div
                  className={`pointer-events-none flex flex-col items-center ${s.done ? 'opacity-55' : ''}`}
                  title={`${s.kind === 'pickup' ? 'Încărcare' : 'Descărcare'} ${s.order} · ${s.code}${s.day ? ` · ${s.day}` : ''}${s.done ? ' · făcut' : ''}`}
                >
                  <div
                    className={`flex items-center gap-1 whitespace-nowrap rounded-full border bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-900 shadow-md dark:bg-gray-900 dark:text-gray-100 ${
                      inRun ? 'border-orange-500 ring-2 ring-orange-500/40' : 'border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                      {s.kind === 'pickup' ? (
                        <path d="M5 1 L9.5 9 L0.5 9 Z" fill={LOADED} />
                      ) : (
                        <path d="M0.5 1 L9.5 1 L5 9 Z" fill={dark ? '#e5e7eb' : '#1f2937'} />
                      )}
                    </svg>
                    <span className="font-mono">{s.code}</span>
                    {s.day ? <span className="font-normal text-gray-500 dark:text-gray-400">{s.day}</span> : null}
                  </div>
                  <div className="h-2 w-px bg-gray-400" aria-hidden="true" />
                  <div className="h-2 w-2 rounded-full border-2 border-white bg-gray-700 shadow dark:border-gray-900" aria-hidden="true" />
                </div>
              </Marker>
            );
          })
        : null}
    </>
  );
}
