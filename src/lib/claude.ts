// Turns a voice or typed dump into suggested tasks. The device clock is sent
// with every call, because the model has no clock of its own. Calls go through
// the focus-claude Supabase function, which holds the Anthropic key.
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { configured, supabase } from './supabase';
import { normalise, type ParseResult } from './normalise';
import { ASK_RULE, CHECK_TOOL, type CheckIn, checkInMessage, checkInPrompt, cleanCheckIn, type JobRef, type Leftover, NO_MORE_QUESTIONS, TICK_RULE } from './leftovers';
import { dayKey, slug, toLocalISO } from './time';
import { FOOD_GROUPS, type Settings, type Space, type State, type Task } from './types';
import { cleanComeUp, COME_UP_TOOL, type ComeUpPlan, comeUpItems, comeUpPrompt } from './comeUp';

export type { ParsedItem, ParseResult } from './normalise';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function system(settings: Settings, spaces: Space[], now: Date) {
  const offsetMin = -now.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const off = `${sign}${String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0')}:${String(Math.abs(offsetMin) % 60).padStart(2, '0')}`;
  const floorName = { up: 'upstairs', down: 'downstairs', '': 'floor not set' } as const;
  const rooms = settings.rooms.map((r) => `${slug(r.name)} (${r.name}, ${floorName[r.floor]})`).join(', ');
  const places = settings.places.map((p) => p.name).join(', ') || 'none yet';
  const spaceList = spaces.map((s) => `${s.id} (${s.name}${s.kind === 'general' ? '' : `, ${s.kind}`})`).join(', ');
  return `You are Focus, a calm home manager for ${settings.firstName}, a solo parent in South East London. Her daughter is Sav.
You turn a brain dump into a short list of items for her to confirm. You suggest; she decides.

Right now on her phone it is ${DAYS[now.getDay()]} ${toLocalISO(now)} (UTC${off}). Today is ${dayKey(now)}. Work out every relative time ("tomorrow", "Thursday", "in an hour") from this, never from anything else.

Her spaces, as id (name): ${spaceList}.
Rooms in her home, as slug (name, floor): ${rooms}.
Places she has travel times for: ${places}.

Kinds:
- "event": has a fixed time (appointment, drop off, meeting, call, interview). Give "at" as local YYYY-MM-DDTHH:MM. If only a day is known with no time, use 09:00 and say so in the title ("Interview (time tbc)").
- "task": something to do with no fixed time. Most things are tasks. Never invent a time for a task: no time pressure that isn't real. If it's for a particular day, set "day". If it has a real deadline ("by 12 tomorrow", "closes Friday 5pm"), set "due" as local YYYY-MM-DDTHH:MM. If the deadline has a day but no time ("closes 23 Nov"), set "due" as YYYY-MM-DD only; never invent a time.
- "buy": something to buy. Set "list": "food" for groceries, or "other" for anything else (clothes, books, gifts, Sav's things, home). For food, "group" is exactly one of: ${FOOD_GROUPS.join(', ')}. For other, "group" is a short type like Clothes, Books, Sav, Home, Gifts.
- "note": something worth keeping that is not a task: a thought, a feeling, something about a person, an idea, a memory. These are private and go in the private space. When something personal could be either, choose "note".

Rules:
- One item per action. Keep titles short and plain. Tasks start with a verb ("Take rubbish out of Sav's room"). Notes keep her own words as closely as possible.
- space_id: the space each item belongs to, from her list. Jobs and recruiters go in the job or work space, bills in money, things for Sav in Sav's space, house jobs in the home space. Leave it out if nothing fits.
- Repeating fixed times ("every weekday", "Mondays") set repeat_days, 0 = Sunday to 6 = Saturday, and "at" on the first occurrence.
- "room" is the slug of the room where a task is done, only if obvious.
- House jobs (cleaning, tidying, washing up, rubbish) are tasks, never events, unless she gives a clock time. Between 17:30 and 19:30 she is with Sav and can't do house jobs; Focus keeps evening jobs for after bedtime on its own.
- Hallway last: list the hallway or entrance jobs after the other rooms, because rubbish and things to go out collect there on the way.
- The bin bag rule: if a task needs something fetched from a different room first, set "grab" with the item and the slug of the room it is in (rubbish in the bedroom needs a bin bag from the kitchen).
- "place" for events away from home, using one of her place names if it fits, otherwise a short name.
- estimate_min: a realistic guess of how long a task takes. Only for tasks.
- Anything starting "Focus note" or that is feedback about this app goes in "notes", not items.
- Never invent things she didn't mention. If something is vague, keep it as she said it.
- "reply" is one short, warm line in plain British English. No clinical or diagnostic words, no guilt, no exclamation marks.`;
}

