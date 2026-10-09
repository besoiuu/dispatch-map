'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { Route, RouteStop } from '@/types/route';
import { useRouteStore } from '@/store/routeStore';
import { useToastStore } from '@/store/toastStore';
import { useSearchIndex } from '@/hooks/useSearchIndex';
import { lookupPrefixed } from '@/lib/plzIndex';
import { textOn } from '@/lib/colors';
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
}

/**
 * Repairs a route whose `plzCodes` have no matching stop.
 *
 * New additions arrive with their stop already built (the store resolves the
 * position when the code is added), so this now only covers routes persisted
 * by older builds and anything imported before the index had loaded. It reads
 * `lib/plzIndex` rather than the detail GeoJSON, which is why a code no
 * longer silently fails to appear while 55 MB of polygons is still being
 * fetched - or never fetched, since that only happened past zoom 7.
 */
function buildStopsFromPlz(plzCodes: string[], existingStops: RouteStop[]): RouteStop[] {
  const existingPlz = new Set(existingStops.filter((s) => s.plz).map((s) => s.plz!));
  if (plzCodes.every((plz) => existingPlz.has(plz))) return existingStops;

  const byPlz = new Map(existingStops.filter((s) => s.plz).map((s) => [s.plz!, s]));
  const stops: RouteStop[] = [];

  for (const plz of plzCodes) {
    const existing = byPlz.get(plz);
    if (existing) {
      stops.push(existing);
      continue;
    }
    const entry = lookupPrefixed(plz);
    if (!entry) continue;
    const { code } = parsePlz(plz);
    stops.push({
      id: crypto.randomUUID(),
      type: 'plz',
      plz,
      label: entry.name ? `${code} ${entry.name}` : code,
      coordinate: [entry.lng, entry.lat],
    });
  }

  // Waypoints carry no postal code, so they are not in `plzCodes` and have to
  // be carried over explicitly or a repair pass would drop them.
  for (const stop of existingStops) {
    if (stop.type === 'waypoint') stops.push(stop);
  }

  return stops;
}

function stopsSignature(stops: RouteStop[]): string {
  return stops.map((s) => `${s.id}@${s.coordinate[0]},${s.coordinate[1]}`).join('|');
}

