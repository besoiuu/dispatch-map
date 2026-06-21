'use client';

import { useState } from 'react';
import type { FeatureCollection } from 'geojson';
import { useRouteStore } from '@/store/routeStore';
import { useToastStore } from '@/store/toastStore';
import { RoutePanel } from './RoutePanel';
import { formatDistance, formatDuration } from '@/lib/routing';

interface RouteManagerProps {
  detailData: FeatureCollection | null;
}

export function RouteManager({ detailData }: RouteManagerProps) {
  const routes = useRouteStore((s) => s.routes);
  const activeRouteId = useRouteStore((s) => s.activeRouteId);
  const addRoute = useRouteStore((s) => s.addRoute);
  const addPlzToActiveRoute = useRouteStore((s) => s.addPlzToActiveRoute);
  const setActiveRoute = useRouteStore((s) => s.setActiveRoute);
  const addToast = useToastStore((s) => s.addToast);
  const [newRouteName, setNewRouteName] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');

  const handleAddRoute = () => {
    const name = newRouteName.trim() || `Route ${routes.length + 1}`;
    addRoute(name);
    setNewRouteName('');
  };

  const handleImport = () => {
    if (!activeRouteId) {
      addToast('Create or select a route first', 'error');
      return;
    }
    const codes = importText
      .split(/[\n,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (codes.length === 0) {
      addToast('No valid codes found', 'error');
      return;
    }
    let added = 0;
    for (const code of codes) {
      const before = useRouteStore.getState().routes.find((r) => r.id === activeRouteId)?.plzCodes.length ?? 0;
      addPlzToActiveRoute(code);
      const after = useRouteStore.getState().routes.find((r) => r.id === activeRouteId)?.plzCodes.length ?? 0;
      if (after > before) added++;
    }
    addToast(`Imported ${added} of ${codes.length} postal codes`, added > 0 ? 'success' : 'info');
    setImportText('');
    setImportOpen(false);
  };

  const totalStops = routes.reduce((sum, r) => sum + r.plzCodes.length + r.stops.filter(s => s.type === 'waypoint').length, 0);
  const totalDistance = routes.reduce((sum, r) => sum + (r.geometry?.distance ?? 0), 0);
  const totalDuration = routes.reduce((sum, r) => sum + (r.geometry?.duration ?? 0), 0);

  return (
    <div className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Routes</h3>
        {activeRouteId && (
          <button
            onClick={() => setImportOpen(!importOpen)}
            className={`cursor-pointer rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              importOpen
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                : 'text-gray-400 hover:bg-gray-100 dark:text-gray-500 dark:hover:bg-gray-800'
            }`}
            title="Import postal codes"
          >
            Import
          </button>
        )}
      </div>

      {importOpen && (
        <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50/50 p-2.5 dark:border-blue-800 dark:bg-blue-950/30">
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={"Paste postal codes separated by commas, spaces, or newlines:\n\nde:10115, de:20095, de:80331\nor\n10115\n20095\n80331"}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500 resize-none transition-colors"
            rows={4}
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              {importText.split(/[\n,;\s]+/).filter(Boolean).length} codes detected
            </span>
            <div className="flex gap-1.5">
              <button
                onClick={() => { setImportOpen(false); setImportText(''); }}
                className="cursor-pointer rounded-md px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                className="cursor-pointer rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 active:bg-blue-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-2 flex items-center gap-2">
        <input
          type="text"
          value={newRouteName}
          onChange={(e) => setNewRouteName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddRoute()}
          placeholder="New route name..."
          className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500 transition-colors"
        />
        <button
          onClick={handleAddRoute}
          className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-gray-900"
        >
          Add
        </button>
      </div>

      {/* Stats bar */}
      {routes.length > 1 && totalStops > 0 && (
        <div className="mb-2 flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2 text-xs dark:bg-gray-800/50">
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {routes.length} routes
          </span>
          <span className="text-gray-400">&#8226;</span>
          <span className="text-gray-500 dark:text-gray-400">{totalStops} stops</span>
          {totalDistance > 0 && (
            <>
              <span className="text-gray-400">&#8226;</span>
              <span className="font-medium text-blue-600 dark:text-blue-400">{formatDistance(totalDistance)}</span>
              <span className="text-gray-500 dark:text-gray-400">{formatDuration(totalDuration)}</span>
            </>
          )}
        </div>
      )}

      {routes.length === 0 && (
        <div className="text-center py-6 px-4">
          <svg className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Create a route to start selecting postal codes.
          </p>
        </div>
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
