'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { useRouteStore } from '@/store/routeStore';

const STORAGE_KEY = 'dispatch-hint-seen';
const CHANGED = 'dispatch-hint-changed';

/**
 * Whether the hint should show is a fact about the browser, not React state:
 * the viewport width and a localStorage flag. Reading it through
 * `useSyncExternalStore` keeps it out of an effect that writes state on mount.
 */
function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia('(max-width: 767px)');
  mq.addEventListener('change', onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    mq.removeEventListener('change', onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

function getSnapshot(): boolean {
  try {
    if (localStorage.getItem(STORAGE_KEY)) return false;
  } catch {
    /* private mode: treat as unseen */
  }
  return window.matchMedia('(max-width: 767px)').matches;
}

export function MobileHint() {
  const wanted = useSyncExternalStore(subscribe, getSnapshot, () => false);
  const hasRoute = useRouteStore((s) => s.routes.length > 0);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* private mode; the hint simply returns next time */
    }
    window.dispatchEvent(new Event(CHANGED));
  }, []);

  if (!wanted || !hasRoute) return null;

  return (
    <div
      className="absolute left-1/2 z-10 -translate-x-1/2 md:hidden animate-in"
      style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="mx-4 flex items-center gap-2 rounded-xl bg-gray-900/90 px-4 py-2.5 text-white shadow-lg backdrop-blur-sm">
        <svg className="h-5 w-5 shrink-0 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
        </svg>
        <span className="text-xs font-medium">Long-press the map for the menu. Drag a pin to move it.</span>
        <button
          onClick={dismiss}
          className="ml-1 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-500 dark:text-gray-400 transition-colors hover:text-white"
          aria-label="Dismiss hint"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
