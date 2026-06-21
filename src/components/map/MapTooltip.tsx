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
    <div className="pointer-events-none absolute bottom-8 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-white px-3 py-2 text-sm shadow-lg dark:bg-gray-800 dark:text-gray-100">
      {hoveredCountry && (
        <span className="mr-1.5 text-[10px] font-bold text-gray-400 uppercase bg-gray-100 dark:bg-gray-700 rounded px-1 py-0.5">{hoveredCountry}</span>
      )}
      <span className="font-semibold">{hoveredFeatureId}</span>
      {hoveredFeatureName && (
        <span className="ml-2 text-gray-600 dark:text-gray-400">{hoveredFeatureName}</span>
      )}
      {route && (
        <span className="ml-2 text-blue-500">{route.name}</span>
      )}
    </div>
  );
}
