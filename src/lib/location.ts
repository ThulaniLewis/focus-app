// Location always on, phone only. Two ways in, because Android geofences can be slow or miss:
//   1. geofences round each place (Android tells Focus on entering and leaving), and
//   2. low power background positions (every 5 minutes or so, with a small "Focus is noticing home
//      and out" notification, which Android needs to keep it running).
// Both feed the same where-am-I logic (geo.ts), which waits for a change to hold before believing it.
// Positions are used to decide, then dropped. Only arrivals and departures are kept, on this phone.
//
// The tasks are defined at the top of this file, which _layout.tsx imports, so Android can run them with
// Focus closed.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { FocusAlarm } from '../../modules/focus-alarm';
import { colors } from '../theme';
import { countLookup, type Fix, type FenceEvent, type GeoData, type GeoLogEntry, type GeoPlace, mergeShopping, type NoticeOpen, observe, placeActions, type PlaceNotice, shoppingItems, shoppingSpaceId, stillCheck, warnAt } from './geo';
import { linkedDue } from './placeLinks';
import { does } from './placeTypes';
import { dayKey } from './time';
import { loadGeo, updateGeo } from './geoStore';
import { migrate, STATE_KEY } from './migrate';
import { CHANNEL, PLACE_WARN_PREFIX } from './notify';
import { configured, supabase } from './supabase';

export const FENCE_TASK = 'focus-places-fence';
export const UPDATES_TASK = 'focus-places-updates';

const supported = Platform.OS === 'android' || Platform.OS === 'ios';

/** About every 5 minutes, or after 100 m, at "balanced" (Wi-Fi and cell, not GPS all the time). */
const UPDATE_OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.Balanced,
  timeInterval: 5 * 60 * 1000,
  distanceInterval: 100,
  deferredUpdatesInterval: 5 * 60 * 1000,
  foregroundService: {
    notificationTitle: 'Focus is noticing home and out',
    notificationBody: 'Only arrivals and departures are kept, on this phone.',
    notificationColor: colors.light.primary,
    killServiceOnDestroy: false,
  },
};

/** One observation in: move the state on, then do whatever the places' types ask for. */
export async function handleObservation(obs: Fix | FenceEvent): Promise<GeoLogEntry[]> {
  let events: GeoLogEntry[] = [];
  let lookUp: { lat: number; lon: number } | null = null;
  const data = await updateGeo((d) => {
    const r = observe(d, obs);
    events = r.events;
    if (obs.source === 'geofence') return r.data;
    const s = stillCheck(r.data, obs);
    if (s.lookUp) lookUp = { lat: obs.lat, lon: obs.lon };
    const still = s.still ?? null;
    return still === (r.data.still ?? null) ? r.data : { ...r.data, still };
  });
  if (events.length) await act(events, data).catch(() => {});
  if (lookUp) await lookForSupermarket(lookUp).catch(() => {});
  return events;
}

/** The list on this phone, topped up from the server if it can be reached quickly. */
const phoneState = async () => migrate(JSON.parse((await AsyncStorage.getItem(STATE_KEY)) ?? 'null'));

async function shoppingNow(): Promise<{ items: string[]; spaceId?: string }> {
  const state = await phoneState();
  const spaceId = shoppingSpaceId(state);
  if (!spaceId) return { items: [] };
  const local = shoppingItems(state);
  let remote: { id: string; title: string; done: boolean; deleted?: boolean }[] | null = null;
  if (configured) {
    try {
      const query = supabase.from('focus_items').select('id, data, deleted').eq('kind', 'task').eq('data->>spaceId', spaceId);
      const timeout = new Promise<null>((r) => setTimeout(() => r(null), 5000));
      const res: any = await Promise.race([query, timeout]);
      if (res && !res.error && Array.isArray(res.data))
        remote = res.data.map((row: any) => ({ id: String(row.id).slice(2), title: String(row.data?.title ?? ''), done: !!row.data?.done, deleted: !!row.deleted || !row.data }));
    } catch {
      remote = null; // offline: the phone's own list will do
    }
  }
  return { items: mergeShopping(local, remote), spaceId };
}

