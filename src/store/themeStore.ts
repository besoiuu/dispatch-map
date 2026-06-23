import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ThemeState {
  dark: boolean;
  colorBlind: boolean;
  toggle: () => void;
  toggleColorBlind: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      dark: false,
      colorBlind: false,
      toggle: () => set((s) => ({ dark: !s.dark })),
      toggleColorBlind: () => set((s) => ({ colorBlind: !s.colorBlind })),
    }),
    {
      name: 'dispatch-theme-v1',
      partialize: (state) => ({ dark: state.dark, colorBlind: state.colorBlind }),
    }
  )
);

if (typeof window !== 'undefined') {
  const stored = localStorage.getItem('dispatch-theme-v1');
  if (!stored) {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) useThemeStore.setState({ dark: true });
  }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    const hasManualPref = localStorage.getItem('dispatch-theme-v1');
    if (!hasManualPref) {
      useThemeStore.setState({ dark: e.matches });
    }
  });
}
