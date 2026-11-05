'use client';

import { useEffect } from 'react';
import { allowedFleetOrigin, parseFleetMessage } from '@/lib/fleetBridge';
import { focusTruck, useFleetStore } from '@/store/fleetStore';

/**
 * Listens for the fleet from the TMS that embeds this map (lib/fleetBridge).
 * Renders nothing. Outside an iframe it does nothing at all.
 */
export function FleetBridge() {
  useEffect(() => {
    if (window.parent === window) return;

    const onMessage = (e: MessageEvent) => {
      if (!allowedFleetOrigin(e.origin)) return;
      const m = parseFleetMessage(e.data);
      if (!m) return;
      if (m.type === 'fleet') {
        const first = !useFleetStore.getState().connected;
        useFleetStore.getState().setFleet(m.at, m.trucks);
        // A focus is honoured when it is new, so a two-minute refresh does not pull the map back.
        if (m.focus && (first || m.focus !== useFleetStore.getState().selected)) focusTruck(m.focus);
        else if (first && m.trucks.length) fitFleet();
      } else {
        focusTruck(m.key);
      }
    };
    window.addEventListener('message', onMessage);
    // No data in it, so any parent may hear it; the parent answers with the fleet.
    window.parent.postMessage({ source: 'dispatch-map', type: 'fleet-ready' }, '*');
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return null;
}

/** Frames every truck, for the first look with nothing focused. */
export function fitFleet() {
  const trucks = useFleetStore.getState().trucks;
  if (!trucks.length) return;
  const lons = trucks.map((t) => t.lon);
  const lats = trucks.map((t) => t.lat);
  const pad = 0.4;
  window.dispatchEvent(
    new CustomEvent('map:flyto', {
      detail: { bbox: [Math.min(...lons) - pad, Math.min(...lats) - pad, Math.max(...lons) + pad, Math.max(...lats) + pad] },
    })
  );
}
