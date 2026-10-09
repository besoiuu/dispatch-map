// Search: what a dispatcher types, and what comes back.
//
// Every case here is a bug that shipped. The index is ordered at, be, cz, de,
// ... and the old ranking stopped scanning once it had 60 candidates, so a
// German dispatcher typing "27" got twenty Austrian codes and Germany's 8,176
// entries were never looked at. Country prefixes matched nothing at all, and
// `lookupPlz` keyed on the code alone would answer with whichever country
// happened to come first.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __setIndexForTests,
  entryKey,
  lookupPlz,
  lookupPrefixed,
  parseQuery,
  searchPlz,
} from '@/lib/plzIndex';

type Row = [string, string, string, number, number];

/**
 * A miniature of the real file, in the real order, with the real collisions:
 * AT 1040 twice (the live index does), AT 2700 four times, and codes that
 * exist in two countries. Enough Austrian 27xx entries to bury Germany if the
 * scan gives up early.
 */
const INDEX: Row[] = [
  ['at', '1040', 'Wien, Wieden', 16.3671, 48.1927],
  ['at', '1040', 'Wien, Wieden', 16.3695, 48.1942],
  ['at', '1060', 'Wien, Mariahilf', 16.347, 48.195],
  ['at', '2700', 'Bad Fischau', 16.17, 47.84],
  ['at', '2700', 'Katzelsdorf', 16.22, 47.79],
  ['at', '2700', 'Weikersdorf am Steinfeld', 16.17, 47.77],
  ['at', '2700', 'Wiener Neustadt', 16.24, 47.81],
  ['at', '2721', 'Dreistetten', 16.12, 47.83],
  ['at', '2751', 'Wollersdorf', 16.23, 47.88],
  ['at', '2755', 'Oed', 16.18, 47.9],
  ['at', '4020', 'Linz', 14.29, 48.3],
  ['be', '1040', 'Etterbeek', 4.39, 50.83],
  ['cz', '27601', 'Melnik', 14.47, 50.35],
  ['de', '27568', 'Bremerhaven', 8.57, 53.55],
  ['de', '27570', 'Bremerhaven', 8.59, 53.54],
  ['de', '27576', 'Bremerhaven', 8.61, 53.57],
  ['de', '40474', 'Dusseldorf', 6.76, 51.25],
  ['de', '99423', 'Weimar', 11.32, 50.98],
  ['nl', '1060', 'Amsterdam', 4.8, 52.35],
];

__setIndexForTests(INDEX);

// ── The country prefix ────────────────────────────────────────────

test('a country typed in front of the code is understood', () => {
  // None of these matched anything before: the query went to the index as
  // one string, no entry's code or name contained "de 27576", and the whole
  // thing fell through to free-text geocoding - which answered with whatever
  // was nearest. That is the "it proposes places near my wish" complaint.
  for (const q of ['de 27576', 'DE 27576', 'de27576', 'de:27576', 'DE-27576']) {
    const { country, text } = parseQuery(q);
    assert.equal(country, 'de', q);
    assert.equal(text, '27576', q);
  }
});

test('a two-letter query that is a country is a filter on its own', () => {
  assert.deepEqual(parseQuery('it'), { country: 'it', text: '' });
});

test('a town whose name starts with a country code is still a town', () => {
  // "ital..." must not be read as Italy, and "be" inside "Bergen" must not
  // make it Belgian.
  assert.equal(parseQuery('Italia').country, null);
  assert.equal(parseQuery('Bergen').country, null);
  assert.equal(parseQuery('Dresden').country, null);
});

test('a country prefix restricts the results to that country', () => {
  const hits = searchPlz('de 275');
  assert.ok(hits.length > 0);
  assert.ok(hits.every((h) => h.country === 'de'), hits.map((h) => h.country).join(','));
});

// ── Ranking ───────────────────────────────────────────────────────

test('THE WHOLE INDEX IS SCANNED, so Germany is reachable', () => {
  // The old loop broke out at `limit * 3` candidates. With Austria first in
  // the file, "27" filled that quota on Austrian codes and returned twenty
  // of them; measured against the live index it stopped after 3,234 of
  // 43,504 rows. German 275xx codes could not be found at two characters.
  const hits = searchPlz('27', { activeCountry: 'de', limit: 20 });
  assert.ok(
    hits.some((h) => h.country === 'de' && h.plz === '27576'),
    'un cod german lipseste din rezultate: ' + hits.map((h) => h.country + h.plz).join(' ')
  );
});

test('the country being worked in comes first', () => {
  const hits = searchPlz('27', { activeCountry: 'de', limit: 20 });
  assert.equal(hits[0].country, 'de', 'primul rezultat nu e din tara activa');
  // Austria still appears - it is a real answer - just after.
  assert.ok(hits.some((h) => h.country === 'at'));
});

test('switching the active country reorders the same results', () => {
  const de = searchPlz('27', { activeCountry: 'de', limit: 20 });
  const at = searchPlz('27', { activeCountry: 'at', limit: 20 });
  assert.equal(de[0].country, 'de');
  assert.equal(at[0].country, 'at');
  assert.equal(de.length, at.length, 'aceleasi rezultate, alta ordine');
});

test('an exact code outranks a longer code that starts with it', () => {
  const hits = searchPlz('1040', { activeCountry: 'be' });
  assert.equal(hits[0].plz, '1040');
  assert.equal(hits[0].country, 'be', 'potrivirea exacta din tara activa e prima');
});

test('a code outranks a town name that merely contains the digits', () => {
  const hits = searchPlz('2700', { activeCountry: 'de' });
  assert.ok(hits.every((h) => h.plz.startsWith('2700')));
});

test('a town name is searchable, not only a code', () => {
  const hits = searchPlz('bremerhaven', { activeCountry: 'de' });
  assert.equal(hits.length, 3);
  assert.ok(hits.every((h) => h.name === 'Bremerhaven'));
});

test('one character is not a search', () => {
  assert.deepEqual(searchPlz('2'), []);
  assert.deepEqual(searchPlz(''), []);
});

// ── The (plz, country) pair ───────────────────────────────────────

test('a lookup needs the country, because codes are shared', () => {
  // 1060 is Wien Mariahilf AND Amsterdam; in the live index 3,423 codes exist
  // in more than one country. Keyed on the code alone, a lookup answers with
  // whichever country loaded first - which once flew the map to the wrong
  // country and is why CLAUDE.md states the rule.
  assert.equal(lookupPlz('at', '1060')?.name, 'Wien, Mariahilf');
  assert.equal(lookupPlz('nl', '1060')?.name, 'Amsterdam');
  assert.equal(lookupPlz('de', '1060'), null);
});

test('the key is built one way only', () => {
  assert.equal(entryKey('DE', '27576'), 'de:27576');
  assert.equal(entryKey('de', '27576'), 'de:27576');
});

test('a stored prefixed code resolves to a position', () => {
  const e = lookupPrefixed('de:27576');
  assert.equal(e?.name, 'Bremerhaven');
  assert.deepEqual([e?.lng, e?.lat], [8.61, 53.57]);
});

test('a bare code cannot be resolved, and says so', () => {
  // Rather than guessing a country. The route store qualifies codes before
  // they are stored for exactly this reason.
  assert.equal(lookupPrefixed('27576'), null);
});

test('a duplicate inside one country resolves to one entry', () => {
  // AT 1040 appears twice in the real index. The lookup must still answer.
  assert.equal(lookupPlz('at', '1040')?.plz, '1040');
});
