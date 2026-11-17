import { create } from 'zustand';
import type { FleetTruck } from '@/lib/fleetBridge';
import { focusPoints } from '@/lib/fleetRoutes';

/**
 * The fleet (lib/fleetBridge), from one of two sources:
 *   'tms' - the TMS embeds this map and hands everything in, runs included;
 *   'key' - the map opened on its own reads positions with the key the TMS
 *           gave it (lib/fleetLink); no runs, driver names as last told.
 * Nothing here is persisted: it is live data. The key is, in lib/fleetLink.
 */
interface FleetState {
  source: 'tms' | 'key' | null;
  at: string | null;
  trucks: FleetTruck[];
  open: boolean;
  selected: string | null;
  /** The run picked in the TMS's week ("#58617"), drawn stronger than the rest of the truck's route. */
  run: string | null;
  /** The TMS address and when the key ends, for the panel to say so; null when there is no key. */
  link: { api: string; exp: number } | null;
  /** The TMS refused the key (expired or revoked): the panel offers to reconnect. */
  linkRefused: boolean;
  /** The last read failed for another reason; the trucks shown are from before. */
  error: string | null;

  setFleet: (source: 'tms' | 'key', at: string, trucks: FleetTruck[]) => void;
  setOpen: (open: boolean) => void;
  select: (key: string | null) => void;
}

export const useFleetStore = create<FleetState>((set) => ({
  source: null,
  at: null,
  trucks: [],
  open: false,
  selected: null,
  run: null,
  link: null,
  linkRefused: false,
  error: null,

  // The first fleet opens the panel - on a desk. On a phone the panel is the
  // whole screen, so it waits for the Flotă button and the map shows first.
  // Later refreshes leave it as the dispatcher set it.
  setFleet: (source, at, trucks) =>
    set((s) => ({
      source,
      at,
      trucks,
      error: null,
      open: s.source ? s.open : typeof window === 'undefined' || window.innerWidth >= 768,
    })),
  setOpen: (open) => set({ open }),
  select: (selected) => set({ selected }),
}));

/**
 * Where to tell the TMS that a truck was picked here: the window and origin
 * the fleet came from (FleetBridge sets it). Null when the map is on its own.
 */
let tms: { win: Window; origin: string } | null = null;
export function setTmsTarget(target: { win: Window; origin: string } | null) {
  tms = target;
}

/**
 * Selects a truck and moves the map to it: to the truck and the rest of its
 * route when it has one, so the dispatcher sees where it is going, not just
 * where it is. With `run`, to that run's two ends and the truck.
 *
 * `fromTms` is set when the TMS asked for it; otherwise the dispatcher picked
 * it here, and the TMS is told, so its week marks the same driver.
 */
export function focusTruck(key: string, opts: { run?: string | null; fromTms?: boolean } = {}) {
  const t = useFleetStore.getState().trucks.find((x) => x.key === key);
  if (!t) return;
  const run = opts.run ?? null;
  // On a phone the panel covers the map: picking a truck shows it on the map, not the list.
  const wideScreen = typeof window !== 'undefined' && window.innerWidth >= 768;
  useFleetStore.setState((st) => ({ selected: key, run, open: wideScreen || st.open }));
  if (!opts.fromTms && tms) {
    try {
      tms.win.postMessage({ source: 'dispatch-map', type: 'fleet-select', key }, tms.origin);
    } catch {
      /* the TMS window went away */
    }
  }
  const pts = focusPoints(t, run);
  if (pts.length === 1) {
    window.dispatchEvent(new CustomEvent('map:flyto', { detail: { center: pts[0], zoom: 9 } }));
    return;
  }
  const lons = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  const pad = 0.15;
  // The fleet panel covers the left 320 px when open (wide screens): frame the route beside it.
  const wide = wideScreen;
  window.dispatchEvent(
    new CustomEvent('map:flyto', {
      detail: {
        bbox: [Math.min(...lons) - pad, Math.min(...lats) - pad, Math.max(...lons) + pad, Math.max(...lats) + pad],
        // Top clears the zoom/base bar; right leaves room for the stop labels, which sit right of their pins.
        padding: { top: 90, bottom: 50, right: wide ? 190 : 40, left: wide ? 360 : 40 },
      },
    }),
  );
}
