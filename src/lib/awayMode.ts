// Away mode (brief 4 Part 5): when it isn't a normal day because she's staying somewhere else.
// Home things pause and roll over quietly; diary events, place reminders, grab lists, her own alarms
// and her child's handovers carry on. Phone only: away mode, where she is and why never reach the
// tablet and are never read aloud. Plain logic, tested. Nothing here knows her places or her times:
// the evening comes from her own wind down time, and which places can ask is place-type data.
import type { GeoPlace } from './geo';
import { type Away, awayNow } from './grabLists';
import { windDownAt } from './look';
import { typeInfo } from './placeTypes';
import { addMin, dayKey, fmtTime, parseLocal } from './time';
import type { State, Task } from './types';

/** "Her usual evening": this long before her wind down. */
export const EVENING_BEFORE_WIND_DOWN_MIN = 60;
/** Still at the place this long after the evening starts (or after arriving, if later): ask once. */
export const AWAY_ASK_AFTER_MIN = 30;

/** The start of her evening on a day, from her own wind down time. */
export function eveningAt(state: State, day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const [h, min] = windDownAt(state, day).split(':').map(Number);
  return addMin(new Date(y, m - 1, d, h, min), -EVENING_BEFORE_WIND_DOWN_MIN);
}

/**
 * When to ask "Looks like you're staying at X tonight?" after arriving at a place, or null when that
 * kind of place never asks (home, the shops, work, the gym) or away mode is already on.
 */
export function awayAskAt(state: State, place: GeoPlace, arrivedAt: Date, away: Away | null | undefined): Date | null {
  if (awayNow(away) || !typeInfo(place.type).awayAsk) return null;
  const evening = eveningAt(state, dayKey(arrivedAt));
  const from = arrivedAt.getTime() > evening.getTime() ? arrivedAt : evening;
  return addMin(from, AWAY_ASK_AFTER_MIN);
}

export const awayAskLine = (placeName: string) => ({
  title: `Looks like you're staying at ${placeName} tonight.`,
  body: "I'll pause the home stuff till you're back. OK?",
});

/** The nights she's away: the ones she said, or the night it started. */
export const awayNights = (a: Away): string[] => (a.nights?.length ? a.nights : [dayKey(new Date(a.since))]);

/** Yes to "Still away tonight?" (or to the first question): add tonight. */
export const addNight = (a: Away, day: string): Away => ({ ...a, nights: [...new Set([...awayNights(a), day])].sort() });

/**
 * Does away mode pause this job? House jobs (anything with a room, or in the home space), the home
 * wind down, and anything tied to the home place. Never diary events, trips with a place (her
 * child's drop offs and pick ups), or a job she gave a place of its own.
 */
export function pausedByAway(task: Task, state: Pick<State, 'spaces'>, homeLinked: Set<string>): boolean {
  if (task.kind === 'event') return false;
  if (task.place) return false; // a trip: handovers and anything she has to get to
  if (homeLinked.has(task.id)) return true;
  if (task.room) return true;
  if (task.seed === 'wind-down' || /^wind down/i.test(task.title)) return true;
  const space = state.spaces.find((s) => s.id === task.spaceId);
  return space?.kind === 'home';
}

/** The tasks linked to her home place (phone only). */
export function homeLinkedIds(places: GeoPlace[], links: { taskId: string; placeId: string }[]): Set<string> {
  const home = new Set(places.filter((p) => p.type === 'home').map((p) => p.id));
  return new Set(links.filter((l) => home.has(l.placeId)).map((l) => l.taskId));
}

/** "Tyre repair 10:00, a whole-day entry": tomorrow's fixed things and whole-day entries, from her own data. */
export function tomorrowBits(state: State, today: Date): string[] {
  const t = new Date(today);
  t.setDate(t.getDate() + 1);
  const day = dayKey(t);
  const timed = state.tasks
    .filter((x) => x.at && !x.flex && !x.done && !x.repeatDays?.length && x.at.startsWith(day))
    .map((x) => ({ at: parseLocal(x.at!)!, title: x.title }))
    .filter((x) => !!x.at)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map((x) => `${x.title.charAt(0).toUpperCase()}${x.title.slice(1)} ${fmtTime(x.at)}`);
  const allDay = state.tasks.filter((x) => x.allDay && x.day === day && !x.done).map((x) => x.title);
  return [...timed, ...allDay].slice(0, 4);
}

/** The short wind down while away: "You're at Gran's tonight. Tomorrow: tyre repair 10:00. Anything to add?" */
export function awayCard(state: State, away: Away, now: Date): { title: string; body: string } {
  const bits = tomorrowBits(state, now);
  return {
    title: `You're at ${away.placeName} tonight.`,
    body: `${bits.length ? `Tomorrow: ${bits.join(', ')}. ` : 'Nothing fixed tomorrow. '}Anything to add?`,
  };
}

export const AWAY_LINE = 'Away tonight. Home jobs paused.';
