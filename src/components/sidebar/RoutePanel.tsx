'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Route, RouteStop } from '@/types/route';
import type { FeatureCollection } from 'geojson';
import { useRouteStore } from '@/store/routeStore';
import { routeToCSV, downloadCSV, copyRouteAsText } from '@/lib/export';
import { calculateRoute, formatDistance, formatDuration, buildGoogleMapsUrl } from '@/lib/routing';

function guessCountry(coord: [number, number]): string {
  const [lng, lat] = coord;
  if (lat > 54.5 && lng > 8 && lng < 15.5) return 'DK';
  if (lat > 51 && lat < 54 && lng > 3.3 && lng < 7.2) return 'NL';
  if (lat > 49.5 && lat < 51.5 && lng > 2.5 && lng < 6.4) return 'BE';
  if (lat > 42 && lat < 51.1 && lng > -5 && lng < 8.2) return 'FR';
  if (lat > 46.3 && lat < 49 && lng > 9.5 && lng < 17.2) return 'AT';
  if (lat > 48.5 && lat < 51.1 && lng > 12 && lng < 19) return 'CZ';
  if (lat > 47 && lat < 55.1 && lng > 5.8 && lng < 15.1) return 'DE';
  if (lat > 49 && lat < 55 && lng > 14 && lng < 24.2) return 'PL';
  if (lat > 45.7 && lat < 48.6 && lng > 16 && lng < 22.9) return 'HU';
  if (lat > 43.6 && lat < 48.3 && lng > 20.2 && lng < 29.7) return 'RO';
  if (lat > 36 && lat < 47.1 && lng > 6.6 && lng < 18.5) return 'IT';
  return '';
}

interface RoutePanelProps {
  route: Route;
  isActive: boolean;
  onActivate: () => void;
  detailData: FeatureCollection | null;
}

function getPlzCentroid(
  plz: string,
  data: FeatureCollection | null
): [number, number] | null {
  if (!data) return null;
  const feature = data.features.find((f) => f.properties?.plz5 === plz);
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
  return [sumLng / count, sumLat / count];
}

function buildStopsFromPlz(
  plzCodes: string[],
  existingStops: RouteStop[],
  data: FeatureCollection | null
): RouteStop[] {
  const stops: RouteStop[] = [];
  const existingMap = new Map(existingStops.map((s) => [s.plz ?? s.id, s]));

  for (const plz of plzCodes) {
    const existing = existingMap.get(plz);
    if (existing) {
      stops.push(existing);
    } else {
      const coord = getPlzCentroid(plz, data);
      if (coord) {
        stops.push({
          id: crypto.randomUUID(),
          type: 'plz',
          plz,
          label: plz,
          coordinate: coord,
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
  const renameRoute = useRouteStore((s) => s.renameRoute);
  const toggleRouteVisibility = useRouteStore((s) => s.toggleRouteVisibility);
  const clearRoute = useRouteStore((s) => s.clearRoute);
  const removeStop = useRouteStore((s) => s.removeStop);
  const reorderStop = useRouteStore((s) => s.reorderStop);
  const setStops = useRouteStore((s) => s.setStops);
  const setRouteGeometry = useRouteStore((s) => s.setRouteGeometry);
  const setRouteCalculating = useRouteStore((s) => s.setRouteCalculating);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(route.name);
  const [copied, setCopied] = useState(false);
  const dragItem = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);

  const handleRename = () => {
    if (editName.trim()) renameRoute(route.id, editName.trim());
    setEditing(false);
  };

  const handleCopy = async () => {
    await copyRouteAsText(route);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleExportCSV = () => {
    const csv = routeToCSV(route);
    downloadCSV(csv, `${route.name.replace(/\s+/g, '_')}.csv`);
  };

  const stops = buildStopsFromPlz(route.plzCodes, route.stops, detailData);
  if (isActive && stops.length !== route.stops.length) {
    setTimeout(() => setStops(route.id, stops), 0);
  }

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

  // Auto-calculate when stops change
  useEffect(() => {
    if (stops.length < 2) return;
    if (!isActive) return;
    const timer = setTimeout(doCalculate, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopsKey, isActive]);

  const handleDragStart = (index: number) => {
    dragItem.current = index;
  };

  const handleDragEnter = (index: number) => {
    dragOver.current = index;
  };

  const handleDragEnd = () => {
    if (dragItem.current !== null && dragOver.current !== null && dragItem.current !== dragOver.current) {
      reorderStop(route.id, dragItem.current, dragOver.current);
    }
    dragItem.current = null;
    dragOver.current = null;
  };

  const moveStop = (index: number, dir: -1 | 1) => {
    const to = index + dir;
    if (to < 0 || to >= stops.length) return;
    reorderStop(route.id, index, to);
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
          className="h-4 w-4 rounded-full border-2 border-gray-300 flex-shrink-0"
          style={{ backgroundColor: route.color }}
        />
        {editing ? (
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            className="flex-1 rounded border border-gray-300 px-1.5 py-0.5 text-sm focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
            autoFocus
          />
        ) : (
          <>
            <button
              onClick={onActivate}
              onDoubleClick={() => { setEditName(route.name); setEditing(true); }}
              className="flex-1 text-left text-sm font-medium text-gray-800 dark:text-gray-200"
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
        <button onClick={() => toggleRouteVisibility(route.id)} className="text-gray-400 hover:text-gray-600" title={route.visible ? 'Hide' : 'Show'}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {route.visible
              ? <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></>
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            }
          </svg>
        </button>
        <button onClick={() => deleteRoute(route.id)} className="text-gray-400 hover:text-red-500" title="Delete">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Stop list */}
      {stops.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          <div className="max-h-48 overflow-y-auto">
          {stops.map((stop, i) => (
            <div key={stop.id}>
              <div
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragEnter={() => handleDragEnter(i)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => e.preventDefault()}
                className="flex items-center gap-2 px-3 py-2 group cursor-grab active:cursor-grabbing hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                <div
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white shrink-0"
                  style={{ backgroundColor: route.color }}
                >
                  {stopLetters[i] ?? (i + 1)}
                </div>

                <div className="flex-1 min-w-0 flex items-center gap-1.5">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                    {stop.plz ?? stop.label}
                  </span>
                  {stop.type === 'plz' && (
                    <span className="text-[10px] text-gray-400 uppercase bg-gray-100 dark:bg-gray-800 rounded px-1">{guessCountry(stop.coordinate)}</span>
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
                  className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {i < stops.length - 1 && (
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
                <button onClick={doCalculate} className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400">Recalculate</button>
              )}
              {stops.length >= 2 && (
                <a
                  href={buildGoogleMapsUrl(stops.map((s) => s.coordinate))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-green-600 hover:text-green-800 dark:text-green-400"
                >
                  Google Maps
                </a>
              )}
              <button
                onClick={() => {
                  const codes = stops.map(s => s.plz ?? s.label).join(',');
                  const url = `${window.location.origin}/#route=${encodeURIComponent(route.name)}:${codes}`;
                  navigator.clipboard.writeText(url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="text-xs text-purple-600 hover:text-purple-800 dark:text-purple-400"
              >Share Link</button>
              <button onClick={handleCopy} className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400">{copied ? 'Copied!' : 'Copy'}</button>
              <button onClick={handleExportCSV} className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400">CSV</button>
              <button onClick={() => clearRoute(route.id)} className="text-xs text-red-500 hover:text-red-700">Clear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
