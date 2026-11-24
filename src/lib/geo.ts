// Where am I: home, a named place, or out. Plain logic, no phone code, so it can be tested.
//
// Phone only. Places, the where-am-I state and the arrivals log live in their own store on the phone
// (geoStore.ts), never in the State that syncs, so they can't reach the tablet. Positions are used to
// decide the state and then thrown away: the only trail kept is the arrive and leave log.
//
// Nothing here knows anyone's places. Every place, its circle and what happens there is data she sets.
import type { State } from './types';

export type PlaceType = 'home' | 'food-shop' | 'family' | 'nursery' | 'gym' | 'other';

export const PLACE_TYPES: { id: PlaceType; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'food-shop', label: 'Food shop', icon: 'shopping-cart' },
  { id: 'family', label: 'Family', icon: 'users' },
  { id: 'nursery', label: 'Nursery or school', icon: 'smile' },
  { id: 'gym', label: 'Gym', icon: 'activity' },
  { id: 'other', label: 'Other', icon: 'map-pin' },
];

/** What happens at a place, as data. More shopping rules can be added here later. */
export type PlaceAction = 'remind-shopping' | 'offer-shopping-list';
export type PlaceRule = { when: 'arrive' | 'leave'; action: PlaceAction };

export type GeoPlace = {
  id: string;
  name: string;
  type: PlaceType;
  lat: number;
  lon: number;
  /** The circle round the centre, in metres. */
  radiusM: number;
  /** The address she picked, to show back to her. */
  address?: string;
  rules: PlaceRule[];
};

/** How Focus found out: Android's geofence, a background position, or a check as Focus opened. */
export type Source = 'geofence' | 'background' | 'app-open';

export type GeoLogEntry = { at: string; placeId: string; placeName: string; event: 'arrive' | 'leave'; source: Source };

export type Presence = {
  /** The place she's at, or null for out. */
  placeId: string | null;
  /** When that started (ISO). Null until Focus has had its first look. */
  since: string | null;
  /** A change seen but not yet held long enough to believe. */
  pending?: { placeId: string | null; firstSeen: string; source: Source } | null;
};

export type GeoData = { places: GeoPlace[]; presence: Presence; log: GeoLogEntry[] };

export const EMPTY_GEO: GeoData = { places: [], presence: { placeId: null, since: null, pending: null }, log: [] };

/** A change has to hold this long before it counts, so the edge of a circle doesn't flicker. */
export const HOLD_MS = 2 * 60 * 1000;
/** Once at a place, she has to be this far past its edge to have left it. */
export const EDGE_MARGIN_M = 40;
/** Positions vaguer than this say nothing useful. */
export const MAX_ACCURACY_M = 250;
/** A check as Focus opens is believed straight away when it's this sharp. */
export const SHARP_M = 50;
/** Notifications for an arrival or departure found out later than this are not sent (it's old news). */
export const STALE_MS = 30 * 60 * 1000;
/** How long the log is kept. */
export const KEEP_DAYS = 60;

export const defaultRadius = (type: PlaceType) => (type === 'home' ? 175 : 120);

/** The usual rules for a kind of place. She can change them; they're stored on the place. */
export function defaultRules(type: PlaceType): PlaceRule[] {
  if (type === 'home') return [{ when: 'leave', action: 'remind-shopping' }];
  if (type === 'food-shop') return [{ when: 'arrive', action: 'offer-shopping-list' }];
  return [];
}

/** Metres between two points. */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export type Fix = { at: Date; lat: number; lon: number; accuracyM?: number | null; source: 'background' | 'app-open' };
export type FenceEvent = { at: Date; source: 'geofence'; placeId: string; inside: boolean };

/**
 * Where a position puts her: a place id, null for out, or undefined when it says nothing (too vague,
 * or in the margin just outside the place she's at).
 */
export function placeForFix(places: GeoPlace[], current: string | null, fix: Pick<Fix, 'lat' | 'lon' | 'accuracyM'>): string | null | undefined {
  if (fix.accuracyM != null && fix.accuracyM > MAX_ACCURACY_M) return undefined;
  const here = current ? places.find((p) => p.id === current) : undefined;
  if (here) {
    const d = distanceM(here.lat, here.lon, fix.lat, fix.lon);
    if (d <= here.radiusM) return here.id;
    if (d <= here.radiusM + EDGE_MARGIN_M) return undefined; // the margin: no news
  }
  let best: { id: string; d: number } | null = null;
  for (const p of places) {
    const d = distanceM(p.lat, p.lon, fix.lat, fix.lon);
    if (d <= p.radiusM && (!best || d < best.d)) best = { id: p.id, d };
  }
  return best ? best.id : null;
}

