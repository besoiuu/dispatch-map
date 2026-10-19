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

# Search & Lookups

## `lib/plzIndex.ts` is the authority for every postal code

One module owns loading `public/data/search-index.json` (1.9 MB, 43,504
entries, every code in all twelve countries), ranking searches, and answering
"where is this code". It lives outside React because the route store and the
stop builder need it too.

**Coordinates come from the index, never from the detail GeoJSON.** That
GeoJSON is 55 MB across 44,331 features and `loadDetailForCountries` only
fetches it after the map has been moved at zoom >= 7 — so for the opening
minutes of a session there is none. Stops used to be built from it, which made
the worst bug in the app: a code picked from search was pushed into
`plzCodes`, produced no stop, no pin and no sidebar row, and then the
duplicate guard saw it as present, so selecting it again did nothing, for
ever, silently. `addPlzToActiveRoute` now resolves the position and creates
the stop in the same tick, and returns `'added' | 'duplicate' | 'no-route' |
'unknown-code'` so the caller can always say what happened.

In PMTiles mode (`NEXT_PUBLIC_USE_PMTILES=true`, which is production) the
detail GeoJSON is not fetched at all — nothing reads it. The overview files
(7 MB) are still loaded, because `Legend` counts and lists regions from them
in both modes.

## Every distance on screen comes from a public demo server

`src/lib/routing.ts` calls OSRM at
`process.env.NEXT_PUBLIC_OSRM_BASE || 'https://router.project-osrm.org'`.
That default is the project's **public demo instance**. It has no uptime
guarantee and its usage policy asks people not to build on it, so every
kilometre and every ETA this app shows - and the ones the loadboard quotes a
carrier from - depend on something nobody here operates.

It fails honestly today: `calculateRoute` returns null on a timeout or a
non-answer and the panel raises "Routing service did not answer - distances
unavailable" rather than drawing a route with no numbers. That is the right
behaviour and should stay.

What is missing is somewhere else to point. Set `NEXT_PUBLIC_OSRM_BASE` to a
self-hosted OSRM (or a paid routing API with an OSRM-compatible response) and
nothing else has to change. Worth doing before a dispatcher plans a day
around these figures.

## The `#route=` link is a contract with another repo

The loadboard (`remro-live-loads`) turns a selection of loads into a link
that opens this app with the route already drawn. The format is parsed and
tested in `src/lib/routeHash.ts`, not in the component, because it is used
by code that does not live here:

```
#route=<urlencoded name>:<item>,<item>,...
```

An item is either a **prefixed postal code** - `de:40721`, country first,
the form `lookupPrefixed` needs (see the section above on codes not being
unique) - or a **coordinate**, `@lat;lng`.

Two optional parameters come with it:

```
&kinds=wppd     what each stop is FOR, one letter per item, same order
&eur=1250       what the whole run earns
```

`kinds` letters are `p` pickup, `d` delivery, `w` waypoint. It is rejected
unless it is exactly as long as the items, because a kinds string out of
step marks the wrong legs empty - a confident lie rather than a missing
feature.

**The kind is stored ON THE STOP, never as a parallel array.** Three things
reorder stops: the store appends waypoints and codes differently, the user
drags, and optimise rewrites the order outright. A positional list points at
the wrong stops in all three. A `codeKinds` map on the route keys them by
code as well, because the postal index is 1.9 MB and lands after mount - an
unresolvable code becomes a stop later, in `RoutePanel`, and would otherwise
lose what it is for on the way.

Three things about it that are not obvious:

- **Coordinates were broken from the start.** They were documented as
  `@lat,lng`, but items are split on commas first, so `@51.2277,6.7735`
  arrived as `@51.2277` - NaN longitude, dropped - and a bare `6.7735`,
  which then fell through to `addPlzToActiveRoute` as if it were a postal
  code. That is exactly the failure `routeStore` calls its worst: a code in
  `plzCodes` that never becomes a stop, shows nothing, and afterwards
  blocks the duplicate guard. `@lat;lng` is the form to write; `@lat,lng`
  is still read, by taking the following bare number as the longitude.
- **The hash is read on mount only.** A link opened while this app is
  already running does nothing, so whoever generates one should open a new
  tab.
- **A route name that already exists is reused**, and
  `addPlzToActiveRoute` reports `duplicate` for a code that is in ANY
  route, not just the active one. Sending the same codes twice merges them
  into the existing route and silently skips anything already placed
  elsewhere.

## Postal codes are NOT unique across countries

`plz2`/`plz5` values repeat between countries — 3,423 codes in the index exist
in more than one, and some repeat inside one country (Austrian `1040`
"Wien, Wieden" appears twice). **Every lookup, key, cache or Map that turns a
code into a place must be keyed by `(plz, country)`.** `entryKey(country, plz)`
is the only thing allowed to build that key; it returns `"de:27576"`.

