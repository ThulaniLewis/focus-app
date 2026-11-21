// On time or late, for fixed times with a place (nursery drop and pick up first). Kind words for the
// pattern, and a plan that fits once there's enough to go on. Pure, so it's tested.
import { isNurseryRun } from './comeUp';
import { addMin, fmtTime, parseLocal } from './time';
import type { PunctualityEntry, Settings, State, Task } from './types';

/** Roughly how late: the choices on the sheet. 30 means 30 or more. */
export const LATE_CHOICES = [5, 10, 20, 30] as const;
/** Up to this many minutes after the planned time still counts as on time. */
export const GRACE_MIN = 5;
const KEEP = 60;

/** Asked about when ticked: a real fixed time somewhere you go. */
export const isTracked = (t: Task) => !!t.at && !t.flex && !!t.place && t.kind !== 'buy' && t.kind !== 'note';

/** The same job across days and copies: the starter job's seed, or its id. */
export const keyOf = (t: Task) => t.seed ?? t.id;

export const isDropOff = (t: Task) => isNurseryRun(t) && ((t.seed ?? '') === 'nursery-drop' || (t.at ?? '').slice(11, 16) < '12:00');

export function plannedHM(t: Task): string {
  const d = t.at ? parseLocal(t.at) : null;
  return d ? fmtTime(d) : '';
}

/** Add an answer (replacing any earlier one for the same job and day). */
export function logAnswer(log: Settings['punctualityLog'], t: Task, day: string, lateMin: number, at: Date): PunctualityEntry[] {
  const key = keyOf(t);
  const rest = (log ?? []).filter((e) => !(e.key === key && e.day === day));
  return [...rest, { key, title: t.title, day, planned: plannedHM(t), lateMin: Math.max(0, lateMin), at: at.toISOString() }]
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-KEEP);
}

/** Un-ticked after all: drop that day's answer. */
export const unlogAnswer = (log: Settings['punctualityLog'], t: Task, day: string) => (log ?? []).filter((e) => !(e.key === keyOf(t) && e.day === day));

export function lastFor(log: Settings['punctualityLog'], key: string, n = 5): PunctualityEntry[] {
  return (log ?? []).filter((e) => e.key === key).sort((a, b) => a.day.localeCompare(b.day)).slice(-n);
}

const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

/**
 * "Late 4 of the last 5, by about 20 minutes. That's just information, not a telling off."
 * Needs three answers first. Good news is said as good news.
 */
export function patternLine(log: Settings['punctualityLog'], key: string): string | null {
  const last = lastFor(log, key);
  if (last.length < 3) return null;
  const late = last.filter((e) => e.lateMin > 0);
  const n = last.length;
  if (late.length * 2 > n) {
    const avg = round5(late.reduce((a, e) => a + e.lateMin, 0) / late.length);
    return `Late ${late.length} of the last ${n}, by about ${avg} minutes. That's just information, not a telling off.`;
  }
  const onTime = n - late.length;
  return onTime === n ? `On time ${n} of the last ${n}. Nicely done.` : `On time ${onTime} of the last ${n}.`;
}

const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const toHM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/**
 * After five drops with a clear pattern (late at least 3 of the last 5), a drop-off time that fits:
 * her usual arrival, rounded to 5 minutes, kept inside nursery's window. Null if nothing to suggest.
 */
export function suggestDropTime(state: State, t: Task, now: Date): { time: string; line: string } | null {
  if (!isDropOff(t) || !isTracked(t)) return null;
  const key = keyOf(t);
  const until = state.settings.punctualityNotYet?.[key];
  if (until && new Date(until).getTime() > now.getTime()) return null;
  const last = lastFor(state.settings.punctualityLog, key);
  if (last.length < 5 || last.filter((e) => e.lateMin > 0).length < 3) return null;
  const arrivals = last.map((e) => toMin(e.planned || plannedHM(t)) + e.lateMin).sort((a, b) => a - b);
  const median = arrivals[Math.floor(arrivals.length / 2)];
  const win = state.settings.nurseryWindow ?? { start: '08:00', end: '08:30' };
  const suggested = Math.min(toMin(win.end), Math.max(toMin(win.start), Math.ceil(median / 5) * 5));
  const time = toHM(suggested);
  if (time === plannedHM(t)) return null;
  return { time, line: `Nursery's fine any time from ${win.start} to ${win.end}. Plan for an ${time} drop? Leaving and getting up move with it.` };
}

/** "Not yet": ask again in a week. */
export const notYetUntil = (now: Date) => addMin(now, 7 * 24 * 60).toISOString();

/** Move a fixed time to a new time of day, keeping its date (for repeats, every day it repeats). */
export const withTime = (t: Task, hm: string): Task => (t.at ? { ...t, at: `${t.at.slice(0, 10)}T${hm}` } : t);
