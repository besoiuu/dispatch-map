'use client';

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import type { FeatureCollection, Feature, Position } from 'geojson';
import { useSearch } from '@/hooks/useSearch';
import { useSearchIndex } from '@/hooks/useSearchIndex';
import { useMapStore } from '@/store/mapStore';
import { useRouteStore } from '@/store/routeStore';
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

interface GeoResult {
  type: 'geo';
  name: string;
  displayName: string;
  shortLabel: string;
  country?: string;
  lat: number;
  lng: number;
}

interface PlzResult {
  type: 'plz';
  plz: string;
  name?: string;
  country?: string;
  feature: Feature;
}

type SearchResultItem = PlzResult | GeoResult;

/* eslint-disable @typescript-eslint/no-explicit-any */
function buildGeoLabel(item: any): { name: string; shortLabel: string } {
  const addr = item.address || {};
  const road = addr.road || addr.pedestrian || addr.path || '';
  const houseNumber = addr.house_number || '';
  const city = addr.city || addr.town || addr.village || addr.municipality || addr.hamlet || '';
  const postcode = addr.postcode || '';

  const street = road && houseNumber ? `${road} ${houseNumber}` : road || item.name || item.display_name.split(',')[0];
  const shortLabel = city ? `${street}, ${city}` : street;
  const name = postcode && city ? `${street}, ${postcode} ${city}` : shortLabel;

  return { name, shortLabel };
}

