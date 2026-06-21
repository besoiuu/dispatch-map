'use client';

import { useState, useEffect } from 'react';

const SHORTCUTS = [
  { keys: ['Click'], desc: 'Select postal code area' },
  { keys: ['Right-click', 'Long-press'], desc: 'Add waypoint to active route' },
  { keys: ['Ctrl', 'Z'], desc: 'Undo last added stop' },
  { keys: ['W', 'A', 'S', 'D'], desc: 'Pan the map' },
  { keys: ['Double-click'], desc: 'Rename a route' },
  { keys: ['Drag'], desc: 'Reorder stops in a route' },
  { keys: ['['], desc: 'Toggle sidebar' },
];

const TIPS = [
  'Create a route first, then click map regions to add stops.',
  'Paste multiple postal codes at once with the import button.',
  'Routes auto-calculate distance and duration via OSRM.',
  'Use the country toggles to show/hide specific countries.',
  'Export routes as CSV or share via link.',
];

export function HelpPanel() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="cursor-pointer rounded-md px-1.5 py-0.5 text-[11px] font-medium text-gray-400 hover:bg-gray-100 dark:text-gray-500 dark:hover:bg-gray-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        title="Keyboard shortcuts & tips"
        aria-label="Show help"
      >
        ?
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
            <div
              className="w-full max-w-sm rounded-xl bg-white shadow-2xl dark:bg-gray-900 dark:border dark:border-gray-700 animate-in"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label="Keyboard shortcuts and tips"
            >
              <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-5 py-3">
                <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Shortcuts & Tips</h2>
                <button
                  onClick={() => setOpen(false)}
                  className="cursor-pointer rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  aria-label="Close"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="px-5 py-4 space-y-4">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Keyboard & Mouse</h3>
                  <div className="space-y-2">
                    {SHORTCUTS.map((s, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="flex shrink-0 items-center gap-1 pt-0.5">
                          {s.keys.map((key, j) => (
                            <span key={j}>
                              {j > 0 && <span className="text-[10px] text-gray-400 mx-0.5">/</span>}
                              <kbd className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                                {key}
                              </kbd>
                            </span>
                          ))}
                        </div>
                        <span className="text-xs text-gray-600 dark:text-gray-400">{s.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Tips</h3>
                  <ul className="space-y-1.5">
                    {TIPS.map((tip, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400">
                        <span className="text-blue-500 mt-0.5 shrink-0">&#8226;</span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 px-5 py-2.5">
                <p className="text-[10px] text-gray-400 dark:text-gray-600 text-center">
                  Press <kbd className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[10px] dark:bg-gray-800 border border-gray-200 dark:border-gray-700">Esc</kbd> to close
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
