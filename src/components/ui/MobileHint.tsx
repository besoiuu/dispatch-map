'use client';

import { useState, useEffect } from 'react';
import { useRouteStore } from '@/store/routeStore';

const STORAGE_KEY = 'dispatch-hint-seen';

export function MobileHint() {
  const [visible, setVisible] = useState(false);
  const routes = useRouteStore((s) => s.routes);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    if (!isMobile) return;
    if (localStorage.getItem(STORAGE_KEY)) return;
    if (routes.length > 0) {
      setVisible(true);
    }
  }, [routes.length]);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(STORAGE_KEY, '1');
  };

  if (!visible) return null;

  return (
    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 md:hidden animate-in">
      <div className="flex items-center gap-2 rounded-xl bg-gray-900/90 px-4 py-2.5 text-white shadow-lg backdrop-blur-sm">
        <svg className="h-5 w-5 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
        </svg>
        <span className="text-xs font-medium">Long-press the map to add a waypoint</span>
        <button
          onClick={dismiss}
          className="cursor-pointer ml-1 rounded-full p-0.5 text-gray-400 hover:text-white transition-colors"
          aria-label="Dismiss hint"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
