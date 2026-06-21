'use client';

import { useState, useMemo, useCallback } from 'react';
import type { FeatureCollection, Feature } from 'geojson';

interface SearchResult {
  plz: string;
  name?: string;
  feature: Feature;
}

export function useSearch(
  data: FeatureCollection | null,
  propertyKey: string = 'plz5'
) {
  const [query, setQuery] = useState('');

  const allFeatures = useMemo(() => {
    if (!data) return [];
    return data.features.map((f) => ({
      plz: String(f.properties?.[propertyKey] ?? ''),
      name: f.properties?.name as string | undefined,
      feature: f,
    }));
  }, [data, propertyKey]);

  const results = useMemo(() => {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    return allFeatures
      .filter(
        (f) =>
          f.plz.startsWith(q) ||
          (f.name && f.name.toLowerCase().includes(q))
      )
      .slice(0, 20);
  }, [query, allFeatures]);

  const clear = useCallback(() => setQuery(''), []);

  return { query, setQuery, results, clear } as const;
}

export type { SearchResult };
