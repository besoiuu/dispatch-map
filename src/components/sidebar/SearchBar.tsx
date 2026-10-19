'use client';

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchIndex } from '@/hooks/useSearchIndex';
import { entryKey, parseQuery, type PlzEntry } from '@/lib/plzIndex';
import { useMapStore } from '@/store/mapStore';
import { useRouteStore } from '@/store/routeStore';
import { useToastStore } from '@/store/toastStore';
import { countries, enabledCountries } from '@/config/countries';

/** Zoom that frames a single postal area without hunting for its polygon. */
const PLZ_ZOOM = 11;
const ADDRESS_ZOOM = 14;

interface GeoResult {
  type: 'geo';
  name: string;
  context: string;
  country?: string;
  lat: number;
  lng: number;
}

interface PlzResult extends PlzEntry {
  type: 'plz';
}

type SearchResultItem = PlzResult | GeoResult;

/* eslint-disable @typescript-eslint/no-explicit-any */
function buildGeoLabel(item: any): { name: string; context: string } {
  const addr = item.address || {};
  const road = addr.road || addr.pedestrian || addr.path || '';
  const houseNumber = addr.house_number || '';
  const city = addr.city || addr.town || addr.village || addr.municipality || addr.hamlet || '';
  const postcode = addr.postcode || '';
  const display = String(item.display_name ?? '');

  const street =
    road && houseNumber ? `${road} ${houseNumber}` : road || item.name || display.split(',')[0];
  const where = [postcode, city].filter(Boolean).join(' ');
  return { name: street, context: where || display.split(',').slice(1, 3).join(',').trim() };
}

/**
 * Free-text geocoding, restricted to the countries this map covers.
 *
 * `countrycodes` is the part that was missing: without it Nominatim answers
 * a query with whatever is nearest anywhere, which is what made the
 * suggestions feel like near-misses. The viewbox alone constrained nothing,
 * because `bounded=0` makes it a ranking hint rather than a filter.
 */
