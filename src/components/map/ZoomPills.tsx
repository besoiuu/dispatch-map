'use client';

import { useMapStore } from '@/store/mapStore';
import { countries } from '@/config/countries';

const LEVELS = [
  { label: 'Country', zoom: 6 },
  { label: 'Region', zoom: 8 },
  { label: 'City', zoom: 11 },
  { label: 'Street', zoom: 14 },
] as const;

function getActiveLevel(zoom: number): number {
  if (zoom < 7) return 0;
  if (zoom < 9.5) return 1;
  if (zoom < 12.5) return 2;
  return 3;
}

export function ZoomPills() {
  const zoom = useMapStore((s) => s.zoom);
  const activeCountry = useMapStore((s) => s.activeCountry);
  const active = getActiveLevel(zoom);
  const config = countries[activeCountry];

  const handleClick = (targetZoom: number) => {
    window.dispatchEvent(
      new CustomEvent('map:setzoom', { detail: { zoom: targetZoom, center: config.center } })
    );
  };

  return (
    <div className="absolute top-2 left-1/2 z-10 -translate-x-1/2" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="flex rounded-xl bg-white/95 p-0.5 shadow-md ring-1 ring-black/5 backdrop-blur-md dark:bg-gray-900/95 dark:ring-white/10">
        {LEVELS.map((level, i) => (
          <button
            key={level.label}
            onClick={() => handleClick(level.zoom)}
            className={`relative cursor-pointer rounded-[10px] px-3.5 py-1.5 text-[11px] font-semibold tracking-wide transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              i === active
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {level.label}
          </button>
        ))}
      </div>
    </div>
  );
}
