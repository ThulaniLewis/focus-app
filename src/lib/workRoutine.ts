// The work routine card, as she arrives at a work place: her work list and when to leave for the next
// fixed thing (pick up, say). Meetings come from her calendar on the screen. Plain logic, tested.
import type { GeoPlace } from './geo';
import { agendaFor, dayKey, isDoneOn } from './time';
import type { State, Task } from './types';

export type LeaveLine = { title: string; at: Date; leaveAt: Date; travelMin?: number };

/** What's on her work list today: not done, for today or no day, in her work space. */
export function workList(state: Pick<State, 'tasks'>, place: Pick<GeoPlace, 'workSpaceId'>, now: Date): Task[] {
  if (!place.workSpaceId) return [];
  const today = dayKey(now);
  return state.tasks
    .filter((t) => t.spaceId === place.workSpaceId && t.kind !== 'note' && t.kind !== 'buy' && !isDoneOn(t, today) && (!t.day || t.day <= today) && !(t.at && !t.flex))
    .slice(0, 8);
}

/** The next fixed thing today that needs her to leave, and when. Null when there's nothing left today. */
export function nextLeave(state: State, now: Date): LeaveLine | null {
  const next = agendaFor(state, dayKey(now)).find((a) => !a.done && a.leaveAt && a.leaveAt.getTime() > now.getTime());
  return next && next.leaveAt ? { title: next.task.title, at: next.at, leaveAt: next.leaveAt, travelMin: next.travelMin } : null;
}
