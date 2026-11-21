// The tablet's room view and task mode, and "I'm avoiding this": worked out from the state.
// No React or device code here, so it's tested.
import { isPrivateSpace } from './sync';
import { addMin, agendaFor, dayKey, fmtTime, isDoneOn, parseLocal, roomNameOf, savAwayByPattern, slug, tasksFor } from './time';
import type { AvoidReason, Settings, State, Task } from './types';

export type RoomJob = {
  task: Task;
  done: boolean;
  /** "About 10 min", "After Sav's in bed", or a real time. */
  sub: string;
  started: boolean;
  niceToHave: boolean;
  /** When it was ticked today ("07:20"), for one-off jobs. */
  doneAt?: string;
};

/** The small grey line under a job: a real time if it has one, otherwise when or how long. */
export function jobSubline(task: Task): string {
  const at = task.at && !task.flex ? parseLocal(task.at) : null;
  if (at) return fmtTime(at);
  if (task.after) return task.after >= '19:15' && task.after <= '20:00' ? "After Sav's in bed" : `After ${task.after}`;
  if (task.estimateMin) return `About ${task.estimateMin} min`;
  return '';
}

/** Today's jobs in a room, open ones in Focus's order, done ones at the bottom. Never private ones. */
export function roomJobs(state: State, room: string, now: Date): RoomJob[] {
  const day = dayKey(now);
  const seen = new Set<string>();
  const list: Task[] = [];
  const add = (t: Task) => {
    if (seen.has(t.id) || t.room !== room || isPrivateSpace(t.spaceId, state.spaces)) return;
    if (t.kind === 'buy' || t.kind === 'note') return;
    seen.add(t.id);
    list.push(t);
  };
  agendaFor(state, day).forEach((a) => add(a.task));
  tasksFor(state, day).forEach(add);
  const jobs = list.map<RoomJob>((t) => {
    const repeats = !!t.repeatDays?.length;
    const done = isDoneOn(t, day);
    const started = repeats ? (t.partialDays ?? []).includes(day) : !!t.partial;
    return {
      task: t,
      done,
      sub: jobSubline(t),
      started,
      niceToHave: t.priority === 3 || !!t.someday,
      doneAt: done && !repeats && t.doneAt ? fmtTime(new Date(t.doneAt)) : undefined,
    };
  });
  // Open first (in order), done sink to the bottom.
  return [...jobs.filter((j) => !j.done), ...jobs.filter((j) => j.done)];
}

/** A job with a real clock time (cook dinner at 18:00) isn't part of a tidy round. */
export const hasRealTime = (t: Task) => !!t.at && !t.flex;

/** The open jobs a room round is made of: no fixed-time things. */
export function roundJobs(jobs: RoomJob[]): RoomJob[] {
  return jobs.filter((j) => !j.done && !hasRealTime(j.task));
}

/** "Start your bedroom" for her own room, otherwise "Start the Kitchen" with its real capitals. */
export function startLabel(settings: Pick<Settings, 'rooms' | 'firstName'>, room: string): string {
  const name = roomNameOf(settings.rooms, room) ?? room.replace(/-/g, ' ');
  const own = /bedroom/i.test(name) && !!settings.firstName && name.toLowerCase().includes(settings.firstName.toLowerCase());
  return own ? 'Start your bedroom' : `Start the ${name}`;
}

/** How long rounds of this room usually take: the average of the last three, in minutes. */
export function usualRoundMin(settings: Pick<Settings, 'roundLog'>, room: string): number | null {
  const past = (settings.roundLog ?? []).filter((r) => r.room === room && r.min > 0).slice(-3);
  if (!past.length) return null;
  return Math.round(past.reduce((a, r) => a + r.min, 0) / past.length);
}

/** "Last time it took 32 min. Do them in any order." or nothing if there's no history yet. */
export function lastTimeLine(settings: Pick<Settings, 'roundLog'>, room: string): string | null {
  const last = [...(settings.roundLog ?? [])].reverse().find((r) => r.room === room && r.min > 0);
  return last ? `Last time it took ${last.min} min. Do them in any order.` : null;
}

/** "of about N min": from past rounds, or the jobs' estimates added up. */
export function roundEstimateMin(state: State, room: string, now: Date): number | null {
  const usual = usualRoundMin(state.settings, room);
  if (usual) return usual;
  const sum = roundJobs(roomJobs(state, room, now)).reduce((a, j) => a + (j.task.estimateMin ?? 0), 0);
  return sum || null;
}

/**
 * A first step taken from the job's own words, when there is one:
 * "Kitchen: dishes in the sink, wipe the sides" → "Dishes in the sink".
 */
