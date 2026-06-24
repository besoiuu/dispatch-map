'use client';

import { useMapStore } from '@/store/mapStore';
import { useRouteStore } from '@/store/routeStore';

export function MapTooltip() {
  const hoveredFeatureId = useMapStore((s) => s.hoveredFeatureId);
  const hoveredFeatureName = useMapStore((s) => s.hoveredFeatureName);
  const hoveredCountry = useMapStore((s) => s.hoveredCountry);
  const routes = useRouteStore((s) => s.routes);

  if (!hoveredFeatureId) return null;

  const route = routes.find((r) => r.plzCodes.includes(hoveredFeatureId));

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
          <span className="text-blue-500 font-medium">{route.name}</span>
        )}
      </div>
    </div>
  );
}
