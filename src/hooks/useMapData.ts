'use client';

import { useEffect } from 'react';
import { useMapStore } from '@/store/mapStore';
import { countries, enabledCountries } from '@/config/countries';
import type { CountryCode } from '@/types/country';
import type { FeatureCollection } from 'geojson';

const DATA_VERSION = 6;

export function useMapData() {
  const detailDataMap = useMapStore((s) => s.detailData);
  const overviewDataMap = useMapStore((s) => s.overviewData);
  const setDetailData = useMapStore((s) => s.setDetailData);
  const setOverviewData = useMapStore((s) => s.setOverviewData);
  const setLoading = useMapStore((s) => s.setLoading);

  useEffect(() => {
    const controller = new AbortController();
    const toLoad = enabledCountries.filter(
      (c) => !detailDataMap[c] || !overviewDataMap[c]
    );

    if (toLoad.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);

    Promise.all(
      toLoad.map(async (code) => {
        const config = countries[code];
        const [overview, detail] = await Promise.all([
          fetch(`${config.overviewPath}?v=${DATA_VERSION}`, { signal: controller.signal }).then((r) => r.json()),
          fetch(`${config.detailPath}?v=${DATA_VERSION}`, { signal: controller.signal }).then((r) => r.json()),
        ]);
        setOverviewData(code, overview);
        setDetailData(code, detail);
      })
    )
      .then(() => setLoading(false))
      .catch((err) => {
        if (err.name !== 'AbortError') {
          console.error('Failed to load map data:', err);
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [detailDataMap, overviewDataMap, setDetailData, setOverviewData, setLoading]);

  return {
    detailDataMap: detailDataMap as Partial<Record<CountryCode, FeatureCollection>>,
    overviewDataMap: overviewDataMap as Partial<Record<CountryCode, FeatureCollection>>,
  };
}
