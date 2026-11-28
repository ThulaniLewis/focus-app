// Where am I: home, a named place, or out. Plain logic, no phone code, so it can be tested.
//
// Phone only. Places, the where-am-I state and the arrivals log live in their own store on the phone
// (geoStore.ts), never in the State that syncs, so they can't reach the tablet. Positions are used to
// decide the state and then thrown away: the only trail kept is the arrive and leave log.
//
// Nothing here knows anyone's places. Every place, its circle and what happens there is data she sets.
import type { State } from './types';

import { askLine, cleanLink, didLine, type LinkedTask, type TaskLink } from './placeLinks';
import { arriveLine, type Away, awayNow, cleanAwayRecord, cleanGrabList, type GrabList, grabsFor, leftLine, unticked } from './grabLists';
import { type Behaviour, cleanType, does, type PlaceType, typeInfo } from './placeTypes';
import { cleanLive, type LiveStatus, type LiveTrip } from './liveTraffic';

export { PLACE_TYPES, type Behaviour, type PlaceType } from './placeTypes';

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
  /** Things this place's type does that she has switched off. */
  off?: Behaviour[];
  /** Nursery or school: the travel-times place her trips here use, for leave-by times. */
  trips?: string;
  /** Work: the space that holds her work list. */
  workSpaceId?: string;
  /** Gym: the task to tick off when she's there. */
  gymTaskId?: string;
};

/**
 * Something to do or say when she gets to (or leaves) a place. Phone only, like the places.
 * "once" goes at the next arrival (before byDay, if it's about a day); "every" goes every time.
 */
