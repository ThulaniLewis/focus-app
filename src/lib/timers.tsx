// Kitchen timers: several at once, on this device. They show on the Dash and ring loudly when
// they end, even with YouTube open. Kept on the device they were set on (a pasta timer on the
// tablet doesn't need to go off in your pocket too).
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { cancelTimer, scheduleTimer } from './notify';

export type KitchenTimer = { id: string; label: string; endsAt: number; minutes: number };

const KEY = 'focus.timers.v1';

type Ctx = {
  timers: KitchenTimer[];
  add: (minutes: number, label?: string) => void;
  addMinute: (id: string) => void;
  remove: (id: string) => void;
};

const TimerCtx = createContext<Ctx | null>(null);

export function TimersProvider({ children }: { children: React.ReactNode }) {
  const [timers, setTimers] = useState<KitchenTimer[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        // Keep ones that ended in the last hour so "time's up" still shows.
        const parsed = raw ? JSON.parse(raw) : [];
        const list: KitchenTimer[] = Array.isArray(parsed) ? parsed.filter((t) => t && typeof t.id === 'string' && typeof t.endsAt === 'number') : [];
        // Timers started before this loaded join the saved ones.
        setTimers((now) => [...list.filter((t) => t.endsAt > Date.now() - 60 * 60000 && !now.some((n) => n.id === t.id)), ...now].sort((a, b) => a.endsAt - b.endsAt));
        setReady(true);
      })
      .catch(() => {
        // Couldn't read them: don't save over them (their alarms are still scheduled and will ring).
      });
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(KEY, JSON.stringify(timers)).catch(() => {});
  }, [timers, ready]);

  const value = useMemo<Ctx>(
    () => ({
      timers,
      add(minutes, label) {
        const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
        const t: KitchenTimer = { id, minutes, label: label?.trim() || `${minutes} min timer`, endsAt: Date.now() + minutes * 60000 };
        setTimers((list) => [...list, t].sort((a, b) => a.endsAt - b.endsAt));
        scheduleTimer(id, t.label, new Date(t.endsAt));
      },
      addMinute(id) {
        const t = timers.find((x) => x.id === id);
        if (!t) return;
        const endsAt = Math.max(t.endsAt, Date.now()) + 60000;
        // Rescheduling happens once, here, not inside the state update (which React may run twice).
        // Cancel also clears a "time's up" that's already showing.
        cancelTimer(id).then(() => scheduleTimer(id, t.label, new Date(endsAt)));
        setTimers((list) => list.map((x) => (x.id === id ? { ...x, endsAt } : x)).sort((a, b) => a.endsAt - b.endsAt));
      },
      remove(id) {
        cancelTimer(id);
        setTimers((list) => list.filter((t) => t.id !== id));
      },
    }),
    [timers],
  );

  return <TimerCtx.Provider value={value}>{children}</TimerCtx.Provider>;
}

export function useTimers() {
  const ctx = useContext(TimerCtx);
  if (!ctx) throw new Error('useTimers outside TimersProvider');
  return ctx;
}

/** "4:05" left, or "Time's up" once it's ended. */
export function timerLeft(t: KitchenTimer, now: number) {
  const sec = Math.round((t.endsAt - now) / 1000);
  if (sec <= 0) return "Time's up";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
