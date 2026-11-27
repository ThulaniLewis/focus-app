// Trips to a place: the tasks with a time whose travel place is the one a nursery or school is linked
// to. Used for the place's sentence and the work routine's leave-by line. Plain logic, tested.
import { fmtTime, parseLocal } from './time';
import type { Task } from './types';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function tripsTo(tasks: Task[], trips?: string): Task[] {
  const n = trips?.trim().toLowerCase();
  if (!n) return [];
  return tasks.filter((t) => !!t.at && !t.flex && t.place?.trim().toLowerCase() === n && (!!t.repeatDays?.length || !t.done));
}

/** "Drop off 08:00 and Pick up 17:15, weekdays". Null when nothing goes there yet. */
export function tripsLine(tasks: Task[]): string | null {
  if (!tasks.length) return null;
  const sorted = [...tasks].sort((a, b) => (a.at ?? '').slice(11).localeCompare((b.at ?? '').slice(11)));
  const parts = sorted.slice(0, 3).map((t) => {
    const d = t.at ? parseLocal(t.at) : null;
    return `${t.title} ${d ? fmtTime(d) : ''}`.trim();
  });
  const days = sorted[0].repeatDays;
  const when = days?.length ? (days.join() === '1,2,3,4,5' ? ', weekdays' : `, ${days.map((d) => DAYS[d]).join(' ')}`) : '';
  return `${parts.join(' and ')}${when}`;
}
