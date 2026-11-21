// Last night's sleep, and the gentler day Focus can offer after a short one. Phone only: sleep is
// never synced, never shown on the tablet, never spoken. Pure, so it's tested.
import { applyMove, isAnchor, savHomeOn, type Move, whenLabel } from './comeUp';
import { isPrivateSpace } from './sync';
import { nextDadSaturday } from './roomMode';
import { agendaFor, dayKey, fmtTime, isDoneOn, savAwayByPattern, tasksFor } from './time';
import type { State, Task } from './types';

/** One night, keyed by the day she woke up. */
export type SleepNight = { day: string; asleepMin: number; start: string; end: string };
/** Kept on the phone only, outside settings (so it can never be one of the shared settings). */
export type SleepState = { nights: SleepNight[]; notToday?: string };

/** What Health Connect hands back (only the bits Focus uses). */
export type SleepSessionIn = { startTime: string; endTime: string; stages?: { startTime: string; endTime: string; stage: number }[] };

/** Health Connect stages that aren't sleep: awake (1), out of bed (3), awake in bed (7). */
const AWAKE_STAGES = new Set([1, 3, 7]);
export const SHORT_NIGHT_MIN = 6 * 60;

const mins = (a: string, b: string) => Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 60000);

/** Minutes actually asleep in one session: its sleep stages if it has them, otherwise the whole session. */
export function asleepIn(s: SleepSessionIn): number {
  if (s.stages?.length) return s.stages.filter((st) => !AWAKE_STAGES.has(st.stage)).reduce((a, st) => a + mins(st.startTime, st.endTime), 0);
  return mins(s.startTime, s.endTime);
}

/**
 * The night before a given morning: sessions starting after 15:00 the day before and ending by 14:00
 * that day (a broken night counts as one). Null if there's nothing.
 */
export function nightFor(sessions: SleepSessionIn[], wakeDay: string): SleepNight | null {
  const [y, m, d] = wakeDay.split('-').map(Number);
  const from = new Date(y, m - 1, d - 1, 15, 0).getTime();
  const to = new Date(y, m - 1, d, 14, 0).getTime();
  const inNight = sessions.filter((s) => new Date(s.startTime).getTime() >= from && new Date(s.endTime).getTime() <= to);
  if (!inNight.length) return null;
  const asleepMin = Math.round(inNight.reduce((a, s) => a + asleepIn(s), 0));
  const start = inNight.map((s) => s.startTime).sort()[0];
  const end = inNight.map((s) => s.endTime).sort().slice(-1)[0];
  return { day: wakeDay, asleepMin, start, end };
}

/** "about 5 hours", "about 5 and a half hours". */
export function aboutHours(min: number): string {
  const halves = Math.round(min / 30);
  const h = Math.floor(halves / 2);
  const half = halves % 2 === 1;
  if (h === 0) return half ? 'about half an hour' : 'hardly any';
  return `about ${h}${half ? ' and a half' : ''} hour${h === 1 && !half ? '' : 's'}`;
}

/** "A short night, about 5 hours. Better than the night before." Null when the night wasn't short. */
export function shortNightLine(last: SleepNight | undefined, before: SleepNight | undefined): string | null {
  if (!last || last.asleepMin >= SHORT_NIGHT_MIN) return null;
  const compare = !before
    ? ''
    : last.asleepMin - before.asleepMin >= 20
      ? ' Better than the night before.'
      : before.asleepMin - last.asleepMin >= 20
        ? ' A bit less than the night before.'
        : ' About the same as the night before.';
  return `A short night, ${aboutHours(last.asleepMin)}.${compare}`;
}

/** The two latest nights up to today: last night, and the night before it. */
export function lastTwo(sleep: SleepState | undefined, today: string): { last?: SleepNight; before?: SleepNight } {
  const nights = (sleep?.nights ?? []).filter((n) => n.day <= today).sort((a, b) => a.day.localeCompare(b.day));
  const last = nights.length && nights[nights.length - 1].day === today ? nights[nights.length - 1] : undefined;
  return { last, before: last ? nights[nights.length - 2] : undefined };
}

/** Keep two weeks of nights, newest wins for the same day. */
export function addNights(sleep: SleepState | undefined, nights: SleepNight[]): SleepState {
  const byDay = new Map((sleep?.nights ?? []).map((n) => [n.day, n]));
  for (const n of nights) byDay.set(n.day, n);
  return { ...(sleep ?? { nights: [] }), nights: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-14) };
}

