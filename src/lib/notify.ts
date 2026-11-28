import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { NAG, plan } from './nudges';
import { geoSnapshot } from './geoStore';
import { homeLinkedIds } from './awayMode';
import type { State } from './types';
import { isTabletDevice } from './device';

export const CHANNEL = 'focus-time';
/** Leave now, deadlines and timers: plays on the alarm sound, so it's heard on vibrate or silent. */
export const LOUD_CHANNEL = 'focus-loud';

let lastSignature = '';
let queue: Promise<void> = Promise.resolve();

export async function setupNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Times and timers',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
    });
    await Notifications.setNotificationChannelAsync(LOUD_CHANNEL, {
      name: 'Leave now, deadlines and timers (sounds on silent)',
      description: 'Plays on the alarm sound, so you hear it even with the phone on vibrate or silent.',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 400, 200, 400, 200, 400],
      bypassDnd: true,
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.ALARM,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      },
    });
  }
  try {
    await Notifications.setNotificationCategoryAsync(NAG, [
      { identifier: 'done', buttonTitle: 'Done', options: { opensAppToForeground: true } },
      { identifier: 'snooze', buttonTitle: 'Snooze 30 min', options: { opensAppToForeground: true } },
    ]);
  } catch {
    // Buttons are a bonus; the nudge still arrives without them.
  }
}

export async function askPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

export async function exactAlarmsAllowed(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    return (await Notifications.getExactAlarmPermissionsAsync()).granted;
  } catch {
    return true;
  }
}

export async function askExactAlarms(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.requestExactAlarmPermissionsAsync();
  } catch {
    // Older Android, or not declared: alarms still fire, just less precisely.
  }
}

/** Kitchen timers are scheduled separately and survive re-planning the nudges. */
export const TIMER_PREFIX = 'timer-';
/** Place reminder warnings (the day before), made by location.ts. Not nudges, so the nudge plan leaves them alone. */
export const PLACE_WARN_PREFIX = 'place-warn-';

/** The room round check-in, on the device running the round (the tablet too). Also survives re-planning. */
const ROUND_CHECK_IN = 'round-checkin';

async function cancelNudges() {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of all)
    if (!n.identifier.startsWith(TIMER_PREFIX) && !n.identifier.startsWith(PLACE_WARN_PREFIX) && n.identifier !== ROUND_CHECK_IN) await Notifications.cancelScheduledNotificationAsync(n.identifier);
}

/** "Still on the kitchen? Tap to stop or keep going." Gentle, once, replacing any earlier one. */
export async function scheduleRoundCheckIn(room: string, at: Date, title: string, body: string) {
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: ROUND_CHECK_IN,
      content: { title, body, data: { roundRoom: room }, threadIdentifier: 'round' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL },
    });
  } catch {
    // The round still runs; there's just no check-in.
  }
}

export async function cancelRoundCheckIn() {
  try {
    await Notifications.cancelScheduledNotificationAsync(ROUND_CHECK_IN);
  } catch {
    // Already gone.
  }
}

/** Ring when a kitchen timer ends: loud, so it's heard over YouTube or with the sound off. */
export async function scheduleTimer(id: string, label: string, at: Date) {
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: `${TIMER_PREFIX}${id}`,
      content: { title: `${label}: time's up`, body: 'Tap to open the timers.', data: { timerId: id }, threadIdentifier: 'timers' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: LOUD_CHANNEL },
    });
  } catch {
    // The timer still shows on screen; it just won't ring.
  }
}

export async function cancelTimer(id: string) {
  try {
    await Notifications.cancelScheduledNotificationAsync(`${TIMER_PREFIX}${id}`);
    await Notifications.dismissNotificationAsync(`${TIMER_PREFIX}${id}`);
  } catch {
    // Already gone.
  }
}

/** Replace all scheduled nudges with the current plan. Safe to call often. */
export function syncNotifications(state: State) {
  queue = queue.then(async () => {
    try {
      // The tablet is a shared screen on the wall: the phone does the buzzing, not both.
      if (isTabletDevice()) {
        if (lastSignature !== 'tablet') await cancelNudges();
        lastSignature = 'tablet';
        return;
      }
      const geo = geoSnapshot();
      const planned = plan(state, new Date(), { away: geo.away, homeLinked: homeLinkedIds(geo.places, geo.links), live: geo.live }).slice(0, 120);
      await tidyPresented(state);
      const signature = planned.map((p) => `${p.at.getTime()}|${p.title}|${p.body}|${p.loud ? 1 : 0}`).join('\n');
      if (signature === lastSignature) return;
      await cancelNudges();
      for (const p of planned) {
        // Nudges about the same job stack together in the tray instead of piling up as separate rows.
        const thread = p.thread ?? (p.nag ? `job-${p.nag.taskId}` : p.ref ? `job-${p.ref.taskId}` : undefined);
        await Notifications.scheduleNotificationAsync({
          content: {
            title: p.title,
            body: p.body,
            ...(p.nag ? { data: p.nag, categoryIdentifier: NAG } : p.ref ? { data: p.ref } : p.data ? { data: p.data } : {}),
            ...(thread ? { threadIdentifier: thread } : {}),
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.at, channelId: p.loud ? LOUD_CHANNEL : CHANNEL },
        });
      }
      lastSignature = signature;
    } catch (e) {
      console.warn('Could not schedule notifications', e);
    }
  });
  return queue;
}

/**
 * Clears the tray of nudges that no longer matter: anything about a job that's done (or snoozed),
 * and, for each job, every nudge but the newest. Runs whenever Focus is open and something changes.
 */
export async function tidyPresented(state: State) {
  try {
    const shown = await Notifications.getPresentedNotificationsAsync();
    const newest = new Map<string, { id: string; date: number }>();
    const gone: string[] = [];
    for (const n of shown) {
      const data = n.request.content.data as { taskId?: string; day?: string } | undefined;
      if (!data?.taskId) continue;
      const t = state.tasks.find((x) => x.id === data.taskId);
      const day = data.day ?? '';
      const finished = !t || (t.repeatDays?.length ? (t.doneDays ?? []).includes(day) : t.done);
      const snoozed = t?.snoozeUntil && new Date(t.snoozeUntil).getTime() > Date.now();
      if (finished || snoozed) {
        gone.push(n.request.identifier);
        continue;
      }
      const key = `${data.taskId}|${day}`;
      const prev = newest.get(key);
      if (!prev || n.date > prev.date) {
        if (prev) gone.push(prev.id);
        newest.set(key, { id: n.request.identifier, date: n.date });
      } else gone.push(n.request.identifier);
    }
    for (const id of gone) await Notifications.dismissNotificationAsync(id);
  } catch {
    // Tidying is a nicety; nothing breaks if it can't run.
  }
}

/** After Done or Snooze from a notification: clear every nudge about that job. */
export async function clearJob(taskId: string) {
  try {
    const shown = await Notifications.getPresentedNotificationsAsync();
    for (const n of shown) {
      const data = n.request.content.data as { taskId?: string } | undefined;
      if (data?.taskId === taskId) await Notifications.dismissNotificationAsync(n.request.identifier);
    }
  } catch {
    // As above.
  }
}
