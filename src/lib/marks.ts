import { elapsedSec } from './time';
import type { Task } from './types';

const nowISO = () => new Date().toISOString();

export /**
 * Tick finished jobs, and mark ones with bits left as "Started, some left" (the bits are their own
 * to-dos). The same as stopping a job, without the timer. Works for one-off and repeating jobs.
 */
function markWith(done: string[], started: string[], day: string) {
  const d = new Set(done);
  const st = new Set(started.filter((x) => !d.has(x)));
  return (x: Task): Task => {
    if (!d.has(x.id) && !st.has(x.id)) return x;
    const full = d.has(x.id);
    const sec = x.timer ? elapsedSec(x.timer, new Date()) : 0;
    const timeBits = sec ? { timer: undefined, actualMin: Math.max(1, Math.round(sec / 60)) } : { timer: undefined };
    if (x.repeatDays?.length)
      return {
        ...x,
        ...timeBits,
        doneDays: [...new Set([...(x.doneDays ?? []), day])],
        partialDays: full ? (x.partialDays ?? []).filter((p) => p !== day) : [...new Set([...(x.partialDays ?? []), day])],
      };
    return { ...x, ...timeBits, done: true, doneAt: nowISO(), partial: !full };
  };
}