// ---------- An easier day ----------

export const NAP_MIN = 25;
const NAP_FROM = '12:30';
const NAP_LAST_START = '14:35';
const EARLY_WIND_DOWN = '21:15';

const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const toHM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export type EasierDay = {
  /** A 25 minute rest while Sav's at nursery, "HH:MM". */
  nap?: string;
  /** The biggest job today: do it first, or move it to her dad's next Saturday. */
  biggest?: { task: Task; saturday?: string };
  /** Wind down earlier tonight. */
  windDown?: Move;
};

/**
 * What Focus can offer after a short night. Only offers: she picks. A nap only on a nursery day (not a
 * weekend, not with Sav home sick or at her dad's), fitted round anything fixed.
 */
export function easierDay(state: State, now: Date): EasierDay {
  const day = dayKey(now);
  const out: EasierDay = {};
  const weekday = now.getDay() >= 1 && now.getDay() <= 5;
  if (weekday && !savHomeOn(state.settings, day) && !savAwayByPattern(state.settings, day)) {
    const fixed = agendaFor(state, day)
      .filter((a) => !a.done && !a.task.flex)
      .map((a) => {
        const start = toMin(fmtTime(a.leaveAt ?? a.at)) - 10;
        return { start, end: toMin(fmtTime(a.at)) + (a.task.estimateMin ?? 15) + 10 };
      });
    const earliest = Math.max(toMin(NAP_FROM), now.getHours() * 60 + now.getMinutes() + 5);
    for (let m = Math.ceil(earliest / 5) * 5; m <= toMin(NAP_LAST_START); m += 5) {
      if (!fixed.some((f) => m < f.end && m + NAP_MIN > f.start)) {
        out.nap = toHM(m);
        break;
      }
    }
  }
  const big = tasksFor(state, day)
    .filter((t) => !isDoneOn(t, day) && t.kind === 'task' && !(t.at && !t.flex) && !t.repeatDays?.length && !isAnchor(t) && !isPrivateSpace(t.spaceId, state.spaces) && (t.estimateMin ?? 0) >= 30)
    .sort((a, b) => (b.estimateMin ?? 0) - (a.estimateMin ?? 0))[0];
  if (big) {
    const sat = nextDadSaturday(state.settings, now);
    // A real deadline before Saturday: only "do it first".
    out.biggest = { task: big, saturday: sat && !(big.dueAt && big.dueAt.slice(0, 10) < sat) ? sat : undefined };
  }
  const wind = agendaFor(state, day).find((a) => !a.done && (a.task.seed === 'wind-down' || /^wind down/i.test(a.task.title)));
  if (wind && fmtTime(wind.at) > EARLY_WIND_DOWN && wind.at.getTime() > now.getTime()) {
    out.windDown = {
      taskId: wind.task.id,
      title: wind.task.title,
      fromLabel: fmtTime(wind.at),
      to: { day, time: EARLY_WIND_DOWN },
      toLabel: whenLabel(day, EARLY_WIND_DOWN, day),
      why: 'An earlier night, tonight only',
    };
  }
  return out;
}

/** Put what she ticked into effect. Only adds or moves: nothing is dropped. */
export function applyEasierDay(
  state: State,
  offer: EasierDay,
  picked: { nap: boolean; biggest: 'first' | 'saturday' | null; windDown: boolean },
  now: Date,
  newId: () => string,
): State {
  const day = dayKey(now);
  let tasks = state.tasks;
  if (picked.nap && offer.nap)
    tasks = [
      ...tasks,
      { id: newId(), title: "Rest while Sav's at nursery", kind: 'event', at: `${day}T${offer.nap}`, estimateMin: NAP_MIN, createdAt: now.toISOString(), done: false },
    ];
  if (offer.biggest && picked.biggest === 'first') tasks = tasks.map((t) => (t.id === offer.biggest!.task.id ? { ...t, topDay: day } : t));
  if (offer.biggest && picked.biggest === 'saturday' && offer.biggest.saturday)
    tasks = applyMove(tasks, { taskId: offer.biggest.task.id, title: offer.biggest.task.title, fromLabel: 'Today', to: { day: offer.biggest.saturday }, toLabel: '', why: '' }, day, newId);
  if (picked.windDown && offer.windDown) tasks = applyMove(tasks, offer.windDown, day, newId);
  return { ...state, tasks };
}
