import { create } from 'zustand';
import type { FeatureCollection } from 'geojson';
import type { CountryCode } from '@/types/country';
import { defaultCountry } from '@/config/countries';

/**
 * What the map shows underneath: `plz` the coloured postal regions over a pale
 * base (the planning view this app was built for), `harta` a full road map
 * with the regions switched off - the everyday "where is this" view, like
 * Google Maps, from OpenFreeMap (config/mapStyle). Routes, pins and the fleet
 * draw on both. Remembered per browser.
 */
export type BaseMap = 'plz' | 'harta';
const BASE_KEY = 'dispatch-base-map';

/**
 * The remembered choice, read AFTER hydration (MapShell calls it on mount).
 * Read while the store was created, it differed between the server render and
 * the browser, and the switch showed the other view pressed.
 */
export function storedBase(): BaseMap | null {
  try {
    const v = window.localStorage.getItem(BASE_KEY);
    return v === 'harta' || v === 'plz' ? v : null;
  } catch {
    return null;
  }
}

interface MapState {
  zoom: number;
  activeCountry: CountryCode;
  detailData: Partial<Record<CountryCode, FeatureCollection>>;
  overviewData: Partial<Record<CountryCode, FeatureCollection>>;
  hiddenCountries: Set<CountryCode>;
  hoveredFeatureId: string | null;
  hoveredFeatureName: string | null;
  hoveredCountry: string | null;
  highlightedPlz: string | null;
  loading: boolean;
  base: BaseMap;

  setZoom: (zoom: number) => void;
  setActiveCountry: (country: CountryCode) => void;
  setDetailData: (country: CountryCode, data: FeatureCollection) => void;
  setOverviewData: (country: CountryCode, data: FeatureCollection) => void;
  toggleCountry: (code: CountryCode) => void;
  isCountryVisible: (code: CountryCode) => boolean;
  setHoveredFeatureId: (id: string | null, name?: string | null, country?: string | null) => void;
  setHighlightedPlz: (plz: string | null) => void;
  setLoading: (loading: boolean) => void;
  setBase: (base: BaseMap) => void;
}

export const useMapStore = create<MapState>((set, get) => ({
  zoom: 6,
  activeCountry: defaultCountry,
  detailData: {},
  overviewData: {},
  hiddenCountries: new Set<CountryCode>(),
  hoveredFeatureId: null,
  hoveredFeatureName: null,
  hoveredCountry: null,
  highlightedPlz: null,
  loading: true,
  base: 'plz',

  setZoom: (zoom) => set({ zoom }),
  setActiveCountry: (activeCountry) => set({ activeCountry }),
  setDetailData: (country, data) =>
    set((s) => ({ detailData: { ...s.detailData, [country]: data } })),
  setOverviewData: (country, data) =>
    set((s) => ({ overviewData: { ...s.overviewData, [country]: data } })),
  toggleCountry: (code) => set((s) => {
    const next = new Set(s.hiddenCountries);
    if (next.has(code)) next.delete(code); else next.add(code);
    return { hiddenCountries: next };
  }),
  isCountryVisible: (code) => !get().hiddenCountries.has(code),
  setHoveredFeatureId: (hoveredFeatureId, hoveredFeatureName = null, hoveredCountry = null) => set({ hoveredFeatureId, hoveredFeatureName, hoveredCountry }),
  setHighlightedPlz: (highlightedPlz) => set({ highlightedPlz }),
  setLoading: (loading) => set({ loading }),
  setBase: (base) => {
    try {
      window.localStorage.setItem(BASE_KEY, base);
    } catch {
      /* private window: the choice lasts this visit */
    }
    set({ base });
  },
}));