const TOOL = {
  name: 'suggest_items',
  description: 'Return the items, notes and a one-line reply for her to review.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            kind: { type: 'string', enum: ['task', 'event', 'buy', 'note'] },
            space_id: { type: 'string' },
            list: { type: 'string', enum: ['food', 'other'] },
            group: { type: 'string' },
            room: { type: 'string' },
            grab: {
              type: 'object',
              properties: { item: { type: 'string' }, from_room: { type: 'string' } },
              required: ['item', 'from_room'],
            },
            at: { type: 'string', description: 'Events only: local YYYY-MM-DDTHH:MM' },
            day: { type: 'string', description: 'Tasks for a particular day: YYYY-MM-DD' },
            due: { type: 'string', description: 'A real deadline: local YYYY-MM-DDTHH:MM, or YYYY-MM-DD when only the day is known' },
            repeat_days: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 } },
            place: { type: 'string' },
            estimate_min: { type: 'integer', minimum: 1 },
          },
          required: ['title', 'kind'],
        },
      },
      notes: { type: 'array', items: { type: 'string' } },
      reply: { type: 'string' },
      done_refs: { type: 'array', items: { type: 'string' }, description: 'Refs of her open jobs she clearly says are finished.' },
      started_refs: { type: 'array', items: { type: 'string' }, description: 'Refs of her open jobs she worked on that still have bits left (add the bits as items).' },
      question: { type: 'string', description: 'Only if something important is unclear: one short, friendly question. Empty otherwise.' },
    },
    required: ['items', 'notes', 'reply'],
  },
};

export class ClaudeError extends Error {}

/** Told about every call's token use, for the dev report. Set by the store. */
let usageListener: ((u: { call: string; model: string; inputTokens: number; outputTokens: number }) => void) | null = null;
export function onClaudeUsage(fn: typeof usageListener) {
  usageListener = fn;
}

/** Send a request through the focus-claude function (the Anthropic key lives there, never on the phone). */
async function callClaude(body: object, settings: Settings, call = 'dump'): Promise<any> {
  if (!configured) throw new ClaudeError('Focus is not connected to Supabase yet. Add your project details in src/config.ts and rebuild.');
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) throw new ClaudeError('Sign in once in Settings so Focus can reach Claude.');
  let { data, error } = await supabase.functions.invoke('focus-claude', { body });
  // A stale sign-in token: refresh it quietly and try once more before saying anything.
  if (error instanceof FunctionsHttpError && error.context?.status === 401) {
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError) ({ data, error } = await supabase.functions.invoke('focus-claude', { body }));
  }
  if (error) {
    if (error instanceof FunctionsFetchError) throw new ClaudeError("Couldn't reach Focus's server. Check you're online and try again.");
    if (error instanceof FunctionsHttpError) {
      const status = error.context?.status;
      const detail: any = await error.context?.json?.().catch(() => null);
      if (detail?.error?.type === 'authentication_error')
        throw new ClaudeError("Anthropic didn't accept Focus's key. Make a new key in the Anthropic console and paste it into ANTHROPIC_API_KEY in Supabase secrets.");
      if (status === 401) {
        const said = String(detail?.msg ?? detail?.message ?? detail?.error ?? '');
        if (/jwt/i.test(said))
          throw new ClaudeError("Supabase's own sign-in check is blocking Focus. In Supabase, open the focus-claude function and turn off Verify JWT. You're still signed in.");
        throw new ClaudeError("Focus's server didn't accept your sign-in. Send yourself a new sign-in email from Today.");
      }
      if (status === 403) throw new ClaudeError("This email isn't on the allowed list for Focus's server.");
      if (status === 404 && detail?.error?.type === 'not_found_error')
        throw new ClaudeError(`Claude doesn't know the model "${settings.model}". Check the model name at the bottom of Settings.`);
      if (status === 404) throw new ClaudeError("Focus's server isn't set up yet. In Supabase, Edge Functions needs one called focus-claude.");
      throw new ClaudeError(`Claude said: ${detail?.error?.message ?? detail?.error ?? `error ${status}`}`);
    }
    throw new ClaudeError('Something went wrong reaching Claude. Try again.');
  }
  const u = (data as any)?.usage;
  if (u && usageListener)
    usageListener({ call, model: String((data as any)?.model ?? settings.model), inputTokens: Number(u.input_tokens ?? 0) + Number(u.cache_read_input_tokens ?? 0) + Number(u.cache_creation_input_tokens ?? 0), outputTokens: Number(u.output_tokens ?? 0) });
  return data;
}

export type DumpResult = ParseResult & { doneIds: string[]; startedIds: string[]; question?: string };