export type PlaceReminder = {
  id: string;
  placeId: string;
  text: string;
  when: 'arrive' | 'leave';
  every?: boolean;
  /** The day it's about, "YYYY-MM-DD": not shown after it, and warned about the day before. */
  byDay?: string;
  createdAt: string;
  doneAt?: string;
  /** Last time it went off. */
  shownAt?: string;
  /** Last "Did you …?" after leaving without ticking it. */
  nudgedAt?: string;
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

/** Standing still somewhere that isn't one of her places, for "any supermarket". */
export type Still = { lat: number; lon: number; since: string; asked?: boolean };

export type GeoData = {
  places: GeoPlace[];
  presence: Presence;
  log: GeoLogEntry[];
  reminders: PlaceReminder[];
  /** Tasks linked to places: asked about on arriving. Phone only. */
  links: TaskLink[];
  /** Grab lists from dumps (brief 4). Phone only. */
  grabLists: GrabList[];
  /** Away from home tonight (brief 4). Phone only, never on the tablet, never read aloud. */
  away: Away | null;
  /** The "staying tonight?" question waiting to go off: "placeId|YYYY-MM-DD". */
  awayAsk?: string | null;
  /** Live traffic checks for today's trips (brief 1b Fix 3). Phone only. */
  live?: LiveTrip[];
  /** Last time Google answered, or didn't. */
  liveStatus?: LiveStatus;
  /** Off by default: ask about the list in any supermarket, not just hers. */
  anySupermarket: boolean;
  /** Tasks to tick when Focus next opens (the gym), as the background can't change the main data. */
  ticks: { taskId: string; day: string }[];
  still?: Still | null;
  /** How many supermarket look-ups today, to keep Google calls tiny. */
  lookups?: { day: string; n: number };
  /** Key place types she said aren't for her, so Focus stops asking. */
  skipped?: PlaceType[];
};

export const EMPTY_GEO: GeoData = { places: [], presence: { placeId: null, since: null, pending: null }, log: [], reminders: [], links: [], grabLists: [], away: null, anySupermarket: false, ticks: [] };

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

export const defaultRadius = (type: PlaceType) => typeInfo(type).radiusM;

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

export type NoticeOpen =
  | { to: 'shopping' }
  | { to: 'reminders'; placeId: string }
  | { to: 'work'; placeId: string }
  | { to: 'grab'; listId: string; left?: boolean }
  | { to: 'away'; placeId: string };
export type PlaceNotice = { kind: 'notify' | 'full-screen'; id: string; title: string; body: string; open: NoticeOpen };

/** Up to five things, then "and 3 more". */
export function listLine(items: string[]): string {
  const shown = items.slice(0, 5).join(', ');
  return items.length > 5 ? `${shown} and ${items.length - 5} more` : shown;
}


/** Is this reminder waiting to go off for an arrival or departure at this time? */
export function reminderDue(r: PlaceReminder, placeId: string, when: 'arrive' | 'leave', at: Date): boolean {
  if (r.placeId !== placeId || r.when !== when) return false;
  if (r.byDay && dayOf(at) > r.byDay) return false;
  if (!r.doneAt) return true;
  // "Every time" reminders come back on the next visit after being done.
  return !!r.every && r.doneAt < at.toISOString() && dayOf(new Date(r.doneAt)) !== dayOf(at);
}

/** The reminders waiting at a place now (for the full screen reminder and the place's screen). */
export function remindersAt(reminders: PlaceReminder[], placeId: string, now: Date): PlaceReminder[] {
  return reminders.filter((r) => reminderDue(r, placeId, r.when, now));
}

/** When to warn the day before, if a "once" reminder about a day hasn't been done by then. */
export const WARN_AT = '18:00';
export function warnAt(r: PlaceReminder): Date | null {
  if (r.every || r.doneAt || !r.byDay) return null;
  const [y, m, d] = r.byDay.split('-').map(Number);
  const at = new Date(y, m - 1, d - 1, Number(WARN_AT.slice(0, 2)), Number(WARN_AT.slice(3)));
  // Made after the warning time: she knows already.
  return at.toISOString() > r.createdAt ? at : null;
}

/** A first draft for the day-before message ("Tell staff X will be late" → "Hi, just to let you know X will be late."). She edits and sends it herself. */
export function draftFor(r: Pick<PlaceReminder, 'text'>): string {
  const t = r.text.trim().replace(/\.$/, '');
  const m = t.match(/^(?:tell|let)\s+(?:\S+\s+){0,3}?(?:know\s+)?(?:that\s+)?(\S+\s+(?:will|is|are|has|have|won't|can't|isn't|needs?)\b.*)$/i);
  return m ? `Hi, just to let you know ${m[1]}. Thanks` : t;
}

/**
 * What arrivals and departures set off: the shopping list at a food shop, a place's linked tasks and
 * reminders (one card per arrival), the work routine, the gym tick, and one "Did you …?" on leaving
 * without answering. Old news and an empty list set off nothing. Pure: returns the new data (reminders
 * and links marked shown or nudged) and the notices. linkedDue is the linked tasks due today, by place.
 */
export function placeActions(
  data: GeoData,
  events: GeoLogEntry[],
  shopping: string[],
  now: Date,
  linkedDue: Record<string, LinkedTask[]> = {},
): { data: GeoData; notices: PlaceNotice[] } {
  const notices: PlaceNotice[] = [];
  let reminders = data.reminders;
  let links = data.links;
  let ticks = data.ticks;
  let grabLists = data.grabLists;
  let away = data.away;
  const mark = (ids: Set<string>, field: 'shownAt' | 'nudgedAt') => {
    reminders = reminders.map((r) => (ids.has(r.id) ? { ...r, [field]: now.toISOString() } : r));
  };
  const markLinks = (ids: Set<string>, field: 'shownAt' | 'nudgedAt') => {
    links = links.map((l) => (ids.has(l.taskId) ? { ...l, [field]: now.toISOString() } : l));
  };
  for (const e of events) {
    if (now.getTime() - new Date(e.at).getTime() > STALE_MS) continue;
    const place = data.places.find((p) => p.id === e.placeId);
    if (!place) continue;
    const at = new Date(e.at);
    if (e.event === 'arrive') {
      // Home again: away mode ends, and any grab list for home shows first.
      if (place.type === 'home' && awayNow(away)) away = { ...away!, endedAt: e.at };
      for (const g of grabsFor(grabLists, place.id)) {
        if (!unticked(g).length) continue;
        notices.push({ kind: 'full-screen', id: `grab-${g.id}-${e.at}`, title: arriveLine(place), body: listLine(unticked(g).map((i) => i.text)), open: { to: 'grab', listId: g.id } });
        grabLists = grabLists.map((x) => (x.id === g.id ? { ...x, shownAt: now.toISOString() } : x));
      }
      if (does(place, 'offer-shopping-list') && shopping.length) {
        const n = shopping.length;
        notices.push({ kind: 'full-screen', id: `arrive-${place.id}-${e.at}`, title: 'Do you want to see your shopping list?', body: `${n} ${n === 1 ? 'thing' : 'things'} on it.`, open: { to: 'shopping' } });
      }
      if (does(place, 'work-routine')) {
        notices.push({ kind: 'full-screen', id: `work-${place.id}-${e.at}`, title: `You're at ${place.name}`, body: "Today's meetings, your work list and when to leave.", open: { to: 'work', placeId: place.id } });
      }
      const gym = place.gymTaskId;
      if (does(place, 'gym-tick') && gym) ticks = [...ticks.filter((t) => !(t.taskId === gym && t.day === dayOf(at))), { taskId: gym, day: dayOf(at) }];
    }
    const remOn = does(place, 'reminders');
    const linkOn = does(place, 'linked-tasks');
    // Linked tasks due today and still open here (Not today is already out of linkedDue).
    const open = linkOn ? (linkedDue[place.id] ?? []).filter((t) => links.some((l) => l.taskId === t.id && l.placeId === place.id)) : [];
    const dueRems = remOn ? reminders.filter((r) => reminderDue(r, place.id, e.event, at)) : [];
    const dueTasks = e.event === 'arrive' ? open : [];
    if (dueRems.length || dueTasks.length) {
      // One card per arrival: the linked tasks first, then the reminders.
      notices.push({
        kind: 'full-screen',
        id: `rem-${place.id}-${e.event}-${e.at}`,
        title: `You're ${e.event === 'arrive' ? 'at' : 'leaving'} ${place.name}`,
        body: [...dueTasks.map((t) => askLine(t.title)), ...dueRems.map((r) => r.text)].join(' · '),
        open: { to: 'reminders', placeId: place.id },
      });
      if (dueRems.length) mark(new Set(dueRems.map((r) => r.id)), 'shownAt');
      if (dueTasks.length) markLinks(new Set(dueTasks.map((t) => t.id)), 'shownAt');
    }
    if (e.event === 'leave') {
      // A grab list shown here, with things not ticked: one "You left without …", never more.
      for (const g of grabsFor(grabLists, place.id)) {
        if (!g.shownAt || !unticked(g).length || (g.nudgedAt && g.nudgedAt >= g.shownAt)) continue;
        notices.push({ kind: 'notify', id: `grab-left-${g.id}-${e.at}`, title: leftLine(g), body: "Tap for Done, Forgot or Didn't need.", open: { to: 'grab', listId: g.id, left: true } });
        grabLists = grabLists.map((x) => (x.id === g.id ? { ...x, nudgedAt: now.toISOString() } : x));
      }
      // Shown this visit, not answered, not asked about yet: one "Did you …?" covering all of them, never more.
      const leftRems = remOn ? reminders.filter((r) => r.placeId === place.id && r.when === 'arrive' && !r.every && !r.doneAt && !!r.shownAt && (!r.nudgedAt || r.nudgedAt < r.shownAt)) : [];
      const leftTasks = open.filter((t) => {
        const l = links.find((x) => x.taskId === t.id);
        return !!l?.shownAt && dayOf(new Date(l.shownAt)) === dayOf(at) && (!l.nudgedAt || l.nudgedAt < l.shownAt);
      });
      const texts = [...leftTasks.map((t) => t.title), ...leftRems.map((r) => r.text)];
      if (texts.length) {
        notices.push({
          kind: 'notify',
          id: `did-${place.id}-${e.at}`,
          title: didLine(texts),
          body: `You've left ${place.name}. Tap to tick ${texts.length === 1 ? 'it' : 'them'} off.`,
          open: { to: 'reminders', placeId: place.id },
        });
        if (leftRems.length) mark(new Set(leftRems.map((r) => r.id)), 'nudgedAt');
        if (leftTasks.length) markLinks(new Set(leftTasks.map((t) => t.id)), 'nudgedAt');
      }
    }
  }
  const changed = reminders !== data.reminders || ticks !== data.ticks || links !== data.links || grabLists !== data.grabLists || away !== data.away;
  return { data: changed ? { ...data, reminders, links, ticks, grabLists, away } : data, notices };
}

// ---------- Any supermarket (off by default) ----------

/** Standing within this of one spot for this long counts as being somewhere. */
export const STILL_M = 60;
export const STILL_MS = 4 * 60 * 1000;
/** Google look-ups a day, at most. */
export const LOOKUPS_A_DAY = 6;

/**
 * Has she stopped somewhere that isn't one of her places, long enough to ask "is this a supermarket?"
 * Returns the new "still" record and whether to look it up now (once per spot).
 */
export function stillCheck(data: GeoData, fix: Pick<Fix, 'lat' | 'lon' | 'accuracyM' | 'at'>): { still: Still | null; lookUp: boolean } {
  if (!data.anySupermarket || data.presence.placeId) return { still: null, lookUp: false };
  if (fix.accuracyM != null && fix.accuracyM > 100) return { still: data.still ?? null, lookUp: false };
  const s = data.still;
  if (!s || distanceM(s.lat, s.lon, fix.lat, fix.lon) > STILL_M) return { still: { lat: fix.lat, lon: fix.lon, since: fix.at.toISOString() }, lookUp: false };
  const used = data.lookups?.day === dayOf(fix.at) ? data.lookups.n : 0;
  const long = fix.at.getTime() - new Date(s.since).getTime() >= STILL_MS;
  if (long && !s.asked && used < LOOKUPS_A_DAY) return { still: { ...s, asked: true }, lookUp: true };
  return { still: s, lookUp: false };
}

/** Count one supermarket look-up against today's limit. */
export function countLookup(data: GeoData, now: Date): GeoData {
  const day = dayOf(now);
  return { ...data, lookups: { day, n: (data.lookups?.day === day ? data.lookups.n : 0) + 1 } };
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

/** Plain data in, a tidy place out (or null if it can't be one). Old places (with "rules") come through fine. */
export function cleanPlace(p: any): GeoPlace | null {
  if (!p || typeof p !== 'object' || typeof p.id !== 'string' || typeof p.name !== 'string') return null;
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return null;
  const type = cleanType(p.type);
  const radiusM = Number.isFinite(p.radiusM) && p.radiusM >= 50 && p.radiusM <= 1000 ? p.radiusM : defaultRadius(type);
  const own = typeInfo(type).behaviours;
  const off = Array.isArray(p.off) ? p.off.filter((b: unknown): b is Behaviour => typeof b === 'string' && own.includes(b as Behaviour)) : [];
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  return {
    id: p.id,
    name: p.name,
    type,
    lat: p.lat,
    lon: p.lon,
    radiusM,
    address: str(p.address),
    ...(off.length ? { off } : {}),
    ...(str(p.trips) ? { trips: str(p.trips) } : {}),
    ...(str(p.workSpaceId) ? { workSpaceId: str(p.workSpaceId) } : {}),
    ...(str(p.gymTaskId) ? { gymTaskId: str(p.gymTaskId) } : {}),
  };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function cleanReminder(r: any, placeIds: Set<string>): PlaceReminder | null {
  if (!r || typeof r.id !== 'string' || typeof r.text !== 'string' || !r.text.trim() || !placeIds.has(r.placeId)) return null;
  const iso = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  return {
    id: r.id,
    placeId: r.placeId,
    text: r.text.trim().slice(0, 200),
    when: r.when === 'leave' ? 'leave' : 'arrive',
    ...(r.every === true ? { every: true } : {}),
    ...(typeof r.byDay === 'string' && DAY.test(r.byDay) ? { byDay: r.byDay } : {}),
    createdAt: iso(r.createdAt) ?? new Date(0).toISOString(),
    ...(iso(r.doneAt) ? { doneAt: iso(r.doneAt) } : {}),
    ...(iso(r.shownAt) ? { shownAt: iso(r.shownAt) } : {}),
    ...(iso(r.nudgedAt) ? { nudgedAt: iso(r.nudgedAt) } : {}),
  };
}

/** Saved data from any build, made safe to use. */
export function parseGeo(raw: unknown): GeoData {
  const s: any = raw && typeof raw === 'object' ? raw : {};
  const places = Array.isArray(s.places) ? s.places.map(cleanPlace).filter((p: GeoPlace | null): p is GeoPlace => !!p) : [];
  const ids = new Set<string>(places.map((p: GeoPlace) => p.id));
  const pr = s.presence && typeof s.presence === 'object' ? s.presence : {};
  const presence: Presence = {
    placeId: typeof pr.placeId === 'string' && ids.has(pr.placeId) ? pr.placeId : null,
    since: typeof pr.since === 'string' ? pr.since : null,
    pending: pr.pending && typeof pr.pending.firstSeen === 'string' ? pr.pending : null,
  };
  const log = Array.isArray(s.log) ? s.log.filter((e: any) => e && typeof e.at === 'string' && (e.event === 'arrive' || e.event === 'leave')) : [];
  const reminders = Array.isArray(s.reminders) ? s.reminders.map((r: any) => cleanReminder(r, ids)).filter((r: PlaceReminder | null): r is PlaceReminder => !!r) : [];
  const links = Array.isArray(s.links) ? s.links.map((l: any) => cleanLink(l, ids)).filter((l: TaskLink | null): l is TaskLink => !!l) : [];
  const grabLists = Array.isArray(s.grabLists) ? s.grabLists.map((g: any) => cleanGrabList(g, ids)).filter((g: GrabList | null): g is GrabList => !!g) : [];
  const away = cleanAwayRecord(s.away, ids);
  const ticks = Array.isArray(s.ticks) ? s.ticks.filter((t: any) => t && typeof t.taskId === 'string' && typeof t.day === 'string') : [];
  const still = s.still && Number.isFinite(s.still.lat) && Number.isFinite(s.still.lon) && typeof s.still.since === 'string' ? s.still : null;
  const lookups = s.lookups && typeof s.lookups.day === 'string' && Number.isFinite(s.lookups.n) ? s.lookups : undefined;
  const awayAsk = typeof s.awayAsk === 'string' ? s.awayAsk : null;
  const live = cleanLive(s.live, new Date());
  const liveStatus = s.liveStatus && typeof s.liveStatus.at === 'string' ? { at: s.liveStatus.at, ok: s.liveStatus.ok === true } : undefined;
  const skipped = Array.isArray(s.skipped) ? s.skipped.filter((t: unknown) => typeof t === 'string').map(cleanType) : [];
  return { places, presence, log, reminders, links, grabLists, away, anySupermarket: s.anySupermarket === true, ticks, ...(still ? { still } : {}), ...(lookups ? { lookups } : {}), ...(skipped.length ? { skipped } : {}), ...(awayAsk ? { awayAsk } : {}), ...(live.length ? { live } : {}), ...(liveStatus ? { liveStatus } : {}) };
}
