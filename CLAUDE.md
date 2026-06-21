@AGENTS.md

# Country Data Rules

When adding a new country or modifying country GeoJSON data, follow these rules strictly:

## Postal Code Requirements
- **plz5** and **plz2** properties MUST contain real postal code prefixes, not ISO codes, TERYT codes, Bezirk numbers, or sequential numbering.
- Look up the actual postal code of each region's capital city and use its first 2 digits as the code.
- The `name` property must be a recognizable city name (e.g., "Ostrava" not "Ostrava-město", "Iași" not "IS").
- Verify codes match reality: e.g., Romanian Iași = 700028 → prefix "70", Austrian Linz = 4020 → prefix "40".

## Data Format
- Both `detail.geojson` and `overview.geojson` must have `plz5`, `plz2`, and `name` properties on every feature.
- Overview features must also have a `centroid` property ([lng, lat]) for label placement.
- Overview features with `label` property: keep it in sync with `name`.
- Multiple features MAY share the same plz2 code (this is expected for countries where admin regions don't map 1:1 to postal regions).

## Color System
- `PlzLayers.tsx` deduplicates plz2 codes before building MapLibre `match` expressions — duplicate codes in data are safe.
- Each country has a base hue in `COUNTRY_HUES` (src/lib/colors.ts). Within-country variation is ±10°.
- When adding a country, pick a hue that's far from existing ones to keep countries visually distinct.

## Cache Busting
- After changing ANY GeoJSON data file, bump `DATA_VERSION` in `src/hooks/useMapData.ts`.
- The service worker uses network-first for GeoJSON. The `?v=N` query param busts browser and CDN caches.
- `next.config.ts` sets `Cache-Control: max-age=3600` (1 hour) for `/data/*` files.

## Country Config (src/config/countries.ts)
- `overviewPropertyKey` and `detailPropertyKey` must match the property names in the GeoJSON files.
- `overviewZoomThreshold` controls when overview→detail transition happens. Use lower values (7-8) for countries with fewer overview features (e.g., 16-20), higher values (9) for countries with many features.
- Add the country code to the `CountryCode` type union in `src/types/country.ts`.
- Add the country to `enabledCountries` array.
- Add country border to `public/data/borders.geojson`.

## Testing Checklist for New Countries
1. Verify postal codes match real-world codes for at least 5 major cities.
2. Confirm colors render (not gray/transparent) — check browser console for MapLibre expression errors.
3. Check overview labels show city names, not admin region names or "undefined".
4. Verify country is visually distinguishable from neighbors (different hue).
5. Test at multiple zoom levels: country view (overview tiles), region view (detail tiles), city view (labels).
6. Bump DATA_VERSION and hard-refresh to confirm cache busting works.
