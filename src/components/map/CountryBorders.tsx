'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { Layer, Source } from 'react-map-gl/maplibre';
import {
  getCountryBorders,
  loadCountryBorders,
  subscribeCountryBorders,
} from '@/lib/countryAtCoord';

/**
 * The dashed country outlines.
 *
 * Both map renderers carried a verbatim copy of this, each with its own fetch
 * of `borders.geojson` - the same duplication that let the stop markers drift
 * apart. There is one component now, and it shares the loaded outlines with
 * `countryAtCoord`, which uses them to work out which country the map is
 * looking at.
 */
export function CountryBorders({ dark }: { dark: boolean }) {
  const data = useSyncExternalStore(subscribeCountryBorders, getCountryBorders, () => null);

  useEffect(() => {
    loadCountryBorders();
  }, []);

  if (!data) return null;

  return (
    <Source id="country-borders" type="geojson" data={data}>
      <Layer
        id="country-borders-glow"
        type="line"
        paint={{
          'line-color': dark ? '#000000' : '#1e293b',
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 6, 6, 10, 10, 14],
          'line-blur': ['interpolate', ['linear'], ['zoom'], 3, 4, 6, 6, 10, 8],
          'line-opacity': 0.4,
        }}
      />
      <Layer
        id="country-borders-line"
        type="line"
        paint={{
          'line-color': dark ? '#e2e8f0' : '#0f172a',
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1, 6, 2, 10, 3],
          'line-opacity': 0.9,
          'line-dasharray': [4, 2],
        }}
      />
    </Source>
  );
}
