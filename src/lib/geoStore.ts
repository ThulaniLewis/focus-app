// The phone's own store for places, where-am-I and the arrivals log. Its own AsyncStorage key, apart
// from the State that syncs, so none of it can ever be sent to the tablet. The background location task
// and the app both read and write it, one change at a time.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { EMPTY_GEO, type GeoData, type GeoPlace, parseGeo, type PlaceReminder } from './geo';
import type { SuggestedAway, SuggestedGrabList } from './dumpShapes';
import { finishGrab, newGrabList, tickGrabItem } from './grabLists';
import { addNight } from './awayMode';

export const GEO_KEY = 'focus.places.v1';

let current: GeoData = EMPTY_GEO;
let loaded = false;
let queue: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function read(): Promise<GeoData> {
  try {
    return parseGeo(JSON.parse((await AsyncStorage.getItem(GEO_KEY)) ?? 'null'));
  } catch {
    return EMPTY_GEO;
  }
}

/** Read the saved places. Safe to call more than once. */
export async function loadGeo(): Promise<GeoData> {
  current = await read();
  loaded = true;
  emit();
  return current;
}

/**
 * Change the data, one change at a time. Always reads what's saved first, because the background task
 * may have written since this copy was loaded.
 */
export function updateGeo(fn: (d: GeoData) => GeoData): Promise<GeoData> {
  const run = queue.then(async () => {
    const before = await read();
    const data = fn(before);
    if (data !== before) await AsyncStorage.setItem(GEO_KEY, JSON.stringify(data));
    current = data;
    loaded = true;
    emit();
    return data;
  });
  queue = run.catch(() => {});
  return run;
}

const where = (p: GeoPlace) => `${p.id}|${p.lat}|${p.lon}|${p.radiusM}`;

/**
 * Save the list of places. If a circle moved (or a place came or went), where she is starts fresh
 * (Focus has another first look), so adding home while standing in it doesn't log an arrival she
 * didn't make. Changing a switch or a name keeps it. Reminders for a deleted place go with it.
 */
export const setPlaces = (places: GeoPlace[]) =>
  updateGeo((d) => {
    const moved = d.places.map(where).sort().join() !== places.map(where).sort().join();
    const ids = new Set(places.map((p) => p.id));
    return {
      ...d,
      places,
      reminders: d.reminders.filter((r) => ids.has(r.placeId)),
      links: d.links.filter((l) => ids.has(l.placeId)),
      ...(moved ? { presence: { placeId: null, since: null, pending: null } } : {}),
    };
  });

