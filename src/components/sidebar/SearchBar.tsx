'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import type { FeatureCollection, Feature, Position } from 'geojson';
import { useSearch } from '@/hooks/useSearch';
import { useMapStore } from '@/store/mapStore';
import { countries } from '@/config/countries';

function featureBbox(feature: Feature): [number, number, number, number] {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  const processCoord = (coord: Position) => {
    if (coord[0] < minLng) minLng = coord[0];
    if (coord[1] < minLat) minLat = coord[1];
    if (coord[0] > maxLng) maxLng = coord[0];
    if (coord[1] > maxLat) maxLat = coord[1];
  };
  const processCoords = (coords: Position[] | Position[][] | Position[][][]) => {
    for (const item of coords) {
      if (typeof item[0] === 'number') {
        processCoord(item as Position);
      } else {
        processCoords(item as Position[][] | Position[][][]);
      }
    }
  };
  const geom = feature.geometry;
  if ('coordinates' in geom) {
    processCoords(geom.coordinates as Position[] | Position[][] | Position[][][]);
  }
  return [minLng, minLat, maxLng, maxLat];
}

interface SearchBarProps {
  detailData: FeatureCollection | null;
}

export function SearchBar({ detailData }: SearchBarProps) {
  const activeCountry = useMapStore((s) => s.activeCountry);
  const setHighlightedPlz = useMapStore((s) => s.setHighlightedPlz);
  const config = countries[activeCountry];
  const { query, setQuery, results, clear } = useSearch(
    detailData,
    config.detailPropertyKey
  );
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setOpen(results.length > 0);
    setSelectedIndex(0);
  }, [results]);

  const flyTo = useCallback(
    (plz: string, feature: GeoJSON.Feature) => {
      setHighlightedPlz(plz);
      setTimeout(() => setHighlightedPlz(null), 2000);

      const bbox = featureBbox(feature);
      const event = new CustomEvent('map:flyto', {
        detail: { bbox, plz },
      });
      window.dispatchEvent(event);

      clear();
      setOpen(false);
    },
    [setHighlightedPlz, clear]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      const r = results[selectedIndex];
      flyTo(r.plz, r.feature);
    } else if (e.key === 'Escape') {
      setOpen(false);
      clear();
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Search postal code..."
        className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
      />
      {query && (
        <button
          onClick={() => {
            clear();
            setOpen(false);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      {open && results.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800">
          {results.map((r, i) => (
            <li key={r.plz}>
              <button
                onClick={() => flyTo(r.plz, r.feature)}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-blue-50 dark:hover:bg-gray-700 ${
                  i === selectedIndex ? 'bg-blue-50 dark:bg-gray-700' : ''
                }`}
              >
                <span className="font-medium dark:text-gray-200">{r.plz}</span>
                {r.name && (
                  <span className="ml-2 text-gray-500 dark:text-gray-400">{r.name}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
