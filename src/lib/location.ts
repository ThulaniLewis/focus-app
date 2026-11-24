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
import { type Fix, type FenceEvent, type GeoData, type GeoLogEntry, type GeoPlace, mergeShopping, noticesFor, observe, type PlaceNotice, shoppingItems, shoppingSpaceId } from './geo';
import { loadGeo, updateGeo } from './geoStore';
import { migrate, STATE_KEY } from './migrate';
import { CHANNEL } from './notify';
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

/** One observation in: move the state on, then send anything the place rules ask for. */
export async function handleObservation(obs: Fix | FenceEvent): Promise<GeoLogEntry[]> {
  let events: GeoLogEntry[] = [];
  const data = await updateGeo((d) => {
    const r = observe(d, obs);
    events = r.events;
    return r.data;
  });
  if (events.length) await sendNotices(events, data).catch(() => {});
  return events;
}

/** The list on this phone, topped up from the server if it can be reached quickly. */
async function shoppingNow(): Promise<{ items: string[]; spaceId?: string }> {
  const state = migrate(JSON.parse((await AsyncStorage.getItem(STATE_KEY)) ?? 'null'));
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

async function sendNotices(events: GeoLogEntry[], data: GeoData) {
  const wanted = events.some((e) => data.places.find((p) => p.id === e.placeId)?.rules.some((r) => r.when === e.event));
  if (!wanted) return;
  const { items, spaceId } = await shoppingNow();
  for (const n of noticesFor(events, data.places, items, new Date())) await show(n, spaceId);
}

async function show(n: PlaceNotice, spaceId?: string) {
  if (n.kind === 'full-screen' && FocusAlarm?.showPlacePopup && spaceId) {
    const ok = await FocusAlarm.showPlacePopup(n.id, n.title, n.body, `focus://space/${spaceId}`).catch(() => false);
    if (ok) return;
  }
  await Notifications.scheduleNotificationAsync({
    identifier: n.id,
    content: { title: n.title, body: n.body, data: { open: n.open }, threadIdentifier: 'places' },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null,
  });
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
export async function hereNow(): Promise<{ lat: number; lon: number; accuracyM: number | null } | null> {
  if (!supported) return null;
  const fg = await Location.requestForegroundPermissionsAsync().catch(() => null);
  if (!fg?.granted) return null;
  const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null);
  return l ? { lat: l.coords.latitude, lon: l.coords.longitude, accuracyM: l.coords.accuracy } : null;
}
