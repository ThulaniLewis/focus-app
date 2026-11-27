// Tasks linked to places: "Drop Ada off" linked to the nursery means arriving there asks "Have you
// dropped Ada off?" (Done, Not yet, Not today). Focus never ticks a linked task by itself.
//
// Phone only: the links live in the places store (geoStore.ts), never in the State that syncs.
// Plain logic, tested. Nothing here knows anyone's places or tasks; names come from her data.
import type { GeoPlace } from './geo';
import { does } from './placeTypes';
import { agendaFor, isDoneOn, tasksFor } from './time';
import type { State, Task } from './types';

/** One task linked to one place. A task has at most one place. */
export type TaskLink = {
  taskId: string;
  placeId: string;
  createdAt: string;
  /** Last time it was asked about on arriving. */
  shownAt?: string;
  /** Last "Did you …?" after leaving without answering. */
  nudgedAt?: string;
  /** "Not yet": when she said it. The leaving nudge still comes. */
  notYetAt?: string;
  /** "Not today": the day, "YYYY-MM-DD". Not asked about again that day. */
  notToday?: string;
};

export type LinkedTask = { id: string; title: string };

/** Common first words, so "Drop Ada off" asks "Have you dropped Ada off?". */
const DONE_FORM: Record<string, string> = {
  drop: 'dropped', pick: 'picked', collect: 'collected', take: 'taken', bring: 'brought', give: 'given', hand: 'handed',
  return: 'returned', post: 'posted', pay: 'paid', buy: 'bought', get: 'got', tell: 'told', ask: 'asked', sign: 'signed',
  send: 'sent', put: 'put', fill: 'filled', book: 'booked', check: 'checked', leave: 'left', pack: 'packed', order: 'ordered',
  print: 'printed', water: 'watered', feed: 'fed', change: 'changed', clean: 'cleaned', fix: 'fixed', call: 'called',
  phone: 'phoned', ring: 'rung', email: 'emailed', speak: 'spoken', find: 'found', show: 'shown', make: 'made', do: 'done',
};

const lowerFirst = (t: string) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t);
const tidy = (t: string) => t.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');

/** "Drop Ada off" → "Have you dropped Ada off?" Anything else → "Done yet: Water the plants?" */
export function askLine(title: string): string {
  const t = tidy(title);
  const [first, ...rest] = t.split(' ');
  const done = DONE_FORM[first?.toLowerCase() ?? ''];
  return done ? `Have you ${[done, ...rest].join(' ')}?` : `Done yet: ${t}?`;
}

/** "Did you drop Ada off?", or for two: "Did you drop Ada off and tell staff …?" */
export function didLine(texts: string[]): string {
  const ts = texts.map((t) => lowerFirst(tidy(t)));
  if (ts.length <= 2) return `Did you ${ts.join(' and ')}?`;
  return `Did you do the ${ts.length} things for here?`;
}

/** The places that can take linked tasks (their type does, and she hasn't switched it off). */
export const linkablePlaces = (places: GeoPlace[]) => places.filter((p) => does(p, 'linked-tasks'));

const STOP = new Set(['the', 'and', 'for', 'with', 'my', 'our', 'to', 'at', 'of', 'a', 'an']);
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']s\b/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));

/**
 * Does this task name one of her linkable places? A match is a word of the place's name that isn't
 * someone's ("Ada's nursery" matches on "nursery", never on "Ada"), or the whole name.
 */
export function suggestLink(title: string, places: GeoPlace[]): GeoPlace | null {
  const t = title.toLowerCase();
  const tw = new Set(words(title));
  let best: { p: GeoPlace; n: number } | null = null;
  for (const p of linkablePlaces(places)) {
    if (t.includes(p.name.toLowerCase())) return p;
    const own = p.name
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => !/[’']s$/.test(w)) // someone's: "Ada's", "Dad's"
      .join(' ');
    const n = words(own).filter((w) => tw.has(w)).length;
    if (n && (!best || n > best.n)) best = { p, n };
  }
  return best?.p ?? null;
}

/** The linked tasks due on a day and not done yet, by place. Skipped days and "Not today" count as not due. */
export function linkedDue(state: Pick<State, 'tasks' | 'settings'>, links: TaskLink[], day: string): Record<string, LinkedTask[]> {
  const placeOf = new Map(links.filter((l) => l.notToday !== day).map((l) => [l.taskId, l.placeId]));
  const due = new Map<string, Task>();
  if (!placeOf.size) return {};
  for (const a of agendaFor(state as State, day)) if (placeOf.has(a.task.id) && !a.done) due.set(a.task.id, a.task);
  for (const t of tasksFor(state as State, day)) if (placeOf.has(t.id) && !isDoneOn(t, day)) due.set(t.id, t);
  const out: Record<string, LinkedTask[]> = {};
  for (const t of due.values()) {
    const pid = placeOf.get(t.id)!;
    (out[pid] ??= []).push({ id: t.id, title: t.title });
  }
  return out;
}

/** The time she arrived at a place today, from the Places log (for ticking a linked task). */
export function arrivedAt(log: { at: string; placeId: string; event: 'arrive' | 'leave' }[], placeId: string, now: Date): string | null {
  const today = localDay(now.toISOString());
  const hit = [...log].reverse().find((e) => e.placeId === placeId && e.event === 'arrive' && e.at <= now.toISOString() && localDay(e.at) === today);
  return hit?.at ?? null;
}

const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Plain data in, a tidy link out. */
export function cleanLink(l: any, placeIds: Set<string>): TaskLink | null {
  if (!l || typeof l.taskId !== 'string' || typeof l.placeId !== 'string' || !placeIds.has(l.placeId)) return null;
  const s = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  return {
    taskId: l.taskId,
    placeId: l.placeId,
    createdAt: s(l.createdAt) ?? new Date(0).toISOString(),
    ...(s(l.shownAt) ? { shownAt: s(l.shownAt) } : {}),
    ...(s(l.nudgedAt) ? { nudgedAt: s(l.nudgedAt) } : {}),
    ...(s(l.notYetAt) ? { notYetAt: s(l.notYetAt) } : {}),
    ...(s(l.notToday) ? { notToday: s(l.notToday) } : {}),
  };
}
