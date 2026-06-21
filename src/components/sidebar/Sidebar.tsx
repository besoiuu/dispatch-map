'use client';

import { useMemo, useRef } from 'react';
import type { FeatureCollection } from 'geojson';
import type { CountryCode } from '@/types/country';
import { SearchBar } from './SearchBar';
import { RouteManager } from './RouteManager';
import { Legend } from './Legend';
import { CountrySelector } from '../country/CountrySelector';
import dynamic from 'next/dynamic';

const HelpPanel = dynamic(() => import('../ui/HelpPanel').then((m) => m.HelpPanel), { ssr: false });
import { useMapStore } from '@/store/mapStore';
import { useThemeStore } from '@/store/themeStore';
import { useRouteStore } from '@/store/routeStore';

function SidebarSkeleton() {
  return (
    <div className="p-3 space-y-3">
      <div className="skeleton h-4 w-20" />
      <div className="skeleton h-8 w-full" />
      <div className="skeleton h-4 w-16 mt-4" />
      {[1,2,3,4,5].map(i => (
        <div key={i} className="flex items-center gap-2">
          <div className="skeleton h-3 w-3 rounded-full" />
          <div className="skeleton h-3 w-8" />
          <div className="skeleton h-3 flex-1" />
        </div>
      ))}
    </div>
  );
}
import { countries, enabledCountries } from '@/config/countries';


interface SidebarProps {
  detailDataMap: Partial<Record<CountryCode, FeatureCollection>>;
}

export function Sidebar({ detailDataMap }: SidebarProps) {
  const zoom = useMapStore((s) => s.zoom);
  const activeCountry = useMapStore((s) => s.activeCountry);
  const dark = useThemeStore((s) => s.dark);
  const toggle = useThemeStore((s) => s.toggle);
  const colorBlind = useThemeStore((s) => s.colorBlind);
  const toggleColorBlind = useThemeStore((s) => s.toggleColorBlind);
  const config = countries[activeCountry];
  const showLegend = zoom < config.overviewZoomThreshold;

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
  const routes = useRouteStore((s) => s.routes);
  const hasRoutes = routes.length > 0;

  return (
    <aside aria-label="Dispatch Map sidebar" role="complementary" className="flex h-full w-full flex-col border-l-0 md:border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="border-b border-gray-200 px-3 py-2 dark:border-gray-700">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <h1 className="text-sm font-bold text-gray-900 dark:text-gray-100">Dispatch Map</h1>
          <div className="flex items-center gap-1">
            <HelpPanel />
            <button
              onClick={toggleColorBlind}
              className={`cursor-pointer rounded-md px-2 py-1 text-[10px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${colorBlind ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' : 'text-gray-400 hover:bg-gray-100 dark:text-gray-500 dark:hover:bg-gray-800'}`}
              title={colorBlind ? 'Switch to vivid colors' : 'Switch to soft colors'}
              aria-label="Toggle color mode"
              aria-pressed={colorBlind}
            >
              Soft
            </button>
            <button
              onClick={toggle}
              className="cursor-pointer rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {dark ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
            <CountrySelector />
          </div>
        </div>
      </div>

      <div className="border-b border-gray-200 px-3 py-2 dark:border-gray-700">
        <SearchBar detailData={detailData} />
      </div>

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
      <div className="border-t border-gray-200 px-3 py-2 text-center dark:border-gray-700">
        <a
          href="https://revolut.me/besoiu"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400 transition-colors"
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
