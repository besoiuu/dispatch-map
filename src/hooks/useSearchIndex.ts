'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  isPlzIndexReady,
  loadPlzIndex,
  searchPlz,
  subscribePlzIndex,
  type PlzEntry,
  type SearchOptions,
} from '@/lib/plzIndex';

export type SearchIndexResult = PlzEntry;

/**
 * React access to the shared index in `lib/plzIndex`. The data itself lives
 * outside React because the route store and the stop builder need it too,
 * and they are not components.
 */
export function useSearchIndex() {
  // useSyncExternalStore rather than useState + useEffect: the index is an
  // external store, and setting state from an effect body is what the
  // react-hooks lint rule flags (and it cost a render pass per load).
  const ready = useSyncExternalStore(subscribePlzIndex, isPlzIndexReady, () => false);

  useEffect(() => {
    loadPlzIndex();
  }, []);

  const search = useCallback(
    (query: string, opts: SearchOptions = {}) => searchPlz(query, opts),
    // `ready` is the dependency on purpose: `searchPlz` reads module state,
    // so this callback's identity has to change once the data lands or a memo
    // built on it keeps serving the empty result it computed first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready]
  );

  return { search, ready };
}