async function act(events: GeoLogEntry[], data: GeoData) {
  // Only fetch the shopping list when arriving somewhere that offers it.
  const needsList = events.some((e) => e.event === 'arrive' && does(data.places.find((p) => p.id === e.placeId) ?? { type: 'other' }, 'offer-shopping-list'));
  const { items, spaceId } = needsList ? await shoppingNow() : { items: [] as string[], spaceId: undefined };
  // Linked tasks: only read the tasks when something happened at a place with links.
  const now = new Date();
  const hasLinks = events.some((e) => data.links.some((l) => l.placeId === e.placeId));
  const due = hasLinks ? linkedDue(await phoneState(), data.links, dayKey(now)) : {};
  let notices: PlaceNotice[] = [];
  await updateGeo((d) => {
    const r = placeActions(d, events, items, now, due);
    notices = r.notices;
    return r.data;
  });
  for (const n of notices) await show(n, spaceId);
}

const linkFor = (open: NoticeOpen, spaceId?: string) =>
  open.to === 'shopping' ? (spaceId ? `focus://space/${spaceId}` : null) : open.to === 'work' ? `focus://work/${open.placeId}` : `focus://place-reminder/${open.placeId}`;

const dataFor = (open: NoticeOpen) => (open.to === 'shopping' ? { open: 'shopping' } : { open: open.to === 'work' ? 'work' : 'place-reminder', placeId: open.placeId });

async function show(n: PlaceNotice, spaceId?: string) {
  const link = linkFor(n.open, spaceId);
  if (n.kind === 'full-screen' && FocusAlarm?.showPlacePopup && link) {
    const ok = await FocusAlarm.showPlacePopup(n.id, n.title, n.body, link).catch(() => false);
    if (ok) return;
  }
  await Notifications.scheduleNotificationAsync({
    identifier: n.id,
    content: { title: n.title, body: n.body, data: dataFor(n.open), threadIdentifier: 'places' },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null,
  });
}

/** "Any supermarket": she's stood still somewhere new. One Google look-up; ask only if it's a supermarket and the list has things on it. */
async function lookForSupermarket(at: { lat: number; lon: number }) {
  const { items, spaceId } = await shoppingNow();
  if (!items.length || !configured) return;
  await updateGeo((d) => countLookup(d, new Date()));
  const res: any = await Promise.race([
    supabase.functions.invoke('focus-places', { body: { action: 'nearby-shop', lat: at.lat, lon: at.lon } }),
    new Promise((r) => setTimeout(() => r(null), 10000)),
  ]).catch(() => null);
  const shop = res?.data?.shop;
  if (!shop || typeof shop.name !== 'string') return;
  const n = items.length;
  await show({ kind: 'full-screen', id: `shop-${Date.now()}`, title: `You're at ${shop.name}. Want your shopping list?`, body: `${n} ${n === 1 ? 'thing' : 'things'} on it.`, open: { to: 'shopping' } }, spaceId);
}

const SHORT_DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * The day-before warnings for "once" reminders about a day: at 18:00 the day before, if it hasn't been
 * done by then, so she can phone or message instead. Re-made whenever reminders change.
 */
