import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Route, RouteGeometry, RouteStop } from '@/types/route';
import { getNextRouteColor } from '@/lib/colors';

interface UndoEntry {
  routeId: string;
  plz: string;
}

interface RouteState {
  routes: Route[];
  activeRouteId: string | null;
  undoStack: UndoEntry[];

  addRoute: (name: string) => void;
  deleteRoute: (id: string) => void;
  renameRoute: (id: string, name: string) => void;
  setActiveRoute: (id: string | null) => void;
  toggleRouteVisibility: (id: string) => void;
  addPlzToActiveRoute: (plz: string) => void;
  removePlzFromRoute: (routeId: string, plz: string) => void;
  setRouteColor: (id: string, color: string) => void;
  clearRoute: (id: string) => void;
  getRouteForPlz: (plz: string) => Route | undefined;
  undoLastAdd: () => void;
  setRouteGeometry: (id: string, geometry: RouteGeometry | undefined) => void;
  setRouteCalculating: (id: string, calculating: boolean) => void;
  setStops: (id: string, stops: RouteStop[]) => void;
  reorderStop: (routeId: string, fromIndex: number, toIndex: number) => void;
  removeStop: (routeId: string, stopId: string) => void;
  addWaypoint: (routeId: string, coordinate: [number, number], index?: number, label?: string) => void;
  restoreRoute: (route: Route, index: number) => void;
  restoreRouteStops: (id: string, plzCodes: string[], stops: RouteStop[]) => void;
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

      addPlzToActiveRoute: (plz) => {
        const { activeRouteId, routes } = get();
        if (!activeRouteId) return;

        const alreadyAssigned = routes.some((r) => r.plzCodes.includes(plz));
        if (alreadyAssigned) return;

        set((s) => ({
          routes: s.routes.map((r) =>
            r.id === activeRouteId
              ? {
                  ...r,
                  plzCodes: [...r.plzCodes, plz],
                  geometry: undefined,
                }
              : r
          ),
          undoStack: [...s.undoStack, { routeId: activeRouteId, plz }],
        }));
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

      addWaypoint: (routeId, coordinate, index, label) =>
        set((s) => ({
          routes: s.routes.map((r) => {
            if (r.id !== routeId) return r;
            const wp: RouteStop = {
              id: crypto.randomUUID(),
              type: 'waypoint',
              label: label || 'Waypoint',
              coordinate,
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

      restoreRouteStops: (id, plzCodes, stops) =>
        set((s) => ({
          routes: s.routes.map((r) =>
            r.id === id ? { ...r, plzCodes, stops, geometry: undefined } : r
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
