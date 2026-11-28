// What Focus should nudge about, worked out from the state. Pure, so it's tested.
import { addMin, agendaFor, dayKey, elapsedSec, fmtTime, hallwayLast, isDoneOn, parseLocal, savAwayByPattern, tasksFor } from './time';
import { isPrivateSpace } from './sync';
import type { State, Task } from './types';
import { whyNow } from './support';
import { houseBlocked } from './comeUp';
import { SEED_NUDGES } from './seed';
import { awayCard, awayNights, eveningAt, pausedByAway } from './awayMode';
import { type Away, awayNow } from './grabLists';
import { liveAgenda, type LiveTrip } from './liveTraffic';

/** When a date-only deadline's countdown alerts go off. A reminder time, not a job time. */
export const DEADLINE_MORNING = '09:00';
/** Days before a date-only deadline, and what the alert says. */
export const DAY_COUNTDOWN: [number, string][] = [
  [3, '3 days left'],
  [1, 'Due tomorrow'],
  [0, 'Due today'],
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "23 Nov" */
export const fmtDueDay = (day: string) => `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;

const GET_READY_MIN = 15;
const HEADS_UP_MIN = 15;
export const NAG = 'nag';
const NAG_EVERY_MIN = 15;
const NAG_TIMES = 8; // every 15 minutes until ticked, the next job, or a checkpoint (2 hours at most)
/**
 * Checkpoints in the day. Once one passes, Focus stops nudging about jobs from before it: they stay
 * on the list, but there's no more buzzing. Leave-by times (drop off, pick up) count as well.
 */
export const CHECKPOINTS = ['19:30', '21:00']; // Sav asleep, wind down
const NAG_DAYS = 2; // today and tomorrow; re-planned every time Focus opens


/**
 * "What's next" check-ins for jobs with no real time. No clock on them, just the next thing.
 * Weekdays fit round nursery and the gym; any window too close to a fixed time is skipped.
 */
export const NEXT_WINDOWS_WEEKDAY = ['10:30', '12:30', '15:30', '19:45'];
export const NEXT_WINDOWS_WEEKEND = ['10:30', '14:00', '19:45'];

export type Planned = {
  at: Date;
  title: string;
  body: string;
  nag?: { taskId: string; day: string };
  ref?: { taskId: string; day: string };
  /** Sounds even when the phone is on vibrate or silent: leave now, deadlines, timers. */
  loud?: boolean;
  /** Notifications with the same thread stack together in the tray. */
  thread?: string;
  /** What a tap opens, for nudges that aren't about one job (away mode). */
  data?: Record<string, string>;
};

/** What the phone knows that the synced State doesn't: away mode and links to home (phone only). */
export type PlanOpts = { away?: Away | null; homeLinked?: Set<string>; live?: LiveTrip[] };

/** The next flexible job to suggest at a given time of day, if any. */
function nextJob(state: State, day: string, at: Date, paused: (t: Task) => boolean = () => false): { task: Task; more: number } | null {
  const hm = fmtTime(at);
  const open = tasksFor(state, day).filter(
    (t) =>
      !isDoneOn(t, day) &&
      !isPrivateSpace(t.spaceId, state.spaces) &&
      (t.flex || !t.at) &&
      (!t.after || hm >= t.after) &&
      (t.priority ?? 2) <= 2 &&
      !houseBlocked(state, t, day, at) && // Sav home sick: house jobs wait for her nap or bedtime
      !paused(t), // away tonight: home jobs wait till she's back
  );
  if (!open.length) return null;
  const ordered = hallwayLast(open, (t) => t.room);
  return { task: ordered[0], more: ordered.length - 1 };
}

/** Everything Focus should nudge about in the next week. */
export function plan(state: State, now: Date, opts: PlanOpts = {}): Planned[] {
  const out: Planned[] = [];
  const away = awayNow(opts.away);
  const homeLinked = opts.homeLinked ?? new Set<string>();
  // Away mode covers tonight and tomorrow; arriving home ends it and the plan is made again.
  const pausedOn = (i: number) => (t: Task) => !!away && i <= 1 && pausedByAway(t, state, homeLinked);
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const day = dayKey(d);
    // Live traffic: today's leave-by and the jobs before it, as moved (until she taps Undo).
    const agenda = liveAgenda(agendaFor(state, day), opts.live, day);
    const paused = pausedOn(i);
    if (away && i <= 1 && !awayNights(away).includes(day)) {
      // Another night? Asked once, at the start of her evening.
      out.push({ at: eveningAt(state, day), title: 'Still away tonight?', body: `At ${away.placeName}. Home jobs stay paused if you are.`, data: { open: 'away', placeId: 'still' }, thread: 'away' });
    }
    // Moments that end a job's nudges: the next job's time, a leave-by, Sav asleep, wind down.
    const gates = [
      ...agenda.filter((x) => x.leaveAt).map((x) => x.leaveAt!),
      ...agenda.filter((x) => x.task.nag && !x.done).map((x) => x.at),
      ...CHECKPOINTS.map((hm) => new Date(`${day}T${hm}:00`)),
    ];
    const nextGate = (after: Date) =>
      gates.filter((g) => g.getTime() > after.getTime()).sort((x, y) => x.getTime() - y.getTime())[0] ?? null;
    for (const a of agenda) {
      if (a.done) continue;
      if (paused(a.task)) {
        // The home wind down becomes one short card, once, on a night she's away. Nothing else.
        if (away && (a.task.seed === 'wind-down' || /^wind down/i.test(a.task.title)) && awayNights(away).includes(day)) {
          const card = awayCard(state, away, d);
          out.push({ at: a.at, title: card.title, body: card.body, data: { open: 'away', placeId: 'card' }, thread: 'away' });
        }
        continue; // rolls over quietly: nothing missed, nothing skipped
      }
      const sp = state.spaces.find((x) => x.id === a.task.spaceId);
      if (sp?.kind === 'private') continue; // never pop private things up on screen
      if (a.task.nag) {
        if (i >= NAG_DAYS) continue;
        const snoozed = a.task.snoozeUntil ? new Date(a.task.snoozeUntil) : null;
        const grab = a.task.grab ? `Grab ${a.task.grab.item} from the ${a.task.grab.fromRoom.replace(/-/g, ' ')} first. ` : '';
        let sentAfterSnooze = false;
        const gate = nextGate(a.at);
        for (let k = 0; k < NAG_TIMES; k++) {
          let at = addMin(a.at, k * NAG_EVERY_MIN);
          let isSnoozeNudge = false;
          if (snoozed && at < snoozed) {
            if (sentAfterSnooze || snoozed.getTime() > addMin(a.at, NAG_TIMES * NAG_EVERY_MIN).getTime()) continue;
            at = snoozed;
            sentAfterSnooze = true;
            isSnoozeNudge = true;
          }
          // After the snoozed nudge, carry on 15 minutes later, not sooner.
          if (snoozed && !isSnoozeNudge && at.getTime() < addMin(snoozed, NAG_EVERY_MIN).getTime()) continue;
          // Only the job you should be on now keeps nudging: stop at the next job or checkpoint.
          // The one nudge you asked for with Snooze still comes.
          if (k > 0 && !isSnoozeNudge && gate && at.getTime() >= gate.getTime()) break;
          const plain = a.task.seed ? SEED_NUDGES[a.task.seed] : undefined;
          if (plain) {
            out.push({ at, title: plain.title, body: plain.ahead ? aheadLine(state, d) : "Tap Done when it's done.", nag: { taskId: a.task.id, day }, thread: `job-${a.task.id}` });
            continue;
          }
          out.push({
            at,
            title: k === 0 ? a.task.title : `Still to do: ${a.task.title}`,
            body: `${grab}${a.task.estimateMin ? `About ${a.task.estimateMin} min. ` : ''}${k === 1 ? `${whyNow(state, a.task, a.at) ?? ''} ` : ''}Tap Done when it's done.`.replace(/\s+/g, ' ').trim(),
            nag: { taskId: a.task.id, day },
            thread: `job-${a.task.id}`,
          });
        }
        continue;
      }
      if (a.leaveAt) {
        out.push({
          at: addMin(a.leaveAt, -GET_READY_MIN),
          title: `Get ready: leave at ${fmtTime(a.leaveAt)}`,
          body: `${a.task.title} at ${fmtTime(a.at)}. ${a.travelMin} min to get there.`,
          ref: { taskId: a.task.id, day },
        });
        out.push({ at: a.leaveAt, title: 'Time to leave', body: `${a.task.title} at ${fmtTime(a.at)}.`, ref: { taskId: a.task.id, day }, loud: true, thread: `job-${a.task.id}` });
      } else {
        out.push({
          at: addMin(a.at, -HEADS_UP_MIN),
          title: `${a.task.title} at ${fmtTime(a.at)}`,
          body: a.placeUnknown ? `Add a travel time for ${a.task.place} in Settings to get a leave-by time.` : 'In 15 minutes.',
          ref: { taskId: a.task.id, day },
        });
      }
    }
  }
  // What's next: gentle check-ins for the jobs with no time, today and tomorrow.
  for (let i = 0; i < 2; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const day = dayKey(d);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    const fixed = agendaFor(state, day).filter((a) => !a.done);
    const busy = (w: Date) =>
      fixed.some((a) => {
        const start = (a.leaveAt ?? a.at).getTime() - 20 * 60000;
        const end = a.at.getTime() + (a.task.estimateMin ?? 15) * 60000;
        return w.getTime() >= start && w.getTime() < end;
      });
    for (const hm of weekend || savAwayByPattern(state.settings, day) ? NEXT_WINDOWS_WEEKEND : NEXT_WINDOWS_WEEKDAY) {
      const w = new Date(`${day}T${hm}:00`);
      if (busy(w)) continue;
      const next = nextJob(state, day, w, pausedOn(i));
      if (!next) continue;
      out.push({
        at: w,
        title: `Next up: ${next.task.title}`,
        body: `Whenever you're ready.${next.more ? ` ${next.more} more on your list after that.` : ''}`,
        ref: { taskId: next.task.id, day },
        thread: 'next',
      });
    }
  }

  // Real deadlines count back: time to start, an hour left, due now. These ones make a sound.
  for (const t of state.tasks) {
    if (!t.dueAt || t.done || isPrivateSpace(t.spaceId, state.spaces)) continue;
    const due = parseLocal(t.dueAt);
    if (!due) continue;
    const day = dayKey(due);
    const need = t.estimateMin ?? 60;
    const startBy = addMin(due, -(need + 15));
    out.push({
      at: startBy,
      title: `Time to start: ${t.title}`,
      body: `Due at ${fmtTime(due)}. It takes about ${need} min, so starting now leaves a little spare.`,
      ref: { taskId: t.id, day },
      loud: true,
      thread: `job-${t.id}`,
    });
    if (addMin(due, -60).getTime() > startBy.getTime() + 10 * 60000)
      out.push({ at: addMin(due, -60), title: `1 hour left: ${t.title}`, body: `Due at ${fmtTime(due)}.`, ref: { taskId: t.id, day }, loud: true, thread: `job-${t.id}` });
    out.push({ at: due, title: `Due now: ${t.title}`, body: 'Send it as it is if you need to. Done beats perfect.', ref: { taskId: t.id, day }, loud: true, thread: `job-${t.id}` });
  }

  // Deadlines with a date but no time count down by day: 3 days, 1 day, and the morning of.
  for (const t of state.tasks) {
    if (!t.dueDay || t.done || isPrivateSpace(t.spaceId, state.spaces)) continue;
    const dueDate = parseLocal(`${t.dueDay}T${DEADLINE_MORNING}`);
    if (!dueDate) continue;
    for (const [daysBefore, title] of DAY_COUNTDOWN) {
      const at = addMin(dueDate, -daysBefore * 24 * 60);
      out.push({
        at,
        title: `${title}: ${t.title}`,
        body: daysBefore ? `Due ${fmtDueDay(t.dueDay)}. It's on your next list.` : 'Due today. Send it as it is if you need to. Done beats perfect.',
        ref: { taskId: t.id, day: dayKey(at) },
        loud: true,
        thread: `job-${t.id}`,
      });
    }
  }

  for (const t of state.tasks) {
    if (!t.timer?.startedAt || !t.estimateMin || t.done) continue;
    const leftSec = t.estimateMin * 60 - elapsedSec(t.timer, now);
    if (leftSec > 0) {
      out.push({
        at: new Date(now.getTime() + leftSec * 1000),
        title: `${t.estimateMin} min is up`,
        body: `${t.title}. Keep going or wrap up, your call.`,
        ref: { taskId: t.id, day: dayKey(now) },
        loud: true,
        thread: `job-${t.id}`,
      });
    }
  }
  const cb = state.settings.comeBack;
  if (cb) out.push({ at: new Date(cb.at), title: cb.title, body: cb.body, ...(cb.taskId ? { ref: { taskId: cb.taskId, day: dayKey(new Date(cb.at)) } } : {}) });
  return out.filter((p) => p.at.getTime() > now.getTime() + 5000).sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** For tests and the plan screen: how many nudges are queued. */
export function plannedCount(state: State, now: Date) {
  return plan(state, now).length;
}


/** "Tomorrow starts with Tyre repair at 10:00." One plain line for the evening nudge. */
export function aheadLine(state: State, today: Date): string {
  const t = new Date(today);
  t.setDate(t.getDate() + 1);
  const first = agendaFor(state, dayKey(t)).find((a) => !a.done && !a.task.flex);
  return first ? `Tomorrow starts with ${first.task.title} at ${fmtTime(first.at)}.` : 'Nothing fixed tomorrow.';
}
