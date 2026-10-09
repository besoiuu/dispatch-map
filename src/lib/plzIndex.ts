/**
 * The postal-code index: one authority for "what is this code, and where".
 *
 * Two rules are structural here rather than remembered at each call site:
 *
 *  1. A postal code is NOT a key. 3,423 of the codes in this index exist in
 *     more than one country, and some repeat inside one country (Austrian
 *     1040 "Wien, Wieden" appears twice). Everything below is keyed by the
 *     PAIR, and `entryKey` is the only thing allowed to build that key.
 *
 *  2. Coordinates come from here, not from the detail GeoJSON. The GeoJSON
 *     is 55 MB across 44,331 features and is fetched only once the map has
 *     been moved at zoom >= 7, so for the first minutes of a session it is
 *     simply absent — which used to mean a code picked from search was
 *     added to `plzCodes`, produced no stop, and could never be added again
 *     because the duplicate guard then saw it as present. This index is
 *     1.9 MB, loads up front, and covers every code in every country.
 */

import type { CountryCode } from '@/types/country';
import { enabledCountries } from '@/config/countries';

export interface PlzEntry {
  /** Lower-case ISO code, as the data file stores it. */
  country: string;
  plz: string;
  name: string;
  lng: number;
  lat: number;
}

/** The pair that identifies a postal area. Never key on `plz` alone. */
export function entryKey(country: string, plz: string): string {
  return `${country.toLowerCase()}:${plz}`;
}

type Row = [string, string, string, number, number];

let entries: PlzEntry[] | null = null;
/** key -> first entry with that key; duplicates inside a country collapse. */
let byKey: Map<string, PlzEntry> | null = null;
let loadPromise: Promise<PlzEntry[]> | null = null;
const listeners = new Set<() => void>();

function ingest(rows: Row[]): PlzEntry[] {
  const list: PlzEntry[] = rows.map(([country, plz, name, lng, lat]) => ({
    country,
    plz,
    name,
    lng,
    lat,
  }));
  const map = new Map<string, PlzEntry>();
  for (const e of list) {
    const k = entryKey(e.country, e.plz);
    if (!map.has(k)) map.set(k, e);
  }
  entries = list;
  byKey = map;
  for (const fn of listeners) fn();
  return list;
}

/** Loads the index once. Safe to call from anywhere, repeatedly. */
export function loadPlzIndex(): Promise<PlzEntry[]> {
  if (entries) return Promise.resolve(entries);
  if (loadPromise) return loadPromise;
  if (typeof window === 'undefined') return Promise.resolve([]);
  loadPromise = fetch('/data/search-index.json')
    .then((r) => r.json())
    .then((rows: Row[]) => ingest(rows))
    .catch(() => {
      loadPromise = null;
      return [];
    });
  return loadPromise;
}

export function isPlzIndexReady(): boolean {
  return entries !== null;
}

export function subscribePlzIndex(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** One postal area by the (country, code) pair, or null if unknown. */
export function lookupPlz(country: string, plz: string): PlzEntry | null {
  if (!byKey) return null;
  return byKey.get(entryKey(country, plz)) ?? null;
}

/** Same, from a stored `"de:27576"` string. Bare codes cannot be resolved. */
export function lookupPrefixed(prefixed: string): PlzEntry | null {
  if (!byKey) return null;
  const i = prefixed.indexOf(':');
  if (i <= 0) return null;
  return byKey.get(entryKey(prefixed.slice(0, i), prefixed.slice(i + 1))) ?? null;
}

const CODE_SET = new Set<string>(enabledCountries);

export interface ParsedQuery {
  /** Country the user named explicitly, if any. */
  country: CountryCode | null;
  /** What is left to match against codes and names. */
  text: string;
}

/**
 * Pulls a leading country out of the query, so a dispatcher can type the way
 * they speak: "DE 27576", "de27576", "de:27576", "DE Bremerhaven". Without
 * this, every one of those matched nothing in the index and fell through to
 * free-text geocoding, which answered with whatever was near.
 */
export function parseQuery(raw: string): ParsedQuery {
  const q = raw.trim();

  // The two letters count as a country in exactly three shapes. Anything
  // looser reads the start of a town as a country: "Italia" begins with "it"
  // and "Bergen" with "be", and treating those as filters returned nothing.
  const m =
    // "DE 27576", "de:27576", "DE-27576", "de, Bremerhaven"
    /^([a-z]{2})[\s:,-]+(.+)$/i.exec(q) ??
    // "de27576" - glued, but only to digits, which no name starts with
    /^([a-z]{2})(\d.*)$/i.exec(q) ??
    // "de" - the country on its own
    /^([a-z]{2})()$/i.exec(q);

  if (m) {
    const cc = m[1].toLowerCase();
    if (CODE_SET.has(cc)) return { country: cc as CountryCode, text: m[2].trim() };
  }
  return { country: null, text: q };
}

export interface SearchOptions {
  /** Results in this country outrank equally good ones elsewhere. */
  activeCountry?: CountryCode | null;
  limit?: number;
}

/**
 * Ranked postal-code search.
 *
 * The whole index is scanned — 43,504 entries costs well under a frame, and
 * the previous version stopped early (`break` once 60 candidates had been
 * collected), which is why Germany was unreachable: the file is ordered
 * at, be, cz, de, ... so "27" filled up on Austrian codes after 3,234 rows
 * and returned twenty of them, with Germany's 8,176 never looked at.
 */
export function searchPlz(query: string, opts: SearchOptions = {}): PlzEntry[] {
  const limit = opts.limit ?? 20;
  if (!entries) return [];

  const { country, text } = parseQuery(query);
  const q = text.toLowerCase();
  if (!q) return [];
  // A country with nothing after it ("de") is a filter, not a search.
  if (q.length < 2 && !country) return [];

  const active = opts.activeCountry ?? null;
  // Rank: exact code, then code prefix, then name. Within each, the country
  // the user named wins, then the country they are working in.
  const buckets: PlzEntry[][] = Array.from({ length: 9 }, () => []);

  for (const e of entries) {
    if (country && e.country !== country) continue;

    let kind: number;
    if (e.plz.toLowerCase() === q) kind = 0;
    else if (e.plz.toLowerCase().startsWith(q)) kind = 1;
    else if (e.name.toLowerCase().includes(q)) kind = 2;
    else continue;

    const locality = country ? 0 : e.country === active ? 1 : 2;
    buckets[kind * 3 + locality].push(e);
  }

  const out: PlzEntry[] = [];
  for (const b of buckets) {
    for (const e of b) {
      out.push(e);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** Test seam: lets the suite load a fixture instead of fetching. */
export function __setIndexForTests(rows: Row[]): void {
  ingest(rows);
}