export async function syncReminderWarnings(data: GeoData): Promise<void> {
  if (!supported) return;
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(all.filter((n) => n.identifier.startsWith(PLACE_WARN_PREFIX)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
    const now = Date.now();
    for (const r of data.reminders) {
      const place = data.places.find((p) => p.id === r.placeId);
      const at = warnAt(r);
      if (!place || !at || at.getTime() <= now || !r.byDay) continue;
      const [y, m, d] = r.byDay.split('-').map(Number);
      const day = SHORT_DAY[new Date(y, m - 1, d).getDay()];
      await Notifications.scheduleNotificationAsync({
        identifier: `${PLACE_WARN_PREFIX}${r.id}`,
        content: {
          title: `Still to do, for ${day}: ${r.text.replace(/\.$/, '')}`,
          body: `If you won't be at ${place.name} before then, phone or message them instead. Focus can draft it.`,
          data: { open: 'place-reminder', placeId: place.id, warn: r.id },
          threadIdentifier: 'places',
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, ...(Platform.OS === 'android' ? { channelId: CHANNEL } : {}) },
      });
    }
  } catch {
    // Notifications not allowed: the place's screen still shows the reminder.
  }
}

if (supported) {
  TaskManager.defineTask(FENCE_TASK, async ({ data, error }) => {
    if (error || !data) return;
    const { eventType, region } = data as { eventType: Location.GeofencingEventType; region: Location.LocationRegion };
    if (!region?.identifier) return;
    await handleObservation({ at: new Date(), source: 'geofence', placeId: region.identifier, inside: eventType === Location.GeofencingEventType.Enter });
  });

  TaskManager.defineTask(UPDATES_TASK, async ({ data, error }) => {
    if (error || !data) return;
    const locations = [...((data as { locations?: Location.LocationObject[] }).locations ?? [])].sort((a, b) => a.timestamp - b.timestamp);
    for (const l of locations)
      await handleObservation({ at: new Date(l.timestamp), lat: l.coords.latitude, lon: l.coords.longitude, accuracyM: l.coords.accuracy, source: 'background' });
  });
}

export type LocationStatus = {
  /** "While using the app" allowed. */
  foreground: boolean;
  /** "Allow all the time" allowed. */
  background: boolean;
  /** Both ways in are running. */
  running: boolean;
};

export async function locationStatus(): Promise<LocationStatus> {
  if (!supported) return { foreground: false, background: false, running: false };
  try {
    const [fg, bg] = await Promise.all([Location.getForegroundPermissionsAsync(), Location.getBackgroundPermissionsAsync()]);
    const [fence, updates] = await Promise.all([Location.hasStartedGeofencingAsync(FENCE_TASK), Location.hasStartedLocationUpdatesAsync(UPDATES_TASK)]);
    return { foreground: fg.granted, background: bg.granted, running: fence && updates };
  } catch {
    return { foreground: false, background: false, running: false };
  }
}

const regionsFor = (places: GeoPlace[]): Location.LocationRegion[] =>
  places.map((p) => ({ identifier: p.id, latitude: p.lat, longitude: p.lon, radius: p.radiusM, notifyOnEnter: true, notifyOnExit: true }));

async function stopAll() {
  await Location.stopGeofencingAsync(FENCE_TASK).catch(() => {});
  if (await Location.hasStartedLocationUpdatesAsync(UPDATES_TASK).catch(() => false)) await Location.stopLocationUpdatesAsync(UPDATES_TASK).catch(() => {});
}

/**
 * Start (or refresh) both ways in, or stop them: on when the feature is on, this is the phone, there's
 * at least one place, and "Allow all the time" is on. Safe to call often.
 */
export async function syncTracking(opts: { on: boolean; places: GeoPlace[] }): Promise<LocationStatus> {
  if (!supported) return { foreground: false, background: false, running: false };
  try {
    if (!opts.on || !opts.places.length) {
      await stopAll();
      return await locationStatus();
    }
    const bg = await Location.getBackgroundPermissionsAsync();
    if (!bg.granted) return await locationStatus();
    await Location.startGeofencingAsync(FENCE_TASK, regionsFor(opts.places)); // replaces the old circles
    if (!(await Location.hasStartedLocationUpdatesAsync(UPDATES_TASK))) await Location.startLocationUpdatesAsync(UPDATES_TASK, UPDATE_OPTIONS);
  } catch {
    // Permission changed underneath, or Expo Go: the status says what's running.
  }
  return locationStatus();
}

/** As Focus opens: one fresh look, so the state is right even if Android missed something. */
export async function checkNow(): Promise<void> {
  if (!supported) return;
  const geo = await loadGeo();
  if (!geo.places.length) return;
  const fg = await Location.getForegroundPermissionsAsync().catch(() => null);
  if (!fg?.granted) return;
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 15000));
  const l = await Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null), timeout]);
  if (!l) return;
  await handleObservation({ at: new Date(l.timestamp), lat: l.coords.latitude, lon: l.coords.longitude, accuracyM: l.coords.accuracy, source: 'app-open' });
}

/** Where she is standing now, for "Use where I am now" on a place. Never saved anywhere else. */
/** Roughly where the phone is, to put nearby addresses first. Never asks for permission, never waits for GPS. */
export async function roughlyHere(): Promise<{ lat: number; lon: number } | null> {
  if (!supported) return null;
  const fg = await Location.getForegroundPermissionsAsync().catch(() => null);
  if (!fg?.granted) return null;
  const l = await Location.getLastKnownPositionAsync({ maxAge: 30 * 60 * 1000 }).catch(() => null);
  return l ? { lat: l.coords.latitude, lon: l.coords.longitude } : null;
}

export async function hereNow(): Promise<{ lat: number; lon: number; accuracyM: number | null } | null> {
  if (!supported) return null;
  const fg = await Location.requestForegroundPermissionsAsync().catch(() => null);
  if (!fg?.granted) return null;
  const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null);
  return l ? { lat: l.coords.latitude, lon: l.coords.longitude, accuracyM: l.coords.accuracy } : null;
}
