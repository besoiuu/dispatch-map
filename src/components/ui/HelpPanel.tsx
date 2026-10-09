'use client';

import { useEffect, useRef, useState } from 'react';

const SHORTCUTS = [
  { keys: ['Click', 'Tap'], desc: 'Add or remove a postal code area' },
  { keys: ['Right-click', 'Long-press'], desc: 'Open the map menu at a point' },
  { keys: ['Drag a pin'], desc: 'Move that stop' },
  { keys: ['Click a pin'], desc: 'Remove the stop, or get directions' },
  { keys: ['Ctrl', 'Z'], desc: 'Undo last added stop' },
  { keys: ['W', 'A', 'S', 'D'], desc: 'Pan the map' },
  { keys: ['Q', 'E'], desc: 'Rotate camera left / right' },
  { keys: ['Double-click'], desc: 'Rename a route' },
  { keys: ['Drag the handle'], desc: 'Reorder stops in a route' },
  { keys: ['['], desc: 'Toggle sidebar' },
];

const TIPS = [
  'Create a route first, then tap map regions to add stops.',
  'Type a country with the code to search one place only: DE 27576.',
  'Paste multiple postal codes at once with the import button.',
  'Routes auto-calculate distance and duration via OSRM.',
  'Use the country toggles to show/hide specific countries.',
  'Export routes as CSV or share via link.',
];

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function HelpPanel() {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const opener = openerRef.current;

    // Focus into the dialog, keep Tab inside it, and give focus back on close.
    // None of this happened before: the dialog was announced with `role` but
    // keyboard focus stayed on the page behind it, so Tab walked the map and
    // the sidebar while the overlay was up.
    dialog?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={openerRef}
        onClick={() => setOpen(true)}
        className="flex h-11 w-9 cursor-pointer items-center justify-center rounded-md text-sm font-medium text-gray-400 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-500 dark:hover:bg-gray-800"
        title="Keyboard shortcuts & tips"
        aria-label="Show help"
        aria-haspopup="dialog"
      >
        ?
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" />
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => setOpen(false)}
          >
            <div
              ref={dialogRef}
              className="max-h-[85dvh] w-full max-w-sm overflow-y-auto overscroll-contain rounded-xl bg-white shadow-2xl animate-in dark:border dark:border-gray-700 dark:bg-gray-900"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="help-title"
            >
              <div className="flex items-center justify-between border-b border-gray-200 px-5 py-2 dark:border-gray-700">
                <h2 id="help-title" className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  Shortcuts &amp; Tips
                </h2>
                <button
                  onClick={() => setOpen(false)}
                  className="flex h-11 w-9 cursor-pointer items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-gray-800"
                  aria-label="Close help"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4 px-5 py-4">
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Keyboard &amp; Mouse
                  </h3>
                  <div className="space-y-2">
                    {SHORTCUTS.map((s) => (
                      <div key={s.desc} className="flex items-start gap-3">
                        <div className="flex shrink-0 items-center gap-1 pt-0.5">
                          {s.keys.map((key, j) => (
                            <span key={key}>
                              {j > 0 && <span className="mx-0.5 text-[10px] text-gray-400">/</span>}
                              <kbd className="inline-block rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
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

                <div className="border-t border-gray-200 pt-3 dark:border-gray-700">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Tips
                  </h3>
                  <ul className="space-y-1.5">
                    {TIPS.map((tip) => (
                      <li key={tip} className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400">
                        <span className="mt-0.5 shrink-0 text-blue-500">&#8226;</span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="border-t border-gray-200 px-5 py-2.5 dark:border-gray-700">
                <p className="text-center text-[10px] text-gray-400 dark:text-gray-600">
                  Press{' '}
                  <kbd className="rounded border border-gray-200 bg-gray-100 px-1 py-0.5 font-mono text-[10px] dark:border-gray-700 dark:bg-gray-800">
                    Esc
                  </kbd>{' '}
                  to close
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