Three separate bugs came from breaking this rule, and each one is now covered
by a test:

- `SearchBar` matched on `plz` alone and flew the map to the wrong country
  (fixed in `9265121`).
- The result list used `key={plz-${r.plz}}`, so two rows shared a React key
  and clicking one could run the other's handler.
- `highlightedPlz` was passed as a bare code, so highlighting one area lit up
  the same digits in every other country's layer. It is now prefixed, and each
  country layer compares only its own half.

## The ranking scans the whole index

`searchPlz` makes one full pass over all 43,504 entries — well under a frame.
The previous version stopped early (`break` once 60 candidates had been
collected), and since the file is ordered `at, be, cz, de, ...`, a query like
`27` filled that quota on Austrian codes after 3,234 rows and returned twenty
of them. Germany's 8,176 entries were never looked at. Do not reintroduce a
bound on the scan; bound the *output* instead.

Results are ranked exact code > code prefix > name, and within each by
country: the one the user named, then `activeCountry`, then the rest.

## A country can be typed into the query

`parseQuery` accepts `DE 27576`, `de:27576`, `DE-27576`, `de27576`,
`de, Bremerhaven` and `de` alone. The separator is **required** unless what
follows starts with a digit, or the start of a town name gets read as a
country: `Italia` begins with `it` and `Bergen` with `be`.

## Nominatim runs alongside the index, not instead of it

Any index hit used to suppress geocoding entirely, so a street address in a
town whose postal code happened to prefix-match was unreachable. The geocoder
is now consulted whenever the query carries a letter, and the request passes
`countrycodes` — without it Nominatim answers with whatever is nearest
anywhere in Europe, which is what made suggestions feel like near-misses
(`bounded=0` makes the viewbox a ranking hint, not a filter).

Postal-area results add an area to the route; address results add a waypoint.
The list labels which is which, because the two do different things.

# Map interaction

- **Pins are draggable** (`RouteMarkers.tsx`, one component for both
  renderers) and `moveStop` in the route store is what they call. Neither
  existed before: the markers had no `draggable`, no `onDragEnd` and no
  `onClick`, and the store had no action that could change a position, so no
  waypoint could be moved on any device.
- **Tapping a pin opens its menu** (`map:stopmenu` -> `ContextMenu` with a
  `stop`), which is the only place a stop can be removed from the map. The
  menu previously offered nothing but ways to add.
- **Long-press opens that menu on touch**, with a 500 ms hold and a 12 px
  movement tolerance. `contextmenu` does not fire on touch, and the old
  handler cancelled on *any* `touchmove`, so an 800 ms press almost never
  completed — a finger always drifts.
- **Tapping an area already on a route removes it**, now with an Undo in the
  toast. Ctrl+Z was the only way back, and no phone has one.
- Anything that is the sole control for an action must be visible without
  hover. The stop-remove button was `opacity-0 group-hover:opacity-100`, which
  on a phone means permanently invisible.
- Drag-to-reorder uses a dedicated handle with `touch-action: none` and
  handles `pointercancel`. Starting a drag from the whole row meant every
  attempt to scroll the list began one, and listening only for `pointerup`
  leaked window listeners and left `dragIdx` stuck when the browser claimed
  the gesture.
- Touch targets are at least 44 px. Pins stay 28 px visually and get their hit
  area from padding.

# Routing

`lib/routing.ts` defaults to OSRM's public demo server — no key, no uptime
promise, rate-limited. Point `NEXT_PUBLIC_OSRM_BASE` at your own instance for
anything serious. Every request carries an `AbortController` with a 12 s
timeout and every failure shape returns `null`, because an unbounded request
left the panel on "Calculating..." indefinitely; `RoutePanel` reports the
failure rather than leaving a stale distance on screen.

# The rest of the interface

- **No emoji.** The region list used flag emoji; it shows the country code in
  a chip instead. Emoji are drawn by the operating system, so the same screen
  looks different on every machine and they arrive with their own colours over
  the palette. `source.test.ts` scans every screen file for them.
- **Every popover closes on `pointerdown`, not `mousedown`.** A finger never
  produces a mousedown, so the map menu, the country toggles and the settings
  menu could each be opened on a phone and not dismissed.
- **Touch targets are 44 px.** The zoom pills, region rows, country toggles,
  the help and settings buttons, the toast controls and the install prompt
  were all between 14 and 26 px.
- **`activeCountry` is written by the map.** Nothing called
  `setActiveCountry`, so it was Germany for ever: the zoom pills re-centred on
  Germany from anywhere, and search ranked German codes for a Dutch route.
  `countryAtCoord` resolves it from the map centre on every move-end, using the
  real outlines in `borders.geojson` — the same file the border lines are drawn
  from, loaded once and shared. The bounding boxes stay as a fallback for two
  cases: before the outlines have loaded, and when a point matches no outline
  at all. That second case is real, not theoretical — the outlines are
  simplified for drawing, so Copenhagen sits a fraction north of its own
  coastline and matches no ring. Only a point outside every box comes back
  null; a country this map does not cover reads as its nearest neighbour
  (Zurich reads as Germany), which is right for the one thing the value does.
