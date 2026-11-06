/**
 * The map's own connection to the TMS: a key, where the TMS is, and the
 * driver names it last told us.
 *
 * When the TMS opens this map (the popup on its fleet planner, or "Deschide
 * harta" there) it hands over a key it signed, valid 30 days, that reads the
 * fleet's GPS and nothing else. It is kept here, in this browser, so the map
 * opened on its own keeps showing the trucks. The TMS checks the key on every
 * call; this file only stores it and drops it once it has expired.
 *
 * Driver names are NOT something the key can read - they come from orders,
 * behind the full TMS login. The last ones the TMS sent are remembered per
 * truck, so a truck opened from a bookmark still says whose it is.
 */

export type FleetLink = {
  token: string;
  exp: number;
  /** The TMS this key belongs to, e.g. "https://remro.herokuapp.com". */
  api: string;
  drivers: Record<string, { driver: string | null; phone: string | null }>;
};

const KEY = 'dispatch-fleet-link-v1';

/** A TMS address the key may be sent to: https, or http on localhost for development. */
export function validApi(api: unknown): string | null {
  if (typeof api !== 'string') return null;
  try {
    const u = new URL(api);
    if (u.protocol === 'https:' || (u.protocol === 'http:' && u.hostname === 'localhost')) return u.href.replace(/\/$/, '');
  } catch {
    /* not a URL */
  }
  return null;
}

export function validToken(token: unknown): string | null {
  return typeof token === 'string' && /^fm1\.[\w-]+\.[\w-]+$/.test(token) && token.length < 600 ? token : null;
}

export function loadLink(now = Date.now(), store: Pick<Storage, 'getItem' | 'removeItem'> | null = safeStorage()): FleetLink | null {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return null;
    const l = JSON.parse(raw) as FleetLink;
    if (!validToken(l.token) || !validApi(l.api) || typeof l.exp !== 'number') return null;
    if (l.exp <= now) {
      store?.removeItem(KEY);
      return null;
    }
    return { ...l, drivers: l.drivers && typeof l.drivers === 'object' ? l.drivers : {} };
  } catch {
    return null;
  }
}

export function saveLink(link: FleetLink, store: Pick<Storage, 'setItem'> | null = safeStorage()) {
  try {
    store?.setItem(KEY, JSON.stringify(link));
  } catch {
    /* private window or storage full: the map still works for this visit */
  }
}

export function clearLink(store: Pick<Storage, 'removeItem'> | null = safeStorage()) {
  try {
    store?.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The key from a link the TMS opened: `#fleet-key=fm1...&fleet-api=https://...`,
 * alongside whatever else the hash carries. Null when absent or malformed.
 */
export function linkFromHash(hash: string): { token: string; api: string } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const token = validToken(params.get('fleet-key'));
  const api = validApi(params.get('fleet-api'));
  return token && api ? { token, api } : null;
}

/** The hash with the key taken out, so it does not stay in the address bar or the history. */
export function hashWithoutLink(hash: string): string {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  params.delete('fleet-key');
  params.delete('fleet-api');
  const rest = params.toString();
  return rest ? `#${rest}` : '';
}

/** "6 dec": when the key stops working. */
export const untilDate = (ms: number) =>
  new Date(ms).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', timeZone: 'Europe/Bucharest' }).replace('.', '');
