// Which screen she's on, by its mockup title, so a "Note for Claude" can say where it was made.
import { isPrivateTask } from './sync';
import { dayKey, fmtTime } from './time';
import type { State } from './types';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const TITLES: [RegExp, string][] = [
  [/^\/$/, 'Today'],
  [/^\/spaces$/, 'Spaces'],
  [/^\/space\//, 'Space'],
  [/^\/settings$/, 'Settings'],
  [/^\/tablet-settings$/, 'Tablet settings panel'],
  [/^\/dump/, 'Talk it through'],
  [/^\/week$/, 'Week ahead'],
  [/^\/winddown$/, 'Wind down'],
  [/^\/room\//, 'Room view'],
  [/^\/rooms$/, 'Home: rooms by floor'],
  [/^\/kitchen$/, 'Kitchen mode and timers'],
  [/^\/bedtime$/, 'Bedtime pictures'],
  [/^\/comeup$/, "Something's come up"],
  [/^\/easier$/, 'An easier day'],
  [/^\/devreport$/, 'Dev report'],
];

/** The mockup title for a route ("/space/jobs" → "Space: jobs"). */
export function screenTitle(path: string): string {
  for (const [re, title] of TITLES) {
    if (re.test(path)) return title === 'Space' || title === 'Room view' ? `${title}: ${path.split('/').pop()}` : title;
  }
  return path;
}

let recent: string[] = [];

export function recordScreen(path: string) {
  if (recent[recent.length - 1] === path) return;
  recent = [...recent.slice(-4), path];
}

/** The screen before the one she's on now (the dev report opens from somewhere). */
export function previousScreen(): string {
  const before = recent.filter((p) => !/^\/(devreport|dump)/.test(p));
  return screenTitle(before[before.length - 1] ?? '/');
}

/** A short, non-private picture of the moment, for a note. */
export function noteContext(state: State, now: Date, device: string): string {
  const running = state.tasks.find((t) => t.timer?.startedAt && !t.done && !isPrivateTask(t, state.spaces));
  const plan = state.settings.dayPlans[dayKey(now)];
  return [
    `${DAYS[now.getDay()]} ${fmtTime(now)} on the ${device}`,
    running ? `running: ${running.title}` : null,
    state.settings.round?.startedAt ? `room round: ${state.settings.round.room}` : null,
    plan?.focus ? `today's focus: ${plan.focus}` : null,
  ]
    .filter(Boolean)
    .join(', ');
}