function placeForFence(presence: Presence, e: FenceEvent): string | null | undefined {
  if (e.inside) return e.placeId;
  // Leaving a place only means "out" if that's where she was (or was about to be).
  if (presence.placeId === e.placeId || presence.pending?.placeId === e.placeId) return null;
  return undefined;
}

/** Drop log entries older than KEEP_DAYS. */
export function trimLog(log: GeoLogEntry[], now: Date): GeoLogEntry[] {
  const cut = now.getTime() - KEEP_DAYS * 86400000;
  return log.filter((e) => new Date(e.at).getTime() >= cut);
}

/**
 * Take one observation (a position or a geofence event) and move the state on. Returns the new data and
 * any arrivals or departures it confirmed. Pure.
 *
 * - A change only counts once it has held for HOLD_MS, and it's logged at the time it was first seen.
 * - A sharp check as Focus opens counts straight away.
 * - The very first look just sets where she is, without logging an arrival she didn't make.
 */
export function observe(data: GeoData, obs: Fix | FenceEvent): { data: GeoData; events: GeoLogEntry[] } {
  const { presence, places } = data;
  const seen = obs.source === 'geofence' ? placeForFence(presence, obs) : placeForFix(places, presence.placeId, obs);
  if (seen === undefined) return { data, events: [] };
  const at = obs.at.toISOString();

  if (presence.since === null) {
    return { data: { ...data, presence: { placeId: seen, since: at, pending: null } }, events: [] };
  }
  if (seen === presence.placeId) {
    return presence.pending ? { data: { ...data, presence: { ...presence, pending: null } }, events: [] } : { data, events: [] };
  }

  const pending = presence.pending && presence.pending.placeId === seen ? presence.pending : null;
  const firstSeen = pending ? pending.firstSeen : at;
  const held = obs.at.getTime() - new Date(firstSeen).getTime() >= HOLD_MS;
  const sharpOpen = obs.source === 'app-open' && obs.accuracyM != null && obs.accuracyM <= SHARP_M;
  if (!held && !sharpOpen) {
    return { data: { ...data, presence: { ...presence, pending: { placeId: seen, firstSeen, source: pending ? pending.source : obs.source } } }, events: [] };
  }

  const source = pending ? pending.source : obs.source;
  const name = (id: string) => places.find((p) => p.id === id)?.name ?? 'a place';
  const events: GeoLogEntry[] = [];
  if (presence.placeId) events.push({ at: firstSeen, placeId: presence.placeId, placeName: name(presence.placeId), event: 'leave', source });
  if (seen) events.push({ at: firstSeen, placeId: seen, placeName: name(seen), event: 'arrive', source });
  return {
    data: { ...data, presence: { placeId: seen, since: firstSeen, pending: null }, log: trimLog([...data.log, ...events], obs.at) },
    events,
  };
}

// ---------- What happens on arrival and departure ----------

export type PlaceNotice = { kind: 'notify' | 'full-screen'; id: string; title: string; body: string; open: 'shopping' };

/** Up to five things, then "and 3 more". */
export function listLine(items: string[]): string {
  const shown = items.slice(0, 5).join(', ');
  return items.length > 5 ? `${shown} and ${items.length - 5} more` : shown;
}

/** The notices the place rules ask for. Nothing for old news, and nothing about an empty list. */
export function noticesFor(events: GeoLogEntry[], places: GeoPlace[], shopping: string[], now: Date): PlaceNotice[] {
  const out: PlaceNotice[] = [];
  for (const e of events) {
    if (now.getTime() - new Date(e.at).getTime() > STALE_MS) continue;
    const place = places.find((p) => p.id === e.placeId);
    if (!place || !shopping.length) continue;
    for (const r of place.rules) {
      if (r.when !== e.event) continue;
      if (r.action === 'remind-shopping') {
        out.push({ kind: 'notify', id: `leave-${e.placeId}-${e.at}`, title: 'On your shopping list', body: `${listLine(shopping)}. Passing a shop?`, open: 'shopping' });
      } else if (r.action === 'offer-shopping-list') {
        const n = shopping.length;
        out.push({ kind: 'full-screen', id: `arrive-${e.placeId}-${e.at}`, title: 'Do you want to see your shopping list?', body: `${n} ${n === 1 ? 'thing' : 'things'} on it.`, open: 'shopping' });
      }
    }
  }
  return out;
}

