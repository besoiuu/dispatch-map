'use client';

import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Unguarded, this threw in a private window and took the effect - and the
    // listener registration below - with it.
    try {
      if (localStorage.getItem('dispatch-install-dismissed')) return;
    } catch {
      /* private mode: offer the prompt, it just will not be remembered */
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!deferredPrompt || dismissed) return null;

  const handleInstall = async () => {
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem('dispatch-install-dismissed', '1');
    } catch {
      /* private mode; it will be offered again next time */
    }
  };

  return (
    <div className="mx-3 mb-2 rounded-xl border border-gray-200 bg-gray-50 p-2.5 dark:border-gray-800 dark:bg-gray-950/40">
      <div className="flex items-center gap-2">
        <svg className="h-5 w-5 text-orange-700 shrink-0 dark:text-orange-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">Install Dispatch Map</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">Use as a standalone app</p>
        </div>
        <button
          onClick={handleInstall}
          className="min-h-11 shrink-0 cursor-pointer rounded-md bg-blue-600 px-3 text-[11px] font-semibold text-gray-950 transition-colors hover:bg-blue-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          Install
        </button>
        <button
          onClick={handleDismiss}
          className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-gray-500 transition-colors hover:text-gray-900 dark:hover:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="Dismiss install prompt"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
