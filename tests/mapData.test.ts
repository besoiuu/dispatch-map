// The shipped GeoJSON, checked against what the app actually requires of it.
//
// CLAUDE.md lists these rules and the "Testing Checklist for New Countries"
// asks a human to verify them by eye. Nothing did, and three real defects were
// sitting in the files: Poland had no `bbox` on any region, so clicking a
// Polish region in the list or on the map did nothing at all; three Austrian
// and three Italian features had a `label` but no `name`; and three Italian
// features used ISO province codes as `plz2`, which CLAUDE.md forbids outright.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Feature, FeatureCollection } from 'geojson';
import { countries, enabledCountries } from '@/config/countries';
import type { CountryCode } from '@/types/country';

const read = (p: string): FeatureCollection =>
  JSON.parse(readFileSync(new URL(`../public${p}`, import.meta.url), 'utf-8'));

const overview = (c: CountryCode) => read(countries[c].overviewPath);
const detail = (c: CountryCode) => read(countries[c].detailPath);

const prop = (f: Feature, key: string) => String(f.properties?.[key] ?? '').trim();

// ── Overview files ────────────────────────────────────────────────

test('every overview feature has plz2, name, label and centroid', () => {
  for (const c of enabledCountries) {
    for (const f of overview(c).features) {
      for (const key of ['plz2', 'name', 'label']) {
        assert.ok(prop(f, key), `${c}: feature fara ${key}: ${JSON.stringify(f.properties)}`);
      }
      const centroid = f.properties?.centroid;
      assert.ok(Array.isArray(centroid) && centroid.length === 2, `${c}: centroid lipsa`);
    }
  }
});

test('EVERY OVERVIEW FEATURE HAS A BBOX, or its region cannot be clicked', () => {
  // The region list and the overview click both zoom with `bbox`. Poland had
  // none, so all sixteen Polish regions were inert - and silently so, because
  // the handler simply returned when the property was missing.
  for (const c of enabledCountries) {
    for (const f of overview(c).features) {
      const bbox = f.properties?.bbox as number[] | undefined;
      assert.ok(Array.isArray(bbox) && bbox.length === 4, `${c}: ${prop(f, 'plz2')} fara bbox`);
      assert.ok(bbox[0] < bbox[2] && bbox[1] < bbox[3], `${c}: bbox inversat ${bbox}`);
    }
  }
});

test('PLZ2 IS NUMERIC, except where the country itself is not', () => {
  // Italy shipped OT, OG and VS - the abolished Sardinian provinces - as region
  // codes. CLAUDE.md forbids ISO codes here, and these matched no detail
  // feature at all, so they coloured nothing and printed a code that does not
  // exist in the postal system. They are 07, 08 and 09 now, after their
  // capitals (Olbia 07026, Tortoli 08048, Sanluri 09025).
  //
  // France's 2A and 2B are NOT the same situation and must not be "fixed":
  // Corsica's department codes genuinely are two characters with one digit, and
  // the French detail data uses them too, for 26 areas. The config's own
  // pattern did not match them either, which is now corrected.
  for (const c of enabledCountries) {
    for (const f of overview(c).features) {
      const code = prop(f, 'plz2');
      assert.ok(
        /^\d{1,2}$/.test(code) || (c === 'fr' && /^2[AB]$/.test(code)),
        `${c}: plz2 "${code}" nu e un cod de regiune valid`
      );
    }
  }
});

/**
 * Overview and detail region codes do not agree everywhere, and this records
 * exactly where, because it is a data-generation gap rather than a bug in code.
 *
 * `plz2` is supposed to be the same administrative region code at both levels.
 * In five countries it is not, and Austria is the extreme: its overview carries
 * 53 distinct region codes while its detail areas use only 9, so the two files
 * were produced from different schemes. The visible effect is limited - the
 * detail layer colours areas from their own codes, so the map still draws - but
 * an overview region with no areas beneath it colours nothing at city zoom, and
 * a detail area whose region is absent gets no watermark label.
 *
 * France's single orphan is different again and worth stating separately: the
 * overview has department 75 (Paris) and the detail file has no Paris at all -
 * 95 departments, and the search index holds no French code starting 75 either.
 * That is missing source data, not a mis-keyed property.
 *
 * Fixing any of this means regenerating that country's data with
 * `npm run preprocess`, not editing a property, so the numbers are pinned here.
 * The test fails if a gap grows AND if one closes, which is the point: neither
 * a regression nor a fix should pass unnoticed.
 */
