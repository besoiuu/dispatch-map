'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';

interface SearchIndexEntry {
  country: string;
  plz: string;
  name: string;
}

let cachedIndex: SearchIndexEntry[] | null = null;

export function useSearchIndex() {
  const [index, setIndex] = useState<SearchIndexEntry[] | null>(cachedIndex);

  useEffect(() => {
    if (cachedIndex) return;
    fetch('/data/search-index.json')
      .then((r) => r.json())
      .then((data: [string, string, string][]) => {
        const entries = data.map(([country, plz, name]) => ({ country, plz, name }));
        cachedIndex = entries;
        setIndex(entries);
      })
      .catch(() => {});
  }, []);

  const search = useCallback(
    (query: string, limit = 20): { plz: string; name: string; country: string }[] => {
      if (!index || !query || query.length < 2) return [];
      const q = query.toLowerCase();
      const results: { plz: string; name: string; country: string }[] = [];
      for (const entry of index) {
        if (entry.plz.startsWith(q) || entry.name.toLowerCase().includes(q)) {
          results.push({ plz: entry.plz, name: entry.name, country: entry.country.toUpperCase() });
          if (results.length >= limit) break;
        }
      }
      return results;
    },
    [index]
  );

  return { search, ready: index !== null };
}