export function firstStep(task: Pick<Task, 'title' | 'grab'>): string | null {
  if (task.grab) return `Grab ${task.grab.item} from the ${task.grab.fromRoom.replace(/-/g, ' ')}`;
  const body = task.title.includes(':') ? task.title.slice(task.title.indexOf(':') + 1) : task.title;
  const parts = body
    .split(/,|;| then | and then /i)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const s = parts[0].replace(/\.$/, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The grab card: things to take from this room. "On your way up" when they're all for upstairs. */
export function grabLines(state: State, room: string): { title: string; lines: { item: string; forTitle: string; toRoom?: string }[] } | null {
  const rooms = state.settings.rooms;
  const here = rooms.find((r) => slug(r.name) === room);
  const lines = state.tasks
    .filter((t) => !t.done && t.grab?.fromRoom === room && !isPrivateSpace(t.spaceId, state.spaces))
    .map((t) => ({ item: t.grab!.item, forTitle: t.title, toRoom: roomNameOf(rooms, t.room) ?? t.room }));
  if (!lines.length) return null;
  const allUp = state.tasks
    .filter((t) => !t.done && t.grab?.fromRoom === room)
    .every((t) => rooms.find((r) => slug(r.name) === t.room)?.floor === 'up');
  return { title: here?.floor !== 'up' && allUp ? 'ON YOUR WAY UP' : "GRAB WHILE YOU'RE HERE", lines };
}

/** The next fixed thing today that isn't private: "Pick up Sav 17:15". */
export function nextFixed(state: State, now: Date): { title: string; at: Date } | null {
  const a = agendaFor(state, dayKey(now)).find((x) => !x.done && x.at.getTime() >= now.getTime() && !isPrivateSpace(x.task.spaceId, state.spaces));
  return a ? { title: a.task.title, at: a.at } : null;
}

/** The round check-in: 20 minutes after starting (10 when started from "I'm avoiding this"). */
export const CHECK_IN_MIN = 20;
export function checkInAt(startedAt: Date, minutes = CHECK_IN_MIN) {
  return addMin(startedAt, minutes);
}
export function checkInText(roomLabel: string) {
  return { title: `Still on the ${roomLabel.toLowerCase()}?`, body: 'Tap to stop or keep going.' };
}

// ---------- "I'm avoiding this" ----------

export type AvoidOption = { reason: AvoidReason; label: string; advice: string };

export const AVOID_OPTIONS: AvoidOption[] = [
  { reason: 'too-much', label: "There's too much", advice: 'Rubbish only, 10 minutes. Then you can stop.' },
  {
    reason: 'no-homes',
    label: "I don't know where things go",
    advice: "Take a bin bag, a basket for other rooms, and a 'no home yet' box. Sort the box another day.",
  },
  { reason: 'perfect', label: 'It has to look perfect', advice: 'Just the bits people see: sofa, table, a clear path. Good enough to sit down in.' },
  {
    reason: 'dont-want',
    label: "Something in there I don't want to deal with",
    advice: "Put it in a box with a note. We'll plan that bit separately.",
  },
];

type MomentumEntry = NonNullable<Settings['momentumLog']>[number];

/** Add an avoidance (or skip) to the momentum log. Phone-only data: it's never synced. */
export function logAvoid(log: Settings['momentumLog'], room: string, at: Date, reason?: AvoidReason, choice: 'avoid' | 'skip' = 'avoid'): MomentumEntry[] {
  return [...(log ?? []), { at: at.toISOString(), room, choice, ...(reason ? { reason } : {}) }].slice(-60);
}

/** The next Saturday Sav is with her dad, from tomorrow on (for "Sort the no home box"). */
export function nextDadSaturday(settings: Pick<Settings, 'savPattern'>, now: Date): string | null {
  for (let i = 1; i <= 7 * 8; i++) {
    const d = new Date(now);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + i);
    const key = dayKey(d);
    if (savAwayByPattern(settings as Settings, key)) return key;
  }
  return null;
}

/**
 * Skipped or avoided three days running (and not done since): the next time this room comes up,
 * offer the "I'm avoiding this" sheet first. Today counts if it's already happened today.
 */
export function avoidFirst(settings: Pick<Settings, 'momentumLog' | 'roundLog'>, room: string, now: Date): boolean {
  const days = new Set(
    (settings.momentumLog ?? []).filter((m) => m.room === room && (m.choice === 'avoid' || m.choice === 'skip')).map((m) => dayKey(new Date(m.at))),
  );
  const roundDays = new Set((settings.roundLog ?? []).filter((r) => r.room === room).map((r) => r.day));
  const today = dayKey(now);
  if (roundDays.has(today)) return false;
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  if (!days.has(today)) d.setDate(d.getDate() - 1);
  let run = 0;
  for (let i = 0; i < 3; i++) {
    const key = dayKey(d);
    if (!days.has(key) || roundDays.has(key)) break;
    run++;
    d.setDate(d.getDate() - 1);
  }
  return run >= 3;
}