- **`COUNTRY_BOUNDS` is derived from the outlines, not hand-written.** The
  hand-written values were slightly too *small* — Romania's outline reached
  29.706 against an east edge of 29.7, Slovakia's 49.614 against 49.6, Austria's
  49.001 against 49.0. Those boxes gate both this lookup and the detail-data
  prefetch, so a few kilometres of the Danube delta and the northern Tatras
  resolved to no country and loaded no data. A test asserts every outline's
  European rings fit inside its box; overseas territory (Curaçao in the Dutch
  outline, Guadeloupe and French Guiana in the French one) is correct data and
  deliberately outside.
- **`borders.geojson` must carry `code` on every feature.** Slovakia's had only
  `name`. Nothing noticed, because the border layer draws every feature as a
  line regardless of properties — but anything keyed on `code` skipped Slovakia
  silently, and this lookup is keyed on `code`.
- **White text is never painted onto a route colour directly.** `textOn()` in
  `lib/colors.ts` picks black or white. Five of the sixteen route colours are
  too pale for white (#bfef45, #fabed4, #aaffc3, #dcbeff, #42d4f4) and several
  mid-tones are no better — white on #3cb44b is 2.7:1. Which route got which
  colour depended on creation order, so unreadable badges looked intermittent.
  The rule is "white unless white falls below 4.5:1", not "whichever has more
  contrast": both guarantee a pass, but max-contrast flips on near-ties and
  puts black on crimson where white reads better and already passes.
- **One `CountryBorders` component.** Both renderers carried a verbatim copy,
  each with its own fetch — the duplication that let the stop markers drift.
- **The region list must not read `window.innerWidth` during render.** That
  renders one value on the server and another on a phone, which is a hydration
  mismatch. `useMediaQuery` subscribes instead.
- **In PMTiles mode the sidebar does not wait for the overview GeoJSON.** The
  7 MB is read by the region list alone, and blocking the whole sidebar behind
  it meant a phone stared at a skeleton while it downloaded.
- **The map tooltip's route lookup was dead.** It compared the bare hovered
  code against `plzCodes`, which holds `"de:27576"`, so it never matched and
  the tooltip never named the route an area belonged to. It builds the pair
  from `hoveredCountry` now.
- **Several features may share one `plz2`**, so the region list keys on
  `(country, code, index)`. Keying on the code alone gave rows the same React
  key — the same bug the search list had.
- **Storage reads are wrapped in try/catch.** `themeStore` read localStorage
  at module scope; unguarded, that throws in a private window and takes the
  module, and therefore the app, down with it.
- **"The user has chosen a theme" is its own flag** (`dispatch-theme-manual`).
  It used to be inferred from the presence of the persisted zustand key — but
  zustand writes that key on *any* state change, including the automatic
  application of the OS preference on first load. So the first visit looked
  like a manual choice and the app stopped following the OS afterwards.

# Export

`routeToCSV` and `routeAsText` both label stops with `stopBadge`, not the list
index — lettering by position gave waypoints a letter and shifted every pickup
after one, so the sheet disagreed with the pins. CSV cells are RFC-4180 quoted
(a label with a comma used to shift the columns) and the file carries a BOM so
Excel reads the German and Romanian names correctly.

`copyRouteAsText` used to copy `route.plzCodes.join(', ')` — raw internal keys
like `de:27576`, with every waypoint missing, while the toast said "copied".

`printRoute` removes the `dark` class directly instead of calling the store's
`toggle()`, because `toggle()` persists: a failure mid-print left dark mode
switched off permanently. It is also guarded against a second click during its
2.5 s wait, which used to toggle the theme twice and leave it inverted.

# Service worker

`public/sw.js` must cache `/data/search-index.json` — it is the authority for
every lookup in the app, and it was not cached at all: 1.9 MB over the wire on
every load, and nothing searchable offline. Non-`/data` responses are now
cached on success too; before, the "network-first, fall back to cache" branch
could never hit because nothing was ever written, so the PWA did not work
offline despite the manifest and the install prompt. `.pmtiles` is still never
intercepted — Range requests must reach the network untouched.

# Shipped data: what is checked, and what is known to be wrong

`tests/mapData.test.ts` enforces the rules the "Testing Checklist for New
Countries" above asks a human to verify by eye. Nothing did, and three real
defects were sitting in the files:

- **Poland carried no `bbox` on any region.** `bbox` is what the region list and
  the overview click use to zoom, so all sixteen Polish regions were inert, and
  silently - the handler just returned when the property was missing.
- **Three Austrian and three Italian overview features had a `label` but no
  `name`**, which this file requires on every overview feature.
- **Italy shipped `OT`, `OG` and `VS` as `plz2`** - ISO codes for the abolished
  Sardinian provinces, which this file forbids outright. They matched no detail
  area at all, so they coloured nothing and printed a region code with no postal
  meaning. They are now `07`, `08` and `09`, after their capitals (Olbia 07026,
  Tortolì 08048, Sanluri 09025).

`DATA_VERSION` is 22 for those three fixes.

Two things that look like defects and are not:

- **`name: "None"` on Italian area 10060 is correct.** None is a real
  municipality in the Province of Turin; the search index lists it between
  Candiolo and Osasco. A cleanup pass that strips falsy-looking names deletes a
  real place.
- **France's `2A` and `2B` are correct.** Corsica's department codes genuinely
  are two characters with one digit, and the French detail data uses them for 26
  areas. The config's own `postcodeFormat` did not match them (`/^\d{2}[AB]?$/`)
  and now does. Those fields - `postcodeFormat`, `postcodeLength`,
  `overviewDigits` - are read by nothing at present.

## `plz2` IS NOT the prefix of `plz5`

The tempting assumption, and wrong for three countries. `plz2` is an
administrative region code taken from the region capital's postcode, so a
municipality inside it can start with other digits: **1939 of 2118** Austrian
areas disagree with their own region code, **2454 of 2484** Polish, **2107 of
2888** Slovak.

Code did assume it. The hover handler derived its neighbouring-areas filter with
`featureId.slice(0, 2)`, so hovering in Austria, Poland or Slovakia highlighted
the wrong group of areas - and looked perfectly right in the other nine
countries. It reads `plz2` off the feature now.

## The region-code gap, which is NOT fixed

Overview and detail are supposed to use the same region codes. In five countries
they do not, and `REGION_CODE_GAPS` in the test pins exactly how far apart they
are. Austria is the extreme: its overview carries **53** distinct region codes
while its detail areas use **9**, so the two files came out of different
schemes. France has one orphan of a different kind - the overview has department
75 (Paris) and the detail file has no Paris at all, nor does the search index.

The map still draws, because the detail layer colours areas from their own
codes. What breaks is smaller: an overview region with no areas colours nothing
at city zoom, and a detail area whose region is missing gets no watermark label.

**Fixing any of it means regenerating that country's data with
`npm run preprocess`, not editing a property**, which needs the OSM/GeoNames
sources. The numbers are pinned so the test fails if a gap grows *or* closes.

# Tests

```
npm test
```

`node --import tsx --test "tests/*.test.ts"` — Node's own runner, no test
framework, using the `tsx` that was already a devDependency so the suite reads
the real TypeScript and the `@/` alias.

What is pinned, and why:

- **`plzIndex.test.ts`** — the ranking and the country prefix, on a miniature
  index in the real file order with the real collisions. The Germany-is-
  reachable test is the early-`break` bug; the `Italia` test caught a bug
  while being written.
- **`routeStore.test.ts`** — a code becomes a stop with no map data loaded,
  and every outcome is reported. This is the silent-selection bug.
- **`stopBadge.test.ts`** — labels, including that a waypoint must not
  relabel the pickups after it. The two renderers had drifted here.
- **`routing.test.ts`** — every OSRM failure shape returns null, and the
  request carries an abort signal.
- **`export.test.ts`** — the sheet and the clipboard agree with the pins,
  and a label with a comma or a quote survives the CSV.
- **`countryAtCoord.test.ts`** — the bounding-box fallback on its own:
  overlapping boxes resolve to the nearer country.
- **`countryBorders.test.ts`** — the real outlines: every feature has a
  `code`, every outline fits its box, a triple-border town resolves
  correctly, and a coastal city still resolves through the fallback.
- **`colors.test.ts`** — every route colour, including the two hardcoded
  pin colours, clears 4.5:1 against the text `textOn` picks for it.
- **`mapData.test.ts`** — the shipped GeoJSON against the rules above:
  every overview feature has a name, label, centroid and bbox; `plz2` is
  never an ISO code; the region-code gaps are exactly the known ones.
- **`source.test.ts`** — reads the files: every enabled country is in the
  shipped index and its rows are `[country, plz, name, lng, lat]` with
  plausible coordinates; neither renderer has grown its own `Marker` again;
  no control in the stop list is hover-only; the drag handles
  `pointercancel`; the menu dismisses on `pointerdown`; detail GeoJSON stays
  unfetched under PMTiles; pinch-zoom stays enabled.

Nothing tests the DOM scraping of MapLibre layers or the gestures themselves —
those need a browser. The suite covers every decision made around them.