async function geocodeSearch(query: string, country: string | null): Promise<GeoResult[]> {
  const codes = country ?? enabledCountries.join(',');
  const url =
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}` +
    `&limit=5&addressdetails=1&countrycodes=${codes}`;
  try {
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((item: any) => {
      const { name, context } = buildGeoLabel(item);
      return {
        type: 'geo' as const,
        name,
        context,
        country: (item.address?.country_code ?? '').toUpperCase() || undefined,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
      };
    });
  } catch {
    return [];
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function SearchBar() {
  const activeCountry = useMapStore((s) => s.activeCountry);
  const setHighlightedPlz = useMapStore((s) => s.setHighlightedPlz);
  const activeRouteId = useRouteStore((s) => s.activeRouteId);
  const routes = useRouteStore((s) => s.routes);
  const addWaypoint = useRouteStore((s) => s.addWaypoint);
  const addPlzToActiveRoute = useRouteStore((s) => s.addPlzToActiveRoute);
  const addToast = useToastStore((s) => s.addToast);
  const { search: searchIndex, ready } = useSearchIndex();

  const [query, setQuery] = useState('');
  const [dismissed, setDismissed] = useState(false);
  // Paired with the query it belongs to, so a new query resets the cursor
  // without an effect that writes state during render.
  const [cursor, setCursor] = useState<{ q: string; i: number }>({ q: '', i: 0 });
  const [geo, setGeo] = useState<{ q: string; results: GeoResult[] }>({ q: '', results: [] });
  const geoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const parsed = useMemo(() => parseQuery(query), [query]);

  const plzResults: PlzResult[] = useMemo(() => {
    if (!ready) return [];
    return searchIndex(query, { activeCountry, limit: 12 }).map((e) => ({ ...e, type: 'plz' as const }));
  }, [query, activeCountry, searchIndex, ready]);

  // The geocoder is consulted ALONGSIDE the index, not only when the index
  // comes up empty. A street address in a town whose postal code happens to
  // prefix-match was previously unreachable: any index hit suppressed it.
  const geoResults = geo.q === query ? geo.results : [];

  // Pure postal codes are answered by the index; anything carrying a letter is
  // the kind of thing only a geocoder can resolve.
  const worthGeocoding = parsed.text.length >= 3 && /[^\d\s]/.test(parsed.text);
  // Derived rather than stored: an answer for this exact query means done,
  // and a failed request still records the query with no results.
  const geoLoading = worthGeocoding && geo.q !== query;

  useEffect(() => {
    if (geoTimerRef.current) clearTimeout(geoTimerRef.current);
    if (!worthGeocoding) return;
    const q = query;
    geoTimerRef.current = setTimeout(() => {
      geocodeSearch(parsed.text, parsed.country).then((results) => setGeo({ q, results }));
    }, 450);
    return () => {
      if (geoTimerRef.current) clearTimeout(geoTimerRef.current);
    };
  }, [query, parsed.text, parsed.country, worthGeocoding]);

  const allResults: SearchResultItem[] = [...plzResults, ...geoResults];
  const open = !dismissed && allResults.length > 0;
  const selectedIndex = cursor.q === query ? Math.min(cursor.i, allResults.length - 1) : 0;

  const reset = useCallback(() => {
    setQuery('');
    setDismissed(false);
    setGeo({ q: '', results: [] });
  }, []);

  const flyTo = useCallback((lng: number, lat: number, zoom: number) => {
    window.dispatchEvent(new CustomEvent('map:flyto', { detail: { center: [lng, lat], zoom } }));
  }, []);

  const selectResult = useCallback(
    (item: SearchResultItem) => {
      if (item.type === 'plz') {
        const prefixed = entryKey(item.country, item.plz);
        flyTo(item.lng, item.lat, PLZ_ZOOM);
        setHighlightedPlz(prefixed);
        setTimeout(() => setHighlightedPlz(null), 2500);

        const label = item.name ? `${item.plz} ${item.name}` : item.plz;
        const outcome = addPlzToActiveRoute(prefixed, { coordinate: [item.lng, item.lat], label });

        if (outcome === 'no-route') {
          addToast('Create or select a route first', 'info');
        } else if (outcome === 'duplicate') {
          const holder = routes.find((r) => r.plzCodes.includes(prefixed));
          addToast(`${item.plz} is already in ${holder?.name ?? 'another route'}`, 'info');
        } else {
          addToast(`${label} added`);
        }
      } else {
        flyTo(item.lng, item.lat, ADDRESS_ZOOM);
        if (!activeRouteId) {
          addToast('Create or select a route first', 'info');
        } else {
          const label = item.context ? `${item.name}, ${item.context}` : item.name;
          addWaypoint(activeRouteId, [item.lng, item.lat], undefined, label);
          addToast(`${item.name} added as waypoint`);
        }
      }
      reset();
    },
    [flyTo, setHighlightedPlz, addPlzToActiveRoute, addToast, routes, activeRouteId, addWaypoint, reset]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setDismissed(false);
      setCursor({ q: query, i: Math.min(selectedIndex + 1, allResults.length - 1) });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor({ q: query, i: Math.max(selectedIndex - 1, 0) });
    } else if (e.key === 'Enter' && open && allResults[selectedIndex]) {
      selectResult(allResults[selectedIndex]);
    } else if (e.key === 'Escape') {
      if (open) setDismissed(true);
      else reset();
    }
  };

  const countryHint = parsed.country ? countries[parsed.country]?.name : null;
  const listId = 'search-results';

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setDismissed(false);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => setDismissed(false)}
        inputMode="search"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label="Search postal code, place or address"
        placeholder="Postal code, place, or DE 27576"
        className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-3.5 pr-12 text-base md:text-sm shadow-sm focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800/50 dark:focus:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500 transition-all"
      />
      {(query || geoLoading) && (
        <button
          onClick={reset}
          aria-label="Clear search"
          className="cursor-pointer absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-gray-500 dark:text-gray-400 transition-colors hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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
      {countryHint && !open && (
        <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">Searching {countryHint} only</p>
      )}
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-[60vh] overflow-y-auto overscroll-contain rounded-xl border border-gray-200/80 bg-white shadow-xl ring-1 ring-black/5 dark:border-gray-700 dark:bg-gray-900 dark:ring-white/10"
        >
          {allResults.map((r, i) => (
            <li
              // Keyed by the pair plus position: the same code legitimately
              // appears twice (AT 1040 "Wien, Wieden") and 3,423 codes exist
              // in more than one country. Keying on `plz` alone gave two rows
              // the same key, and React then ran the wrong row's handler.
              key={r.type === 'plz' ? `plz-${entryKey(r.country, r.plz)}-${i}` : `geo-${r.lat},${r.lng}-${i}`}
              role="option"
              aria-selected={i === selectedIndex}
            >
              <button
                onClick={() => selectResult(r)}
                className={`cursor-pointer flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-blue-50 dark:hover:bg-gray-700 ${
                  i === selectedIndex ? 'bg-blue-50 dark:bg-gray-700' : ''
                }`}
              >
                {r.type === 'plz' ? (
                  <>
                    <span className="shrink-0 rounded bg-gray-100 px-1 py-0.5 text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400 dark:bg-gray-700 dark:text-gray-400">
                      {r.country}
                    </span>
                    <span className="font-medium tabular-nums dark:text-gray-200">{r.plz}</span>
                    {r.name && <span className="truncate text-gray-500 dark:text-gray-400">{r.name}</span>}
                    <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Area
                    </span>
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4 shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="min-w-0">
                      <span className="block truncate font-medium dark:text-gray-200">{r.name}</span>
                      {r.context && (
                        <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{r.context}</span>
                      )}
                    </span>
                    <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Waypoint
                    </span>
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