/** What she's said so far: the first dump, then any answers to Focus's questions. */
export async function parseDump(
  text: string,
  settings: Settings,
  spaces: Space[],
  now = new Date(),
  ctx: { jobs?: JobRef[]; turns?: { q?: string; said: string }[] } = {},
): Promise<DumpResult> {
  const jobs = ctx.jobs ?? [];
  const turns = ctx.turns ?? [];
  const canAsk = turns.length < 3;
  const loop = [
    jobs.length
      ? `Her open jobs today, as ref: title [room]:\n${jobs.map((j) => `${j.ref}: ${j.title}${j.room ? ` [${j.room}]` : ''}`).join('\n')}`
      : 'She has no open jobs today.',
    'If she talks about what she has done (not just new things), work out what it means for those jobs, like a PA checking in:',
    TICK_RULE,
    '- Bits left go in items as tasks in the right room. Do not add an item that is already one of her open jobs.',
    canAsk ? ASK_RULE : NO_MORE_QUESTIONS,
    'If you ask a question, still return every item you are sure of; they are shown after she answers.',
  ].join('\n');

  // The Anthropic key lives in the focus-claude Supabase function, never on the phone.
  const body = {
    model: settings.model,
    max_tokens: 2000,
    system: `${system(settings, spaces, now)}\n\n${loop}\n\nAlways answer by calling the ${TOOL.name} tool exactly once.`,
    tools: [TOOL],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: turns.length > 1 ? checkInMessage(turns) : text }],
  };
  const data = await callClaude(body, settings);
  const block = (data as any)?.content?.find((c: any) => c.type === 'tool_use');
  if (!block) {
    const said = (data as any)?.content?.find((c: any) => c.type === 'text')?.text;
    return { ...normalise({ items: [], notes: [], reply: said ? String(said).slice(0, 200) : "I couldn't sort that one. Try saying it a different way." }, settings, spaces), doneIds: [], startedIds: [] };
  }
  const base = normalise(block.input, settings, spaces);
  const loopBits = cleanCheckIn({ done_refs: block.input?.done_refs, started_refs: block.input?.started_refs, question: block.input?.question, jobs: [] }, { jobs, roomSlugs: [], today: dayKey(now), tomorrow: dayKey(now) });
  // Don't re-add a job that's already open.
  const open = new Set(jobs.map((j) => `${j.room ?? ''}|${j.title.toLowerCase()}`));
  const items = base.items.filter((it) => !open.has(`${it.room ?? ''}|${it.title.toLowerCase()}`));
  return { ...base, items, doneIds: loopBits.doneIds, startedIds: loopBits.startedIds, question: loopBits.question };
}

export { normalise };

/** "Something's come up": Claude suggests what to add and move; the rules in comeUp.ts check it. */
export async function reworkDay(text: string, state: State, now = new Date()): Promise<ComeUpPlan> {
  const { settings } = state;
  const items = comeUpItems(state, now);
  const rooms = settings.rooms.map((r) => ({ name: r.name, slug: slug(r.name) }));
  const data = await callClaude(
    {
      model: settings.model,
      max_tokens: 1500,
      system: comeUpPrompt({ items, rooms, now, firstName: settings.firstName, savNap: settings.savNap }),
      tools: [COME_UP_TOOL],
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: text }],
    },
    settings,
    'something came up',
  );
  const block = data?.content?.find((c: any) => c.type === 'tool_use');
  if (!block) throw new ClaudeError("Claude didn't sort that one. Try saying it a different way.");
  return cleanComeUp(block.input, { items, tasks: state.tasks, roomSlugs: rooms.map((r) => r.slug), now });
}

export type { CheckIn, Leftover };

/** The Stop check in: what she said about the job, turned into ticks and to-dos across the day. */
export async function checkIn(opts: {
  turns: { q?: string; said: string }[];
  stopped: Task;
  stoppedRoom?: string;
  jobs: JobRef[];
  settings: Settings;
  today: string;
  tomorrow: string;
}): Promise<CheckIn> {
  const { settings } = opts;
  const rooms = settings.rooms.map((r) => ({ name: r.name, slug: slug(r.name) }));
  const data = await callClaude(
    {
      model: settings.model,
      max_tokens: 1500,
      system: checkInPrompt({ ...opts, rooms, canAsk: opts.turns.length < 3 }),
      tools: [CHECK_TOOL],
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: checkInMessage(opts.turns) }],
    },
    settings,
    'stop check in',
  );
  const block = data?.content?.find((c: any) => c.type === 'tool_use');
  if (!block) throw new ClaudeError("Claude didn't sort that one.");
  return cleanCheckIn(block.input, { jobs: opts.jobs, roomSlugs: rooms.map((r) => r.slug), stoppedRoom: opts.stopped.room, today: opts.today, tomorrow: opts.tomorrow });
}
