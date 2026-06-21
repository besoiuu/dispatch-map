'use client';

import { useState } from 'react';
import type { FeatureCollection } from 'geojson';
import { useRouteStore } from '@/store/routeStore';
import { RoutePanel } from './RoutePanel';

interface RouteManagerProps {
  detailData: FeatureCollection | null;
}

export function RouteManager({ detailData }: RouteManagerProps) {
  const routes = useRouteStore((s) => s.routes);
  const activeRouteId = useRouteStore((s) => s.activeRouteId);
  const addRoute = useRouteStore((s) => s.addRoute);
  const setActiveRoute = useRouteStore((s) => s.setActiveRoute);
  const [newRouteName, setNewRouteName] = useState('');

  const handleAddRoute = () => {
    const name = newRouteName.trim() || `Route ${routes.length + 1}`;
    addRoute(name);
    setNewRouteName('');
  };

  return (
    <div className="p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Routes</h3>
      <div className="mb-2 flex items-center gap-2">
        <input
          type="text"
          value={newRouteName}
          onChange={(e) => setNewRouteName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddRoute()}
          placeholder="New route name..."
          className="flex-1 rounded border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
        />
        <button
          onClick={handleAddRoute}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Add
        </button>
      </div>

      {routes.length === 0 && (
        <p className="text-center text-xs text-gray-400 py-4 dark:text-gray-500">
          Create a route to start selecting postal codes.
        </p>
      )}

      <div className="space-y-2">
        {routes.map((route) => (
          <RoutePanel
            key={route.id}
            route={route}
            isActive={route.id === activeRouteId}
            onActivate={() => setActiveRoute(route.id)}
            detailData={detailData}
          />
        ))}
      </div>
    </div>
  );
}
