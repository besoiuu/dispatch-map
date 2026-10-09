'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Map, {
  NavigationControl,
  type MapRef,
  type MapLayerMouseEvent,
  type MapLayerTouchEvent,
} from 'react-map-gl/maplibre';
import type { FeatureCollection } from 'geojson';
import type { CountryCode } from '@/types/country';
import { MAP_STYLE_LIGHT, MAP_STYLE_DARK } from '@/config/mapStyle';
import { countries, enabledCountries } from '@/config/countries';
import { useMapStore } from '@/store/mapStore';
import { useRouteStore } from '@/store/routeStore';
import { useThemeStore } from '@/store/themeStore';
import { useToastStore } from '@/store/toastStore';
import { entryKey } from '@/lib/plzIndex';
import { countryAtCoord } from '@/lib/countryAtCoord';
import { loadDetailForCountries, getVisibleCountries } from '@/hooks/useMapData';
import { PlzLayers } from './PlzLayers';
import { PlzLayersPMTiles } from './PlzLayersPMTiles';
import { MapTooltip } from './MapTooltip';
import dynamic from 'next/dynamic';
import type { ContextMenuState } from './ContextMenu';
import type { TileMetadata } from '@/hooks/useTileMetadata';

const ContextMenu = dynamic(() => import('./ContextMenu').then((m) => m.ContextMenu), { ssr: false });

