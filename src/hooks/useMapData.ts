'use client';

import { useEffect } from 'react';
import { useMapStore } from '@/store/mapStore';
import { countries, enabledCountries } from '@/config/countries';
import type { CountryCode } from '@/types/country';
import type { FeatureCollection } from 'geojson';

const DATA_VERSION = 15;

const DETAIL_PREFETCH_ZOOM = 7;

const COUNTRY_BOUNDS: Record<CountryCode, [number, number, number, number]> = {
  de: [5.8, 47.3, 15.1, 55.0],
  nl: [3.3, 50.7, 7.2, 53.6],
  fr: [-5.2, 41.3, 8.3, 51.1],
  be: [2.5, 49.5, 6.4, 51.5],
  dk: [8.0, 54.5, 15.2, 57.8],
  at: [9.5, 46.3, 17.2, 49.0],
  cz: [12.0, 48.5, 19.0, 51.1],
  sk: [16.8, 47.7, 22.6, 49.6],
  pl: [14.1, 49.0, 24.2, 54.9],
  hu: [16.0, 45.7, 22.9, 48.6],
  ro: [20.2, 43.6, 29.7, 48.3],
  it: [6.6, 36.0, 18.5, 47.1],
};

const detailLoadingSet = new Set<CountryCode>();

export function loadDetailForCountries(codes: CountryCode[]) {
  const store = useMapStore.getState();
  const toLoad = codes.filter(c => !store.detailData[c] && !detailLoadingSet.has(c));
  if (toLoad.length === 0) return;

  for (const code of toLoad) {
    detailLoadingSet.add(code);
    const config = countries[code];
    fetch(`${config.detailPath}?v=${DATA_VERSION}`)
      .then(r => r.json())
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
    const controller = new AbortController();
    const { setOverviewData, setLoading, overviewData } = useMapStore.getState();
    const toLoad = enabledCountries.filter(c => !overviewData[c]);

    if (toLoad.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);

    Promise.all(
      toLoad.map(async (code) => {
        const config = countries[code];
        const data = await fetch(`${config.overviewPath}?v=${DATA_VERSION}`, {
          signal: controller.signal,
        }).then(r => r.json());
        useMapStore.getState().setOverviewData(code, data);
      })
    )
      .then(() => useMapStore.getState().setLoading(false))
      .catch(err => {
        if (err.name !== 'AbortError') {
          console.error('Failed to load overview data:', err);
          useMapStore.getState().setLoading(false);
        }
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    detailDataMap: detailDataMap as Partial<Record<CountryCode, FeatureCollection>>,
    overviewDataMap: overviewDataMap as Partial<Record<CountryCode, FeatureCollection>>,
  };
}
