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
      const exact: SearchIndexResult[] = [];
      const prefix: SearchIndexResult[] = [];
      const nameMatch: SearchIndexResult[] = [];
      for (const entry of index) {
        const r = { plz: entry.plz, name: entry.name, country: entry.country.toUpperCase(), lng: entry.lng, lat: entry.lat };
        if (entry.plz === q) {
          exact.push(r);
        } else if (entry.plz.startsWith(q)) {
          prefix.push(r);
        } else if (entry.name.toLowerCase().includes(q)) {
          nameMatch.push(r);
        }
        if (exact.length + prefix.length + nameMatch.length >= limit * 3) break;
      }
      return [...exact, ...prefix, ...nameMatch].slice(0, limit);
    },
    [index]
  );

  return { search, ready: index !== null };
}
