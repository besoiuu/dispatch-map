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

## Zoom Level Pattern (MANDATORY for all countries)

Every country MUST match this exact zoom behavior — Germany and Austria are the reference:

| Zoom Level | UI Pill | What's Visible |
|-----------|---------|----------------|
| z=3-6 | Country | 3D extrusion overview tiles (colored regions with names) |
| z=6-9 | Region | Same overview tiles, flatter extrusion, region code + name labels |
| z=9-12 | City | Flat detail tiles (individual municipalities/postal areas), colored by region hue. Postal code + city name labels appear at z=10. Overview region code shows as faded watermark. |
| z=12+ | Street | Same detail tiles, larger labels. Full postal code + city name visible. |

### Standard config values (NO EXCEPTIONS):
- `overviewZoomThreshold: 9` — overview shows z=0..9.5, detail shows z=9+
- `detailLabelMinZoom: 10` — tile labels (postal code + city name) appear at z=10

### Detail data requirements:
- Municipality-level boundaries (admin_level=8 from OSM, or equivalent postal areas)
- Each feature must have: `plz5` (full postal code), `plz2` (region prefix, first 2 digits), `name` (city/town name)
- Real postal codes from GeoNames.org assigned via nearest-neighbor centroid matching

### Overview data requirements:
- Regional boundaries (states/provinces/counties dissolved from detail or admin_level=4-6)
- Each feature must have: `plz2` (region code), `label` (region name), `name` (region name), `centroid` ([lng,lat])

## Country Config (src/config/countries.ts)
- `overviewPropertyKey` and `detailPropertyKey` must match the property names in the GeoJSON files.
- Add the country code to the `CountryCode` type union in `src/types/country.ts`.
- Add the country to `enabledCountries` array.
- Add country border to `public/data/borders.geojson`.

## Testing Checklist for New Countries
1. Verify postal codes match real-world codes for at least 5 major cities.
2. Confirm colors render (not gray/transparent) — check browser console for MapLibre expression errors.
3. Check overview labels show city names, not admin region names or "undefined".
4. Verify country is visually distinguishable from neighbors (different hue).
5. Test at ALL four zoom levels: Country (3D overview), Region (overview labels), City (detail tiles + labels at z=10), Street (large labels).
6. Verify overview→detail transition happens at z=9 (not earlier, not later).
7. Verify tile labels (postal code + city name) appear at z=10.
8. Bump DATA_VERSION and hard-refresh to confirm cache busting works.
