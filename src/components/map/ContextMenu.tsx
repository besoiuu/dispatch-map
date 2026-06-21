'use client';

import { useEffect, useRef } from 'react';
import { useRouteStore } from '@/store/routeStore';
import { useToastStore } from '@/store/toastStore';

export interface ContextMenuState {
  x: number;
  y: number;
  lngLat: { lng: number; lat: number };
  plz?: string;
  plzName?: string;
  country?: string;
}

interface ContextMenuProps {
  state: ContextMenuState;
  onClose: () => void;
}

export function ContextMenu({ state, onClose }: ContextMenuProps) {
  const routes = useRouteStore((s) => s.routes);
  const activeRouteId = useRouteStore((s) => s.activeRouteId);
  const addWaypoint = useRouteStore((s) => s.addWaypoint);
  const addPlzToActiveRoute = useRouteStore((s) => s.addPlzToActiveRoute);
  const addToast = useToastStore((s) => s.addToast);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const activeRoute = routes.find((r) => r.id === activeRouteId);

  const handleAddWaypoint = () => {
    if (!activeRouteId) return;
    addWaypoint(activeRouteId, [state.lngLat.lng, state.lngLat.lat]);
    addToast(`Waypoint added to ${activeRoute?.name ?? 'route'}`);
    onClose();
  };

  const handleAddPlz = () => {
    if (!state.plz || !activeRouteId) return;
    const prefixed = state.country ? `${state.country.toLowerCase()}:${state.plz}` : state.plz;
    addPlzToActiveRoute(prefixed);
    addToast(`${state.plz} added to ${activeRoute?.name ?? 'route'}`);
    onClose();
  };

  const handleCopyCoords = () => {
    const text = `${state.lngLat.lat.toFixed(6)}, ${state.lngLat.lng.toFixed(6)}`;
    navigator.clipboard.writeText(text);
    addToast('Coordinates copied');
    onClose();
  };

  const menuStyle: React.CSSProperties = {
    left: state.x,
    top: state.y,
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] rounded-lg border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-900 animate-in"
      style={menuStyle}
      role="menu"
    >
      {state.plz && (
        <div className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-800">
          <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">
            {state.country && <span className="text-[10px] text-gray-400 uppercase mr-1">{state.country}</span>}
            {state.plz}
          </p>
          {state.plzName && <p className="text-[11px] text-gray-500 dark:text-gray-400">{state.plzName}</p>}
        </div>
      )}

      {activeRoute && state.plz && (
        <button
          onClick={handleAddPlz}
          className="cursor-pointer flex w-full items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
          role="menuitem"
        >
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: activeRoute.color }} />
          Add to {activeRoute.name}
        </button>
      )}

      {activeRoute && (
        <button
          onClick={handleAddWaypoint}
          className="cursor-pointer flex w-full items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
          role="menuitem"
        >
          <svg className="h-3.5 w-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Drop waypoint here
        </button>
      )}

      {!activeRoute && (
        <p className="px-3 py-2 text-[11px] text-gray-400 dark:text-gray-500 italic">
          Create a route first
        </p>
      )}

      <div className="border-t border-gray-100 dark:border-gray-800 mt-0.5 pt-0.5">
        <button
          onClick={handleCopyCoords}
          className="cursor-pointer flex w-full items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
          role="menuitem"
        >
          <svg className="h-3.5 w-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Copy coordinates
        </button>
      </div>
    </div>
  );
}
