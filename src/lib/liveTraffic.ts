// Live travel time with traffic (brief 1b Fix 3). For a trip to one of her places with a fixed time
// (drop off, pick up), Focus asks Google how long it really takes right now and works out a leave-by
// time. The fixed time never moves; the leave-by and the jobs before it can, with the reason, the
// numbers and Undo. Plain logic, tested. Phone only: trips, leave-by times and checks stay with her
// places. Google is sent only the two points, never anything about her.
import type { GeoPlace } from './geo';
import { does } from './placeTypes';
import { addMin, agendaFor, type AgendaItem, dayKey, fmtTime } from './time';
import type { State } from './types';

/** Minutes before the leave-by time when Focus checks. Plus once when she leaves somewhere. No more. */
export const LIVE_CHECKS = [60, 30, 15];
/** Each check counts in this window after its mark (positions come about every 5 minutes). */
export const CHECK_WINDOW_MIN = 15;
/** A leave-by that changes by more than this moves, with one message. */
export const LIVE_SHIFT_MIN = 5;
/** A new leave-by this close (or gone already) uses the alarm style alert. */
export const LIVE_ALARM_MIN = 10;
/** Leaving somewhere this long before a trip counts as setting off for it. */
export const LEAVE_CHECK_WITHIN_MIN = 90;

export type TravelMode = 'drive' | 'walk' | 'bike' | 'transit';

export type TripPlan = {
  key: string;
  taskId: string;
  day: string;
  title: string;
  arriveAt: Date;
  usualLeaveAt: Date;
  usualMin: number;
  bufferMin: number;
  dest: GeoPlace;
  origin: GeoPlace;
};

export type MovedJob = { taskId: string; title: string; from: string; to: string };

export type LiveTrip = {
  key: string;
  taskId: string;
  day: string;
  placeName: string;
  arriveAt: string;
  usualLeaveAt: string;
  usualMin: number;
  /** The leave-by in use now (ISO). */
  leaveAt: string;
  liveMin?: number;
  /** Google's no-traffic time, to say "heavier than usual". */
  staticMin?: number;
  /** Checks done: "60", "30", "15", "leave". */
  checks: string[];
  moved: MovedJob[];
  /** Undo: back to the usual leave-by, and the jobs back where they were. */
  undone?: boolean;
  lastCheckAt?: string;
};

export type LiveStatus = { at: string; ok: boolean };

/** The place a trip goes to: the nursery or school whose travel-times name matches the job's place. */
export function tripPlace(places: GeoPlace[], placeName?: string): GeoPlace | undefined {
  const n = placeName?.trim().toLowerCase();
  if (!n) return undefined;
  return places.find((p) => p.trips?.trim().toLowerCase() === n && does(p, 'leave-by'));
}

/** Today's trips Focus can check: a fixed time, a leave-by, a saved place at the end and somewhere to start from. */
export function tripsToday(state: State, places: GeoPlace[], herePlaceId: string | null, now: Date): TripPlan[] {
  const day = dayKey(now);
  const origin = (herePlaceId ? places.find((p) => p.id === herePlaceId) : undefined) ?? places.find((p) => p.type === 'home');
  if (!origin) return [];
  const out: TripPlan[] = [];
  for (const a of agendaFor(state, day)) {
    if (a.done || !a.leaveAt || a.travelMin == null) continue;
    const dest = tripPlace(places, a.task.place);
    if (!dest || dest.id === origin.id) continue;
    if (a.at.getTime() <= now.getTime()) continue;
    out.push({ key: `${a.task.id}|${day}`, taskId: a.task.id, day, title: a.task.title, arriveAt: a.at, usualLeaveAt: a.leaveAt, usualMin: a.travelMin, bufferMin: state.settings.bufferMin, dest, origin });
  }
  return out;
}

const active = (r?: LiveTrip) => (r && !r.undone ? r : undefined);
export const leaveNow = (t: TripPlan, r?: LiveTrip) => (active(r) ? new Date(active(r)!.leaveAt) : t.usualLeaveAt);

/** Which check is due now, if any: 60, 30 or 15 minutes before leaving, or she has just left somewhere. */
export function dueCheck(t: TripPlan, r: LiveTrip | undefined, now: Date, justLeft: boolean): string | null {
  const minsTo = (leaveNow(t, r).getTime() - now.getTime()) / 60000;
  const done = r?.checks ?? [];
  if (minsTo <= -CHECK_WINDOW_MIN) return null;
  if (justLeft && minsTo <= LEAVE_CHECK_WITHIN_MIN && !done.includes('leave')) return 'leave';
  for (const c of LIVE_CHECKS) if (minsTo <= c && minsTo > c - CHECK_WINDOW_MIN && !done.includes(String(c))) return String(c);
  return null;
}

/**
 * The jobs before the trip that no longer fit once she leaves earlier: moved back, one after another,
 * so each ends by the new leave-by. Never into the past. Events and the trip itself never move.
 */
export function jobsToMove(agenda: AgendaItem[], trip: TripPlan, newLeave: Date, now: Date): MovedJob[] {
  const before = agenda
    .filter((a) => !a.done && a.task.id !== trip.taskId && a.task.kind !== 'event' && !a.leaveAt && a.at.getTime() < trip.usualLeaveAt.getTime())
    .map((a) => ({ a, end: addMin(a.at, a.task.estimateMin ?? 15) }))
    .filter((x) => x.end.getTime() > newLeave.getTime())
    .sort((x, y) => y.a.at.getTime() - x.a.at.getTime());
  const out: MovedJob[] = [];
  let edge = newLeave;
  for (const { a } of before) {
    const to = addMin(edge, -(a.task.estimateMin ?? 15));
    if (to.getTime() >= a.at.getTime()) continue;
    if (to.getTime() < now.getTime()) continue; // can't go earlier than now: it stays, and the message doesn't claim it moved
    out.push({ taskId: a.task.id, title: a.task.title, from: a.at.toISOString(), to: to.toISOString() });
    edge = to;
  }
  return out;
}

