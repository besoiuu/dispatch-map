'use client';

import { Marker } from 'react-map-gl/maplibre';
import { STALE_MS } from '@/lib/fleetBridge';
import { focusTruck, useFleetStore } from '@/store/fleetStore';

/**
 * One tag per truck from the TMS: its plate, a dot that is green while it
 * drives, faded when the position is old. Square-cornered, unlike the round
 * route pins, so a truck never reads as a stop.
 */
export function FleetMarkers() {
  const trucks = useFleetStore((s) => s.trucks);
  const selected = useFleetStore((s) => s.selected);
  const at = useFleetStore((s) => s.at);
  if (!trucks.length) return null;
  // Old against when the TMS sent the fleet: it refreshes every two minutes.
  const now = Date.parse(at ?? '') || 0;

  return (
    <>
      {trucks.map((t) => {
        const stale = now > 0 && now - Date.parse(t.at) > STALE_MS;
        const on = t.key === selected;
        return (
          <Marker key={`truck-${t.key}`} longitude={t.lon} latitude={t.lat} anchor="bottom" style={{ zIndex: on ? 3 : 2 }} onClick={() => focusTruck(t.key)}>
            {/* The padding is the touch target, as on the route pins. */}
            <div
              role="button"
              tabIndex={0}
              aria-label={`${t.plate}${t.driver ? `, ${t.driver}` : ''}${t.place ? `, ${t.place}` : ''}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  focusTruck(t.key);
                }
              }}
              className={`flex cursor-pointer flex-col items-center p-2 ${stale ? 'opacity-60' : ''}`}
            >
              <div
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-md border-2 px-2 py-1 font-mono text-[11px] font-bold shadow-lg transition-transform duration-150 hover:scale-105 ${
                  on
                    ? 'border-white bg-orange-500 text-white'
                    : 'border-white bg-gray-900 text-white dark:border-gray-200 dark:bg-gray-800'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 rounded-full ${t.moving && !stale ? 'bg-green-400' : 'bg-gray-400'}`}
                />
                {t.plate}
              </div>
              <svg width="12" height="7" viewBox="0 0 12 7" className="-mt-px" aria-hidden="true">
                <path d="M0 0 L6 6 L12 0" className={on ? 'fill-orange-500' : 'fill-gray-900 dark:fill-gray-800'} />
              </svg>
            </div>
          </Marker>
        );
      })}
    </>
  );
}
