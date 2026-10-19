'use client';

import { useRef, useState, useEffect } from 'react';
import { SearchBar } from './SearchBar';
import { RouteManager } from './RouteManager';
import { Legend } from './Legend';
import { CountrySelector } from '../country/CountrySelector';
import dynamic from 'next/dynamic';

const HelpPanel = dynamic(() => import('../ui/HelpPanel').then((m) => m.HelpPanel), { ssr: false });
import { InstallPrompt } from '../ui/InstallPrompt';
import { useMapStore } from '@/store/mapStore';
import { useThemeStore } from '@/store/themeStore';

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
    // `pointerdown`: a finger produces no mousedown, so this menu could not
    // be dismissed by tapping away from it on a phone.
    const handleClick = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => { window.removeEventListener('pointerdown', handleClick); window.removeEventListener('keydown', handleKey); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
          open ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-300'
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
            className="flex min-h-11 w-full cursor-pointer items-center gap-3 px-3 text-xs text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
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
            aria-pressed={colorBlind}
            className="flex min-h-11 w-full cursor-pointer items-center gap-3 px-3 text-xs text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <svg className={`h-4 w-4 ${colorBlind ? 'text-blue-500' : 'text-gray-500 dark:text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
            </svg>
            <span>Soft colors {colorBlind ? 'on' : 'off'}</span>
          </button>
          <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
          <div className="px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">Countries</p>
            <CountrySelector />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The sidebar no longer touches the detail GeoJSON.
 *
 * It used to merge every visible country's features into one collection and
 * clone each feature to tag `_country` - 44,331 features, 55 MB of source
 * data, duplicated in memory - purely so that search could match on them and
 * the stop builder could average a polygon into a centroid. Both now read
 * `lib/plzIndex` (1.9 MB, every code in every country, loaded up front), so
 * the clone, the cache-ref read during render, and the per-keystroke scan of
 * the whole collection are all gone.
 */
export function Sidebar() {
  const loading = useMapStore((s) => s.loading);

  return (
    <aside aria-label="Dispatch Map sidebar" role="complementary" className="flex h-full w-full flex-col bg-white dark:bg-gray-900 border-l-0 md:border-l border-gray-200/80 dark:border-gray-800">
      {/* Header */}
      <div className="shrink-0 px-4 py-3">
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
      <div className="shrink-0 px-4 pb-3">
        <SearchBar />
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 overflow-y-auto">
          <SidebarSkeleton />
        </div>
      ) : (
        /* Routes and the legend scroll TOGETHER, in one box.
         *
         * RouteManager used to be `shrink-0` with only the legend scrolling
         * below it. A shrink-0 box refuses to give up height, so once a few
         * routes were open the column grew past the sidebar and the overflow
         * simply spilled off the bottom of the screen - with no scrollable
         * ancestor, there was nothing to scroll. Measured on a 1366x768
         * laptop with four routes: content ended 331px below the fold, and
         * the only scrollable things on the whole sidebar were the per-route
         * stop lists, none of which was overflowing.
         *
         * `min-h-0` is the half that is easy to drop: a flex child's default
         * `min-height:auto` refuses to shrink below its content, which is
         * the same bug again one level down.
         */
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <RouteManager />
          <Legend />
        </div>
      )}

      <InstallPrompt />
      <div className="shrink-0 border-t border-gray-100 px-4 py-2 text-center dark:border-gray-800">
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