async function geocodeSearch(query: string): Promise<GeoResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&viewbox=-10,35,30,60&bounded=0&addressdetails=1`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DispatchMap/1.0' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.map((item: any) => {
      const { name, shortLabel } = buildGeoLabel(item);
      return {
        type: 'geo' as const,
        name,
        shortLabel,
        country: (item.address?.country_code ?? '').toUpperCase() || undefined,
        displayName: item.display_name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
      };
    });
  } catch {
    return [];
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

interface SearchBarProps {
  detailData: FeatureCollection | null;
}

export function SearchBar({ detailData }: SearchBarProps) {
  const activeCountry = useMapStore((s) => s.activeCountry);
  const setHighlightedPlz = useMapStore((s) => s.setHighlightedPlz);
  const activeRouteId = useRouteStore((s) => s.activeRouteId);
  const addWaypoint = useRouteStore((s) => s.addWaypoint);
  const config = countries[activeCountry];
  const { query, setQuery, results: plzResultsGeo, clear } = useSearch(
    detailData,
    config.detailPropertyKey
  );
  const { search: searchIndex } = useSearchIndex();
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [geoResults, setGeoResults] = useState<GeoResult[]>([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const geoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const indexResults = useMemo(() => {
    if (!query || query.length < 2) return [];
    return searchIndex(query, 20);
  }, [query, searchIndex]);

  const plzResults: PlzResult[] = indexResults.length > 0
    ? indexResults.map((r) => {
        const geoMatch = plzResultsGeo.find((g) => g.plz === r.plz);
        return {
          type: 'plz' as const,
          plz: r.plz,
          name: r.name,
          country: r.country,
          feature: geoMatch?.feature ?? null as unknown as Feature,
        };
      })
    : plzResultsGeo.map((r) => ({ type: 'plz' as const, ...r }));

  const allResults: SearchResultItem[] = [
    ...plzResults,
    ...geoResults,
  ];

  useEffect(() => {
    setSelectedIndex(0);
    if (plzResults.length > 0) {
      setOpen(true);
      setGeoResults([]);
      return;
    }

    if (geoTimerRef.current) clearTimeout(geoTimerRef.current);

    if (!query || query.length < 3) {
      setGeoResults([]);
      setOpen(false);
      return;
    }

    setGeoLoading(true);
    geoTimerRef.current = setTimeout(async () => {
      const results = await geocodeSearch(query);
      setGeoResults(results);
      setGeoLoading(results.length === 0 && false);
      setOpen(results.length > 0);
      setGeoLoading(false);
    }, 500);

    return () => {
      if (geoTimerRef.current) clearTimeout(geoTimerRef.current);
    };
  }, [query, indexResults, plzResultsGeo]);

  const flyToFeature = useCallback(
    (plz: string, feature: GeoJSON.Feature) => {
      setHighlightedPlz(plz);
      setTimeout(() => setHighlightedPlz(null), 2000);
      const bbox = featureBbox(feature);
      window.dispatchEvent(new CustomEvent('map:flyto', { detail: { bbox, plz } }));
      clear();
      setOpen(false);
      setGeoResults([]);
    },
    [setHighlightedPlz, clear]
  );

  const flyToGeo = useCallback(
    (result: GeoResult) => {
      const pad = 0.02;
      const bbox = [result.lng - pad, result.lat - pad, result.lng + pad, result.lat + pad];
      window.dispatchEvent(new CustomEvent('map:flyto', { detail: { bbox } }));

      if (activeRouteId) {
        addWaypoint(activeRouteId, [result.lng, result.lat], undefined, result.name);
      }

      clear();
      setOpen(false);
      setGeoResults([]);
    },
    [activeRouteId, addWaypoint, clear]
  );

  const addPlzToActiveRoute = useRouteStore((s) => s.addPlzToActiveRoute);
  const selectResult = useCallback(
    (item: SearchResultItem) => {
      if (item.type === 'plz') {
        if (item.feature) {
          flyToFeature(item.plz, item.feature);
        } else {
          const cc = (item.country ?? '').toLowerCase();
          const countryConfig = cc ? countries[cc as keyof typeof countries] : null;
          if (countryConfig) {
            const [lng, lat] = countryConfig.center;
            const pad = 0.5;
            window.dispatchEvent(new CustomEvent('map:flyto', {
              detail: { bbox: [lng - pad, lat - pad, lng + pad, lat + pad] }
            }));
          }
          if (cc && activeRouteId) {
            addPlzToActiveRoute(`${cc}:${item.plz}`);
          }
          clear();
          setOpen(false);
          setGeoResults([]);
        }
      } else {
        flyToGeo(item);
      }
    },
    [flyToFeature, flyToGeo, activeRouteId, addPlzToActiveRoute, clear]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, allResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && allResults[selectedIndex]) {
      selectResult(allResults[selectedIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      clear();
      setGeoResults([]);
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
        onFocus={() => allResults.length > 0 && setOpen(true)}
        placeholder="Search postal code or place..."
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500 transition-colors"
      />
      {(query || geoLoading) && (
        <button
          onClick={() => {
            clear();
            setOpen(false);
            setGeoResults([]);
          }}
          className="cursor-pointer absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors rounded-full p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {geoLoading ? (
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </button>
      )}
      {open && allResults.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800">
          {allResults.map((r, i) => (
            <li key={r.type === 'plz' ? `plz-${r.plz}` : `geo-${i}`}>
              <button
                onClick={() => selectResult(r)}
                className={`cursor-pointer w-full px-3 py-2 text-left text-sm transition-colors hover:bg-blue-50 dark:hover:bg-gray-700 ${
                  i === selectedIndex ? 'bg-blue-50 dark:bg-gray-700' : ''
                }`}
              >
                {r.type === 'plz' ? (
                  <div className="flex items-center gap-2">
                    {r.country && (
                      <span className="text-[10px] font-bold text-gray-400 uppercase bg-gray-100 dark:bg-gray-700 dark:text-gray-400 rounded px-1 py-0.5 shrink-0">{r.country}</span>
                    )}
                    <span className="font-medium dark:text-gray-200">{r.plz}</span>
                    {r.name && (
                      <span className="text-gray-500 dark:text-gray-400 truncate">{r.name}</span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {r.country ? (
                      <span className="text-[10px] font-bold text-gray-400 uppercase bg-gray-100 dark:bg-gray-700 dark:text-gray-400 rounded px-1 py-0.5 shrink-0">{r.country}</span>
                    ) : (
                      <svg className="h-3.5 w-3.5 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                    <div className="min-w-0">
                      <span className="font-medium dark:text-gray-200">{r.name}</span>
                      <span className="ml-1 text-xs text-gray-400 dark:text-gray-500 truncate block">
                        {r.displayName.split(',').slice(1, 3).join(',')}
                      </span>
                    </div>
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
