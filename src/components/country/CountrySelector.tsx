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
            className={`cursor-pointer rounded px-2 py-1 text-[10px] font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-gray-900 ${
              visible
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-400 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-500 dark:hover:bg-gray-600'
            }`}
          >
            {code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
