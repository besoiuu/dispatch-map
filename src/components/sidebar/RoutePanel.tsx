'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Route, RouteStop } from '@/types/route';
import type { FeatureCollection } from 'geojson';
import { useRouteStore } from '@/store/routeStore';
import { useToastStore } from '@/store/toastStore';
import { routeToCSV, downloadCSV, copyRouteAsText, printRoute } from '@/lib/export';
import { calculateRoute, calculateTrip, formatDistance, formatDuration, buildGoogleMapsUrl } from '@/lib/routing';

function parsePlz(prefixedPlz: string): { country: string; code: string } {
  if (prefixedPlz.includes(':')) {
    const [cc, code] = prefixedPlz.split(':', 2);
    return { country: cc.toUpperCase(), code };
  }
  return { country: '', code: prefixedPlz };
}

interface RoutePanelProps {
  route: Route;
  isActive: boolean;
  onActivate: () => void;
  detailData: FeatureCollection | null;
}

function findPlzFeature(
  prefixedPlz: string,
  data: FeatureCollection | null
): { coord: [number, number]; name: string } | null {
  if (!data) return null;
  const { country, code } = parsePlz(prefixedPlz);
  const cc = country.toLowerCase();
  const feature = data.features.find((f) => {
    if (f.properties?.plz5 !== code) return false;
    if (cc && f.properties?._country && f.properties._country !== cc) return false;
    return true;
  });
  if (!feature || !('coordinates' in feature.geometry)) return null;
  let sumLng = 0, sumLat = 0, count = 0;
  const walk = (coords: unknown[]) => {
    if (typeof coords[0] === 'number') {
      sumLng += coords[0] as number;
      sumLat += coords[1] as number;
      count++;
    } else {
      for (const c of coords) walk(c as unknown[]);
    }
  };
  walk(feature.geometry.coordinates as unknown[]);
  if (count === 0) return null;
  return {
    coord: [sumLng / count, sumLat / count],
    name: String(feature.properties?.name ?? ''),
  };
}

function buildStopsFromPlz(
  plzCodes: string[],
  existingStops: RouteStop[],
  data: FeatureCollection | null
): RouteStop[] {
  const existingPlzSet = new Set(existingStops.filter(s => s.plz).map(s => s.plz!));
  const allResolved = plzCodes.every((plz) => existingPlzSet.has(plz));
  if (allResolved && existingStops.length > 0) return existingStops;

  const stops: RouteStop[] = [];
  const existingMap = new Map(existingStops.map((s) => [s.plz ?? s.id, s]));

  for (const plz of plzCodes) {
    const existing = existingMap.get(plz);
    if (existing) {
      stops.push(existing);
    } else {
      const result = findPlzFeature(plz, data);
      if (result) {
        const { code } = parsePlz(plz);
        stops.push({
          id: crypto.randomUUID(),
          type: 'plz',
          plz,
          label: result.name ? `${code} ${result.name}` : code,
          coordinate: result.coord,
        });
      }
    }
  }

  for (const stop of existingStops) {
    if (stop.type === 'waypoint' && !stops.find((s) => s.id === stop.id)) {
      stops.push(stop);
    }
  }

  return stops;
}

