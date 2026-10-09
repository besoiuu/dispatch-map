'use client';

import { useMapStore } from '@/store/mapStore';
import { useRouteStore } from '@/store/routeStore';
import { entryKey } from '@/lib/plzIndex';

export function MapTooltip() {
  const hoveredFeatureId = useMapStore((s) => s.hoveredFeatureId);
  const hoveredFeatureName = useMapStore((s) => s.hoveredFeatureName);
  const hoveredCountry = useMapStore((s) => s.hoveredCountry);
  const routes = useRouteStore((s) => s.routes);

  if (!hoveredFeatureId) return null;

  // `plzCodes` holds "de:27576"; the hovered id is the bare code. Comparing
  // them never matched, so the tooltip never named the route an area belongs
  // to - the feature looked implemented and did nothing. The country is
  // already here, so the pair can be rebuilt properly.
  const key = hoveredCountry ? entryKey(hoveredCountry, hoveredFeatureId) : null;
  const route = key ? routes.find((r) => r.plzCodes.includes(key)) : undefined;

  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-xl bg-white/95 px-3.5 py-2 text-sm shadow-lg backdrop-blur-md dark:bg-gray-900/95 dark:text-gray-100 ring-1 ring-black/5 dark:ring-white/10">
      <div className="flex items-center gap-2">
        {hoveredCountry && (
          <span className="text-[10px] font-bold text-gray-400 uppercase bg-gray-100 dark:bg-gray-800 rounded px-1 py-0.5">{hoveredCountry}</span>
        )}
        <span className="font-bold tabular-nums">{hoveredFeatureId}</span>
        {hoveredFeatureName && (
          <span className="text-gray-500 dark:text-gray-400">{hoveredFeatureName}</span>
        )}
        {route && (
          <span className="flex items-center gap-1 font-medium" style={{ color: route.color }}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: route.color }} />
            {route.name}
          </span>
        )}
      </div>
    </div>
  );
}
