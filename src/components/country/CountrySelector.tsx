'use client';

import { enabledCountries, countries } from '@/config/countries';
import { useMapStore } from '@/store/mapStore';

export function CountrySelector() {
  const hiddenCountries = useMapStore((s) => s.hiddenCountries);
  const toggleCountry = useMapStore((s) => s.toggleCountry);

  return (
    <div className="flex flex-wrap gap-0.5" role="group" aria-label="Toggle countries">
      {enabledCountries.map((code) => {
        const visible = !hiddenCountries.has(code);
        return (
          <button
            key={code}
            onClick={() => toggleCountry(code)}
            aria-pressed={visible}
            aria-label={`${visible ? 'Hide' : 'Show'} ${countries[code].name}`}
            title={`${visible ? 'Hide' : 'Show'} ${countries[code].name}`}
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold transition-colors ${
              visible
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
            }`}
          >
            {code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