const newId = () => `rem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Add a place reminder (after her yes). */
export const addReminder = (r: Omit<PlaceReminder, 'id' | 'createdAt'>) =>
  updateGeo((d) => ({ ...d, reminders: [...d.reminders, { ...r, id: newId(), createdAt: new Date().toISOString() }] }));

/** Done (or not done) with a reminder. */
export const setReminderDone = (id: string, done: boolean) =>
  updateGeo((d) => ({
    ...d,
    reminders: d.reminders.map((r) => {
      if (r.id !== id) return r;
      const { doneAt, ...rest } = r;
      return done ? { ...rest, doneAt: new Date().toISOString() } : rest;
    }),
  }));

export const deleteReminder = (id: string) => updateGeo((d) => ({ ...d, reminders: d.reminders.filter((r) => r.id !== id) }));

/** Link a task to a place (after her yes). A task has one place: a new link replaces the old. */
export const linkTask = (taskId: string, placeId: string) =>
  updateGeo((d) => ({ ...d, links: [...d.links.filter((l) => l.taskId !== taskId), { taskId, placeId, createdAt: new Date().toISOString() }] }));

export const unlinkTask = (taskId: string) => updateGeo((d) => ({ ...d, links: d.links.filter((l) => l.taskId !== taskId) }));

/** Not yet (the leaving nudge still comes) or Not today (not asked again that day). Done is a tick on the task itself. */
export const answerLink = (taskId: string, answer: 'not-yet' | 'not-today', day: string) =>
  updateGeo((d) => ({
    ...d,
    links: d.links.map((l) => (l.taskId !== taskId ? l : answer === 'not-yet' ? { ...l, notYetAt: new Date().toISOString() } : { ...l, notToday: day })),
  }));

/** "Not for me" on a key place question, or ask again. */
/** Grab lists (brief 4). */
/** Save a grab list (after Add). Returns its id; if she's at its place now, it counts as shown already. */
export async function addGrabList(s: SuggestedGrabList): Promise<{ id: string; hereNow: boolean }> {
  let out = { id: '', hereNow: false };
  await updateGeo((d) => {
    const hereNow = !!s.placeId && d.presence.placeId === s.placeId;
    const g = newGrabList(s, new Date(), hereNow);
    out = { id: g.id, hereNow };
    return { ...d, grabLists: [...d.grabLists.filter((x) => !x.closedAt).slice(-9), g] };
  });
  return out;
}
/** The leaving nudge's answers: Done (got them), Forgot (keep it for next time), Didn't need. */
export const finishGrabList = (listId: string, how: 'got' | 'forgot' | 'not-needed') =>
  updateGeo((d) => ({ ...d, grabLists: d.grabLists.map((g) => (g.id === listId ? finishGrab(g, how, new Date()) : g)) }));
export const tickGrab = (listId: string, itemId: string) =>
  updateGeo((d) => ({ ...d, grabLists: d.grabLists.map((g) => (g.id === listId ? tickGrabItem(g, itemId, new Date()) : g)) }));
/** Done (or close it): it leaves nothing behind on Today. */
export const closeGrabList = (listId: string) =>
  updateGeo((d) => ({ ...d, grabLists: d.grabLists.map((g) => (g.id === listId ? { ...g, closedAt: new Date().toISOString() } : g)) }));

/** Away from home (brief 4). Null ends it. */
export const setAway = (a: SuggestedAway | null) =>
  updateGeo((d) => ({ ...d, away: a ? addNight({ ...a, since: new Date().toISOString() }, dayOf(new Date())) : d.away && !d.away.endedAt ? { ...d.away, endedAt: new Date().toISOString() } : d.away }));
/** Yes to "Still away tonight?". */
export const awayTonight = (day: string) => updateGeo((d) => (d.away && !d.away.endedAt ? { ...d, away: addNight(d.away, day) } : d));
/** The evening question was put to her (or taken back on leaving), so it's asked once. */
export const markAwayAsk = (key: string | null) => updateGeo((d) => ({ ...d, awayAsk: key }));
const pad = (n: number) => String(n).padStart(2, '0');
const dayOf = (x: Date) => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;

/** Undo a live traffic move: the usual leave-by, and the jobs back where they were. */
export const undoLive = (key: string) => updateGeo((d) => ({ ...d, live: (d.live ?? []).map((r) => (r.key === key ? { ...r, undone: true } : r)) }));

export const skipType = (type: GeoPlace['type'], skip: boolean) =>
  updateGeo((d) => ({ ...d, skipped: skip ? [...new Set([...(d.skipped ?? []), type])] : (d.skipped ?? []).filter((x) => x !== type) }));

export const setAnySupermarket = (on: boolean) => updateGeo((d) => ({ ...d, anySupermarket: on, still: null }));

/** The gym ticks waiting for the app, handed over once. */
export async function takeTicks(): Promise<{ taskId: string; day: string }[]> {
  let out: { taskId: string; day: string }[] = [];
  await updateGeo((d) => {
    out = d.ticks;
    return d.ticks.length ? { ...d, ticks: [] } : d;
  });
  return out;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  if (!loaded) loadGeo().catch(() => {});
  return () => {
    listeners.delete(l);
  };
};
const snapshot = () => current;
/** The phone's places data as last read, for planning nudges outside React. */
export const geoSnapshot = () => current;

/** The places, where she is and the log: re-renders when any of it changes. */
export function useGeo(): GeoData {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
