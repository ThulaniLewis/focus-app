// The setup checklist: every permission Focus uses, whether it's on, and how to turn it on.
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { Linking, Platform } from 'react-native';
import { FocusAlarm } from '../../modules/focus-alarm';
import { calendarAllowed } from './calendar';
import { askExactAlarms, askPermission, exactAlarmsAllowed } from './notify';

export type PermissionId = 'location' | 'location-always' | 'notifications' | 'full-screen' | 'exact-alarms' | 'battery' | 'calendar' | 'microphone';

export type PermissionItem = {
  id: PermissionId;
  name: string;
  /** One plain line on why. */
  why: string;
  /** What to tap once Android's settings page is open, when it isn't just "Allow". */
  steps?: string;
  /** true on, false off, null when this build can't tell (before 0.8.0). */
  check: () => Promise<boolean | null>;
  /** Ask, or open the right settings page. */
  fix: () => Promise<void>;
};

const safe = async (f: () => Promise<boolean | null>) => {
  try {
    return await f();
  } catch {
    return null;
  }
};

export const PERMISSIONS: PermissionItem[] = [
  {
    id: 'location',
    name: 'Location while using Focus',
    why: 'So Focus can find where you are when you set up a place.',
    check: () => safe(async () => (await Location.getForegroundPermissionsAsync()).granted),
    fix: async () => {
      const r = await Location.requestForegroundPermissionsAsync();
      if (!r.granted && !r.canAskAgain) await Linking.openSettings();
    },
  },
  {
    id: 'location-always',
    name: 'Location all the time',
    why: 'So Focus knows you are home or out with the app closed. Only arrivals and departures are kept, on this phone.',
    steps: 'Tap Location, then Allow all the time.',
    check: () => safe(async () => (await Location.getBackgroundPermissionsAsync()).granted),
    fix: async () => {
      const fg = await Location.getForegroundPermissionsAsync();
      if (!fg.granted && !(await Location.requestForegroundPermissionsAsync()).granted) return;
      // Android 11 and later opens Focus's location page for this.
      const r = await Location.requestBackgroundPermissionsAsync();
      if (!r.granted && !r.canAskAgain) await Linking.openSettings();
    },
  },
  {
    id: 'notifications',
    name: 'Notifications',
    why: 'For leave-by times, timers and your shopping list when you go out.',
    check: () => safe(async () => (await Notifications.getPermissionsAsync()).granted),
    fix: async () => {
      if (!(await askPermission())) await Linking.openSettings();
    },
  },
  {
    id: 'full-screen',
    name: 'Full screen notifications',
    why: 'So your shopping list can pop up when you reach the shop, like an alarm.',
    steps: 'Switch on Allow full screen notifications.',
    check: () => safe(async () => (FocusAlarm ? FocusAlarm.canUseFullScreenIntent() : null)),
    fix: async () => {
      if (FocusAlarm) await FocusAlarm.openFullScreenSettings();
    },
  },
  {
    id: 'exact-alarms',
    name: 'Alarms and reminders',
    why: 'So leave-by reminders land on the minute, not a few minutes late.',
    steps: 'Switch on Allow setting alarms and reminders.',
    check: () => safe(exactAlarmsAllowed),
    fix: askExactAlarms,
  },
  {
    id: 'battery',
    name: 'Battery: Unrestricted',
    why: "Samsung's battery saver is the usual reason location stops in the background.",
    steps: 'Tap Battery, then Unrestricted.',
    check: () => safe(async () => (FocusAlarm?.batteryUnrestricted ? FocusAlarm.batteryUnrestricted() : null)),
    fix: () => Linking.openSettings(),
  },
  {
    id: 'calendar',
    name: 'Calendar',
    why: 'So Focus can plan round your diary and add dated things to it.',
    check: () => safe(() => calendarAllowed(false)),
    fix: async () => {
      if (!(await calendarAllowed(true))) await Linking.openSettings();
    },
  },
  {
    id: 'microphone',
    name: 'Microphone',
    why: 'So you can talk to Focus instead of typing.',
    check: () => safe(async () => (await ExpoSpeechRecognitionModule.getPermissionsAsync()).granted),
    fix: async () => {
      const r = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!r.granted && !r.canAskAgain) await Linking.openSettings();
    },
  },
];

export async function checkAll(): Promise<Record<PermissionId, boolean | null>> {
  if (Platform.OS === 'web') return Object.fromEntries(PERMISSIONS.map((p) => [p.id, null])) as Record<PermissionId, boolean | null>;
  const pairs = await Promise.all(PERMISSIONS.map(async (p) => [p.id, await p.check()] as const));
  return Object.fromEntries(pairs) as Record<PermissionId, boolean | null>;
}
