'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import type { FeatureCollection } from 'geojson';
import type { CountryCode } from '@/types/country';
import { SearchBar } from './SearchBar';
import { RouteManager } from './RouteManager';
import { Legend } from './Legend';
import { CountrySelector } from '../country/CountrySelector';
import dynamic from 'next/dynamic';

const HelpPanel = dynamic(() => import('../ui/HelpPanel').then((m) => m.HelpPanel), { ssr: false });
import { InstallPrompt } from '../ui/InstallPrompt';
import { useMapStore } from '@/store/mapStore';
import { useThemeStore } from '@/store/themeStore';
import { useRouteStore } from '@/store/routeStore';
import { countries, enabledCountries } from '@/config/countries';

function SidebarSkeleton() {
  return (
    <div className="p-4 space-y-3">
      <div className="skeleton h-10 w-full rounded-xl" />
      <div className="skeleton h-4 w-20 mt-4" />
      <div className="skeleton h-9 w-full rounded-lg" />
      {[1,2,3].map(i => (
        <div key={i} className="flex items-center gap-2">
          <div className="skeleton h-3 w-3 rounded-full" />
          <div className="skeleton h-3 flex-1 rounded" />
        </div>
      ))}
    </div>
  );
}

function SettingsDropdown() {
  const dark = useThemeStore((s) => s.dark);
  const toggle = useThemeStore((s) => s.toggle);
  const colorBlind = useThemeStore((s) => s.colorBlind);
  const toggleColorBlind = useThemeStore((s) => s.toggleColorBlind);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => { window.removeEventListener('mousedown', handleClick); window.removeEventListener('keydown', handleKey); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`cursor-pointer rounded-lg p-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
          open ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300'
        }`}
        title="Settings"
        aria-label="Settings"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-56 rounded-xl border border-gray-200 bg-white py-1.5 shadow-xl dark:border-gray-700 dark:bg-gray-900 animate-in">
          <button
            onClick={toggle}
            className="cursor-pointer flex w-full items-center gap-3 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
          >
            {dark ? (
              <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
            ) : (
              <svg className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
            )}
            <span>{dark ? 'Light mode' : 'Dark mode'}</span>
          </button>
          <button
            onClick={toggleColorBlind}
            className="cursor-pointer flex w-full items-center gap-3 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className={`h-4 w-4 ${colorBlind ? 'text-blue-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
            </svg>
            <span>Soft colors {colorBlind ? 'on' : 'off'}</span>
          </button>
          <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
          <div className="px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">Countries</p>
            <CountrySelector />
          </div>
        </div>
      )}
    </div>
  );
}

interface SidebarProps {
  detailDataMap: Partial<Record<CountryCode, FeatureCollection>>;
}

export function Sidebar({ detailDataMap }: SidebarProps) {
  const zoom = useMapStore((s) => s.zoom);
  const activeCountry = useMapStore((s) => s.activeCountry);
  const config = countries[activeCountry];

  const loading = useMapStore((s) => s.loading);
  const hiddenCountries = useMapStore((s) => s.hiddenCountries);
  const augmentedCache = useRef(new Map<string, GeoJSON.Feature[]>());
  const detailData = useMemo(() => {
    const cache = augmentedCache.current;
    const visibleCountries = enabledCountries.filter((c) => !hiddenCountries.has(c));
    const allFeatures: GeoJSON.Feature[] = [];
    for (const c of visibleCountries) {
      const src = detailDataMap[c]?.features;
      if (!src) continue;
      const cacheKey = `${c}:${src.length}`;
      let augmented = cache.get(cacheKey);
      if (!augmented) {
        augmented = src.map(f => ({ ...f, properties: { ...f.properties, _country: c } }));
        cache.set(cacheKey, augmented);
      }
      allFeatures.push(...augmented);
    }
    if (allFeatures.length === 0) return null;
    return { type: 'FeatureCollection' as const, features: allFeatures };
  }, [detailDataMap, hiddenCountries]);

  return (
    <aside aria-label="Dispatch Map sidebar" role="complementary" className="flex h-full w-full flex-col bg-white dark:bg-gray-900 border-l-0 md:border-l border-gray-200/80 dark:border-gray-800">
      {/* Header */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-lg bg-blue-600 flex items-center justify-center">
              <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </div>
            <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Dispatch Map</h1>
          </div>
          <div className="flex items-center gap-0.5">
            <HelpPanel />
            <SettingsDropdown />
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 pb-3">
        <SearchBar detailData={detailData} />
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 overflow-y-auto">
          <SidebarSkeleton />
        </div>
      ) : (
        <>
          <div className="shrink-0">
            <RouteManager detailData={detailData} />
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            <Legend />
          </div>
        </>
      )}

      <InstallPrompt />
      <div className="border-t border-gray-100 px-4 py-2 text-center dark:border-gray-800">
        <a
          href="https://revolut.me/besoiu"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-gray-350 hover:text-blue-500 dark:text-gray-600 dark:hover:text-blue-400 transition-colors"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          Support this project
        </a>
      </div>
    </aside>
  );
}
