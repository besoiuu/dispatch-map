import { create } from 'zustand';
import type { FleetTruck } from '@/lib/fleetBridge';

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
  link: null,
  linkRefused: false,
  error: null,

  // The first fleet opens the panel; later refreshes leave it as the dispatcher set it.
  setFleet: (source, at, trucks) => set((s) => ({ source, at, trucks, error: null, open: s.source ? s.open : true })),
  setOpen: (open) => set({ open }),
  select: (selected) => set({ selected }),
}));

/** Selects a truck and moves the map to it. */
export function focusTruck(key: string) {
  const t = useFleetStore.getState().trucks.find((x) => x.key === key);
  if (!t) return;
  useFleetStore.setState({ selected: key, open: true });
  window.dispatchEvent(new CustomEvent('map:flyto', { detail: { center: [t.lon, t.lat], zoom: 9 } }));
}
