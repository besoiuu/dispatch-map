// Things that are wrong in the FILES, and show up nowhere in a unit test.
//
// Two kinds. First the shipped data: `lib/plzIndex` is now the authority for
// where every postal code is, so a preprocessing change that drops a country
// or reorders the row tuple breaks selection everywhere at once, silently.
// Second the structural fixes that were easy to undo by habit - a
// hover-only control, a marker that is not draggable, a 55 MB download that
// nothing reads - each of which was a bug a dispatcher reported.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { enabledCountries } from '@/config/countries';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf-8');
const src = (p: string) => read(`src/${p}`);
/**
 * The file with comment lines removed.
 *
 * These tests assert that certain code is ABSENT, and the comments that
 * record why it was removed quote it verbatim - so a plain substring search
 * matches the explanation and fails.
 */
const code = (p: string) =>
  src(p)
    .split(/\r?\n/)
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');

/** Every source file a dispatcher's screen is built from. */
const FILES = [
  'app/layout.tsx',
  'components/country/CountrySelector.tsx',
  'components/map/ContextMenu.tsx',
  'components/map/MapShell.tsx',
  'components/map/MapTooltip.tsx',
  'components/map/MapView.tsx',
  'components/map/RouteMarkers.tsx',
  'components/map/ZoomPills.tsx',
  'components/sidebar/Legend.tsx',
  'components/sidebar/RouteManager.tsx',
  'components/sidebar/RoutePanel.tsx',
  'components/sidebar/SearchBar.tsx',
  'components/sidebar/Sidebar.tsx',
  'components/ui/HelpPanel.tsx',
  'components/ui/InstallPrompt.tsx',
  'components/ui/MobileHint.tsx',
  'components/ui/Toast.tsx',
  'lib/export.ts',
];


// ── The shipped index ─────────────────────────────────────────────

type Row = [string, string, string, number, number];
const rows: Row[] = JSON.parse(read('public/data/search-index.json'));

test('every row is [country, plz, name, lng, lat]', () => {
  // The tuple order is positional and unlabelled, so swapping lng/lat in the
  // preprocessor would place every pin in the sea with nothing to warn us.
  for (const r of rows.slice(0, 2000)) {
    assert.equal(r.length, 5);
    assert.match(r[0], /^[a-z]{2}$/);
    assert.ok(r[1].length > 0, 'cod gol');
    assert.equal(typeof r[3], 'number');
    assert.equal(typeof r[4], 'number');
    // Europe: longitude well inside, latitude clearly north. A swap puts
    // latitude (36..58) into longitude's slot, which still passes a bare
    // number check but not this one.
    assert.ok(r[3] > -12 && r[3] < 32, `lng ${r[3]} pentru ${r[0]}:${r[1]}`);
    assert.ok(r[4] > 34 && r[4] < 60, `lat ${r[4]} pentru ${r[0]}:${r[1]}`);
  }
});

test('EVERY ENABLED COUNTRY IS IN THE INDEX', () => {
  // A country enabled in the config but missing from the index is a country
  // whose codes cannot be searched, selected or placed - and the map still
  // draws it, so it looks like it should work.
  const present = new Set(rows.map((r) => r[0]));
  const missing = enabledCountries.filter((c) => !present.has(c));
  assert.deepEqual(missing, []);
});

test('the index is big enough to be the real thing', () => {
  // Guards against a truncated or placeholder file being committed.
  assert.ok(rows.length > 40_000, `doar ${rows.length} intrari`);
});

test('German five-digit codes resolve, which is the common case', () => {
  const de = new Map(rows.filter((r) => r[0] === 'de').map((r) => [r[1], r]));
  for (const code of ['27576', '99423', '40474', '10115', '80331']) {
    assert.ok(de.has(code), `lipseste codul german ${code}`);
  }
});

// ── Fixes that habit could undo ───────────────────────────────────

test('the per-keystroke scan of the whole GeoJSON is gone', () => {
  // `useSearch` mapped and filtered every feature of every visible country -
  // 44,331 of them, 55 MB of source - on each keystroke.
  assert.throws(() => src('hooks/useSearch.ts'), 'useSearch.ts a reapărut');
});

