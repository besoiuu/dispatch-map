import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ThemeState {
  dark: boolean;
  colorBlind: boolean;
  _initialized: boolean;
  toggle: () => void;
  toggleColorBlind: () => void;
}

function getSystemDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      dark: getSystemDark(),
      colorBlind: false,
      _initialized: false,
      toggle: () => set((s) => ({ dark: !s.dark })),
      toggleColorBlind: () => set((s) => ({ colorBlind: !s.colorBlind })),
    }),
    {
      name: 'dispatch-theme-v1',
      onRehydrateStorage: () => (state) => {
        if (state) state._initialized = true;
      },
      partialize: (state) => ({ dark: state.dark, colorBlind: state.colorBlind }),
    }
  )
);

if (typeof window !== 'undefined') {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', (e) => {
    const stored = localStorage.getItem('dispatch-theme-v1');
    if (!stored) {
      useThemeStore.setState({ dark: e.matches });
    }
  });
}