export function RoutePanel({ route, isActive, onActivate }: RoutePanelProps) {
  const deleteRoute = useRouteStore((s) => s.deleteRoute);
  const restoreRoute = useRouteStore((s) => s.restoreRoute);
  const restoreRouteStops = useRouteStore((s) => s.restoreRouteStops);
  const restoreStop = useRouteStore((s) => s.restoreStop);
  const renameRoute = useRouteStore((s) => s.renameRoute);
  const toggleRouteVisibility = useRouteStore((s) => s.toggleRouteVisibility);
  const clearRoute = useRouteStore((s) => s.clearRoute);
  const removeStop = useRouteStore((s) => s.removeStop);
  const reorderStop = useRouteStore((s) => s.reorderStop);
  const setStops = useRouteStore((s) => s.setStops);
  const setRouteGeometry = useRouteStore((s) => s.setRouteGeometry);
  const setRouteCalculating = useRouteStore((s) => s.setRouteCalculating);
  const addToast = useToastStore((s) => s.addToast);
  // Only to re-run the repair pass once the index is in memory.
  const { ready: indexReady } = useSearchIndex();
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
    await copyRouteAsText(route, stops);
    addToast('Route copied to clipboard');
  };

  const stops = useMemo(
    () => buildStopsFromPlz(route.plzCodes, route.stops),
    // `indexReady` is a cache key, not an input: before the index lands an
    // unresolvable code produces no stop, so the pass has to run again once
    // it can succeed. The linter cannot see that `buildStopsFromPlz` reads
    // module state that this flag tracks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [route.plzCodes, route.stops, indexReady]
  );

  const handleExportCSV = () => {
    const csv = routeToCSV(route, stops);
    downloadCSV(csv, `${route.name.replace(/\s+/g, '_')}.csv`);
    addToast('CSV file downloaded');
  };

  // Compared by content, not by count. A length check missed a repair that
  // replaced a stop rather than adding one - for instance a code whose
  // position only became resolvable after the index loaded.
  const builtSignature = stopsSignature(stops);
  const storedSignature = stopsSignature(route.stops);
  useEffect(() => {
    if (builtSignature !== storedSignature) setStops(route.id, stops);
  }, [builtSignature, storedSignature, route.id, stops, setStops]);

  const doCalculate = useCallback(async () => {
    if (stops.length < 2) return;
    const coords = stops.map((s) => s.coordinate);
    setRouteCalculating(route.id, true);
    try {
      const geometry = await calculateRoute(coords);
      setRouteGeometry(route.id, geometry ?? undefined);
      if (!geometry) addToast('Routing service did not answer - distances unavailable', 'error');
    } catch {
      setRouteGeometry(route.id, undefined);
      addToast('Routing service did not answer - distances unavailable', 'error');
    }
    setRouteCalculating(route.id, false);
  }, [route.id, stops, setRouteGeometry, setRouteCalculating, addToast]);

  const doOptimize = useCallback(async () => {
    if (stops.length < 3) return;
    const coords = stops.map((s) => s.coordinate);
    const prevDistance = route.geometry?.distance ?? 0;
    setRouteCalculating(route.id, true);
    try {
      const result = await calculateTrip(coords);
      if (result) {
        const { geometry, waypointOrder } = result;
        const reordered = waypointOrder.map((i: number) => stops[i]);
        const plzCodes = reordered.filter((s) => s.plz).map((s) => s.plz!);
        restoreRouteStops(route.id, plzCodes, reordered, geometry);
        const saved = prevDistance - geometry.distance;
        addToast(saved > 0 ? `Optimized - saved ${formatDistance(saved)}` : 'Route optimized');
      } else {
        addToast('Could not optimize this route', 'info');
      }
    } catch {
      addToast('Optimization failed', 'error');
    }
    setRouteCalculating(route.id, false);
  }, [route.id, route.geometry?.distance, stops, restoreRouteStops, setRouteCalculating, addToast]);

  // Auto-calculate when the stops or their positions change.
  useEffect(() => {
    if (stops.length < 2) return;
    if (!isActive) return;
    const timer = setTimeout(doCalculate, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builtSignature, isActive]);

  /**
   * Drag-to-reorder, from a dedicated handle.
   *
   * Three things were wrong before. The whole row started a drag, so on a
   * phone every attempt to scroll the list began one; nothing set
   * `touch-action`, so the browser took the gesture and scrolled anyway; and
   * only `pointerup` was listened for, while a gesture the browser claims
   * ends in `pointercancel` - leaving the window listeners attached and
   * `dragIdx` stuck on, which is what made the list feel broken after a
   * single failed drag. The handle below owns the gesture via
   * `setPointerCapture`, so the row itself still scrolls normally.
   */
  const handleDragStart = (index: number, e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const handle = e.currentTarget as HTMLElement;
    const startY = e.clientY;
    const pointerId = e.pointerId;
    let started = false;

    const listEl = listRef.current;
    if (!listEl) return;
    const items = Array.from(listEl.querySelectorAll<HTMLElement>('[data-stop-idx]'));

    try {
      handle.setPointerCapture(pointerId);
    } catch {
      /* capture is an optimisation; the window listeners still work */
    }

    // The gesture's own indices live here, not in refs written during render:
    // one drag is one closure, so there is nothing to share.
    let fromIdx = index;
    let toIdx = index;

    const cleanup = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onCancel);
      try {
        handle.releasePointerCapture(pointerId);
      } catch {
        /* already released */
      }
    };

    const onMove = (me: PointerEvent) => {
      if (me.pointerId !== pointerId) return;
      if (!started) {
        if (Math.abs(me.clientY - startY) <= 8) return;
        started = true;
        fromIdx = index;
        toIdx = index;
        setDragIdx(index);
        setDropIdx(index);
      }
      me.preventDefault();
      let closest = index;
      let minDist = Infinity;
      items.forEach((el, i) => {
        const rect = el.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        const dist = Math.abs(me.clientY - mid);
        if (dist < minDist) {
          minDist = dist;
          closest = i;
        }
      });
      toIdx = closest;
      setDropIdx(closest);
    };

    const commit = () => {
      if (fromIdx !== toIdx) reorderStop(route.id, fromIdx, toIdx);
      setDragIdx(null);
      setDropIdx(null);
    };

    const onUp = (ue: PointerEvent) => {
      if (ue.pointerId !== pointerId) return;
      cleanup();
      if (started) commit();
    };

    // A cancelled gesture must tear down exactly like a finished one, or the
    // row stays greyed out and the listeners leak.
    const onCancel = (ce: PointerEvent) => {
      if (ce.pointerId !== pointerId) return;
      cleanup();
      setDragIdx(null);
      setDropIdx(null);
    };

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onCancel);
  };

  const flyToStop = (stop: RouteStop) => {
    window.dispatchEvent(
      new CustomEvent('map:flyto', { detail: { center: stop.coordinate, zoom: 12 } })
    );
  };

  const handleRemoveStop = (stop: RouteStop, index: number) => {
    removeStop(route.id, stop.id);
    addToast(`${stop.label} removed`, 'info', {
      label: 'Undo',
      onClick: () => restoreStop(route.id, stop, index),
    });
  };

  const getStopLabel = (stop: RouteStop, index: number) => {
    let plzIdx = 0;
    let wpIdx = 0;
    for (let j = 0; j <= index; j++) {
      if (stops[j].type === 'waypoint') wpIdx++;
      else plzIdx++;
    }
    if (stop.type === 'waypoint') return { text: String(wpIdx), isWaypoint: true };
    return { text: String.fromCharCode(64 + plzIdx), isWaypoint: false };
  };

  return (
    <div
      className={`rounded-xl border-l-[3px] transition-all ${
        isActive
          ? 'bg-blue-50/50 dark:bg-blue-950/20 shadow-sm'
          : 'bg-white hover:bg-gray-50/50 dark:bg-gray-900 dark:hover:bg-gray-800/30'
      } border border-gray-200/60 dark:border-gray-800`}
      style={{ borderLeftColor: isActive ? route.color : 'transparent' }}
    >
      {/* Header */}
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button
          onClick={onActivate}
          aria-label={`Make ${route.name} the active route`}
          aria-pressed={isActive}
          className="cursor-pointer flex h-11 w-9 shrink-0 items-center justify-center rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <span
            className="h-4 w-4 rounded-full border-2 border-gray-300 transition-transform"
            style={{ backgroundColor: route.color }}
          />
        </button>
        {editing ? (
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            aria-label="Route name"
            className="flex-1 rounded-lg border border-gray-300 px-2 py-1 text-base md:text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 transition-colors"
            autoFocus
          />
        ) : (
          <>
            <button
              onClick={onActivate}
              onDoubleClick={() => {
                setEditName(route.name);
                setEditing(true);
              }}
              className="cursor-pointer min-h-11 flex-1 rounded px-1 text-left text-sm font-medium text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-200"
            >
              {route.name}
            </button>
            <button
              onClick={() => {
                setEditName(route.name);
                setEditing(true);
              }}
              aria-label={`Rename ${route.name}`}
              className="cursor-pointer flex h-11 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:text-gray-300"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <span
              className="inline-flex min-w-6 shrink-0 items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums"
              style={{
                backgroundColor: stops.length > 0 ? route.color : '#9ca3af',
                color: textOn(stops.length > 0 ? route.color : '#9ca3af'),
              }}
            >
              {stops.length}
            </span>
          </>
        )}
        <button
          onClick={() => toggleRouteVisibility(route.id)}
          className="cursor-pointer flex h-11 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:text-gray-300"
          aria-label={route.visible ? `Hide ${route.name}` : `Show ${route.name}`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {route.visible ? (
              <>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </>
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            )}
          </svg>
        </button>
        <button
          onClick={() => {
            const routes = useRouteStore.getState().routes;
            const idx = routes.findIndex((r) => r.id === route.id);
            const snapshot = { ...route };
            deleteRoute(route.id);
            addToast(`"${route.name}" deleted`, 'info', {
              label: 'Undo',
              onClick: () => restoreRoute(snapshot, idx),
            });
          }}
          className="cursor-pointer flex h-11 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:text-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label={`Delete ${route.name}`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Codes that could not be placed, so the count and the map agree */}
      {route.plzCodes.length > stops.filter((s) => s.type === 'plz').length && (
        <p className="border-t border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          {route.plzCodes.length - stops.filter((s) => s.type === 'plz').length} code(s) could not be
          located and are not on the map.
        </p>
      )}

      {/* Stop list */}
      {stops.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          <div ref={listRef} className="max-h-64 overflow-y-auto overscroll-contain">
            {stops.map((stop, i) => (
              <div key={stop.id}>
                {dragIdx !== null && dropIdx === i && dropIdx < dragIdx && (
                  <div className="mx-3 h-0.5 rounded-full" style={{ backgroundColor: route.color }} />
                )}
                <div
                  data-stop-idx={i}
                  className={`flex items-center gap-1 pl-1 pr-1 ${
                    dragIdx === i ? 'opacity-40' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  }`}
                >
                  {/* The drag handle owns the gesture; `touch-action: none` is
                      what stops the browser turning it into a list scroll. */}
                  <button
                    onPointerDown={(e) => handleDragStart(i, e)}
                    aria-label={`Reorder ${stop.label}`}
                    className="flex h-11 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded text-gray-300 active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-600"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <circle cx="9" cy="6" r="1.6" />
                      <circle cx="15" cy="6" r="1.6" />
                      <circle cx="9" cy="12" r="1.6" />
                      <circle cx="15" cy="12" r="1.6" />
                      <circle cx="9" cy="18" r="1.6" />
                      <circle cx="15" cy="18" r="1.6" />
                    </svg>
                  </button>

                  {(() => {
                    const { text, isWaypoint } = getStopLabel(stop, i);
                    return isWaypoint ? (
                      <div
                        className="flex h-5 w-5 shrink-0 items-center justify-center text-[9px] font-bold"
                        style={{
                          backgroundColor: route.color,
                          color: textOn(route.color),
                          borderRadius: 3,
                          transform: 'rotate(45deg)',
                        }}
                      >
                        <span style={{ transform: 'rotate(-45deg)' }}>{text}</span>
                      </div>
                    ) : (
                      <div
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                        style={{ backgroundColor: route.color, color: textOn(route.color) }}
                      >
                        {text}
                      </div>
                    );
                  })()}

                  <button
                    onClick={() => flyToStop(stop)}
                    title="Show on map"
                    className="flex min-h-11 min-w-0 flex-1 cursor-pointer flex-col justify-center rounded px-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                        {stop.type === 'waypoint' && stop.label === 'Waypoint'
                          ? `Waypoint ${getStopLabel(stop, i).text}`
                          : stop.label || parsePlz(stop.plz ?? '').code}
                      </span>
                      {stop.type === 'waypoint' ? (
                        <span className="shrink-0 rounded bg-gray-100 px-1 text-[9px] text-gray-400 dark:bg-gray-800">
                          WP
                        </span>
                      ) : (
                        stop.plz && (
                          <span className="shrink-0 rounded bg-gray-100 px-1 text-[10px] uppercase text-gray-400 dark:bg-gray-800">
                            {parsePlz(stop.plz).country}
                          </span>
                        )
                      )}
                    </span>
                    {stop.type === 'waypoint' && (
                      <span className="text-[10px] tabular-nums text-gray-400 dark:text-gray-500">
                        {stop.coordinate[1].toFixed(5)}, {stop.coordinate[0].toFixed(5)}
                      </span>
                    )}
                  </button>

                  {route.geometry?.legs?.[i] && i < stops.length - 1 && (
                    <span className="shrink-0 whitespace-nowrap text-[10px] tabular-nums text-gray-400 dark:text-gray-500">
                      {formatDistance(route.geometry.legs[i].distance)}
                      <span className="mx-0.5">·</span>
                      {formatDuration(route.geometry.legs[i].duration)}
                    </span>
                  )}

                  {/* Always rendered. This was `opacity-0 group-hover:opacity-100`,
                      which on a phone means permanently invisible - there is no
                      hover - so a stop could not be removed by anyone on touch. */}
                  <button
                    onClick={() => handleRemoveStop(stop, i)}
                    aria-label={`Remove ${stop.label}`}
                    className="flex h-11 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-gray-400 transition-colors hover:text-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {dragIdx !== null && dropIdx === i && dropIdx > dragIdx && (
                  <div className="mx-3 h-0.5 rounded-full" style={{ backgroundColor: route.color }} />
                )}
              </div>
            ))}
          </div>

          {/* Summary + Actions */}
          <div className="border-t border-gray-100 px-3 py-2 dark:border-gray-800">
            {route.calculating ? (
              <span className="animate-pulse text-xs text-gray-500">Calculating...</span>
            ) : route.geometry ? (
              <div className="mb-1.5 flex items-center gap-1.5">
                <span className="text-sm font-bold tabular-nums" style={{ color: route.color }}>
                  {formatDistance(route.geometry.distance)}
                </span>
                <span className="text-xs text-gray-400">·</span>
                <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                  {formatDuration(route.geometry.duration)}
                </span>
              </div>
            ) : stops.length >= 2 ? (
              <p className="mb-1.5 text-[11px] text-gray-400">Calculating route...</p>
            ) : (
              <p className="mb-1.5 text-[11px] text-gray-400">Add more stops</p>
            )}
            <div className="flex flex-wrap items-center gap-0.5">
              <button
                onClick={doCalculate}
                disabled={stops.length < 2}
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-400 dark:hover:bg-blue-950/50 dark:hover:text-blue-400"
                aria-label="Recalculate route"
                title="Recalculate"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              {stops.length >= 3 && (
                <button
                  onClick={doOptimize}
                  className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/50 dark:hover:text-blue-400"
                  aria-label="Optimize stop order"
                  title="Optimize route"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </button>
              )}
              {stops.length >= 2 && (
                <a
                  href={buildGoogleMapsUrl(stops.map((s) => ({ coordinate: s.coordinate, label: s.label })))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/50 dark:hover:text-blue-400"
                  aria-label="Open route in Google Maps"
                  title="Open in Google Maps"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}
              <button
                onClick={() => {
                  const codes = stops
                    .map((s) => s.plz ?? `@${s.coordinate[1].toFixed(5)},${s.coordinate[0].toFixed(5)}`)
                    .join(',');
                  navigator.clipboard.writeText(
                    `${window.location.origin}/#route=${encodeURIComponent(route.name)}:${codes}`
                  );
                  addToast('Share link copied');
                }}
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/50 dark:hover:text-blue-400"
                aria-label="Copy share link"
                title="Copy share link"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </button>
              <button
                onClick={handleCopy}
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/50 dark:hover:text-blue-400"
                aria-label="Copy route as text"
                title="Copy as text"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
              <button
                onClick={handleExportCSV}
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/50 dark:hover:text-blue-400"
                aria-label="Export route as CSV"
                title="Export CSV"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </button>
              <button
                onClick={() => printRoute(route, stops)}
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/50 dark:hover:text-blue-400"
                aria-label="Print route"
                title="Print / PDF"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
              </button>
              <div className="flex-1" />
              <button
                onClick={() => {
                  const savedCodes = [...route.plzCodes];
                  const savedStops = [...route.stops];
                  clearRoute(route.id);
                  addToast('Stops cleared', 'info', {
                    label: 'Undo',
                    onClick: () => restoreRouteStops(route.id, savedCodes, savedStops),
                  });
                }}
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-gray-600 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                aria-label="Clear all stops"
                title="Clear all stops"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
