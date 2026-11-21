// Small pure helpers the screens share. No React in here so they can be tested.
import type { DiaryEvent } from './calendar';
import { savAwayByPattern, slug } from './time';
import type { Room, Settings, Space, State, Task } from './types';

const startOf = (day: string) => new Date(`${day}T00:00:00`);

/** Diary events that touch a given day. */
export function diaryOn(events: DiaryEvent[], day: string): DiaryEvent[] {
  const from = startOf(day);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return events.filter((e) => e.start < to && e.end > from);
}

/** On a Saturday, is there a diary entry saying Sav is with her dad? */
export function savAwayOn(events: DiaryEvent[], day: string, awayWords: string[]): DiaryEvent | undefined {
  const words = awayWords.map((w) => w.trim().toLowerCase()).filter(Boolean);
  if (!words.length) return undefined;
  return diaryOn(events, day).find((e) => {
    const t = e.title.toLowerCase();
    return words.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t));
  });
}

/** Open things in a space (shopping counts unticked items, private counts notes). */
export function openIn(state: State, space: Space): Task[] {
  return state.tasks.filter((t) => t.spaceId === space.id && !t.done);
}

export function roomsByFloor(rooms: Room[]) {
  return {
    up: rooms.filter((r) => r.floor === 'up'),
    down: rooms.filter((r) => r.floor === 'down'),
    other: rooms.filter((r) => r.floor === ''),
  };
}

export function openInRoom(state: State, room: Room): Task[] {
  const s = slug(room.name);
  return state.tasks.filter((t) => !t.done && !t.at && t.room === s);
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function greeting(now: Date, name: string) {
  const h = now.getHours();
  const part = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
  return name ? `${part}, ${name}` : part;
}

/**
 * Where Sav is on a Saturday: a diary entry mentioning dad wins, otherwise the
 * every-other-Saturday pattern. Null on other days, or when there's nothing to go on.
 */
export function savSaturday(events: DiaryEvent[], day: string, settings: Settings): { away: boolean; from: 'diary' | 'pattern' } | null {
  const d = new Date(`${day}T00:00:00`);
  if (d.getDay() !== 6) return null;
  if (savAwayOn(events, day, settings.awayWords)) return { away: true, from: 'diary' };
  if (settings.savPattern) return { away: savAwayByPattern(settings, day), from: 'pattern' };
  return null;
}