/** Hold time and the movement a finger is allowed during it. */
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 12;

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
  const setActiveCountry = useMapStore((s) => s.setActiveCountry);
  const highlightedPlz = useMapStore((s) => s.highlightedPlz);
  const addPlzToActiveRoute = useRouteStore((s) => s.addPlzToActiveRoute);
  const getRouteForPlz = useRouteStore((s) => s.getRouteForPlz);
  const removePlzFromRoute = useRouteStore((s) => s.removePlzFromRoute);
  const restoreStop = useRouteStore((s) => s.restoreStop);
  const activeRouteId = useRouteStore((s) => s.activeRouteId);
  const addToast = useToastStore((s) => s.addToast);
  const hiddenCountries = useMapStore((s) => s.hiddenCountries);

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

          const plz = entryKey(country, rawPlz);
          const existingRoute = getRouteForPlz(plz);
          if (existingRoute) {
            // A tap one area off used to be a silent deletion, with undo
            // available only as Ctrl+Z - which no phone has.
            const index = existingRoute.stops.findIndex((st) => st.plz === plz);
            const stop = index >= 0 ? existingRoute.stops[index] : null;
            removePlzFromRoute(existingRoute.id, plz);
            addToast(`${rawPlz} removed from ${existingRoute.name}`, 'info', {
              label: 'Undo',
              onClick: () => {
                if (stop) restoreStop(existingRoute.id, stop, index);
                else addPlzToActiveRoute(plz);
              },
            });
          } else if (activeRouteId) {
            const outcome = addPlzToActiveRoute(plz);
            if (outcome === 'unknown-code') {
              addToast(`${rawPlz} added, but its position is unknown`, 'info');
            }
          } else {
            addToast('Create or select a route first', 'info');
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
    [activeRouteId, addPlzToActiveRoute, getRouteForPlz, removePlzFromRoute, restoreStop, addToast]
  );

  /** Resolves what is under a point and opens the menu there. */
  const openMenuAt = useCallback(
    (point: { x: number; y: number }, lngLat: { lng: number; lat: number }) => {
      const map = mapRef.current?.getMap();
      const { lng, lat } = lngLat;
      // queryRenderedFeatures takes a PointLike; a tuple is one.
      const at: [number, number] = [point.x, point.y];

      let plz: string | undefined;
      let plzName: string | undefined;
      let country: string | undefined;
      let isDetail = false;

      if (map) {
        const plz5Layers = enabledCountries.map((c) => `plz5-fill-${c}`).filter((l) => map.getLayer(l));
        if (plz5Layers.length > 0) {
          const features = map.queryRenderedFeatures(at, { layers: plz5Layers });
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
            const features = map.queryRenderedFeatures(at, { layers: plz2Layers });
            if (features.length > 0) {
              const layerId = features[0].layer?.id || '';
              country = layerId.replace('plz2-fill-', '').toUpperCase();
              plz = String(features[0].properties?.plz2 ?? '') || undefined;
              plzName = String(features[0].properties?.label ?? features[0].properties?.name ?? '') || undefined;
            }
          }
        }
      }

      setContextMenu({ x: point.x, y: point.y, lngLat: { lng, lat }, plz, plzName, country, isDetail });
    },
    []
  );

  const handleContextMenu = useCallback(
    (e: MapLayerMouseEvent) => {
      e.preventDefault();
      openMenuAt({ x: e.point.x, y: e.point.y }, { lng: e.lngLat.lng, lat: e.lngLat.lat });
    },
    [openMenuAt]
  );

  /**
   * Long-press on touch.
   *
   * Two changes from the version that never worked. It cancels on real
   * movement only - a finger drifts a few pixels during any hold, and the old
   * handler cleared the timer on ANY touchmove, so an 800 ms press almost
   * never completed. And it opens the context menu rather than silently
   * dropping a waypoint, which is also the only way that menu is reachable
   * without a right mouse button, since contextmenu does not fire on touch.
   */
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStart = useRef<{ x: number; y: number } | null>(null);

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressStart.current = null;
  }, []);

  const handleTouchStart = useCallback(
    (e: MapLayerTouchEvent) => {
      // A second finger means pinch-zoom, never a press.
      if (e.originalEvent?.touches && e.originalEvent.touches.length > 1) {
        cancelLongPress();
        return;
      }
      const point = { x: e.point.x, y: e.point.y };
      const lngLat = { lng: e.lngLat.lng, lat: e.lngLat.lat };
      longPressStart.current = point;
      longPressTimer.current = setTimeout(() => {
        longPressTimer.current = null;
        longPressStart.current = null;
        navigator.vibrate?.(10);
        openMenuAt(point, lngLat);
      }, LONG_PRESS_MS);
    },
    [cancelLongPress, openMenuAt]
  );

  const handleTouchMove = useCallback(
    (e: MapLayerTouchEvent) => {
      const start = longPressStart.current;
      if (!start) return;
      if (Math.hypot(e.point.x - start.x, e.point.y - start.y) > LONG_PRESS_SLOP) cancelLongPress();
    },
    [cancelLongPress]
  );

  const handleTouchEnd = useCallback(() => cancelLongPress(), [cancelLongPress]);

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
          // Read from the feature, never sliced off the postcode. `plz2` is an
          // administrative region code, and in Austria, Poland and Slovakia it
          // is NOT the first two digits of the postcode: 1939 of 2118 Austrian
          // areas disagree, 2454 of 2484 Polish and 2107 of 2888 Slovak. So
          // slicing highlighted the wrong group of neighbours in those three
          // countries, or none at all - and looked correct everywhere else.
          const plz2 = String(features[0].properties?.plz2 ?? '') || null;
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

    // Nothing wrote `activeCountry` before, so it stayed Germany for ever -
    // which ranked German codes first wherever you were working, and made the
    // zoom pills re-centre on Germany from anywhere. Outside every country's
    // box the previous value is kept rather than guessed at.
    const c = map.getCenter();
    const at = countryAtCoord(c.lng, c.lat);
    if (at && at !== useMapStore.getState().activeCountry) setActiveCountry(at);

    const b = map.getBounds();
    const visible = getVisibleCountries(
      { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() },
      zoom
    );
    if (visible.length > 0) {
      loadDetailForCountries(visible);
    }
  }, [setZoom, setActiveCountry]);

  useEffect(() => {
    const handler = (e: Event) => {
      const map = mapRef.current?.getMap();
      if (!map) return;
      const { bbox, center, zoom } = (e as CustomEvent).detail ?? {};
      if (bbox) {
        map.fitBounds(
          [[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
          { padding: 40, maxZoom: 13 }
        );
      } else if (center) {
        // Search now hands over a point from the postal-code index, because it
        // no longer depends on the detail GeoJSON being loaded to find a
        // polygon to frame.
        map.flyTo({ center, zoom: zoom ?? 11, duration: 800 });
      }
    };
    window.addEventListener('map:flyto', handler);

    // A pin was clicked. The marker reports which stop it is; the position is
    // projected here, because only the map knows where that coordinate is on
    // screen right now.
    const stopMenuHandler = (e: Event) => {
      const map = mapRef.current?.getMap();
      if (!map) return;
      const d = (e as CustomEvent).detail;
      if (!d?.coordinate) return;
      const p = map.project(d.coordinate);
      setContextMenu({
        x: p.x,
        y: p.y,
        lngLat: { lng: d.coordinate[0], lat: d.coordinate[1] },
        stop: {
          routeId: d.routeId,
          routeName: d.routeName,
          stopId: d.stopId,
          label: d.label,
          index: d.index,
        },
      });
    };
    window.addEventListener('map:stopmenu', stopMenuHandler);

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
      window.removeEventListener('map:stopmenu', stopMenuHandler);
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
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMoveEnd={handleMoveEnd}
      interactiveLayerIds={enabledCountries.flatMap((c) => {
        if (hiddenCountries.has(c)) return [];
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
