// Keeps location going on the phone: starts or stops the background tracking as places and the switch
// change, and takes one fresh look each time Focus comes to the front. Also does what the background
// can't: ticks off the gym task, and keeps the day-before reminder warnings up to date. Draws nothing.
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { featureOn } from '../lib/features';
import { takeTicks, useGeo } from '../lib/geoStore';
import { useDeviceRole } from '../lib/device';
import { checkNow, syncReminderWarnings, syncTracking } from '../lib/location';
import { syncNotifications } from '../lib/notify';
import { useStore } from '../lib/store';
import { isDoneOn } from '../lib/time';

export function PlacesHost() {
  const store = useStore();
  const { state } = store;
  const role = useDeviceRole();
  const geo = useGeo();
  const on = role === 'phone' && featureOn(state.settings, 'places');
  const placesKey = JSON.stringify(geo.places.map((p) => [p.id, p.lat, p.lon, p.radiusM]));
  const remindersKey = JSON.stringify([geo.reminders.map((r) => [r.id, r.byDay, r.doneAt, r.text]), geo.places.map((p) => [p.id, p.name])]);
  const latest = useRef(store);
  useEffect(() => {
    latest.current = store;
  });

  useEffect(() => {
    syncTracking({ on, places: geo.places }).catch(() => {});
    // placesKey stands for the places: only their circles matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, placesKey]);

  // Away mode (and links to home) change what gets nudged: plan again when they change.
  const awayKey = JSON.stringify([geo.away, geo.links.length, geo.places.length, (geo.live ?? []).map((r) => [r.key, r.leaveAt, r.undone])]);
  useEffect(() => {
    if (role !== 'phone') return;
    syncNotifications(latest.current.state);
    // awayKey stands for away mode, the home links and live traffic moves.
  }, [role, awayKey]);

  useEffect(() => {
    if (!on) return;
    syncReminderWarnings(geo).catch(() => {});
    // remindersKey stands for the reminders and place names.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, remindersKey]);

  useEffect(() => {
    if (!on) return;
    const look = () => {
      checkNow().catch(() => {});
      syncTracking({ on, places: geo.places }).catch(() => {});
      // The gym: tick off its task for the day she was there, once.
      takeTicks()
        .then((ticks) => {
          const { state: s, toggleDone } = latest.current;
          for (const t of ticks) {
            const task = s.tasks.find((x) => x.id === t.taskId);
            if (task && !isDoneOn(task, t.day)) toggleDone(task.id, task.repeatDays?.length ? t.day : undefined);
          }
        })
        .catch(() => {});
    };
    look();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') look();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, placesKey]);

  return null;
}
