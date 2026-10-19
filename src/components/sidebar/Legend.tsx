'use client';

import { useState, useMemo, memo } from 'react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useMapStore } from '@/store/mapStore';
import { countries, enabledCountries } from '@/config/countries';
import { getRegionColor, setCountryHueContext } from '@/lib/colors';
import type { CountryCode } from '@/types/country';
import type { FeatureCollection } from 'geojson';

interface CountrySectionProps {
  code: CountryCode;
  data: FeatureCollection;
  isCollapsed: boolean;
  onToggle: () => void;
}

const CountrySection = memo(function CountrySection({
  code,
  data,
  isCollapsed,
  onToggle,
}: CountrySectionProps) {
  const config = countries[code];

  const regions = useMemo(() => {
    // The hue context is global state in lib/colors, so it is set ONCE for the
    // whole country here. It used to be set inside each swatch's style prop
    // via a comma operator - a side effect per row, during render.
    setCountryHueContext(code);
    return data.features
      .map((f, i) => ({
        // CLAUDE.md states that several features may share one plz2 code, so
        // the index is part of the key. Without it React saw duplicates and
        // could reuse the wrong row - the same bug as the search list had.
        key: `${code}-${String(f.properties?.[config.overviewPropertyKey] ?? '')}-${i}`,
        code: String(f.properties?.[config.overviewPropertyKey] ?? ''),
        label: String(f.properties?.label ?? ''),
        bbox: f.properties?.bbox as [number, number, number, number] | undefined,
      }))
      .map((r) => ({ ...r, color: getRegionColor(r.code) }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [data, config.overviewPropertyKey, code]);

  const handleClick = (bbox?: [number, number, number, number]) => {
    if (!bbox) return;
    window.dispatchEvent(new CustomEvent('map:flyto', { detail: { bbox } }));
  };

  return (
    <div className="mb-1">
      <button
        onClick={onToggle}
        aria-expanded={!isCollapsed}
        className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded px-2 text-left text-sm font-semibold transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:hover:bg-gray-800"
      >
        {/* The country code, not a flag emoji: emoji are drawn by the operating
            system, so the same list looked different on every machine and
            arrived with its own colours over the palette. */}
        <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          {code}
        </span>
        <span className="text-gray-800 dark:text-gray-200">{config.name}</span>
        <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">({regions.length})</span>
        <svg
          className={`ml-auto h-3 w-3 shrink-0 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${
            isCollapsed ? '' : 'rotate-90'
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {!isCollapsed && (
        <div className="ml-2">
          {regions.map((region) => (
            <button
              key={region.key}
              onClick={() => handleClick(region.bbox)}
              disabled={!region.bbox}
              title={region.bbox ? `Zoom to ${region.label || region.code}` : undefined}
              className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded px-2 text-left text-xs transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent dark:hover:bg-gray-800"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: region.color }}
              />
              <span className="shrink-0 font-medium tabular-nums text-gray-700 dark:text-gray-300">
                {region.code}
              </span>
              {region.label && (
                <span className="truncate text-gray-500 dark:text-gray-400">{region.label}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

export function Legend() {
  const overviewDataMap = useMapStore((s) => s.overviewData);
  // Open by default, and collapsed on a narrow screen by CSS-driven state set
  // after mount. Reading `window.innerWidth` in the initialiser made the
  // server render `true` and the client render `false` on a phone, which is a
  // hydration mismatch - React discards and re-renders the subtree.
  const [sectionOpen, setSectionOpen] = useState(true);
  const narrow = useMediaQuery('(max-width: 767px)');
  const [touched, setTouched] = useState(false);
  // Collapsed on a phone until the dispatcher opens it themselves.
  const open = touched ? sectionOpen : !narrow;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(enabledCountries.map((c) => [c, true]))
  );

  const total = useMemo(
    () => enabledCountries.reduce((sum, c) => sum + (overviewDataMap[c]?.features.length ?? 0), 0),
    [overviewDataMap]
  );

  return (
    <div className="border-t border-gray-200 dark:border-gray-700">
      <button
        onClick={() => {
          setTouched(true);
          setSectionOpen(!open);
        }}
        aria-expanded={open}
        className="flex min-h-11 w-full cursor-pointer items-center justify-between px-3 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:hover:bg-gray-800/50"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Regions ({total})
        </h3>
        <svg
          className={`h-3 w-3 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {open &&
        enabledCountries.map((code) => {
          const data = overviewDataMap[code];
          if (!data) return null;
          return (
            <CountrySection
              key={code}
              code={code}
              data={data}
              isCollapsed={collapsed[code]}
              onToggle={() => setCollapsed((s) => ({ ...s, [code]: !s[code] }))}
            />
          );
        })}
    </div>
  );
}
