'use client';

import { useMemo } from 'react';
import { Source, Layer } from 'react-map-gl/maplibre';
import { RouteMarkers } from './RouteMarkers';
import { CountryBorders } from './CountryBorders';
import type { Feature, FeatureCollection, Point, Position } from 'geojson';
import type { CountryCode } from '@/types/country';
import { splitRouteLine } from '@/lib/legEconomics';
import { useMapStore } from '@/store/mapStore';
import { useRouteStore } from '@/store/routeStore';
import { useThemeStore } from '@/store/themeStore';
import { countries, enabledCountries } from '@/config/countries';
import {
  buildRegionColorExpression,
  getRegionColorFaded,
  setCountryHueContext,
  setColorBlindMode,
} from '@/lib/colors';

interface PlzLayersProps {
  detailDataMap: Partial<Record<CountryCode, FeatureCollection>>;
  overviewDataMap: Partial<Record<CountryCode, FeatureCollection>>;
  highlightedPlz: string | null;
}

function computeCentroids(data: FeatureCollection): FeatureCollection<Point> {
  const features: Feature<Point>[] = [];
  for (const f of data.features) {
    const geom = f.geometry;
    if (!geom || !('coordinates' in geom)) continue;
    let sumLng = 0, sumLat = 0, count = 0;
    const walk = (coords: unknown[]) => {
      if (typeof coords[0] === 'number') {
        sumLng += coords[0] as number;
        sumLat += coords[1] as number;
        count++;
      } else {
        for (const c of coords) walk(c as unknown[]);
      }
    };
    walk(geom.coordinates as unknown[]);
    if (count > 0) {
      features.push({
        type: 'Feature',
        properties: { ...f.properties },
        geometry: { type: 'Point', coordinates: [sumLng / count, sumLat / count] as Position },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

function computeOverviewPoints(data: FeatureCollection): FeatureCollection<Point> {
  const features: Feature<Point>[] = [];
  for (const f of data.features) {
    const centroid = f.properties?.centroid as [number, number] | undefined;
    if (centroid) {
      features.push({
        type: 'Feature',
        properties: { ...f.properties },
        geometry: { type: 'Point', coordinates: centroid },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}


export function PlzLayers({
  detailDataMap,
  overviewDataMap,
  highlightedPlz,
}: PlzLayersProps) {
  const hoveredFeatureId = useMapStore((s) => s.hoveredFeatureId);
  const hiddenCountries = useMapStore((s) => s.hiddenCountries);
  const routes = useRouteStore((s) => s.routes);
  const dark = useThemeStore((s) => s.dark);
  const colorBlind = useThemeStore((s) => s.colorBlind);

  return (
    <>
      <CountryBorders dark={dark} />
      {enabledCountries.map((code) => (
        <CountryLayers
          key={code}
          code={code}
          visible={!hiddenCountries.has(code)}
          detailData={detailDataMap[code] ?? null}
          overviewData={overviewDataMap[code] ?? null}
          hoveredFeatureId={hoveredFeatureId}
          highlightedPlz={highlightedPlz}
          routes={routes}
          dark={dark}
          colorBlind={colorBlind}
        />
      ))}
      {routes
        .filter((r) => r.visible && r.geometry)
        .map((r) => (
          <Source
            key={`route-line-${r.id}`}
            id={`route-line-${r.id}`}
            type="geojson"
            data={{
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: r.geometry!.coordinates },
            }}
          >
            <Layer id={`route-line-glow-${r.id}`} type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': r.color, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 8, 8, 14, 14, 20], 'line-blur': ['interpolate', ['linear'], ['zoom'], 3, 6, 8, 10, 14, 14], 'line-opacity': 0.15 }} />
            <Layer id={`route-line-border-${r.id}`} type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': dark ? '#1a1a1a' : '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 5, 8, 7, 14, 9], 'line-opacity': 0.9 }} />
            <Layer id={`route-line-fill-${r.id}`} type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': r.color, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 3, 8, 4, 14, 5], 'line-opacity': 1 }} />
          </Source>
        ))}

      {/* The empty running, dashed over the solid line.
          A route drawn as one stroke hides the thing its margin lives in:
          the approach to the first car and the run home after the last drop
          earn nothing and burn the same diesel. Drawn ON TOP of the solid
          line rather than instead of it, so the route still reads as one
          continuous thing and the dashes say "this part is deadhead". */}
      {routes
        .filter((r) => r.visible && r.geometry && r.stops.some((s) => s.kind))
        .map((r) => {
          const cut = splitRouteLine(r.geometry!.coordinates, r.stops);
          if (!cut || cut.empty.length === 0) return null;
          return (
            <Source
              key={`route-empty-${r.id}`}
              id={`route-empty-${r.id}`}
              type="geojson"
              data={{
                type: 'FeatureCollection',
                features: cut.empty.map((coords) => ({
                  type: 'Feature' as const,
                  properties: {},
                  geometry: { type: 'LineString' as const, coordinates: coords },
                })),
              }}
            >
              <Layer
                id={`route-empty-line-${r.id}`}
                type="line"
                layout={{ 'line-cap': 'butt', 'line-join': 'round' }}
                paint={{
                  'line-color': dark ? '#1a1a1a' : '#ffffff',
                  'line-width': ['interpolate', ['linear'], ['zoom'], 3, 3, 8, 4, 14, 5],
                  'line-dasharray': [1.5, 1.5],
                  'line-opacity': 0.95,
                }}
              />
            </Source>
          );
        })}

      <RouteMarkers />
    </>
  );
}

interface CountryLayersProps {
  code: CountryCode;
  visible: boolean;
  detailData: FeatureCollection | null;
  overviewData: FeatureCollection | null;
  hoveredFeatureId: string | null;
  highlightedPlz: string | null;
  routes: { id: string; color: string; plzCodes: string[]; visible: boolean }[];
  dark: boolean;
  colorBlind: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function CountryLayers({
  code,
  visible,
  detailData,
  overviewData,
  hoveredFeatureId,
  highlightedPlz,
  routes,
  dark,
  colorBlind,
}: CountryLayersProps) {
  const config = countries[code];
  const threshold = config.overviewZoomThreshold;
  const dpk = config.detailPropertyKey;
  const opk = config.overviewPropertyKey;
  const vis = visible ? 'visible' : 'none';

  setCountryHueContext(code);
  setColorBlindMode(colorBlind);

  const plz2Codes = useMemo(() => {
    if (!overviewData) return [];
    const set = new Set<string>();
    for (const f of overviewData.features) set.add(String(f.properties?.[opk] ?? ''));
    return Array.from(set);
  }, [overviewData, opk]);

  const allPlz2Codes = useMemo(() => {
    if (!detailData) return [];
    const set = new Set<string>();
    for (const f of detailData.features) set.add(String(f.properties?.plz2 ?? ''));
    return Array.from(set);
  }, [detailData]);

  const plz5LabelPoints = useMemo(() => detailData ? computeCentroids(detailData) : null, [detailData]);
  const plz2LabelPoints = useMemo(() => overviewData ? computeOverviewPoints(overviewData) : null, [overviewData]);

  // `colorBlind` is a cache key: the colour helpers read a module-level mode
  // that `setColorBlindMode` flips, so the expression has to be rebuilt when
  // it changes even though it is not referenced here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plz2FillColor = useMemo(() => buildRegionColorExpression(plz2Codes, opk), [plz2Codes, opk, colorBlind]);

  const plz5FillColor = useMemo(() => {
    const visibleRoutes = routes.filter((r) => r.visible && r.plzCodes.length > 0);
    const fallback = dark ? '#1e1e1e' : '#f0f0f0';
    const fadedPairs = allPlz2Codes.flatMap((c) => [c, getRegionColorFaded(c, dark)]);
    const fadedExpr = fadedPairs.length > 0 ? ['match', ['get', 'plz2'], ...fadedPairs, fallback] : fallback;

    if (visibleRoutes.length === 0) return fadedExpr;

    const pairs: unknown[] = [];
    const seen = new Set<string>();
    for (const route of visibleRoutes) {
      for (const plz of route.plzCodes) {
        const parts = plz.split(':');
        const cc = parts.length > 1 ? parts[0] : '';
        const plzCode = parts.length > 1 ? parts[1] : parts[0];
        if (cc && cc !== code) continue;
        if (seen.has(plzCode)) continue;
        seen.add(plzCode);
        pairs.push(plzCode, route.color);
      }
    }
    if (pairs.length === 0) return fadedExpr;
    return ['match', ['get', dpk], ...pairs, fadedExpr];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, dpk, code, allPlz2Codes, dark, colorBlind]);

  const plz5FillOpacity = useMemo(() => {
    const visibleRoutes = routes.filter((r) => r.visible && r.plzCodes.length > 0);
    if (visibleRoutes.length === 0) return 0.65;
    const assigned = visibleRoutes.flatMap((r) => r.plzCodes
      .filter(p => { const parts = p.split(':'); return parts.length === 1 || parts[0] === code; })
      .map(p => p.includes(':') ? p.split(':')[1] : p)
    );
    if (assigned.length === 0) return 0.5;
    const unique = [...new Set(assigned)];
    return ['match', ['get', dpk], ...unique.flatMap((plz) => [plz, 0.7]), 0.5];
  }, [routes, dpk, code]);

  const hoveredPlz2 = hoveredFeatureId && hoveredFeatureId.length >= 2 ? hoveredFeatureId.slice(0, 2) : null;

  const hoverFilter = hoveredFeatureId ? ['==', ['get', dpk], hoveredFeatureId] : ['==', ['get', dpk], ''];
  const neighborFilter = hoveredPlz2 ? ['==', ['get', 'plz2'], hoveredPlz2] : ['==', ['get', 'plz2'], ''];
  // "de:27576" -> only the DE layer matches 27576. Passing the bare code made
  // every country's layer light up its own area with those digits.
  const highlightedHere =
    highlightedPlz && highlightedPlz.startsWith(`${code}:`)
      ? highlightedPlz.slice(code.length + 1)
      : null;
  const highlightFilter = highlightedHere
    ? ['==', ['get', dpk], highlightedHere]
    : ['==', ['get', dpk], ''];

  return (
    <>
      {overviewData && (
        <Source id={`plz2-source-${code}`} type="geojson" data={overviewData}>
          <Layer id={`plz2-fill-${code}`} type="fill-extrusion" minzoom={0} maxzoom={threshold + 0.5}
            layout={{ visibility: vis }}
            paint={{
              'fill-extrusion-color': plz2FillColor as any,
              'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 3, 8000, 5, 4000, 7, 1500, 9, 200] as any,
              'fill-extrusion-base': 0,
              'fill-extrusion-opacity': dark ? 0.75 : 0.65,
            }} />
          <Layer id={`plz2-outline-${code}`} type="line" minzoom={0} maxzoom={threshold + 0.5}
            layout={{ visibility: vis }}
            paint={{ 'line-color': dark ? '#888888' : '#555555', 'line-width': 1.5 }} />
        </Source>
      )}
      {plz2LabelPoints && (
        <Source id={`plz2-label-source-${code}`} type="geojson" data={plz2LabelPoints}>
          <Layer id={`plz2-labels-${code}`} type="symbol" minzoom={5} maxzoom={threshold + 0.5}
            layout={{ visibility: vis, 'text-field': ['concat', ['get', opk], '\n', ['get', 'label']] as any, 'text-size': ['interpolate', ['linear'], ['zoom'], 5, 10, 8, 14] as any, 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'], 'text-line-height': 1.2 as any }}
            paint={{ 'text-color': dark ? '#e0e0e0' : '#222222', 'text-halo-color': dark ? 'rgba(0,0,0,0.8)' : '#ffffff', 'text-halo-width': 2 }} />
          {config.detailLabelMinZoom > threshold && (
            <Layer id={`plz2-labels-detail-${code}`} type="symbol" minzoom={threshold} maxzoom={24}
              layout={{ visibility: vis, 'text-field': ['get', opk] as any, 'text-size': ['interpolate', ['linear'], ['zoom'], 9, 22, 12, 40, 15, 60] as any, 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'], 'text-allow-overlap': true, 'text-ignore-placement': true }}
              paint={{ 'text-color': dark ? '#ffffff' : '#000000', 'text-opacity': dark ? 0.3 : 0.2, 'text-halo-color': dark ? '#000000' : '#ffffff', 'text-halo-width': 1, 'text-halo-blur': 1 }} />
          )}
        </Source>
      )}
      {detailData && (
        <Source id={`plz5-source-${code}`} type="geojson" data={detailData}>
          <Layer id={`plz5-fill-${code}`} type="fill" minzoom={threshold} maxzoom={24}
            layout={{ visibility: vis }}
            paint={{ 'fill-color': plz5FillColor as any, 'fill-opacity': plz5FillOpacity as any }} />
          <Layer id={`plz5-outline-${code}`} type="line" minzoom={threshold} maxzoom={24}
            layout={{ visibility: vis }}
            paint={{ 'line-color': dark ? '#555555' : '#aaaaaa', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.3, 12, 0.8] as any }} />
          <Layer id={`plz5-neighbor-${code}`} type="line" minzoom={threshold} maxzoom={24}
            layout={{ visibility: vis }}
            filter={neighborFilter as any}
            paint={{ 'line-color': '#3b82f6', 'line-width': 1.5, 'line-opacity': 0.6 }} />
          <Layer id={`plz5-hover-${code}`} type="fill" minzoom={threshold} maxzoom={24}
            layout={{ visibility: vis }}
            filter={hoverFilter as any}
            paint={{ 'fill-color': '#ffcc00', 'fill-opacity': 0.5 }} />
          <Layer id={`plz5-highlight-${code}`} type="fill" minzoom={threshold} maxzoom={24}
            layout={{ visibility: vis }}
            filter={highlightFilter as any}
            paint={{ 'fill-color': '#ff4444', 'fill-opacity': 0.6 }} />
        </Source>
      )}
      {plz5LabelPoints && (
        <Source id={`plz5-label-source-${code}`} type="geojson" data={plz5LabelPoints}>
          <Layer id={`plz5-labels-${code}`} type="symbol" minzoom={config.detailLabelMinZoom} maxzoom={24}
            layout={{ visibility: vis, 'text-field': ['concat', ['get', dpk], '\n', ['get', 'name']] as any, 'text-size': ['interpolate', ['linear'], ['zoom'], config.detailLabelMinZoom, 9, config.detailLabelMinZoom + 2, 12, config.detailLabelMinZoom + 4, 16, 18, 28] as any, 'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'], 'text-padding': 2 as any }}
            paint={{ 'text-color': dark ? '#e0e0e0' : '#333333', 'text-halo-color': dark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)', 'text-halo-width': 1.5 }} />
        </Source>
      )}
    </>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */
