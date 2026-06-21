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
    { name: 'dispatch-theme-v1' }
  )
);
