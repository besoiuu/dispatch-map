'use client';

import { useCallback, useEffect, useRef, useMemo } from 'react';
import Map, {
  NavigationControl,
  type MapRef,
  type MapLayerMouseEvent,
} from 'react-map-gl/maplibre';
import type { FeatureCollection } from 'geojson';
import type { CountryCode } from '@/types/country';
import { MAP_STYLE_LIGHT, MAP_STYLE_DARK } from '@/config/mapStyle';
import { countries, enabledCountries } from '@/config/countries';
import { useMapStore } from '@/store/mapStore';
import { useRouteStore } from '@/store/routeStore';
import { useThemeStore } from '@/store/themeStore';
import { PlzLayers } from './PlzLayers';
import { MapTooltip } from './MapTooltip';

interface MapViewProps {
  detailDataMap: Partial<Record<CountryCode, FeatureCollection>>;
  overviewDataMap: Partial<Record<CountryCode, FeatureCollection>>;
}

export function MapView({ detailDataMap, overviewDataMap }: MapViewProps) {
  const mapRef = useRef<MapRef>(null);
  const activeCountry = useMapStore((s) => s.activeCountry);
  const setZoom = useMapStore((s) => s.setZoom);
  const setHoveredFeatureId = useMapStore((s) => s.setHoveredFeatureId);
  const highlightedPlz = useMapStore((s) => s.highlightedPlz);
  const addPlzToActiveRoute = useRouteStore((s) => s.addPlzToActiveRoute);
  const getRouteForPlz = useRouteStore((s) => s.getRouteForPlz);
  const removePlzFromRoute = useRouteStore((s) => s.removePlzFromRoute);
  const addWaypoint = useRouteStore((s) => s.addWaypoint);
  const activeRouteId = useRouteStore((s) => s.activeRouteId);

  const dark = useThemeStore((s) => s.dark);
  const config = countries[activeCountry];

  const handleClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const map = mapRef.current?.getMap();
      if (!map) return;

      // Try detail layers first (PLZ selection)
      const plz5Layers = enabledCountries.map((c) => `plz5-fill-${c}`).filter((l) => map.getLayer(l));
      if (plz5Layers.length > 0) {
        const features = map.queryRenderedFeatures(e.point, { layers: plz5Layers });
        if (features.length > 0) {
          const layerId = features[0].layer?.id || '';
          const country = layerId.replace('plz5-fill-', '');
          const rawPlz = String(features[0].properties?.plz5 ?? '');
          if (!rawPlz) return;

          const plz = `${country}:${rawPlz}`;
          const existingRoute = getRouteForPlz(plz);
          if (existingRoute) {
            removePlzFromRoute(existingRoute.id, plz);
          } else if (activeRouteId) {
            addPlzToActiveRoute(plz);
          }
          return;
        }
      }

      // Fall back to overview layers (zoom to region)
      const plz2Layers = enabledCountries.map((c) => `plz2-fill-${c}`).filter((l) => map.getLayer(l));
      if (plz2Layers.length === 0) return;
      const features = map.queryRenderedFeatures(e.point, { layers: plz2Layers });
      if (features.length > 0) {
        const props = features[0].properties;
        if (props?.bbox) {
          const bbox = JSON.parse(props.bbox);
          map.fitBounds(bbox, { padding: 40, maxZoom: 10 });
        }
      }
    },
    [activeRouteId, addPlzToActiveRoute, getRouteForPlz, removePlzFromRoute]
  );

  const handleContextMenu = useCallback(
    (e: MapLayerMouseEvent) => {
      if (!activeRouteId) return;
      e.preventDefault();
      const { lng, lat } = e.lngLat;
      addWaypoint(activeRouteId, [lng, lat]);
    },
    [activeRouteId, addWaypoint]
  );

  // Long-press for mobile waypoint adding
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressCoord = useRef<{ lng: number; lat: number } | null>(null);

  const handleTouchStart = useCallback((e: { lngLat: { lng: number; lat: number } }) => {
    longPressCoord.current = e.lngLat;
    longPressTimer.current = setTimeout(() => {
      if (!activeRouteId || !longPressCoord.current) return;
      addWaypoint(activeRouteId, [longPressCoord.current.lng, longPressCoord.current.lat]);
      longPressCoord.current = null;
    }, 600);
  }, [activeRouteId, addWaypoint]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressCoord.current = null;
  }, []);

  const throttleRef = useRef(0);
  const handleMouseMove = useCallback(
    (e: MapLayerMouseEvent) => {
      const now = performance.now();
      if (now - throttleRef.current < 30) return;
      throttleRef.current = now;

      const map = mapRef.current?.getMap();
      if (!map) return;

      const zoom = map.getZoom();
      const prefix = zoom >= config.overviewZoomThreshold ? 'plz5-fill' : 'plz2-fill';
      const layerIds = enabledCountries.map((c) => `${prefix}-${c}`).filter((l) => map.getLayer(l));

      if (layerIds.length === 0) return;

      const features = map.queryRenderedFeatures(e.point, {
        layers: layerIds,
      });

      if (features.length > 0) {
        map.getCanvas().style.cursor = 'pointer';
        const key =
          zoom >= config.overviewZoomThreshold
            ? config.detailPropertyKey
            : config.overviewPropertyKey;
        const featureName = String(features[0].properties?.name ?? features[0].properties?.label ?? '');
        setHoveredFeatureId(String(features[0].properties?.[key] ?? ''), featureName);
      } else {
        map.getCanvas().style.cursor = '';
        setHoveredFeatureId(null, null);
      }
    },
    [config, setHoveredFeatureId]
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredFeatureId(null);
  }, [setHoveredFeatureId]);

  const handleZoomEnd = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map) setZoom(map.getZoom());
  }, [setZoom]);

  useEffect(() => {
    const handler = (e: Event) => {
      const map = mapRef.current?.getMap();
      if (!map) return;
      const { bbox } = (e as CustomEvent).detail;
      if (bbox) {
        map.fitBounds(
          [[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
          { padding: 40, maxZoom: 13 }
        );
      }
    };
    window.addEventListener('map:flyto', handler);

    const zoomHandler = (e: Event) => {
      const map = mapRef.current?.getMap();
      if (!map) return;
      const { zoom: targetZoom } = (e as CustomEvent).detail;
      if (targetZoom != null) {
        map.easeTo({ zoom: targetZoom, duration: 600 });
      }
    };
    window.addEventListener('map:setzoom', zoomHandler);

    const keyHandler = (e: KeyboardEvent) => {
      const map = mapRef.current?.getMap();
      if (!map) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      const PAN = 100;
      switch (e.key.toLowerCase()) {
        case 'w': map.panBy([0, -PAN], { duration: 200 }); break;
        case 'a': map.panBy([-PAN, 0], { duration: 200 }); break;
        case 's': map.panBy([0, PAN], { duration: 200 }); break;
        case 'd': map.panBy([PAN, 0], { duration: 200 }); break;
        default: return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', keyHandler);

    return () => {
      window.removeEventListener('map:flyto', handler);
      window.removeEventListener('map:setzoom', zoomHandler);
      window.removeEventListener('keydown', keyHandler);
    };
  }, []);

  return (
    <Map
      ref={mapRef}
      mapStyle={dark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT}
      initialViewState={{
        longitude: 8.5,
        latitude: 51.0,
        zoom: 5.5,
        pitch: 30,
      }}
      style={{ width: '100%', height: '100%' }}
      minZoom={3}
      maxZoom={18}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onZoomEnd={handleZoomEnd}
      interactiveLayerIds={enabledCountries.flatMap((c) => {
        if (useMapStore.getState().hiddenCountries.has(c)) return [];
        return [
          ...(detailDataMap[c] ? [`plz5-fill-${c}`] : []),
          ...(overviewDataMap[c] ? [`plz2-fill-${c}`] : []),
        ];
      })}
    >
      <NavigationControl position="top-left" />
      <PlzLayers
        detailDataMap={detailDataMap}
        overviewDataMap={overviewDataMap}
        highlightedPlz={highlightedPlz}
      />
      <MapTooltip />
    </Map>
  );
}

export { type MapViewProps };