const REGION_CODE_GAPS: Record<string, { orphanRegions: number; areasWithNoRegion: number }> = {
  at: { orphanRegions: 44, areasWithNoRegion: 0 },
  be: { orphanRegions: 0, areasWithNoRegion: 0 },
  cz: { orphanRegions: 2, areasWithNoRegion: 7 },
  de: { orphanRegions: 0, areasWithNoRegion: 0 },
  dk: { orphanRegions: 0, areasWithNoRegion: 0 },
  fr: { orphanRegions: 1, areasWithNoRegion: 0 },
  hu: { orphanRegions: 0, areasWithNoRegion: 61 },
  it: { orphanRegions: 0, areasWithNoRegion: 0 },
  nl: { orphanRegions: 0, areasWithNoRegion: 0 },
  pl: { orphanRegions: 0, areasWithNoRegion: 5 },
  ro: { orphanRegions: 1, areasWithNoRegion: 0 },
  sk: { orphanRegions: 0, areasWithNoRegion: 1 },
};

test('the overview/detail region-code gaps are exactly the known ones', () => {
  for (const c of enabledCountries) {
    const regions = new Set(overview(c).features.map((f) => prop(f, 'plz2')));
    const areas = new Set(detail(c).features.map((f) => prop(f, 'plz2')));
    const actual = {
      orphanRegions: [...regions].filter((r) => !areas.has(r)).length,
      areasWithNoRegion: [...areas].filter((a) => !regions.has(a)).length,
    };
    assert.deepEqual(actual, REGION_CODE_GAPS[c], `${c}: decalajul s-a schimbat`);
  }
});

test('ITALY NO LONGER SHIPS ISO PROVINCE CODES', () => {
  // The three that started this: OT, OG and VS - the abolished Sardinian
  // provinces - matched no detail area and printed a code with no postal
  // meaning. CLAUDE.md forbids ISO codes in `plz2` outright.
  const codes = overview('it').features.map((f) => prop(f, 'plz2'));
  for (const iso of ['OT', 'OG', 'VS']) {
    assert.ok(!codes.includes(iso), `codul ISO ${iso} a revenit`);
  }
  // And the prefixes they became are present.
  for (const real of ['07', '08', '09']) {
    assert.ok(codes.includes(real), `lipseste prefixul ${real}`);
  }
});

// ── Detail files ──────────────────────────────────────────────────

test('every detail feature has plz5, plz2 and name', () => {
  for (const c of enabledCountries) {
    for (const f of detail(c).features) {
      for (const key of ['plz5', 'plz2', 'name']) {
        assert.ok(prop(f, key), `${c}: feature fara ${key}`);
      }
    }
  }
});

test('"None" is a town, not a missing value', () => {
  // None is a real municipality in the Province of Turin, postcode 10060 - the
  // search index lists it between Candiolo and Osasco. It reads exactly like a
  // stringified null, so a cleanup pass that strips falsy-looking names would
  // delete a real place. It stays.
  const italy = detail('it').features.filter((f) => prop(f, 'name') === 'None');
  assert.equal(italy.length, 1);
  assert.equal(prop(italy[0], 'plz5'), '10060');
});

test('PLZ2 IS NOT THE PREFIX OF PLZ5, and nothing may assume it is', () => {
  // The tempting assumption, and it is wrong for three countries. `plz2` is an
  // administrative region code, taken from the region capital's postcode, so a
  // municipality inside it can start with different digits: 1939 of 2118
  // Austrian areas disagree with their own region code, 2454 of 2484 Polish and
  // 2107 of 2888 Slovak. CLAUDE.md says as much - "countries where admin
  // regions don't map 1:1 to postal regions".
  //
  // This is pinned because code DID assume it: the hover handler derived the
  // neighbouring-areas filter with `featureId.slice(0, 2)`, which highlighted
  // the wrong group in exactly those three countries and looked right in the
  // other nine.
  const disagreeing: Record<string, number> = {};
  for (const c of enabledCountries) {
    const n = detail(c).features.filter((f) => !prop(f, 'plz5').startsWith(prop(f, 'plz2'))).length;
    if (n > 0) disagreeing[c] = n;
  }
  assert.deepEqual(Object.keys(disagreeing).sort(), ['at', 'pl', 'sk']);
  for (const [c, n] of Object.entries(disagreeing)) {
    assert.ok(n > 1000, `${c}: doar ${n} - verifica daca datele s-au schimbat`);
  }
});
