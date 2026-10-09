import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ThemeState {
  dark: boolean;
  colorBlind: boolean;
  /** Set once the user picks a theme themselves; until then the OS decides. */
  manual: boolean;
  toggle: () => void;
  toggleColorBlind: () => void;
}

const MANUAL_KEY = 'dispatch-theme-manual';

function readFlag(key: string): boolean {
  try {
    return Boolean(localStorage.getItem(key));
  } catch {
    // Private mode. Reading this at module scope used to throw and take the
    // whole module - and therefore the app - down with it.
    return false;
  }
}

function writeFlag(key: string) {
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* private mode; the OS preference keeps applying, which is fine */
  }
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      dark: false,
      colorBlind: false,
      manual: false,
      toggle: () => {
        writeFlag(MANUAL_KEY);
        set((s) => ({ dark: !s.dark, manual: true }));
      },
      toggleColorBlind: () => set((s) => ({ colorBlind: !s.colorBlind })),
    }),
    {
      name: 'dispatch-theme-v1',
      partialize: (state) => ({
        dark: state.dark,
        colorBlind: state.colorBlind,
        manual: state.manual,
      }),
    }
  )
);

if (typeof window !== 'undefined') {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');

  /**
   * "Has the user chosen?" is its own flag now.
   *
   * It used to be inferred from the presence of the persisted store key - but
   * zustand writes that key on ANY state change, including the automatic
   * application of the OS preference on first load. So the first visit wrote
   * the key, and every later OS theme change was then treated as overridden by
   * a choice the user had never made.
   */
  const chosen = () => readFlag(MANUAL_KEY) || useThemeStore.getState().manual;

  if (!chosen() && mq.matches) useThemeStore.setState({ dark: true });

  mq.addEventListener('change', (e) => {
    if (!chosen()) useThemeStore.setState({ dark: e.matches });
  });
}
