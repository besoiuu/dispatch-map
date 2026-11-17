'use client';

import { useMapStore, type BaseMap } from '@/store/mapStore';
import { countries } from '@/config/countries';

const LEVELS = [
  { label: 'Țară', title: 'Țara întreagă', zoom: 6 },
  { label: 'Regiune', title: 'Regiunile poștale', zoom: 8 },
  { label: 'Oraș', title: 'Codurile poștale ale orașelor', zoom: 11 },
  { label: 'Stradă', title: 'Străzile', zoom: 14 },
] as const;

const BASES: { id: BaseMap; label: string; title: string }[] = [
  { id: 'harta', label: 'Hartă', title: 'Harta drumurilor, fără regiunile poștale' },
  { id: 'plz', label: 'Coduri poștale', title: 'Regiunile poștale colorate pe țări' },
];

function getActiveLevel(zoom: number): number {
  if (zoom < 7) return 0;
  if (zoom < 9.5) return 1;
  if (zoom < 12.5) return 2;
  return 3;
}

/**
 * The bar across the top of the map: how close (the four zoom levels) and
 * what is underneath (road map or postal regions). Centred on the part of the
 * map you can see - from md up the sidebar covers the right edge - and on a
 * phone only the base switch: pinch and the +/- buttons zoom there, and the
 * levels would run into the Flotă button.
 */
export function ZoomPills() {
  const zoom = useMapStore((s) => s.zoom);
  const activeCountry = useMapStore((s) => s.activeCountry);
  const base = useMapStore((s) => s.base);
  const setBase = useMapStore((s) => s.setBase);
  const active = getActiveLevel(zoom);
  const config = countries[activeCountry];

  const handleClick = (targetZoom: number) => {
    window.dispatchEvent(new CustomEvent('map:setzoom', { detail: { zoom: targetZoom, center: config.center } }));
  };

  return (
    <div
      className="pointer-events-none absolute left-(--map-left) right-(--map-right) top-3 z-10 flex justify-end gap-2 pr-3 sm:justify-center sm:pr-0"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <Segmented label="Nivel de zoom" className="hidden sm:flex">
        {LEVELS.map((level, i) => (
          <SegButton key={level.label} on={i === active} onClick={() => handleClick(level.zoom)} title={level.title} current>
            {level.label}
          </SegButton>
        ))}
      </Segmented>
      <Segmented label="Ce arată harta">
        {BASES.map((b) => (
          <SegButton key={b.id} on={base === b.id} onClick={() => setBase(b.id)} title={b.title}>
            {b.label}
          </SegButton>
        ))}
      </Segmented>
    </div>
  );
}

function Segmented({ label, className = 'flex', children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`pointer-events-auto rounded-xl border border-gray-200 bg-white p-1 shadow-md dark:border-gray-800 dark:bg-gray-900 ${className}`}
    >
      {children}
    </div>
  );
}

function SegButton({
  on,
  onClick,
  title,
  current,
  children,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
  /** A zoom level reads as "you are here" (aria-current); a base is a pressed toggle. */
  current?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      {...(current ? { 'aria-current': on ? ('true' as const) : undefined } : { 'aria-pressed': on })}
      className={`min-h-10 cursor-pointer whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
        on
          ? 'bg-orange-50 text-orange-700 ring-1 ring-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:ring-orange-900'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100'
      }`}
    >
      {children}
    </button>
  );
}
