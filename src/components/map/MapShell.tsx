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
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const r of regs) r.unregister();
      });
      caches.keys().then((keys) => {
        for (const k of keys) caches.delete(k);
      });
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
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        useRouteStore.getState().undoLastAdd();
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
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 rounded-lg bg-white/90 px-4 py-2 text-sm text-gray-600 shadow-md backdrop-blur-sm dark:bg-gray-800/90 dark:text-gray-300">
            Loading map data...
          </div>
        )}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="absolute bottom-4 right-4 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg md:hidden"
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
      <div
        className={`
          md:relative md:h-full md:w-[var(--sidebar-width)] md:block
          fixed inset-x-0 bottom-0 z-30 transition-transform duration-300 md:transition-none
          ${mobileOpen ? 'translate-y-0' : 'translate-y-full md:translate-y-0'}
        `}
      >
        <div className="h-[60vh] md:h-full">
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
    </div>
  );
}
