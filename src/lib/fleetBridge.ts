/**
 * The fleet, handed in by the REMRO TMS.
 *
 * The TMS embeds this map in a popup on its fleet planner and passes in where
 * each of its own trucks is. The positions come from CargoTrack, whose key
 * lives on the TMS server and must never reach a browser, and this app has no
 * login of its own - so the map never fetches the fleet. It only RECEIVES it,
 * by `postMessage`, and only from a parent it recognises. Opened on its own,
 * it simply has no fleet.
 *
 * The exchange:
 *
 *   map  -> parent   { source: "dispatch-map", type: "fleet-ready" }
 *   parent -> map    { source: "remro-tms", type: "fleet", at, trucks, focus? }
 *   parent -> map    { source: "remro-tms", type: "fleet-focus", key }
 *
 * "fleet-ready" carries no data, so it goes to any parent. Everything coming
 * the other way is checked twice: the sender's origin against the allow-list,
 * and the payload's shape field by field. The strings end up on screen and
 * the numbers become marker positions; a NaN longitude throws inside MapLibre.
 */

export type FleetRun = {
  /** The order number, "#58617". */
  id: string;
  /** "DE40221 -> NL5466". */
  route: string;
  /** The order's stage as the TMS names it: "Planificat", "Încărcat". */
  stage: string;
  /** The GPS state of the run, already worded: "la încărcare din azi 10:21". */
  gps: string | null;
};

export type FleetTruck = {
  /** The plate without spaces, "AR87GLI": the identity of the truck. */
  key: string;
  /** The plate as shown, "AR 87 GLI". */
  plate: string;
  driver: string | null;
  phone: string | null;
  lat: number;
  lon: number;
  /** When the tracker last reported, ISO. */
  at: string;
  moving: boolean;
  /** "lângă Rosenheim, DE". */
  place: string | null;
  /** "2.431 km de la bază · plecat lun 2 nov 09:01", or "în bază din ...". */
  base: string | null;
  run: FleetRun | null;
};

export type FleetMessage =
  | { type: 'fleet'; at: string; trucks: FleetTruck[]; focus: string | null }
  | { type: 'fleet-focus'; key: string };

/** Where the TMS is served. More can be added with NEXT_PUBLIC_FLEET_ORIGINS, comma-separated. */
const DEFAULT_ORIGINS = [
  'https://remro.herokuapp.com',
  'https://remro-frontend.robert-suselea.workers.dev',
  'http://localhost:3000',
];

export function fleetOrigins(extra: string | undefined = process.env.NEXT_PUBLIC_FLEET_ORIGINS): string[] {
  const more = (extra ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return [...new Set([...DEFAULT_ORIGINS, ...more])];
}

export function allowedFleetOrigin(origin: string, allowed: readonly string[] = fleetOrigins()): boolean {
  return allowed.includes(origin);
}

const str = (v: unknown, max = 200): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function truck(v: unknown): FleetTruck | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const key = str(o.key, 20);
  const lat = num(o.lat);
  const lon = num(o.lon);
  // A truck with no usable position cannot be put on the map; it is left out, not placed at 0,0.
  if (!key || lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const r = o.run && typeof o.run === 'object' ? (o.run as Record<string, unknown>) : null;
  const run =
    r && str(r.id, 20) && str(r.route)
      ? { id: str(r.id, 20)!, route: str(r.route)!, stage: str(r.stage, 40) ?? '', gps: str(r.gps) }
      : null;
  return {
    key,
    plate: str(o.plate, 20) ?? key,
    driver: str(o.driver, 80),
    phone: str(o.phone, 30),
    lat,
    lon,
    at: str(o.at, 40) ?? '',
    moving: o.moving === true,
    place: str(o.place),
    base: str(o.base),
    run,
  };
}

/** The message, or null when it is not one of ours or not well formed. */
export function parseFleetMessage(data: unknown): FleetMessage | null {
  if (!data || typeof data !== 'object') return null;
  const m = data as Record<string, unknown>;
  if (m.source !== 'remro-tms') return null;
  if (m.type === 'fleet-focus') {
    const key = str(m.key, 20);
    return key ? { type: 'fleet-focus', key } : null;
  }
  if (m.type !== 'fleet' || !Array.isArray(m.trucks)) return null;
  const trucks = m.trucks.slice(0, 200).map(truck).filter((t): t is FleetTruck => t !== null);
  return { type: 'fleet', at: str(m.at, 40) ?? new Date().toISOString(), trucks, focus: str(m.focus, 20) };
}

/** "acum 4 min", "acum 2 ore", "acum 3 zile": how old a position is, in the TMS's language. */
export function seenAgo(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const min = Math.max(0, Math.round((now - t) / 60_000));
  if (min < 1) return 'acum';
  if (min < 60) return `acum ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `acum ${h} ${h === 1 ? 'oră' : 'ore'}`;
  return `acum ${Math.round(h / 24)} zile`;
}

/** A position older than this is drawn faded: the truck may well be elsewhere. */
export const STALE_MS = 3 * 3600_000;
