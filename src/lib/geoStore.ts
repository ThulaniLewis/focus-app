// The phone's own store for places, where-am-I and the arrivals log. Its own AsyncStorage key, apart
// from the State that syncs, so none of it can ever be sent to the tablet. The background location task
// and the app both read and write it, one change at a time.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { EMPTY_GEO, type GeoData, type GeoPlace, parseGeo } from './geo';

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

/**
 * Save the list of places. Where she is starts fresh (Focus has another first look), so adding home
 * while standing in it doesn't log an arrival she didn't make.
 */
export const setPlaces = (places: GeoPlace[]) =>
  updateGeo((d) => ({ ...d, places, presence: { placeId: null, since: null, pending: null } }));

const subscribe = (l: () => void) => {
  listeners.add(l);
  if (!loaded) loadGeo().catch(() => {});
  return () => {
    listeners.delete(l);
  };
};
const snapshot = () => current;

/** The places, where she is and the log: re-renders when any of it changes. */
export function useGeo(): GeoData {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
