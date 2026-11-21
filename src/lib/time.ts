// Pure time keeping logic. No React, no device APIs, so it can be tested.
import type { Place, Settings, State, Task } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’]/g, '') // Sav's and Sav’s are the same room
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** A room's display name from its slug ("savs-room" to "Sav's room"). */
export const roomNameOf = (rooms: { name: string }[], slugValue?: string) =>
  slugValue ? rooms.find((r) => slug(r.name) === slugValue)?.name : undefined;

export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const toLocalISO = (d: Date) => `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** "2026-11-17T08:15" read as local time (never UTC). */
export function parseLocal(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, 0, 0);
}

export const fmtTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** The line under the date: what 22:30 is, and how long is left until it. */
export function dayEndLine(minutesLeft: number, dayEnd: string, durationOf: (min: number) => string = fmtDuration): string {
  return minutesLeft > 0 ? `Day ends ${dayEnd} · ${durationOf(minutesLeft)} left` : 'Day done. Rest.';
}

export function fmtDuration(totalMin: number): string {
  const m = Math.max(0, Math.round(totalMin));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

export function fmtElapsed(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

export const addMin = (d: Date, min: number) => new Date(d.getTime() + min * 60000);
export const minutesBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 60000;

/** When does this task happen on the given day, if at all? */
export function occurrenceOn(task: Task, day: string): Date | null {
  if (!task.at) return null;
  const base = parseLocal(task.at);
  if (!base) return null;
  if (task.repeatDays && task.repeatDays.length) {
    const d = parseLocal(day);
    if (!d) return null;
    if (day < dayKey(base)) return null;
    if (task.skipDays?.includes(day)) return null;
    if (!task.repeatDays.includes(d.getDay())) return null;
    d.setHours(base.getHours(), base.getMinutes(), 0, 0);
    return d;
  }
  return dayKey(base) === day ? base : null;
}

export function isDoneOn(task: Task, day: string): boolean {
  if (task.repeatDays && task.repeatDays.length) return (task.doneDays ?? []).includes(day);
  return task.done;
}

export function findPlace(places: Place[], name?: string): Place | undefined {
  if (!name) return undefined;
  const n = name.trim().toLowerCase();
  if (!n) return undefined;
  return (
    places.find((p) => p.name.toLowerCase() === n) ??
    places.find((p) => n.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(n))
  );
}

export type AgendaItem = {
  task: Task;
  at: Date;
  leaveAt?: Date;
  travelMin?: number;
  /** Has a place, but we don't know how long it takes to get there. */
  placeUnknown: boolean;
  done: boolean;
};

/** Is Sav with her dad on this day by the usual pattern? Only Saturdays count. */
export function savAwayByPattern(settings: State['settings'], day: string): boolean {
  const p = settings.savPattern;
  const d = parseLocal(day);
  const a = p ? parseLocal(p.anchor) : null;
  if (!p || !d || !a || d.getDay() !== 6 || p.weeks < 1) return false;
  const weeks = Math.round((d.getTime() - a.getTime()) / (7 * 86400000));
  return ((weeks % p.weeks) + p.weeks) % p.weeks === 0;
}

/** What's paused and what comes first on a day. */
export function dayPlanFor(settings: State['settings'], day: string) {
  const p = settings.dayPlans?.[day] ?? {};
  return { focus: p.focus, paused: new Set(p.paused ?? []) };
}

export function agendaFor(state: State, day: string): AgendaItem[] {
  const { places, bufferMin } = state.settings;
  const items: AgendaItem[] = [];
  const away = savAwayByPattern(state.settings, day);
  const { paused } = dayPlanFor(state.settings, day);
  for (const task of state.tasks) {
    if (task.flex) continue; // no real time: it lives in the day's "next" list
    if (task.spaceId && paused.has(task.spaceId)) continue;
    const at = occurrenceOn(task, day);
    if (!at) continue;
    if (task.onlyWhen === 'sav-away' && !away) continue;
    if (task.onlyWhen === 'sav-home' && away) continue;
    const place = findPlace(places, task.place);
    const item: AgendaItem = {
      task,
      at,
      placeUnknown: !!task.place && !place,
      done: isDoneOn(task, day),
    };
    if (place) {
      item.travelMin = place.travelMin;
      item.leaveAt = addMin(at, -(place.travelMin + bufferMin));
    }
    items.push(item);
  }
  return items.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export type Anchor = { label: string; at: Date; kind: 'leave' | 'event' };

/** The next fixed moment today: a leave-by time or an event start. */
export function nextAnchor(state: State, now: Date): Anchor | null {
  const anchors: Anchor[] = [];
  for (const a of agendaFor(state, dayKey(now))) {
    if (a.done) continue;
    if (a.leaveAt) anchors.push({ label: `Leave for ${a.task.title}`, at: a.leaveAt, kind: 'leave' });
    anchors.push({ label: a.task.title, at: a.at, kind: 'event' });
  }
  const upcoming = anchors.filter((x) => x.at.getTime() >= now.getTime() - 60000);
  upcoming.sort((a, b) => a.at.getTime() - b.at.getTime());
  return upcoming[0] ?? null;
}

export function dayEndOn(now: Date, dayEnd: string): Date {
  const [h, m] = dayEnd.split(':').map(Number);
  const d = new Date(now);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

export const minutesLeftToday = (now: Date, dayEnd: string) =>
  Math.max(0, minutesBetween(now, dayEndOn(now, dayEnd)));

/** Work back from the first thing in the day: wake time = first leave (or start) minus getting ready. */
export function wakeFor(state: State, day: string): { wake: Date; because: AgendaItem } | null {
  const first = agendaFor(state, day).find((a) => !a.done);
  if (!first) return null;
  const out = first.leaveAt ?? first.at;
  return { wake: addMin(out, -state.settings.readyMin), because: first };
}

/** How long a running or paused timer has counted, in seconds. */
export function elapsedSec(timer: Task['timer'], now: Date): number {
  if (!timer) return 0;
  const running = timer.startedAt ? (now.getTime() - new Date(timer.startedAt).getTime()) / 1000 : 0;
  return timer.accumulatedSec + Math.max(0, running);
}

/**
 * How far off estimates usually are: median of actual / estimate across the
 * last 20 timed tasks. Needs 3 before it says anything.
 */
export function estimateRatio(tasks: Task[]): number | null {
  const ratios = tasks
    .filter((t) => t.done && t.actualMin && t.estimateMin && t.actualMin >= 1)
    .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''))
    .slice(0, 20)
    .map((t) => (t.actualMin as number) / (t.estimateMin as number))
    .sort((a, b) => a - b);
  if (ratios.length < 3) return null;
  const mid = Math.floor(ratios.length / 2);
  return ratios.length % 2 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2;
}

export function realisticMin(estimate: number, ratio: number | null): number {
  if (!ratio) return estimate;
  return Math.max(1, Math.round((estimate * ratio) / 5) * 5 || Math.round(estimate * ratio));
}

/** Tasks to show on a given day: dated to it, or undated and not done, plus fixed-time items. */
/**
 * The hallway is the last room of a tidy round: rubbish and things to go out pile up there on the way,
 * so it's done once the other rooms are. Matches hallway, hall, entrance, porch.
 */
export const isLastRoom = (room?: string) => !!room && /^(hallway|hall|entrance|entrance-hall|porch|front-door)$/.test(room);

/** Hold hallway jobs back while other room jobs are still open in the same list. Keeps the order otherwise. */
export function hallwayLast<T>(items: T[], roomOf: (x: T) => string | undefined): T[] {
  const others = items.some((x) => roomOf(x) && !isLastRoom(roomOf(x)));
  if (!others) return items;
  return [...items.filter((x) => !isLastRoom(roomOf(x))), ...items.filter((x) => isLastRoom(roomOf(x)))];
}

/** Was this one-off ticked on this (local) day? doneAt is stored in UTC, so convert it first. */
const doneOnDay = (t: Task, day: string) => !!t.doneAt && dayKey(new Date(t.doneAt)) === day;

/** A flexible job on this day: repeats that fall today, or a one-off from today or earlier still open. */
export function flexOn(task: Task, day: string): boolean {
  if (!task.flex || !task.at) return false;
  if (task.repeatDays?.length) return !!occurrenceOn(task, day);
  const d = task.at.slice(0, 10);
  return d === day || (d < day && !task.done);
}

/** Minutes into the day of a flexible job's suggested slot, to keep the planned order. */
const slotMin = (t: Task) => (t.at ? Number(t.at.slice(11, 13)) * 60 + Number(t.at.slice(14, 16)) : 24 * 60);

export function tasksFor(state: State, day: string): Task[] {
  const { paused, focus } = dayPlanFor(state.settings, day);
  const away = savAwayByPattern(state.settings, day);
  const dueSoon = (t: Task) => ((t.dueAt && t.dueAt.slice(0, 10) <= day) || (t.dueDay && t.dueDay <= day) ? 0 : 1);
  const rank = (t: Task) => (t.priority ?? 2) * 10 + (focus && t.spaceId === focus ? 0 : 5);
  return state.tasks.filter((t) => {
    if (t.someday) return false; // projects live in their space
    if (t.spaceId && paused.has(t.spaceId)) return false;
    if (t.kind === 'buy' || t.kind === 'note') return false; // shopping and private notes live in their spaces
    if (t.flex) {
      if (t.onlyWhen === 'sav-away' && !away) return false;
      if (t.onlyWhen === 'sav-home' && away) return false;
      if (!flexOn(t, day)) return false;
      return !isDoneOn(t, day) || (!t.repeatDays?.length && doneOnDay(t, day)) || !!t.repeatDays?.length;
    }
    if (t.at) return false; // real fixed times live in the agenda
    if (t.day && t.day !== day) return t.day < day && !t.done; // carry unfinished forward
    return !t.done || doneOnDay(t, day);
  }).sort(
    (a, b) =>
      // "Something's come up" jobs go at the very top of their day.
      (a.topDay === day ? 0 : 1) - (b.topDay === day ? 0 : 1) ||
      dueSoon(a) - dueSoon(b) ||
      rank(a) - rank(b) ||
      (isLastRoom(a.room) ? 1 : 0) - (isLastRoom(b.room) ? 1 : 0) ||
      (a.after ?? '').localeCompare(b.after ?? '') ||
      slotMin(a) - slotMin(b),
  );
}

/** Too early for this job? (House jobs that wait until Sav's asleep.) */
export const notYet = (t: Task, now: Date) => !!t.after && fmtTime(now) < t.after;

export const isValidHHMM = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

