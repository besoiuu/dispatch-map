import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Route, RouteGeometry, RouteStop } from '@/types/route';
import { getNextRouteColor } from '@/lib/colors';
import { lookupPrefixed } from '@/lib/plzIndex';

interface UndoEntry {
  routeId: string;
  plz: string;
}

export interface AddPlzOptions {
  /** Where the area is. Supplying it creates the stop in the same tick. */
  coordinate?: [number, number];
  label?: string;
  /** What the stop is for, when the caller knows. */
  kind?: RouteStop['kind'];
}

/**
 * Why `addPlzToActiveRoute` reports back: it used to return silently when
 * the code was already assigned, which was indistinguishable from success.
 * Paired with a code that reached `plzCodes` but never became a stop, that
 * produced the worst bug in the app - a selection that vanished and could
 * never be made again, with nothing on screen either time.
 */
export type AddPlzResult = 'added' | 'duplicate' | 'no-route' | 'unknown-code';

interface RouteState {
  routes: Route[];
  activeRouteId: string | null;
  undoStack: UndoEntry[];

  addRoute: (name: string) => void;
  deleteRoute: (id: string) => void;
  renameRoute: (id: string, name: string) => void;
  setActiveRoute: (id: string | null) => void;
  toggleRouteVisibility: (id: string) => void;
  addPlzToActiveRoute: (plz: string, opts?: AddPlzOptions) => AddPlzResult;
  removePlzFromRoute: (routeId: string, plz: string) => void;
  setRouteColor: (id: string, color: string) => void;
  clearRoute: (id: string) => void;
  getRouteForPlz: (plz: string) => Route | undefined;
  undoLastAdd: () => void;
  setRouteGeometry: (id: string, geometry: RouteGeometry | undefined) => void;
  /** What the run earns and what its codes are for, from an incoming link. */
  setRouteBrief: (id: string, brief: { revenue?: number; codeKinds?: Route['codeKinds'] }) => void;
  setRouteCalculating: (id: string, calculating: boolean) => void;
  setStops: (id: string, stops: RouteStop[]) => void;
  reorderStop: (routeId: string, fromIndex: number, toIndex: number) => void;
  removeStop: (routeId: string, stopId: string) => void;
  restoreStop: (routeId: string, stop: RouteStop, index: number) => void;
  moveStop: (routeId: string, stopId: string, coordinate: [number, number]) => void;
  addWaypoint: (routeId: string, coordinate: [number, number], index?: number, label?: string, kind?: RouteStop['kind']) => void;
  restoreRoute: (route: Route, index: number) => void;
  restoreRouteStops: (id: string, plzCodes: string[], stops: RouteStop[], geometry?: RouteGeometry) => void;
}

