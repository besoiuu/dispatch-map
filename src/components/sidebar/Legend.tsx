'use client';

import { useState, useMemo, memo } from 'react';
import { useMapStore } from '@/store/mapStore';
import { countries, enabledCountries } from '@/config/countries';
import { getRegionColor, setCountryHueContext } from '@/lib/colors';
import type { CountryCode } from '@/types/country';
import type { FeatureCollection } from 'geojson';

const FLAGS: Record<CountryCode, string> = {
  de: '🇩🇪',
  nl: '🇳🇱',
  fr: '🇫🇷',
  be: '🇧🇪',
  dk: '🇩🇰',
  at: '🇦🇹',
  cz: '🇨🇿',
  pl: '🇵🇱',
  hu: '🇭🇺',
  ro: '🇷🇴',
  it: '🇮🇹',
  sk: '🇸🇰',
};

interface CountrySectionProps {
  code: CountryCode;
  data: FeatureCollection;
  isCollapsed: boolean;
  onToggle: () => void;
}

const CountrySection = memo(function CountrySection({ code, data, isCollapsed, onToggle }: CountrySectionProps) {
  const config = countries[code];

  const regions = useMemo(() => {
    return data.features
      .map((f) => ({
        code: String(f.properties?.[config.overviewPropertyKey] ?? ''),
        label: String(f.properties?.label ?? ''),
        bbox: f.properties?.bbox as [number, number, number, number] | undefined,
      }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [data, config.overviewPropertyKey]);

  const handleClick = (bbox?: [number, number, number, number]) => {
    if (!bbox) return;
    window.dispatchEvent(new CustomEvent('map:flyto', { detail: { bbox } }));
  };

  return (
    <div className="mb-1">
      <button
        onClick={onToggle}
        className="cursor-pointer flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm font-semibold hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
      >
        <span>{FLAGS[code]}</span>
        <span className="text-gray-800 dark:text-gray-200">{config.name}</span>
        <span className="text-xs text-gray-400">({regions.length})</span>
        <svg
          className={`ml-auto h-3 w-3 text-gray-400 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {!isCollapsed && (
        <div className="ml-2 space-y-0">
          {regions.map((region) => (
            <button
              key={`${code}-${region.code}`}
              onClick={() => handleClick(region.bbox)}
              className="cursor-pointer flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
            >
              <span
                className="h-2.5 w-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: (setCountryHueContext(code), getRegionColor(region.code)) }}
              />
              <span className="font-medium text-gray-700 dark:text-gray-300">{region.code}</span>
              {region.label && (
                <span className="text-gray-500 dark:text-gray-400 truncate">{region.label}</span>
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
  const [sectionOpen, setSectionOpen] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(
    () => Object.fromEntries(enabledCountries.map((c) => [c, true]))
  );

  const total = useMemo(
    () => enabledCountries.reduce((sum, c) => sum + (overviewDataMap[c]?.features.length ?? 0), 0),
    [overviewDataMap]
  );

  return (
    <div className="border-t border-gray-200 dark:border-gray-700">
      <button
        onClick={() => setSectionOpen(!sectionOpen)}
        className="cursor-pointer flex w-full items-center justify-between px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Regions ({total})
        </h3>
        <svg
          className={`h-3 w-3 text-gray-400 transition-transform duration-200 ${sectionOpen ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {sectionOpen && enabledCountries.map((code) => {
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
