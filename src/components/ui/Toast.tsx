'use client';

import { useToastStore } from '@/store/toastStore';

const ICONS = {
  success: (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  info: (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  error: (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

const STYLES = {
  success: 'bg-green-600 text-white',
  info: 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900',
  error: 'bg-red-600 text-white',
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col gap-2"
      style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg backdrop-blur-sm animate-in ${STYLES[toast.type]}`}
          role="status"
          aria-live="polite"
        >
          {ICONS[toast.type]}
          <span className="min-w-0">{toast.message}</span>
          {toast.action && (
            <button
              onClick={() => { toast.action!.onClick(); removeToast(toast.id); }}
              className="ml-1 min-h-9 shrink-0 cursor-pointer rounded-md bg-white/20 px-3 text-xs font-bold transition-colors hover:bg-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              {toast.action.label}
            </button>
          )}
          <button
            onClick={() => removeToast(toast.id)}
            className="-mr-1 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            aria-label="Dismiss notification"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