export function RoutePanel({ route, isActive, onActivate, detailData }: RoutePanelProps) {
  const deleteRoute = useRouteStore((s) => s.deleteRoute);
  const restoreRoute = useRouteStore((s) => s.restoreRoute);
  const restoreRouteStops = useRouteStore((s) => s.restoreRouteStops);
  const renameRoute = useRouteStore((s) => s.renameRoute);
  const toggleRouteVisibility = useRouteStore((s) => s.toggleRouteVisibility);
  const clearRoute = useRouteStore((s) => s.clearRoute);
  const removeStop = useRouteStore((s) => s.removeStop);
  const reorderStop = useRouteStore((s) => s.reorderStop);
  const setStops = useRouteStore((s) => s.setStops);
  const setRouteGeometry = useRouteStore((s) => s.setRouteGeometry);
  const setRouteCalculating = useRouteStore((s) => s.setRouteCalculating);
  const addToast = useToastStore((s) => s.addToast);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(route.name);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const handleRename = () => {
    if (editName.trim()) renameRoute(route.id, editName.trim());
    setEditing(false);
  };

  const handleCopy = async () => {
    await copyRouteAsText(route);
    addToast('Route copied to clipboard');
  };

  const handleExportCSV = () => {
    const csv = routeToCSV(route);
    downloadCSV(csv, `${route.name.replace(/\s+/g, '_')}.csv`);
    addToast('CSV file downloaded');
  };

  const stops = buildStopsFromPlz(route.plzCodes, route.stops, detailData);

  const stopsNeedSync = isActive && stops.length !== route.stops.length;
  useEffect(() => {
    if (stopsNeedSync) setStops(route.id, stops);
  }, [stopsNeedSync, route.id, stops, setStops]);

  const stopsKey = stops.map((s) => `${s.id}:${s.coordinate}`).join('|');

  const doCalculate = useCallback(async () => {
    if (stops.length < 2) return;
    const coords = stops.map((s) => s.coordinate);
    setRouteCalculating(route.id, true);
    try {
      const geometry = await calculateRoute(coords);
      setRouteGeometry(route.id, geometry ?? undefined);
    } catch {
      setRouteGeometry(route.id, undefined);
    }
    setRouteCalculating(route.id, false);
  }, [route.id, stops, setRouteGeometry, setRouteCalculating]);

  const doOptimize = useCallback(async () => {
    if (stops.length < 3) return;
    const coords = stops.map((s) => s.coordinate);
    setRouteCalculating(route.id, true);
    try {
      const result = await calculateTrip(coords);
      if (result) {
        const { geometry, waypointOrder } = result;
        const reordered = waypointOrder.map((i: number) => stops[i]);
        const plzCodes = reordered.filter((s) => s.plz).map((s) => s.plz!);
        setStops(route.id, reordered);
        useRouteStore.getState().restoreRouteStops(route.id, plzCodes, reordered);
        setRouteGeometry(route.id, geometry);
        addToast(`Route optimized — saved ${formatDistance((route.geometry?.distance ?? geometry.distance) - geometry.distance)}`);
      }
    } catch {
      addToast('Optimization failed', 'error');
    }
    setRouteCalculating(route.id, false);
  }, [route.id, route.geometry?.distance, stops, setStops, setRouteGeometry, setRouteCalculating, addToast]);

  // Auto-calculate when stops change
  useEffect(() => {
    if (stops.length < 2) return;
    if (!isActive) return;
    const timer = setTimeout(doCalculate, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopsKey, isActive]);

  const handlePointerDown = (index: number, e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    setDragIdx(index);
    setDropIdx(index);

    const listEl = listRef.current;
    if (!listEl) return;
    const items = Array.from(listEl.querySelectorAll<HTMLElement>('[data-stop-idx]'));

    const onMove = (me: PointerEvent) => {
      const y = me.clientY;
      let closest = index;
      let minDist = Infinity;
      items.forEach((el, i) => {
        const rect = el.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        const dist = Math.abs(y - mid);
        if (dist < minDist) { minDist = dist; closest = i; }
      });
      setDropIdx(closest);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setDragIdx((prev) => {
        setDropIdx((drop) => {
          if (prev !== null && drop !== null && prev !== drop) {
            reorderStop(route.id, prev, drop);
          }
          return null;
        });
        return null;
      });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const stopLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  return (
    <div
      className={`rounded-lg border transition-colors ${
        isActive
          ? 'border-blue-400 bg-blue-50 dark:border-blue-600 dark:bg-blue-950/40'
          : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 p-3">
        <button
          onClick={onActivate}
          className="cursor-pointer h-4 w-4 rounded-full border-2 border-gray-300 shrink-0 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
          style={{ backgroundColor: route.color }}
        />
        {editing ? (
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            className="flex-1 rounded-lg border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 transition-colors"
            autoFocus
          />
        ) : (
          <>
            <button
              onClick={onActivate}
              onDoubleClick={() => { setEditName(route.name); setEditing(true); }}
              className="cursor-pointer flex-1 text-left text-sm font-medium text-gray-800 dark:text-gray-200 rounded px-1 -mx-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {route.name}
            </button>
            <span
              className="inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium text-white min-w-6"
              style={{ backgroundColor: stops.length > 0 ? route.color : '#9ca3af' }}
            >
              {stops.length}
            </span>
          </>
        )}
        <button onClick={() => toggleRouteVisibility(route.id)} className="cursor-pointer text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors rounded p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" title={route.visible ? 'Hide' : 'Show'}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {route.visible
              ? <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></>
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            }
          </svg>
        </button>
        <button onClick={() => {
          const routes = useRouteStore.getState().routes;
          const idx = routes.findIndex((r) => r.id === route.id);
          const snapshot = { ...route };
          deleteRoute(route.id);
          addToast(`"${route.name}" deleted`, 'info', { label: 'Undo', onClick: () => restoreRoute(snapshot, idx) });
        }} className="cursor-pointer text-gray-400 hover:text-red-500 transition-colors rounded p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" title="Delete">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Stop list */}
      {stops.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          <div ref={listRef} className="max-h-48 overflow-y-auto">
          {stops.map((stop, i) => (
            <div key={stop.id}>
              {dragIdx !== null && dropIdx === i && dropIdx < dragIdx && (
                <div className="h-0.5 mx-3 rounded-full" style={{ backgroundColor: route.color }} />
              )}
              <div
                data-stop-idx={i}
                onPointerDown={(e) => handlePointerDown(i, e)}
                className={`flex items-center gap-2 px-3 py-2 group cursor-grab active:cursor-grabbing select-none touch-none ${
                  dragIdx === i ? 'opacity-40' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }`}
              >
                <div
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white shrink-0"
                  style={{ backgroundColor: route.color }}
                >
                  {stopLetters[i] ?? (i + 1)}
                </div>

                <div className="flex-1 min-w-0 flex items-center gap-1.5">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                    {stop.label || parsePlz(stop.plz ?? '').code}
                  </span>
                  {stop.type === 'plz' && stop.plz && (
                    <span className="text-[10px] text-gray-400 uppercase bg-gray-100 dark:bg-gray-800 rounded px-1 shrink-0">{parsePlz(stop.plz).country}</span>
                  )}
                </div>

                {route.geometry?.legs?.[i] && i < stops.length - 1 && (
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
                    {formatDistance(route.geometry.legs[i].distance)}
                    <span className="mx-0.5">·</span>
                    {formatDuration(route.geometry.legs[i].duration)}
                  </span>
                )}

                <button
                  onClick={() => removeStop(route.id, stop.id)}
                  className="cursor-pointer text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:opacity-100"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {dragIdx !== null && dropIdx === i && dropIdx > dragIdx && (
                <div className="h-0.5 mx-3 rounded-full" style={{ backgroundColor: route.color }} />
              )}
              {dragIdx === null && i < stops.length - 1 && (
                <div className="ml-[1.65rem] border-l-2 h-1" style={{ borderColor: route.color + '30' }} />
              )}
            </div>
          ))}

          </div>
          {/* Summary bar */}
          <div className="flex flex-wrap items-center justify-between gap-1 border-t border-gray-200 px-3 py-2 dark:border-gray-700" style={{ backgroundColor: route.color + '10' }}>
            {route.calculating ? (
              <span className="text-xs text-gray-500 animate-pulse">Calculating route...</span>
            ) : route.geometry ? (
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold" style={{ color: route.color }}>
                  {formatDistance(route.geometry.distance)}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {formatDuration(route.geometry.duration)}
                </span>
              </div>
            ) : stops.length >= 2 ? (
              <span className="text-xs text-gray-400">Add stops to calculate route</span>
            ) : (
              <span className="text-xs text-gray-400">Add more stops</span>
            )}
            <div className="flex flex-wrap gap-2">
              {route.geometry && (
                <button onClick={doCalculate} className="cursor-pointer text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 transition-colors rounded px-1.5 py-0.5 hover:bg-blue-50 dark:hover:bg-blue-950/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Recalculate</button>
              )}
              {stops.length >= 3 && (
                <button onClick={doOptimize} className="cursor-pointer text-xs text-orange-600 hover:text-orange-800 dark:text-orange-400 transition-colors rounded px-1.5 py-0.5 hover:bg-orange-50 dark:hover:bg-orange-950/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Optimize</button>
              )}
              {stops.length >= 2 && (
                <a
                  href={buildGoogleMapsUrl(stops.map((s) => ({ coordinate: s.coordinate, label: s.label })))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cursor-pointer text-xs text-green-600 hover:text-green-800 dark:text-green-400 transition-colors rounded px-1.5 py-0.5 hover:bg-green-50 dark:hover:bg-green-950/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  Google Maps
                </a>
              )}
              <button
                onClick={() => {
                  const codes = stops.map(s => s.plz ?? `@${s.coordinate[1].toFixed(5)},${s.coordinate[0].toFixed(5)}`).join(',');
                  const url = `${window.location.origin}/#route=${encodeURIComponent(route.name)}:${codes}`;
                  navigator.clipboard.writeText(url);
                  addToast('Share link copied to clipboard');
                }}
                className="cursor-pointer text-xs text-purple-600 hover:text-purple-800 dark:text-purple-400 transition-colors rounded px-1.5 py-0.5 hover:bg-purple-50 dark:hover:bg-purple-950/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >Share Link</button>
              <button onClick={handleCopy} className="cursor-pointer text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 transition-colors rounded px-1.5 py-0.5 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Copy</button>
              <button onClick={handleExportCSV} className="cursor-pointer text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 transition-colors rounded px-1.5 py-0.5 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">CSV</button>
              <button onClick={() => printRoute(route, stops)} className="cursor-pointer text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 transition-colors rounded px-1.5 py-0.5 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">PDF</button>
              <button onClick={() => {
                const savedCodes = [...route.plzCodes];
                const savedStops = [...route.stops];
                clearRoute(route.id);
                addToast('Stops cleared', 'info', { label: 'Undo', onClick: () => restoreRouteStops(route.id, savedCodes, savedStops) });
              }} className="cursor-pointer text-xs text-red-500 hover:text-red-700 transition-colors rounded px-1.5 py-0.5 hover:bg-red-50 dark:hover:bg-red-950/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Clear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
