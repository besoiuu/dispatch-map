'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouteStore } from '@/store/routeStore';
import { useToastStore } from '@/store/toastStore';
import type { RouteStop } from '@/types/route';

/** A stop the menu was opened on, rather than a bare point on the map. */
export interface ContextMenuStop {
  routeId: string;
  routeName: string;
  stopId: string;
  label: string;
  index: number;
}

export interface ContextMenuState {
  x: number;
  y: number;
  lngLat: { lng: number; lat: number };
  plz?: string;
  plzName?: string;
  country?: string;
  isDetail?: boolean;
  stop?: ContextMenuStop;
}

interface ContextMenuProps {
  state: ContextMenuState;
  onClose: () => void;
}

const MENU_WIDTH = 220;
const EDGE = 8;

export function ContextMenu({ state, onClose }: ContextMenuProps) {
  const routes = useRouteStore((s) => s.routes);
  const activeRouteId = useRouteStore((s) => s.activeRouteId);
  const addWaypoint = useRouteStore((s) => s.addWaypoint);
  const addPlzToActiveRoute = useRouteStore((s) => s.addPlzToActiveRoute);
  const removeStop = useRouteStore((s) => s.removeStop);
  const restoreStop = useRouteStore((s) => s.restoreStop);
  const addToast = useToastStore((s) => s.addToast);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: state.x, top: state.y });

  useEffect(() => {
    // `pointerdown` rather than `mousedown`: a touch never produced a
    // mousedown, so on a phone the menu could not be dismissed by tapping
    // away from it. Scroll and resize close it too, since it is anchored to
    // a point on the map that has then moved.
    const away = (e: Event) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  // Flip the menu back on screen. Opened near the right or bottom edge - which
  // on a phone is most of it - it used to run off the viewport with no way to
  // reach the lower items.
  useLayoutEffect(() => {
    const el = menuRef.current;
    const w = el?.offsetWidth || MENU_WIDTH;
    const h = el?.offsetHeight || 0;
    const maxLeft = window.innerWidth - w - EDGE;
    const maxTop = window.innerHeight - h - EDGE;
    setPos({
      left: Math.max(EDGE, Math.min(state.x, maxLeft)),
      top: Math.max(EDGE, Math.min(state.y, maxTop)),
    });
  }, [state.x, state.y, state.stop, state.plz]);

  const activeRoute = routes.find((r) => r.id === activeRouteId);
  const stopRoute = state.stop ? routes.find((r) => r.id === state.stop!.routeId) : undefined;

  const handleAddWaypoint = () => {
    if (!activeRouteId) return;
    const label =
      state.plz && state.plzName ? `${state.plz} ${state.plzName}` : state.plz || 'Waypoint';
    addWaypoint(activeRouteId, [state.lngLat.lng, state.lngLat.lat], undefined, label);
    addToast(`${label} added to ${activeRoute?.name ?? 'route'}`);
    onClose();
  };

  const handleAddPlz = () => {
    if (!state.plz || !activeRouteId) return;
    const prefixed = state.country ? `${state.country.toLowerCase()}:${state.plz}` : state.plz;
    const outcome = addPlzToActiveRoute(prefixed);
    if (outcome === 'duplicate') {
      const holder = routes.find((r) => r.plzCodes.includes(prefixed));
      addToast(`${state.plz} is already in ${holder?.name ?? 'another route'}`, 'info');
    } else {
      addToast(`${state.plz} added to ${activeRoute?.name ?? 'route'}`);
    }
    onClose();
  };

  const handleRemoveStop = () => {
    const s = state.stop;
    if (!s || !stopRoute) return;
    const snapshot: RouteStop | undefined = stopRoute.stops.find((st) => st.id === s.stopId);
    removeStop(s.routeId, s.stopId);
    addToast(`${s.label} removed from ${s.routeName}`, 'info', {
      label: 'Undo',
      onClick: () => {
        if (snapshot) restoreStop(s.routeId, snapshot, s.index);
      },
    });
    onClose();
  };

  const handleCopyCoords = () => {
    const text = `${state.lngLat.lat.toFixed(6)}, ${state.lngLat.lng.toFixed(6)}`;
    navigator.clipboard?.writeText(text);
    addToast('Coordinates copied');
    onClose();
  };

  const item =
    'flex w-full min-h-11 items-center gap-2.5 px-3 text-left text-xs text-gray-700 transition-colors hover:bg-blue-50 focus:outline-none focus-visible:bg-blue-50 dark:text-gray-300 dark:hover:bg-gray-800 dark:focus-visible:bg-gray-800';

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[220px] max-w-[min(18rem,calc(100vw-1rem))] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-900 animate-in"
      style={{ left: pos.left, top: pos.top }}
      role="menu"
      aria-label="Map actions"
    >
      {state.stop ? (
        <div className="border-b border-gray-100 px-3 py-2 dark:border-gray-800">
          <p className="truncate text-xs font-semibold text-gray-900 dark:text-gray-100">{state.stop.label}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">on {state.stop.routeName}</p>
        </div>
      ) : (
        state.plz && (
          <div className="border-b border-gray-100 px-3 py-2 dark:border-gray-800">
            <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">
              {state.country && (
                <span className="mr-1 text-[10px] uppercase text-gray-400">{state.country}</span>
              )}
              {state.plz}
            </p>
            {state.plzName && <p className="text-[11px] text-gray-500 dark:text-gray-400">{state.plzName}</p>}
          </div>
        )
      )}

      {/* Removing a stop from the map was impossible: this menu only ever
          offered ways to ADD, and the pin itself had no click handler. */}
      {state.stop && (
        <>
          <button onClick={handleRemoveStop} className={`cursor-pointer text-red-600 dark:text-red-400 ${item}`} role="menuitem">
            <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Remove this stop
          </button>
          <p className="px-3 pb-1 pt-0.5 text-[10px] italic text-gray-400 dark:text-gray-500">
            Drag the pin to move it.
          </p>
          <div className="my-0.5 border-t border-gray-100 dark:border-gray-800" />
        </>
      )}

      {!state.stop && activeRoute && state.plz && state.isDetail && (
        <button onClick={handleAddPlz} className={`cursor-pointer ${item}`} role="menuitem">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: activeRoute.color }} />
          Add to {activeRoute.name}
        </button>
      )}

      {!state.stop && activeRoute && (
        <button onClick={handleAddWaypoint} className={`cursor-pointer ${item}`} role="menuitem">
          <svg className="h-3.5 w-3.5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Drop waypoint here
        </button>
      )}

      {!state.stop && !activeRoute && (
        <p className="px-3 py-2 text-[11px] italic text-gray-400 dark:text-gray-500">Create a route first</p>
      )}

      <div className="mt-0.5 border-t border-gray-100 pt-0.5 dark:border-gray-800">
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${state.lngLat.lat},${state.lngLat.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClose}
          className={`cursor-pointer ${item}`}
          role="menuitem"
        >
          <svg className="h-3.5 w-3.5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Open in Google Maps
        </a>
        <button onClick={handleCopyCoords} className={`cursor-pointer ${item}`} role="menuitem">
          <svg className="h-3.5 w-3.5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Copy coordinates
        </button>
      </div>
    </div>
  );
}