export type LiveNotice = { id: string; title: string; body: string; alarm: boolean };

/**
 * One answer from Google in: the new record and, if the leave-by moved by more than 5 minutes, one
 * message with the reason and the numbers. Google gives no cause for traffic, so none is made up.
 */
export function applyLive(
  state: State,
  t: TripPlan,
  prev: LiveTrip | undefined,
  check: string,
  google: { min: number; usualMin: number } | null,
  now: Date,
): { rec: LiveTrip; notice: LiveNotice | null } {
  const base: LiveTrip = prev ?? {
    key: t.key,
    taskId: t.taskId,
    day: t.day,
    placeName: t.dest.name,
    arriveAt: t.arriveAt.toISOString(),
    usualLeaveAt: t.usualLeaveAt.toISOString(),
    usualMin: t.usualMin,
    leaveAt: t.usualLeaveAt.toISOString(),
    checks: [],
    moved: [],
  };
  const checks = [...new Set([...base.checks, check])];
  if (!google) return { rec: { ...base, checks }, notice: null }; // Google down: the usual time stands
  const live = Math.max(1, Math.round(google.min));
  const usual = Math.max(1, Math.round(google.usualMin));
  const current = leaveNow(t, prev);
  const target = addMin(t.arriveAt, -(live + t.bufferMin));
  // Back near the usual time: the usual time it is, and anything moved goes back.
  const nearUsual = Math.abs(target.getTime() - t.usualLeaveAt.getTime()) <= LIVE_SHIFT_MIN * 60000;
  const next = nearUsual ? t.usualLeaveAt : target;
  const rec0: LiveTrip = { ...base, checks, liveMin: live, staticMin: usual, lastCheckAt: now.toISOString() };
  if (Math.abs(next.getTime() - current.getTime()) <= LIVE_SHIFT_MIN * 60000 || prev?.undone) return { rec: rec0, notice: null };

  const hm = fmtTime(next);
  const earlier = next.getTime() < current.getTime();
  const moved = earlier && !nearUsual ? jobsToMove(agendaFor(state, t.day), t, next, now) : [];
  const rec: LiveTrip = { ...rec0, leaveAt: next.toISOString(), moved };
  const why = earlier
    ? live > usual + 2
      ? `Traffic is heavier than usual, so it's ${live} minutes today instead of ${usual}.`
      : `It's ${live} minutes today instead of your usual ${t.usualMin}.`
    : `Traffic has eased, so it's ${live} minutes now.`;
  const movedLine = moved.length ? ` ${moved.map((m) => `${m.title} moved to ${fmtTime(new Date(m.to))}`).join('. ')}.` : '';
  const backLine = !earlier && prev?.moved.length ? ' Your jobs before it are back where they were.' : '';
  return {
    rec,
    notice: {
      id: `live-${t.key}-${now.getTime()}`,
      title: nearUsual && !earlier ? `Leaving for ${t.dest.name} is back to ${hm}` : `I've moved leaving for ${t.dest.name} to ${hm}`,
      body: `${why}${movedLine}${backLine} Tap to undo.`,
      alarm: earlier && next.getTime() - now.getTime() <= LIVE_ALARM_MIN * 60000,
    },
  };
}

/** The leave-by and job times in use for a day, for the nudges. Undone or old records change nothing. */
export function liveAgenda(agenda: AgendaItem[], live: LiveTrip[] | undefined, day: string): AgendaItem[] {
  const recs = (live ?? []).filter((r) => r.day === day && !r.undone);
  if (!recs.length) return agenda;
  const moved = new Map(recs.flatMap((r) => r.moved.map((m) => [m.taskId, new Date(m.to)] as const)));
  return agenda.map((a) => {
    const r = recs.find((x) => x.taskId === a.task.id);
    if (r && a.leaveAt) return { ...a, leaveAt: new Date(r.leaveAt), travelMin: r.liveMin ?? a.travelMin };
    const to = moved.get(a.task.id);
    return to ? { ...a, at: to } : a;
  });
}

/** Keep only today's records (and yesterday's, for the log). */
export function cleanLive(raw: unknown, now: Date): LiveTrip[] {
  if (!Array.isArray(raw)) return [];
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const from = dayKey(y);
  return raw.filter((r: any) => r && typeof r.key === 'string' && typeof r.day === 'string' && r.day >= from && typeof r.leaveAt === 'string' && Array.isArray(r.checks)).map((r: any) => ({ ...r, moved: Array.isArray(r.moved) ? r.moved : [] }));
}

/** "Live traffic: checked 07:12." or the fallback line for Settings. */
export function liveStatusLine(s: LiveStatus | undefined, now: Date): string {
  if (!s) return 'Live traffic: checked before trips to your nursery or school, about 4 times a trip.';
  const when = dayKey(new Date(s.at)) === dayKey(now) ? fmtTime(new Date(s.at)) : 'earlier';
  return s.ok ? `Live traffic: last checked ${when}.` : `Live traffic couldn't be reached (${when}), so Focus is using your usual travel times.`;
}
