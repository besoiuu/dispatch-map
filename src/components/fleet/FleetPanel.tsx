'use client';

import { useEffect, useRef, useState } from 'react';
import { STALE_MS, seenAgo } from '@/lib/fleetBridge';
import { focusTruck, useFleetStore } from '@/store/fleetStore';
import { fitFleet } from './FleetBridge';

/**
 * The fleet, on the left: the route sidebar keeps the right. It exists only
 * when the TMS has handed a fleet in, so the map opened on its own looks as
 * it always did. Romanian, like everything the TMS sends into it.
 */
export function FleetPanel() {
  const connected = useFleetStore((s) => s.connected);
  const open = useFleetStore((s) => s.open);
  const setOpen = useFleetStore((s) => s.setOpen);
  const trucks = useFleetStore((s) => s.trucks);
  const at = useFleetStore((s) => s.at);
  const selected = useFleetStore((s) => s.selected);
  const [query, setQuery] = useState('');
  const list = useRef<HTMLUListElement>(null);

  // The map's zoom buttons sit top-left; they move aside while the panel is open.
  useEffect(() => {
    document.documentElement.classList.toggle('fleet-open', connected && open);
  }, [connected, open]);

  // A truck picked on the map scrolls into view in the list.
  useEffect(() => {
    if (!selected) return;
    list.current?.querySelector(`[data-key="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected]);

  if (!connected) return null;

  const q = query.trim().toLowerCase();
  const shown = q
    ? trucks.filter((t) => [t.plate, t.key, t.driver, t.place, t.run?.route].some((v) => v?.toLowerCase().includes(q)))
    : trucks;
  const moving = trucks.filter((t) => t.moving).length;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute left-3 top-3 z-30 flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-800 shadow-lg hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
      >
        <TruckIcon />
        Flotă
        <span className="rounded-md bg-orange-500/15 px-1.5 text-xs font-bold text-orange-700 dark:text-orange-300">{trucks.length}</span>
      </button>
    );
  }

  return (
    <aside
      aria-label="Flota"
      className="absolute inset-y-0 left-0 z-30 flex w-(--fleet-width) max-w-[88vw] flex-col border-r border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900"
    >
      <header className="flex items-start justify-between gap-2 border-b border-gray-200 px-4 pb-3 pt-4 dark:border-gray-700">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-bold text-gray-900 dark:text-gray-50">
            <TruckIcon />
            Flota
          </h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {trucks.length} camioane · <span className="font-semibold text-green-700 dark:text-green-400">{moving} în mers</span>
            {at ? ` · actualizat ${seenAgo(at)}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Ascunde flota"
          title="Ascunde flota"
          className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </header>

      <div className="flex gap-2 border-b border-gray-200 px-3 py-2.5 dark:border-gray-700">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Caută șofer, nr., oraș, cursă"
          aria-label="Caută în flotă"
          className="h-11 min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 text-base text-gray-900 placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 md:text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        />
        <button
          type="button"
          onClick={fitFleet}
          title="Arată toate camioanele pe hartă"
          className="h-11 shrink-0 cursor-pointer rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          Toate
        </button>
      </div>

      <ul ref={list} className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto overscroll-contain dark:divide-gray-800">
        {shown.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            {trucks.length ? 'Niciun camion nu se potrivește.' : 'Niciun camion cu poziție GPS.'}
          </li>
        ) : null}
        {shown.map((t) => {
          // Against when the TMS sent the fleet, not the clock: render stays pure, and the TMS refreshes it.
          const stale = Date.parse(at ?? t.at) - Date.parse(t.at) > STALE_MS;
          const on = t.key === selected;
          return (
            <li key={t.key} data-key={t.key}>
              <button
                type="button"
                onClick={() => focusTruck(t.key)}
                aria-current={on ? 'true' : undefined}
                className={`block w-full cursor-pointer px-4 py-3 text-left transition-colors focus:outline-none focus-visible:bg-orange-50 dark:focus-visible:bg-orange-500/10 ${
                  on ? 'bg-orange-50 dark:bg-orange-500/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-bold text-gray-900 dark:text-gray-50">{t.driver ?? t.plate}</span>
                  <span className="shrink-0 rounded border border-gray-200 bg-white px-1.5 py-px font-mono text-[11px] font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                    {t.plate}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xs">
                  <span
                    aria-hidden="true"
                    className={`h-2 w-2 shrink-0 rounded-full ${t.moving && !stale ? 'bg-green-500' : 'bg-gray-400'}`}
                  />
                  <span className="truncate font-semibold text-gray-800 dark:text-gray-100">{t.place ?? `${t.lat.toFixed(2)}, ${t.lon.toFixed(2)}`}</span>
                  <span className={`shrink-0 ${stale ? 'text-amber-700 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'}`}>
                    · {t.moving && !stale ? 'în mers' : stale ? `văzut ${seenAgo(t.at)}` : 'oprit'}
                  </span>
                </div>
                {t.base ? <div className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">{t.base}</div> : null}
                {t.run ? (
                  <div className="mt-2 rounded-lg bg-gray-50 px-2.5 py-1.5 dark:bg-gray-800/70">
                    <div className="truncate font-mono text-xs font-bold text-gray-900 dark:text-gray-100">{t.run.route}</div>
                    <div className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                      {t.run.id}
                      {t.run.stage ? <> · <span className="font-semibold text-gray-700 dark:text-gray-200">{t.run.stage}</span></> : null}
                    </div>
                    {t.run.gps ? <div className="mt-1 truncate text-xs font-semibold text-green-700 dark:text-green-400">{t.run.gps}</div> : null}
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">fără cursă azi</div>
                )}
              </button>
              {/* Outside the button: a link inside a button is not valid, and the tap must dial, not select. */}
              {t.phone ? (
                <a
                  href={`tel:${t.phone.replace(/\s/g, '')}`}
                  className={`-mt-2 flex min-h-9 items-center px-4 pb-2 text-xs font-semibold text-orange-700 underline-offset-2 hover:underline dark:text-orange-300 ${
                    on ? 'bg-orange-50 dark:bg-orange-500/10' : ''
                  }`}
                >
                  {t.phone}
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function TruckIcon() {
  return (
    <svg className="h-4 w-4 text-orange-600 dark:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 6h11v9H3zM14 9h4l3 3v3h-7M7 18.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm10 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
    </svg>
  );
}
