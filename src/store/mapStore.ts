import { create } from 'zustand';
import type { FeatureCollection } from 'geojson';
import type { CountryCode } from '@/types/country';
import { defaultCountry } from '@/config/countries';

interface MapState {
  zoom: number;
  activeCountry: CountryCode;
  detailData: Partial<Record<CountryCode, FeatureCollection>>;
  overviewData: Partial<Record<CountryCode, FeatureCollection>>;
  hiddenCountries: Set<CountryCode>;
  hoveredFeatureId: string | null;
  hoveredFeatureName: string | null;
  highlightedPlz: string | null;
  loading: boolean;

  setZoom: (zoom: number) => void;
  setActiveCountry: (country: CountryCode) => void;
  setDetailData: (country: CountryCode, data: FeatureCollection) => void;
  setOverviewData: (country: CountryCode, data: FeatureCollection) => void;
  toggleCountry: (code: CountryCode) => void;
  isCountryVisible: (code: CountryCode) => boolean;
  setHoveredFeatureId: (id: string | null, name?: string | null) => void;
  setHighlightedPlz: (plz: string | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useMapStore = create<MapState>((set, get) => ({
  zoom: 6,
  activeCountry: defaultCountry,
  detailData: {},
  overviewData: {},
  hiddenCountries: new Set<CountryCode>(),
  hoveredFeatureId: null,
  hoveredFeatureName: null,
  highlightedPlz: null,
  loading: true,

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
  setHoveredFeatureId: (hoveredFeatureId, hoveredFeatureName = null) => set({ hoveredFeatureId, hoveredFeatureName }),
  setHighlightedPlz: (highlightedPlz) => set({ highlightedPlz }),
  setLoading: (loading) => set({ loading }),
}));
