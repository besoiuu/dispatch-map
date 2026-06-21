'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useMapData } from '@/hooks/useMapData';
import { useMapStore } from '@/store/mapStore';
import { useThemeStore } from '@/store/themeStore';
import { setColorBlindMode } from '@/lib/colors';
import { useRouteStore } from '@/store/routeStore';
import { MapView } from './MapView';
import { ZoomPills } from './ZoomPills';
import { Sidebar } from '../sidebar/Sidebar';
import { ToastContainer } from '../ui/Toast';
import { MobileHint } from '../ui/MobileHint';
import { enabledCountries } from '@/config/countries';
import type { CountryCode } from '@/types/country';

export function MapShell() {
  const { detailDataMap, overviewDataMap } = useMapData();
  const loading = useMapStore((s) => s.loading);
  const dark = useThemeStore((s) => s.dark);
  const colorBlind = useThemeStore((s) => s.colorBlind);

  useEffect(() => {
    setColorBlindMode(colorBlind);
  }, [colorBlind]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const touchStartY = useRef(0);
  const handleSwipeStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);
  const handleSwipeEnd = useCallback((e: React.TouchEvent) => {
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (dy > 80) setMobileOpen(false);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  // URL hash sync — read on mount
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    try {
      const params = new URLSearchParams(hash);
      const z = params.get('z');
      const c = params.get('c');
      const hide = params.get('hide');
      if (z) useMapStore.getState().setZoom(parseFloat(z));
      if (c) {
        const [lng, lat] = c.split(',').map(Number);
        if (!isNaN(lng) && !isNaN(lat)) {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('map:setzoom', {
              detail: { zoom: z ? parseFloat(z) : 6 }
            }));
          }, 500);
        }
      }
      if (hide) {
        const codes = hide.split(',') as CountryCode[];
        for (const code of codes) {
          if (enabledCountries.includes(code)) {
            useMapStore.getState().toggleCountry(code);
          }
        }
      }
    } catch {}
  }, []);

  // URL hash sync — write on changes
  const zoom = useMapStore((s) => s.zoom);
  const hiddenCountries = useMapStore((s) => s.hiddenCountries);
  useEffect(() => {
    const map = document.querySelector('.maplibregl-map');
    if (!map) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      params.set('z', zoom.toFixed(1));
      const hidden = [...hiddenCountries];
      if (hidden.length > 0) params.set('hide', hidden.join(','));
      window.history.replaceState(null, '', `#${params.toString()}`);
    }, 500);
    return () => clearTimeout(timer);
  }, [zoom, hiddenCountries]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        useRouteStore.getState().undoLastAdd();
      }
      if (e.key === '[') {
        setSidebarCollapsed((s) => !s);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex h-full w-full flex-col md:flex-row">
      <div className="relative flex-1 min-h-0">
        <MapView detailDataMap={detailDataMap} overviewDataMap={overviewDataMap} />
        <ZoomPills />
        {loading && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 rounded-lg bg-white/90 px-4 py-2 text-sm text-gray-600 shadow-lg backdrop-blur-sm dark:bg-gray-800/90 dark:text-gray-300 flex items-center gap-2">
            <svg className="h-4 w-4 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading map data...
          </div>
        )}
        <MobileHint />
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="cursor-pointer absolute bottom-4 right-4 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 active:scale-95 transition-all duration-200 md:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {mobileOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>
      {/* Desktop collapse toggle */}
      <button
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="cursor-pointer hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 z-30 h-10 w-5 items-center justify-center rounded-l-md bg-white border border-r-0 border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-800 transition-all shadow-sm"
        style={{ right: sidebarCollapsed ? 0 : 'var(--sidebar-width)' }}
        title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
      >
        <svg className={`h-3 w-3 transition-transform duration-200 ${sidebarCollapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
      <div
        className={`
          md:relative md:h-full md:block overflow-hidden
          fixed inset-x-0 bottom-0 z-30 transition-all duration-300 md:transition-all
          ${mobileOpen ? 'translate-y-0' : 'translate-y-full md:translate-y-0'}
          ${sidebarCollapsed ? 'md:w-0' : 'md:w-(--sidebar-width)'}
        `}
      >
        <div className="h-[60vh] md:h-full" style={{ width: 'var(--sidebar-width)' }}>
          <div
            onTouchStart={handleSwipeStart}
            onTouchEnd={handleSwipeEnd}
            className="flex justify-center py-2 md:hidden bg-white dark:bg-gray-900 rounded-t-2xl border-t border-gray-200 dark:border-gray-700 cursor-grab"
          >
            <div className="h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600" />
          </div>
          <Sidebar detailDataMap={detailDataMap} />
        </div>
      </div>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <ToastContainer />
    </div>
  );
}