test('no control in the stop list is revealed only by hover', () => {
  // The remove button was `opacity-0 group-hover:opacity-100`, which on a
  // phone means permanently invisible: there is no hover, so a stop could not
  // be removed by anyone on touch.
  // Only className attributes count - the comment that records the old class
  // is the reason this test exists.
  const offenders = code('components/sidebar/RoutePanel.tsx')
    .split(/\r?\n/)
    .filter((l) => l.includes('className') && /opacity-0\s+group-hover:opacity-100/.test(l));
  assert.deepEqual(offenders, [], 'un control din lista de opriri e din nou doar pe hover');
});

test('pins are draggable and say where they landed', () => {
  const markers = src('components/map/RouteMarkers.tsx');
  assert.match(markers, /draggable/, 'markerul nu mai e draggable');
  assert.match(markers, /onDragEnd/, 'nimeni nu afla unde s-a mutat');
  assert.match(markers, /onClick/, 'pinul nu se mai poate deschide');
});

test('a cancelled drag is torn down like a finished one', () => {
  // Listening only for `pointerup` leaked the window listeners and left
  // `dragIdx` set when the browser claimed the gesture - which is what made
  // the list feel broken after one failed drag on a phone.
  const panel = src('components/sidebar/RoutePanel.tsx');
  assert.match(panel, /pointercancel/);
  assert.match(panel, /touch-none/, 'fara touch-action gestul devine scroll');
});

