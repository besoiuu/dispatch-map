'use client';

import { useEffect } from 'react';
import { useMapStore } from '@/store/mapStore';
import { countries, enabledCountries } from '@/config/countries';
import type { CountryCode } from '@/types/country';
import type { FeatureCollection } from 'geojson';
// One copy of the bounding boxes, shared with `countryAtCoord`.
import { COUNTRY_BOUNDS } from '@/lib/countryAtCoord';

// 22: Polish regions gained their bbox, three Austrian and three Italian
// overview features gained a name, and the Italian ISO province codes OT/OG/VS
// became the real postal prefixes 07/08/09.
const DATA_VERSION = 22;

const USE_PMTILES = process.env.NEXT_PUBLIC_USE_PMTILES === 'true';

const DETAIL_PREFETCH_ZOOM = 7;

let worker: Worker | null = null;
const pendingRequests = new Map<string, (data: FeatureCollection) => void>();

function getWorker(): Worker | null {
  if (typeof window === 'undefined') return null;
  if (!worker) {
    try {
      worker = new Worker('/geojson-worker.js');
      worker.onmessage = (e) => {
        const { id, data, error } = e.data;
        const resolve = pendingRequests.get(id);
        if (resolve && !error) {
          resolve(data);
        } else if (error) {
          console.error(`Worker error for ${id}:`, error);
        }
        pendingRequests.delete(id);
      };
    } catch {
      return null;
    }
  }
  return worker;
}

function fetchViaWorker(url: string): Promise<FeatureCollection> {
  const w = getWorker();
  if (!w) {
    return fetch(url).then((r) => r.json());
  }
  const id = url;
  return new Promise((resolve) => {
    pendingRequests.set(id, resolve);
    w.postMessage({ url, id });
  });
}

const detailLoadingSet = new Set<CountryCode>();

/**
 * Detail polygons, for the GeoJSON renderer only.
 *
 * In PMTiles mode nothing reads these - the tiles draw the areas and
 * `lib/plzIndex` answers the lookups - yet they were fetched anyway: up to
 * 55 MB across 44,331 features, Germany alone 10.9 MB, downloaded and parsed
 * on a phone for nothing. Search and the stop builder no longer depend on
 * them, so production can skip them entirely.
 */
export function loadDetailForCountries(codes: CountryCode[]) {
  if (USE_PMTILES) return;
  const store = useMapStore.getState();
  const toLoad = codes.filter(c => !store.detailData[c] && !detailLoadingSet.has(c));
  if (toLoad.length === 0) return;

  for (const code of toLoad) {
    detailLoadingSet.add(code);
    const config = countries[code];
    fetchViaWorker(`${config.detailPath}?v=${DATA_VERSION}`)
      .then(data => {
        useMapStore.getState().setDetailData(code, data);
        detailLoadingSet.delete(code);
      })
      .catch(err => {
        console.error(`Failed to load detail for ${code}:`, err);
        detailLoadingSet.delete(code);
      });
  }
}

export function getVisibleCountries(
  bounds: { west: number; south: number; east: number; north: number },
  zoom: number
): CountryCode[] {
  if (zoom < DETAIL_PREFETCH_ZOOM) return [];
  return enabledCountries.filter(code => {
    const [w, s, e, n] = COUNTRY_BOUNDS[code];
    return w <= bounds.east && e >= bounds.west && s <= bounds.north && n >= bounds.south;
  });
}

export function useMapData() {
  const detailDataMap = useMapStore((s) => s.detailData);
  const overviewDataMap = useMapStore((s) => s.overviewData);

  useEffect(() => {
    const { setLoading, overviewData } = useMapStore.getState();
    const toLoad = enabledCountries.filter(c => !overviewData[c]);

    if (toLoad.length === 0) {
      setLoading(false);
      return;
    }

    // In PMTiles mode the tiles draw the map and `lib/plzIndex` answers the
    // lookups; the overview GeoJSON (7 MB) is read by the region list alone.
    // Blocking the whole sidebar behind it meant a phone stared at a skeleton
    // while it downloaded. It still loads, in the background, and the region
    // list fills in when it arrives.
    setLoading(USE_PMTILES ? false : true);

    const initialBounds = { west: -2, south: 44, east: 20, north: 56 };
    const priority = toLoad.filter(code => {
      const [w, s, e, n] = COUNTRY_BOUNDS[code];
      return w <= initialBounds.east && e >= initialBounds.west &&
             s <= initialBounds.north && n >= initialBounds.south;
    });
    const deferred = toLoad.filter(c => !priority.includes(c));

    const loadBatch = async (codes: CountryCode[]) => {
      await Promise.all(codes.map(async (code) => {
        const config = countries[code];
        const data = await fetchViaWorker(`${config.overviewPath}?v=${DATA_VERSION}`);
        useMapStore.getState().setOverviewData(code, data);
      }));
    };

    loadBatch(priority)
      .then(() => {
        useMapStore.getState().setLoading(false);
        if (deferred.length > 0) loadBatch(deferred);
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          console.error('Failed to load overview data:', err);
          useMapStore.getState().setLoading(false);
        }
      });
  }, []);

  return {
    detailDataMap: detailDataMap as Partial<Record<CountryCode, FeatureCollection>>,
    overviewDataMap: overviewDataMap as Partial<Record<CountryCode, FeatureCollection>>,
  };
}
