// The Stop check in: Thulani talks about how the job went, in her own words, and Claude works out
// what that means for the whole day. Other jobs she finished get ticked, bits left anywhere become
// their own to-dos in the right room and on the right day, and if something is unclear Claude asks
// one short question. No phone code here, so it can be tested.
import { agendaFor, dayKey, isDoneOn, slug, tasksFor } from './time';
import type { State, Task } from './types';

export type Leftover = { title: string; need: boolean; room?: string; day?: string };

/** One of today's open jobs, given to Claude by a short ref (j1, j2…) instead of its real id. */
export type JobRef = { ref: string; id: string; title: string; room?: string };

export type CheckIn = {
  /** The job she stopped: finished in full, or some left. */
  thisJobDone: boolean;
  /** Other jobs on today's list she says she finished. Real task ids. */
  doneIds: string[];
  /** Other jobs she worked on that still have bits left (the bits are in jobs). */
  startedIds: string[];
  jobs: Leftover[];
  /** One short follow up when something is unclear. */
  question?: string;
};

export const CHECK_TOOL = {
  name: 'save_check_in',
  description: 'Save what Thulani said about the job she stopped: what got finished, and what is left where.',
  input_schema: {
    type: 'object',
    properties: {
      this_job_done: { type: 'boolean', description: 'true only if she says the job she stopped is fully finished with nothing left.' },
      done_refs: {
        type: 'array',
        items: { type: 'string' },
        description: 'Refs (like "j3") of OTHER jobs on today\'s list that she clearly says are finished, with nothing left.',
      },
      started_refs: {
        type: 'array',
        items: { type: 'string' },
        description: 'Refs of OTHER jobs she worked on that still have bits left. Put the bits in jobs.',
      },
      jobs: {
        type: 'array',
        description: 'Everything still left to do that she mentioned, in any room.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short job starting with a verb, plain British English, no full stop, e.g. "Mop the floor".' },
            room: { type: 'string', description: 'Room slug from her rooms list, or "" if it is not tied to a room.' },
            need: { type: 'boolean', description: 'true if needed to make things tidy for now; false if it can wait (deep cleans, clear outs, organising).' },
            when: { type: 'string', description: '"today", "tomorrow", or a date as YYYY-MM-DD.' },
          },
          required: ['title', 'room', 'need', 'when'],
        },
      },
      question: {
        type: 'string',
        description: 'Only if something important is unclear: ONE short, friendly question. Leave empty otherwise.',
      },
    },
    required: ['this_job_done', 'done_refs', 'jobs'],
  },
};

/** Today's open jobs that she might talk about, with short refs. */
export function openJobs(state: State, stopped?: Task, now = new Date()): JobRef[] {
  const today = dayKey(now);
  const seen = new Set<string>(stopped ? [stopped.id] : []);
  const out: Task[] = [];
  for (const a of agendaFor(state, today)) {
    if (a.done || seen.has(a.task.id) || a.task.kind === 'event') continue;
    seen.add(a.task.id);
    out.push(a.task);
  }
  for (const t of tasksFor(state, today)) {
    if (isDoneOn(t, today) || seen.has(t.id) || t.list) continue; // shopping lists aren't jobs
    seen.add(t.id);
    out.push(t);
  }
  return out.slice(0, 40).map((t, i) => ({ ref: `j${i + 1}`, id: t.id, title: t.title, room: t.room }));
}

/** Shared with the dump: a job is only ticked when she says it is finished. */
export const TICK_RULE = [
  '- Never tick a job off just because she mentions it. Only put it in done_refs if she clearly says it is finished, with nothing left ("all done", "finished", "that\'s sorted", "it\'s all clean and nothing left").',
  '- If she worked on a job and says there are bits left, put it in started_refs and add each bit as its own job in that room.',
  '- If she says she did or cleaned something but not whether it is finished, do not tick it. Ask (see below), and leave it out of done_refs and started_refs until she answers.',
].join('\n');

export const ASK_RULE =
  '- Ask when it matters. If she mentions doing a job or a room but not whether it is finished, or what is left is unclear, ask in "question": short, friendly, like a PA checking in. Cover everything unclear in one go if you can, e.g. "Is the bathroom all done, or is there more to do? And did the kitchen floor get mopped?". Still fill in everything you are sure of. Do not ask about small things.';

export const NO_MORE_QUESTIONS = '- Do not ask any more questions. Make your best call, and if you are not sure a job is finished, do not tick it.';

