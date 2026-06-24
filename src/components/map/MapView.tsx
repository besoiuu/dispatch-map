'use client';

import { useCallback, useEffect, useRef, useMemo, useState } from 'react';
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
import { loadDetailForCountries, getVisibleCountries } from '@/hooks/useMapData';
import { PlzLayers } from './PlzLayers';
import { PlzLayersPMTiles } from './PlzLayersPMTiles';
import { MapTooltip } from './MapTooltip';
import dynamic from 'next/dynamic';
import type { ContextMenuState } from './ContextMenu';
import type { TileMetadata } from '@/hooks/useTileMetadata';

const ContextMenu = dynamic(() => import('./ContextMenu').then((m) => m.ContextMenu), { ssr: false });

interface MapViewProps {
  detailDataMap: Partial<Record<CountryCode, FeatureCollection>>;
  overviewDataMap: Partial<Record<CountryCode, FeatureCollection>>;
  usePMTiles?: boolean;
  tileMetadata?: TileMetadata | null;
}

export function MapView({ detailDataMap, overviewDataMap, usePMTiles, tileMetadata }: MapViewProps) {
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
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const handleClick = useCallback(
    (e: MapLayerMouseEvent) => {
      setContextMenu(null);
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
      e.preventDefault();
      const map = mapRef.current?.getMap();
      const { lng, lat } = e.lngLat;

      let plz: string | undefined;
      let plzName: string | undefined;
      let country: string | undefined;
      let isDetail = false;

      if (map) {
        const plz5Layers = enabledCountries.map((c) => `plz5-fill-${c}`).filter((l) => map.getLayer(l));
        if (plz5Layers.length > 0) {
          const features = map.queryRenderedFeatures(e.point, { layers: plz5Layers });
          if (features.length > 0) {
            const layerId = features[0].layer?.id || '';
            country = layerId.replace('plz5-fill-', '').toUpperCase();
            plz = String(features[0].properties?.plz5 ?? '') || undefined;
            plzName = String(features[0].properties?.name ?? '') || undefined;
            isDetail = true;
          }
        }
        if (!plz) {
          const plz2Layers = enabledCountries.map((c) => `plz2-fill-${c}`).filter((l) => map.getLayer(l));
          if (plz2Layers.length > 0) {
            const features = map.queryRenderedFeatures(e.point, { layers: plz2Layers });
            if (features.length > 0) {
              const layerId = features[0].layer?.id || '';
              country = layerId.replace('plz2-fill-', '').toUpperCase();
              plz = String(features[0].properties?.plz2 ?? '') || undefined;
              plzName = String(features[0].properties?.label ?? features[0].properties?.name ?? '') || undefined;
            }
          }
        }
      }

      setContextMenu({ x: e.point.x, y: e.point.y, lngLat: { lng, lat }, plz, plzName, country, isDetail });
    },
    []
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
  const lastHoverId = useRef<string | null>(null);
  const handleMouseMove = useCallback(
    (e: MapLayerMouseEvent) => {
      const now = performance.now();
      if (now - throttleRef.current < 16) return;
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
        const layerId = features[0].layer?.id || '';
        const country = layerId.split('-').pop() || '';
        const key =
          zoom >= config.overviewZoomThreshold
            ? config.detailPropertyKey
            : config.overviewPropertyKey;
        const featureId = String(features[0].properties?.[key] ?? '');
        const featureName = String(features[0].properties?.name ?? features[0].properties?.label ?? '');

        if (featureId !== lastHoverId.current) {
          lastHoverId.current = featureId;
          const dpk = config.detailPropertyKey;
          const plz2 = featureId.length >= 2 ? featureId.slice(0, 2) : null;
          for (const c of enabledCountries) {
            const hoverLayer = `plz5-hover-${c}`;
            const neighborLayer = `plz5-neighbor-${c}`;
            if (map.getLayer(hoverLayer)) {
              map.setFilter(hoverLayer, ['==', ['get', dpk], featureId]);
            }
            if (map.getLayer(neighborLayer)) {
              map.setFilter(neighborLayer, plz2 ? ['==', ['get', 'plz2'], plz2] : ['==', ['get', 'plz2'], '']);
            }
          }
          setHoveredFeatureId(featureId, featureName, country.toUpperCase());
        }
      } else {
        if (lastHoverId.current !== null) {
          lastHoverId.current = null;
          const dpk = config.detailPropertyKey;
          for (const c of enabledCountries) {
            const hoverLayer = `plz5-hover-${c}`;
            const neighborLayer = `plz5-neighbor-${c}`;
            if (map.getLayer(hoverLayer)) {
              map.setFilter(hoverLayer, ['==', ['get', dpk], '']);
            }
            if (map.getLayer(neighborLayer)) {
              map.setFilter(neighborLayer, ['==', ['get', 'plz2'], '']);
            }
          }
          setHoveredFeatureId(null, null, null);
        }
        map.getCanvas().style.cursor = '';
      }
    },
    [config, setHoveredFeatureId]
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredFeatureId(null);
  }, [setHoveredFeatureId]);

  const handleMoveEnd = useCallback(() => {
    setContextMenu(null);
    const map = mapRef.current?.getMap();
    if (!map) return;

    const zoom = map.getZoom();
    const rounded = Math.round(zoom * 10) / 10;
    if (rounded !== useMapStore.getState().zoom) setZoom(rounded);

    const b = map.getBounds();
    const visible = getVisibleCountries(
      { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() },
      zoom
    );
    if (visible.length > 0) {
      loadDetailForCountries(visible);
    }
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
      const { zoom: targetZoom, center } = (e as CustomEvent).detail;
      if (targetZoom == null) return;
      const opts: { zoom: number; duration: number; center?: [number, number] } = { zoom: targetZoom, duration: 600 };
      if (center && targetZoom >= 9) {
        const mapCenter = map.getCenter();
        const [cLng, cLat] = center;
        const dist = Math.abs(mapCenter.lng - cLng) + Math.abs(mapCenter.lat - cLat);
        if (dist > 3) opts.center = center;
      }
      map.easeTo(opts);
    };
    window.addEventListener('map:setzoom', zoomHandler);

    const keysDown = new Set<string>();
    let panFrame = 0;
    const PAN_SPEED = 4;
    const PAN_MAX = 12;
    const ROT_SPEED = 0.3;
    const ROT_MAX = 2.0;
    let panVelocity = 0;
    let rotVelocity = 0;

    const panLoop = () => {
      const map = mapRef.current?.getMap();
      if (!map || keysDown.size === 0) {
        panVelocity = 0;
        rotVelocity = 0;
        panFrame = 0;
        return;
      }
      const hasPan = keysDown.has('w') || keysDown.has('a') || keysDown.has('s') || keysDown.has('d');
      const hasRot = keysDown.has('q') || keysDown.has('e');
      if (hasPan) panVelocity = Math.min(panVelocity + PAN_SPEED * 0.15, PAN_MAX);
      else panVelocity = 0;
      if (hasRot) rotVelocity = Math.min(rotVelocity + ROT_SPEED * 0.15, ROT_MAX);
      else rotVelocity = 0;

      let dx = 0, dy = 0;
      if (keysDown.has('w')) dy -= panVelocity;
      if (keysDown.has('s')) dy += panVelocity;
      if (keysDown.has('a')) dx -= panVelocity;
      if (keysDown.has('d')) dx += panVelocity;
      if (dx !== 0 || dy !== 0) {
        map.panBy([dx, dy], { duration: 0 });
      }
      if (keysDown.has('q')) {
        map.setBearing(map.getBearing() - rotVelocity);
      }
      if (keysDown.has('e')) {
        map.setBearing(map.getBearing() + rotVelocity);
      }
      panFrame = requestAnimationFrame(panLoop);
    };

    const keyDownHandler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      const key = e.key.toLowerCase();
      if (!['w', 'a', 's', 'd', 'q', 'e'].includes(key)) return;
      e.preventDefault();
      if (keysDown.has(key)) return;
      keysDown.add(key);
      if (!panFrame) panFrame = requestAnimationFrame(panLoop);
    };

    const keyUpHandler = (e: KeyboardEvent) => {
      keysDown.delete(e.key.toLowerCase());
      if (keysDown.size === 0) {
        cancelAnimationFrame(panFrame);
        panFrame = 0;
        panVelocity = 0;
      }
    };

    window.addEventListener('keydown', keyDownHandler);
    window.addEventListener('keyup', keyUpHandler);

    return () => {
      window.removeEventListener('map:flyto', handler);
      window.removeEventListener('map:setzoom', zoomHandler);
      window.removeEventListener('keydown', keyDownHandler);
      window.removeEventListener('keyup', keyUpHandler);
      cancelAnimationFrame(panFrame);
    };
  }, []);

  return (
    <Map
      ref={mapRef}
      mapStyle={dark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT}
      preserveDrawingBuffer={true}
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
      onMoveEnd={handleMoveEnd}
      interactiveLayerIds={enabledCountries.flatMap((c) => {
        if (useMapStore.getState().hiddenCountries.has(c)) return [];
        if (usePMTiles) return [`plz5-fill-${c}`, `plz2-fill-${c}`];
        return [
          ...(detailDataMap[c] ? [`plz5-fill-${c}`] : []),
          ...(overviewDataMap[c] ? [`plz2-fill-${c}`] : []),
        ];
      })}
    >
      <NavigationControl position="top-left" />
      {usePMTiles && tileMetadata ? (
        <PlzLayersPMTiles
          tileMetadata={tileMetadata}
          highlightedPlz={highlightedPlz}
        />
      ) : (
        <PlzLayers
          detailDataMap={detailDataMap}
          overviewDataMap={overviewDataMap}
          highlightedPlz={highlightedPlz}
        />
      )}
      <MapTooltip />
      {contextMenu && (
        <ContextMenu state={contextMenu} onClose={() => setContextMenu(null)} />
      )}
    </Map>
  );
}

export { type MapViewProps };
