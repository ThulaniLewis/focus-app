// Light or dark (Settings, "Look"). Light and Dark are fixed. "Match phone" goes by the time of day:
// light by day, dark from tonight's wind down until morning. Wind down comes from the plan itself
// (the wind down job), so moving that job moves when Focus goes dark.
import type { State } from './types';
import { agendaFor, fmtTime } from './time';

export type Look = 'light' | 'dark' | 'match';
export type Scheme = 'light' | 'dark';

export const LOOKS: { id: Look; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'match', label: 'Match phone' },
];

/** When "Match phone" turns light again. Same as the tablet's night screen ending; moves to the profile in Stage 2. */
export const MORNING = '06:30';

const isWindDown = (title: string, seed?: string) => seed === 'wind-down' || /^wind down/i.test(title);

/** Tonight's wind down ("HH:MM"): the wind down job's time, or the end of the day if there isn't one. */
export function windDownAt(state: State, day: string): string {
  const w = agendaFor(state, day).find((a) => isWindDown(a.task.title, a.task.seed));
  return w ? fmtTime(w.at) : state.settings.dayEnd;
}

export function schemeFor(look: Look | undefined, now: Date, windDown: string): Scheme {
  if (look === 'light' || look === 'dark') return look;
  const hm = fmtTime(now);
  return hm >= windDown || hm < MORNING ? 'dark' : 'light';
}
