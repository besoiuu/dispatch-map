'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * A media query as an external store.
 *
 * Reading `window.innerWidth` in a `useState` initialiser renders one value on
 * the server and another on a phone, which is a hydration mismatch - React
 * throws the subtree away and renders it again. Setting it from an effect
 * instead trades that for a second render pass on every mount. Subscribing is
 * what the platform actually offers.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    [query]
  );
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  // The server has no viewport; false means "assume the wide layout", which is
  // what the markup is written for.
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
