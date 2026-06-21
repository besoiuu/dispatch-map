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
      <div className="flex rounded-full bg-white/90 p-1 shadow-lg backdrop-blur-sm dark:bg-gray-800/90">
        {LEVELS.map((level, i) => (
          <button
            key={level.label}
            onClick={() => handleClick(level.zoom)}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
              i === active
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {level.label}
          </button>
        ))}
      </div>
    </div>
  );
}