test('the map menu can be dismissed by touch', () => {
  // It listened for `mousedown`, which a finger never produces.
  const menu = src('components/map/ContextMenu.tsx');
  assert.match(menu, /pointerdown/);
  assert.ok(!/addEventListener\('mousedown'/.test(menu));
});

test('the map menu can remove a stop, not only add things', () => {
  assert.match(src('components/map/ContextMenu.tsx'), /Remove this stop/);
});

test('both renderers use the one marker component', () => {
  // They each carried a copy, and the copies had drifted on how stops are
  // labelled. Neither may declare a Marker of its own again.
  for (const f of ['components/map/PlzLayers.tsx', 'components/map/PlzLayersPMTiles.tsx']) {
    const body = code(f);
    assert.match(body, /<RouteMarkers \/>/, `${f} nu foloseste componenta comuna`);
    assert.ok(!/<Marker\b/.test(body), `${f} si-a facut din nou propriul Marker`);
  }
});

test('detail GeoJSON is not downloaded when the tiles are in use', () => {
  // Up to 55 MB across 44,331 features, Germany alone 10.9 MB, fetched and
  // parsed on a phone in PMTiles mode where nothing reads it.
  assert.match(src('hooks/useMapData.ts'), /if \(USE_PMTILES\) return;/);
});

test('pinch-zoom of the interface stays available', () => {
  const layout = src('app/layout.tsx');
  assert.match(layout, /userScalable: true/);
  assert.ok(!/maximumScale: 1\b/.test(layout));
});

test('the routing host can be pointed somewhere with an uptime promise', () => {
  const routing = src('lib/routing.ts');
  assert.match(routing, /NEXT_PUBLIC_OSRM_BASE/);
  assert.match(routing, /AbortController/, 'cererea nu are limita de timp');
});

// ── Rules that hold across the whole interface ────────────────────

test('NO EMOJI ANYWHERE A DISPATCHER CAN SEE', () => {
  // Emoji are drawn by the operating system, so the same screen looks
  // different on every machine and they arrive with their own colours over
  // the palette. The region list used flag emoji; it shows the country code
  // now, like the rest of the app.
  const EMOJI = /[\u{1F000}-\u{1FAFF}]/u;
  const hits: string[] = [];
  for (const f of FILES) {
    src(f)
      .split(/\r?\n/)
      .forEach((line, i) => {
        if (EMOJI.test(line)) hits.push(`${f}:${i + 1} ${line.trim().slice(0, 50)}`);
      });
  }
  assert.deepEqual(hits, []);
});

test('every popover closes on a touch, not only a mouse click', () => {
  // `mousedown` is never produced by a finger, so each of these could be
  // opened on a phone and not dismissed.
  for (const f of [
    'components/map/ContextMenu.tsx',
    'components/country/CountrySelector.tsx',
    'components/sidebar/Sidebar.tsx',
  ]) {
    const body = code(f);
    assert.ok(
      !/addEventListener[(]'mousedown'/.test(body),
      `${f} inchide un popover doar pe mousedown`
    );
  }
});

test('the help dialog traps focus and says it is modal', () => {
  const help = src('components/ui/HelpPanel.tsx');
  assert.match(help, /aria-modal="true"/);
  assert.match(help, /aria-labelledby/);
  assert.match(help, /e.key !== 'Tab'/, 'fara capcana de focus');
});

test('storage reads are guarded, so a private window does not break the app', () => {
  // `themeStore` read localStorage at module scope: unguarded, that throws in
  // a private window and takes the whole module - and the app - with it.
  for (const f of [
    'store/themeStore.ts',
    'components/ui/InstallPrompt.tsx',
    'components/ui/MobileHint.tsx',
  ]) {
    const body = src(f);
    const reads = (body.match(/localStorage[.](get|set)Item/g) ?? []).length;
    const guards = (body.match(/try {/g) ?? []).length;
    assert.ok(guards > 0 && guards >= Math.min(reads, 2), `${f}: ${reads} accesari, ${guards} try`);
  }
});

test('the index and the region list key on the pair, never the code alone', () => {
  // Several features may share one plz2 code - CLAUDE.md says so - and 3,423
  // codes exist in more than one country. Both lists had rows sharing a React
  // key, which let React run the wrong row's handler.
  const legend = src('components/sidebar/Legend.tsx');
  assert.match(legend, /key={region[.]key}/);
  const bar = src('components/sidebar/SearchBar.tsx');
  assert.match(bar, /entryKey[(]r[.]country, r[.]plz[)]/);
});

test('the service worker caches the postal-code index', () => {
  // It is the authority for every lookup now. It was not cached at all, so
  // 1.9 MB went over the wire on every load and nothing worked offline.
  const sw = read('public/sw.js');
  assert.match(sw, /search-index[.]json/);
});

test('activeCountry has a writer', () => {
  // It had none, so it was Germany for ever: the zoom pills re-centred on
  // Germany from anywhere and search ranked German codes for every route.
  assert.match(src('components/map/MapView.tsx'), /setActiveCountry[(]at[)]/);
});

test('the clipboard export does not emit internal keys', () => {
  const ex = code('lib/export.ts');
  assert.ok(!/plzCodes[.]join/.test(ex), 'copiem iar cheile interne');
  assert.match(ex, /stopBadge/, 'exportul nu foloseste etichetele comune');
});

test('neither renderer has its own copy of the country outlines', () => {
  // Each carried a verbatim CountryBorders, each with its own fetch - the same
  // duplication that let the stop markers drift apart. One component now, and
  // it shares the loaded outlines with `countryAtCoord`.
  for (const f of ['components/map/PlzLayers.tsx', 'components/map/PlzLayersPMTiles.tsx']) {
    const body = code(f);
    assert.match(body, /<CountryBorders dark=/, `${f} nu foloseste componenta comuna`);
    assert.ok(!/function CountryBorders/.test(body), `${f} si-a facut din nou propriul contur`);
  }
});

test('nothing paints text-white onto a route colour', () => {
  // Five of the sixteen route colours are too pale for white text, and several
  // mid-tones are no better - which route got which depended on creation
  // order, so unreadable badges looked intermittent. `textOn` decides now.
  for (const f of ['components/map/RouteMarkers.tsx', 'components/sidebar/RoutePanel.tsx']) {
    const body = code(f);
    assert.match(body, /textOn\(/, `${f} nu foloseste textOn`);
  }
});

test('the region list does not read the viewport during render', () => {
  // `window.innerWidth` in a useState initialiser renders one value on the
  // server and another on a phone - a hydration mismatch, so React throws the
  // subtree away and renders it again.
  const legend = code('components/sidebar/Legend.tsx');
  assert.ok(!/window[.]innerWidth/.test(legend));
  assert.match(legend, /useMediaQuery/);
});
