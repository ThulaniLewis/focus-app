// The kind words: how today compares with last time, and why doing it now helps.
import { dayKey, savAwayByPattern } from './time';
import type { State, Task } from './types';

const fmt = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}` : `${min} min`);

/** The next Saturday Sav is with her dad, as "Saturday 21 Nov", if there is one in the next three weeks. */
export function nextFreeSaturday(state: State, from: Date): { label: string; day: string } | null {
  for (let i = 0; i < 21; i++) {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    const key = dayKey(d);
    if (d.getDay() === 6 && savAwayByPattern(state.settings, key)) {
      return { day: key, label: `Saturday ${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}` };
    }
  }
  return null;
}

/** A line for a house job: doing it now keeps Sav-free Saturdays free. */
export function whyNow(state: State, task: Task, now: Date): string | null {
  if (task.spaceId !== 'home') return null;
  const sat = nextFreeSaturday(state, now);
  if (!sat || sat.day === dayKey(now)) return 'A bit now means less waiting for you later.';
  return `Every bit you do now is less to catch up on ${sat.label}, when Sav's with her dad. Keep that day for you.`;
}

/** After stopping a job: how long it took against last time or the plan. */
export function howItWent(task: Task, minutes: number, allDone: boolean): string[] {
  const lines: string[] = [];
  const past = task.history ?? []; // called before today's time is saved
  const last = past[past.length - 1];
  if (last) {
    const diff = last.min - minutes;
    if (Math.abs(diff) < 5) lines.push(`About the same as last time (${fmt(last.min)}). That's a rhythm forming.`);
    else if (diff > 0) lines.push(`${fmt(minutes)} today. Last time it took ${fmt(last.min)}, so that's ${fmt(diff)} quicker.`);
    else lines.push(`${fmt(minutes)} today, longer than last time (${fmt(last.min)}). Some days there's just more to do.`);
  } else if (task.estimateMin && minutes > 0) {
    if (minutes > task.estimateMin * 1.3) lines.push(`${fmt(minutes)}. I'd planned ${fmt(task.estimateMin)}, so I'll plan it properly next time.`);
    else lines.push(`${fmt(minutes)}, right on plan.`);
  } else if (minutes > 0) {
    lines.push(`${fmt(minutes)} on it.`);
  }
  lines.push(allDone ? 'Well done. That one is off your mind.' : "Good going. You moved it forward, and what's left is written down, so you don't have to hold it.");
  return lines;
}