export function checkInPrompt(opts: {
  stopped: Task;
  stoppedRoom?: string;
  jobs: JobRef[];
  rooms: { name: string; slug: string }[];
  today: string;
  tomorrow: string;
  canAsk: boolean;
}) {
  const { stopped, stoppedRoom, jobs, rooms, today, tomorrow, canAsk } = opts;
  return [
    `You are Focus, Thulani's home PA. She has just stopped a house job and is telling you how it went, out loud. She talks in prose, not lists: stories, distractions, asides ("it took longer because I ended up cleaning the bathroom"). Speech to text makes it messy (no commas, misheard words: "a sides" means "the sides").`,
    `Your job is to pull out only the tasks and actions and ignore the rest, the way a good PA would.`,
    `The job she stopped: "${stopped.title}"${stoppedRoom ? ` (${stoppedRoom})` : ''}.`,
    jobs.length
      ? `Her other open jobs today:\n${jobs.map((j) => `${j.ref}: ${j.title}${j.room ? ` [${j.room}]` : ''}`).join('\n')}`
      : 'She has no other open jobs today.',
    `Her rooms (slug: name): ${rooms.map((r) => `${r.slug}: ${r.name}`).join(', ')}.`,
    `Today is ${today}, tomorrow is ${tomorrow}.`,
    [
      'How to think it through:',
      TICK_RULE,
      '- Bits left in another room are jobs in THAT room ("stuff on the bathroom side to take out" is a bathroom job).',
      '- If the job she stopped still has lots left, list every remaining part as its own job in its room, like a fresh round of it. If she says "everything I had before" or "the rest", add the parts of the stopped job that are not covered yet.',
      '- Do not add a job that is already one of her open jobs; leave it as it is.',
      '- List the hallway or entrance jobs last; rubbish and things to go out collect there on the way.',
      '- Use "when" for timing she gives ("take the bins to the dump tomorrow" is tomorrow). Otherwise today.',
      '- Never invent jobs she did not say. Keep each one short, one action, starting with a verb.',
      canAsk ? ASK_RULE : NO_MORE_QUESTIONS,
    ].join('\n'),
    `Always answer by calling the ${CHECK_TOOL.name} tool exactly once.`,
  ].join('\n\n');
}

const slugOf = (s: string) => slug(s);

export function cleanCheckIn(
  input: any,
  ctx: { jobs: JobRef[]; roomSlugs: string[]; stoppedRoom?: string; today: string; tomorrow: string },
): CheckIn {
  const byRef = new Map(ctx.jobs.map((j) => [j.ref, j.id]));
  const refs = (v: any) => [...new Set((Array.isArray(v) ? v : []).map((r: any) => byRef.get(String(r).trim())).filter(Boolean))] as string[];
  const doneIds = refs(input?.done_refs);
  const startedIds = refs(input?.started_refs).filter((x) => !doneIds.includes(x));
  const rooms = new Set(ctx.roomSlugs);
  const open = new Set(ctx.jobs.map((j) => `${j.room ?? ''}|${j.title.toLowerCase()}`));
  const seen = new Set<string>();
  const jobs: Leftover[] = [];
  for (const j of Array.isArray(input?.jobs) ? input.jobs : []) {
    let title = String(j?.title ?? '').trim().replace(/\.$/, '');
    if (title.length < 2) continue;
    title = title.charAt(0).toUpperCase() + title.slice(1);
    const r = slugOf(String(j?.room ?? ''));
    const room = rooms.has(r) ? r : r ? ctx.stoppedRoom : undefined;
    const w = String(j?.when ?? 'today').trim().toLowerCase();
    const day = w === 'tomorrow' ? ctx.tomorrow : /^\d{4}-\d{2}-\d{2}$/.test(w) && w >= ctx.today ? w : ctx.today;
    const key = `${room ?? ''}|${title.toLowerCase()}`;
    if (seen.has(key) || open.has(key)) continue;
    seen.add(key);
    jobs.push({ title, need: j?.need !== false, room, day });
  }
  const q = String(input?.question ?? '').trim();
  return { thisJobDone: input?.this_job_done === true && !jobs.some((j) => j.room === ctx.stoppedRoom), doneIds, startedIds, jobs: jobs.slice(0, 15), question: q || undefined };
}

/** What she said, plus any questions and answers so far, as one message for Claude. */
export function checkInMessage(turns: { q?: string; said: string }[]) {
  return turns.map((t) => (t.q ? `You asked: ${t.q}\nShe answered: ${t.said}` : `What she said: ${t.said}`)).join('\n\n');
}
