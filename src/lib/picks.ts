// "Today's focus": the top things to do. Pure, so it's tested.
import { houseBlocked } from './comeUp';
import { agendaFor, dayKey, dayPlanFor, hallwayLast, isDoneOn, notYet, tasksFor } from './time';
import type { State, Task } from './types';

export type Pick = { task: Task; at?: Date };

/** The most important open things for a day: musts first, then the focus space, then by time. */
export function topPicks(state: State, day: string, now: Date, n = 3): Pick[] {
  const { focus } = dayPlanFor(state.settings, day);
  const soon = now.getTime() - 30 * 60000;
  const timed: Pick[] = agendaFor(state, day)
    .filter((a) => !a.done && (dayKey(now) !== day || a.at.getTime() >= soon))
    .map((a) => ({ task: a.task, at: a.at }));
  const loose: Pick[] = tasksFor(state, day)
    // Not done, not a job that waits until Sav's asleep, and (Sav home sick) not a house job outside her nap.
    .filter((t) => !isDoneOn(t, day) && !(dayKey(now) === day && (notYet(t, now) || houseBlocked(state, t, day, now))))
    .map((task) => ({ task }));
  const score = (p: Pick) => (p.task.topDay === day ? -1000 : 0) + (p.task.priority ?? 2) * 100 + (focus && p.task.spaceId === focus ? 0 : 50) + (p.at ? 0 : 25);
  const ranked = [...loose, ...timed]
    .filter((p) => (p.task.priority ?? 2) <= 2)
    .sort((a, b) => score(a) - score(b) || (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0));
  // Fixed appointments keep their place; house jobs in the hallway wait until the other rooms are done.
  const fixed = (p: Pick) => p.task.kind === 'event';
  const house = hallwayLast(ranked.filter((p) => !fixed(p)), (p) => p.task.room);
  let h = 0;
  return ranked.map((p) => (fixed(p) ? p : house[h++])).slice(0, n);
}