export const useRouteStore = create<RouteState>()(
  persist(
    (set, get) => ({
      routes: [],
      activeRouteId: null,
      undoStack: [],

      addRoute: (name) => {
        const usedColors = get().routes.map((r) => r.color);
        const route: Route = {
          id: crypto.randomUUID(),
          name,
          color: getNextRouteColor(usedColors),
          plzCodes: [],
          stops: [],
          visible: true,
        };
        set((s) => ({
          routes: [...s.routes, route],
          activeRouteId: route.id,
        }));
      },

      deleteRoute: (id) =>
        set((s) => ({
          routes: s.routes.filter((r) => r.id !== id),
          activeRouteId: s.activeRouteId === id ? null : s.activeRouteId,
        })),

      renameRoute: (id, name) =>
        set((s) => ({
          routes: s.routes.map((r) => (r.id === id ? { ...r, name } : r)),
        })),

      setActiveRoute: (id) => set({ activeRouteId: id }),

      toggleRouteVisibility: (id) =>
        set((s) => ({
          routes: s.routes.map((r) =>
            r.id === id ? { ...r, visible: !r.visible } : r
          ),
        })),

      addPlzToActiveRoute: (plz, opts) => {
        const { activeRouteId, routes } = get();
        if (!activeRouteId) return 'no-route';

        if (routes.some((r) => r.plzCodes.includes(plz))) return 'duplicate';

        // Resolve the position now, from the caller or from the index, so the
        // stop exists immediately. Falling back to the detail GeoJSON (in
        // RoutePanel) is still allowed - it is more precise, being a real
        // polygon centroid - but it is no longer required for the code to
        // show up at all.
        let coordinate = opts?.coordinate;
        let label = opts?.label;
        if (!coordinate) {
          const entry = lookupPrefixed(plz);
          if (entry) {
            coordinate = [entry.lng, entry.lat];
            if (!label) label = entry.name ? `${entry.plz} ${entry.name}` : entry.plz;
          }
        }

        const stop: RouteStop | null = coordinate
          ? {
              id: crypto.randomUUID(),
              type: 'plz',
              plz,
              label: label ?? plz.split(':').pop() ?? plz,
              coordinate,
              ...(opts?.kind ? { kind: opts.kind } : {}),
            }
          : null;

        set((s) => ({
          routes: s.routes.map((r) =>
            r.id === activeRouteId
              ? {
                  ...r,
                  plzCodes: [...r.plzCodes, plz],
                  stops: stop ? [...r.stops, stop] : r.stops,
                  geometry: undefined,
                }
              : r
          ),
          undoStack: [...s.undoStack, { routeId: activeRouteId, plz }],
        }));

        // Added either way; the caller is told the position is still missing
        // so it can say so instead of showing an empty route.
        return stop ? 'added' : 'unknown-code';
      },

      removePlzFromRoute: (routeId, plz) =>
        set((s) => ({
          routes: s.routes.map((r) =>
            r.id === routeId
              ? {
                  ...r,
                  plzCodes: r.plzCodes.filter((p) => p !== plz),
                  stops: r.stops.filter((st) => st.plz !== plz),
                  geometry: undefined,
                }
              : r
          ),
        })),

      setRouteColor: (id, color) =>
        set((s) => ({
          routes: s.routes.map((r) => (r.id === id ? { ...r, color } : r)),
        })),

      clearRoute: (id) =>
        set((s) => ({
          routes: s.routes.map((r) =>
            r.id === id
              ? { ...r, plzCodes: [], stops: [], geometry: undefined }
              : r
          ),
        })),

      getRouteForPlz: (plz) => {
        return get().routes.find((r) => r.plzCodes.includes(plz));
      },

      undoLastAdd: () => {
        const { undoStack } = get();
        if (undoStack.length === 0) return;
        const last = undoStack[undoStack.length - 1];
        set((s) => ({
          undoStack: s.undoStack.slice(0, -1),
          routes: s.routes.map((r) =>
            r.id === last.routeId
              ? {
                  ...r,
                  plzCodes: r.plzCodes.filter((p) => p !== last.plz),
                  stops: r.stops.filter((st) => st.plz !== last.plz),
                  geometry: undefined,
                }
              : r
          ),
        }));
      },

      setRouteBrief: (id, brief) =>
        set((s) => ({
          routes: s.routes.map((r) => (r.id === id ? { ...r, ...brief } : r)),
        })),

      setRouteGeometry: (id, geometry) =>
        set((s) => ({
          routes: s.routes.map((r) =>
            r.id === id ? { ...r, geometry } : r
          ),
        })),

      setRouteCalculating: (id, calculating) =>
        set((s) => ({
          routes: s.routes.map((r) =>
            r.id === id ? { ...r, calculating } : r
          ),
        })),

      setStops: (id, stops) =>
        set((s) => ({
          routes: s.routes.map((r) =>
            r.id === id ? { ...r, stops } : r
          ),
        })),

      reorderStop: (routeId, fromIndex, toIndex) =>
        set((s) => ({
          routes: s.routes.map((r) => {
            if (r.id !== routeId) return r;
            const stops = [...r.stops];
            const [movedStop] = stops.splice(fromIndex, 1);
            stops.splice(toIndex, 0, movedStop);
            const plzCodes = stops
              .filter((st) => st.plz)
              .map((st) => st.plz!);
            return { ...r, stops, plzCodes, geometry: undefined };
          }),
        })),

      removeStop: (routeId, stopId) =>
        set((s) => ({
          routes: s.routes.map((r) => {
            if (r.id !== routeId) return r;
            const stop = r.stops.find((st) => st.id === stopId);
            return {
              ...r,
              stops: r.stops.filter((st) => st.id !== stopId),
              plzCodes: stop?.plz
                ? r.plzCodes.filter((p) => p !== stop.plz)
                : r.plzCodes,
              geometry: undefined,
            };
          }),
        })),

      restoreStop: (routeId, stop, index) =>
        set((s) => ({
          routes: s.routes.map((r) => {
            if (r.id !== routeId) return r;
            const stops = [...r.stops];
            stops.splice(Math.min(index, stops.length), 0, stop);
            const plzCodes = stops.filter((st) => st.plz).map((st) => st.plz!);
            return { ...r, stops, plzCodes, geometry: undefined };
          }),
        })),

      /**
       * Drag a pin to a new position. There was no action for this at all,
       * which is why no marker on the map could be moved on any device - the
       * feature was missing from the store, not broken in the UI.
       */
      moveStop: (routeId, stopId, coordinate) =>
        set((s) => ({
          routes: s.routes.map((r) => {
            if (r.id !== routeId) return r;
            if (!r.stops.some((st) => st.id === stopId)) return r;
            return {
              ...r,
              stops: r.stops.map((st) =>
                st.id === stopId ? { ...st, coordinate } : st
              ),
              geometry: undefined,
            };
          }),
        })),

      addWaypoint: (routeId, coordinate, index, label, kind) =>
        set((s) => ({
          routes: s.routes.map((r) => {
            if (r.id !== routeId) return r;
            const wp: RouteStop = {
              id: crypto.randomUUID(),
              type: 'waypoint',
              label: label || 'Waypoint',
              coordinate,
              ...(kind ? { kind } : {}),
            };
            const stops = [...r.stops];
            if (index !== undefined) {
              stops.splice(index, 0, wp);
            } else {
              stops.push(wp);
            }
            return { ...r, stops, geometry: undefined };
          }),
        })),

      restoreRoute: (route, index) =>
        set((s) => {
          const routes = [...s.routes];
          routes.splice(Math.min(index, routes.length), 0, { ...route, geometry: undefined });
          return { routes, activeRouteId: route.id };
        }),

      restoreRouteStops: (id, plzCodes, stops, geometry) =>
        set((s) => ({
          routes: s.routes.map((r) =>
            r.id === id ? { ...r, plzCodes, stops, geometry: geometry ?? undefined } : r
          ),
        })),
    }),
    {
      name: 'dispatch-routes-v1',
      version: 2,
      partialize: (state) => ({
        routes: state.routes.map((r) => ({
          ...r,
          geometry: undefined,
          calculating: false,
        })),
        activeRouteId: state.activeRouteId,
      }),
    }
  )
);
