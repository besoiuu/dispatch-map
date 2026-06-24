'use client';

import { useState, useEffect, useCallback } from 'react';

interface SearchIndexEntry {
  country: string;
  plz: string;
  name: string;
  lng: number;
  lat: number;
}

let cachedIndex: SearchIndexEntry[] | null = null;

export interface SearchIndexResult {
  plz: string;
  name: string;
  country: string;
  lng: number;
  lat: number;
}

export function useSearchIndex() {
  const [index, setIndex] = useState<SearchIndexEntry[] | null>(cachedIndex);

  useEffect(() => {
    if (cachedIndex) return;
    fetch('/data/search-index.json')
      .then((r) => r.json())
      .then((data: [string, string, string, number, number][]) => {
        const entries = data.map(([country, plz, name, lng, lat]) => ({ country, plz, name, lng, lat }));
        cachedIndex = entries;
        setIndex(entries);
      })
      .catch(() => {});
  }, []);

  const search = useCallback(
    (query: string, limit = 20): SearchIndexResult[] => {
      if (!index || !query || query.length < 2) return [];
      const q = query.toLowerCase();
      const results: SearchIndexResult[] = [];
      for (const entry of index) {
        if (entry.plz.startsWith(q) || entry.name.toLowerCase().includes(q)) {
          results.push({
            plz: entry.plz,
            name: entry.name,
            country: entry.country.toUpperCase(),
            lng: entry.lng,
            lat: entry.lat,
          });
          if (results.length >= limit) break;
        }
      }
      return results;
    },
    [index]
  );

  return { search, ready: index !== null };
}