// ---------- The shopping list ----------

export const shoppingSpaceId = (state: Pick<State, 'spaces'>) => state.spaces.find((s) => s.kind === 'shopping')?.id;

/** What's still to buy, as Today counts it. */
export function shoppingItems(state: Pick<State, 'spaces' | 'tasks'>): { id: string; title: string }[] {
  const id = shoppingSpaceId(state);
  if (!id) return [];
  return state.tasks.filter((t) => t.spaceId === id && !t.done).map((t) => ({ id: t.id, title: t.title }));
}

/**
 * The list on this phone plus what the server has (say, added on the tablet since Focus was last
 * open). The server's copy of an item wins; items it has ticked or deleted drop out.
 */
export function mergeShopping(
  local: { id: string; title: string }[],
  remote: { id: string; title: string; done: boolean; deleted?: boolean }[] | null,
): string[] {
  if (!remote) return local.map((i) => i.title);
  const byId = new Map(local.map((i) => [i.id, i.title] as [string, string | null]));
  for (const r of remote) byId.set(r.id, r.done || r.deleted ? null : r.title);
  return [...byId.values()].filter((t): t is string => !!t);
}

// ---------- Showing it ----------

const pad = (n: number) => String(n).padStart(2, '0');
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Home since 17:42", "At the gym since 10:02", "Out since Mon 09:10". Null until Focus knows. */
export function whereLine(data: GeoData, now: Date): string | null {
  const { presence, places } = data;
  if (!presence.since || !places.length) return null;
  const since = new Date(presence.since);
  const when = dayOf(since) === dayOf(now) ? hm(since) : `${SHORT_DAYS[since.getDay()]} ${hm(since)}`;
  const place = presence.placeId ? places.find((p) => p.id === presence.placeId) : undefined;
  if (!place) return `Out since ${when}`;
  if (place.type === 'home') return `Home since ${when}`;
  return `At ${place.name} since ${when}`;
}

/** One line of the log: "Left home 08:05", "Arrived Nursery 08:21". */
export function logLine(e: GeoLogEntry, places: GeoPlace[]): string {
  const place = places.find((p) => p.id === e.placeId);
  const name = place?.type === 'home' ? 'home' : (place?.name ?? e.placeName);
  return `${e.event === 'arrive' ? 'Arrived' : 'Left'} ${name} ${hm(new Date(e.at))}`;
}

/** A day's arrivals and departures, in order. `day` is "YYYY-MM-DD", local time. */
export function logForDay(log: GeoLogEntry[], day: string): GeoLogEntry[] {
  return log.filter((e) => dayOf(new Date(e.at)) === day).sort((a, b) => a.at.localeCompare(b.at));
}

/** Plain data in, a tidy place out (or null if it can't be one). */
export function cleanPlace(p: any): GeoPlace | null {
  if (!p || typeof p !== 'object' || typeof p.id !== 'string' || typeof p.name !== 'string') return null;
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return null;
  const type: PlaceType = PLACE_TYPES.some((t) => t.id === p.type) ? p.type : 'other';
  const radiusM = Number.isFinite(p.radiusM) && p.radiusM >= 50 && p.radiusM <= 1000 ? p.radiusM : defaultRadius(type);
  const rules = Array.isArray(p.rules) ? p.rules.filter((r: any) => r && (r.when === 'arrive' || r.when === 'leave') && typeof r.action === 'string') : defaultRules(type);
  return { id: p.id, name: p.name, type, lat: p.lat, lon: p.lon, radiusM, address: typeof p.address === 'string' ? p.address : undefined, rules };
}

/** Saved data from any build, made safe to use. */
export function parseGeo(raw: unknown): GeoData {
  const s: any = raw && typeof raw === 'object' ? raw : {};
  const places = Array.isArray(s.places) ? s.places.map(cleanPlace).filter((p: GeoPlace | null): p is GeoPlace => !!p) : [];
  const pr = s.presence && typeof s.presence === 'object' ? s.presence : {};
  const presence: Presence = {
    placeId: typeof pr.placeId === 'string' && places.some((p: GeoPlace) => p.id === pr.placeId) ? pr.placeId : null,
    since: typeof pr.since === 'string' ? pr.since : null,
    pending: pr.pending && typeof pr.pending.firstSeen === 'string' ? pr.pending : null,
  };
  const log = Array.isArray(s.log) ? s.log.filter((e: any) => e && typeof e.at === 'string' && (e.event === 'arrive' || e.event === 'leave')) : [];
  return { places, presence, log };
}
