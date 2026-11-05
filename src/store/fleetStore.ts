import { create } from 'zustand';
import type { FleetTruck } from '@/lib/fleetBridge';

/** The fleet the TMS handed in (lib/fleetBridge). Nothing here is persisted: it is live data. */
interface FleetState {
  /** True once a parent page has sent a fleet: the panel exists only then. */
  connected: boolean;
  at: string | null;
  trucks: FleetTruck[];
  open: boolean;
  selected: string | null;

  setFleet: (at: string, trucks: FleetTruck[]) => void;
  setOpen: (open: boolean) => void;
  select: (key: string | null) => void;
}

export const useFleetStore = create<FleetState>((set) => ({
  connected: false,
  at: null,
  trucks: [],
  open: false,
  selected: null,

  // The first fleet opens the panel; later refreshes leave it as the dispatcher set it.
  setFleet: (at, trucks) => set((s) => ({ at, trucks, connected: true, open: s.connected ? s.open : true })),
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
