'use client';

import { useState, useEffect, useRef } from 'react';
import { enabledCountries, countries } from '@/config/countries';
import { useMapStore } from '@/store/mapStore';

export function CountrySelector() {
  const hiddenCountries = useMapStore((s) => s.hiddenCountries);
  const toggleCountry = useMapStore((s) => s.toggleCountry);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hiddenCount = hiddenCountries.size;

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`cursor-pointer rounded-md px-2 py-1 text-[10px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
          open
            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
            : 'text-gray-400 hover:bg-gray-100 dark:text-gray-500 dark:hover:bg-gray-800'
        }`}
        title="Toggle countries"
        aria-label="Toggle countries"
      >
        <span className="flex items-center gap-1">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {hiddenCount > 0 && (
            <span className="rounded-full bg-red-500 text-white text-[8px] font-bold px-1">{hiddenCount}</span>
          )}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 rounded-lg border border-gray-200 bg-white p-2 shadow-xl dark:border-gray-600 dark:bg-gray-800 animate-in" style={{ minWidth: '220px' }}>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Toggle countries">
            {enabledCountries.map((code) => {
              const visible = !hiddenCountries.has(code);
              return (
                <button
                  key={code}
                  onClick={() => toggleCountry(code)}
                  aria-pressed={visible}
                  aria-label={`${visible ? 'Hide' : 'Show'} ${countries[code].name}`}
                  title={`${visible ? 'Hide' : 'Show'} ${countries[code].name}`}
                  className={`cursor-pointer rounded px-2 py-1 text-[10px] font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
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
        </div>
      )}
    </div>
  );
}
