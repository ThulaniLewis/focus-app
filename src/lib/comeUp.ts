// "Something's come up": a gas engineer at 11, Sav off sick, running late. Claude suggests what to add
// and move; the rules here make sure nothing is dropped and fixed times stay put. Also the sick-day
// plan and waiting mode. No phone code here, so it's tested.
import { isPrivateSpace } from './sync';
import { agendaFor, dayKey, flexOn, fmtTime, isDoneOn, notYet, occurrenceOn, parseLocal, savAwayByPattern, slug, tasksFor } from './time';
import type { Settings, State, Task } from './types';

// ---------- What kind of thing is this? ----------

export const isNurseryRun = (t: Task) => /nursery/i.test(t.place ?? '') || (t.seed ?? '').startsWith('nursery-');

/** Needs her to leave the house (and so can't happen with Sav home sick). */
export const needsGoingOut = (t: Task) =>
  t.kind !== 'buy' &&
  !isNurseryRun(t) &&
  // A job in a room is in the house ("empty the shopping bags" isn't a trip out).
  (!!t.place ||
    (!t.room && /\b(gym|go(ing)? (to the )?shop(ping)?|food shop|supermarket|post office|the tip|the dump|chemist|pharmacy|library|haircut)\b/i.test(t.title)));

/** A house job: tidying, cleaning, laundry. Not Sav's own routine (dinner, bedtime), not appointments. */
export const isHouseJob = (t: Task) => t.kind !== 'event' && t.spaceId !== 'sav' && (!!t.room || t.spaceId === 'home');

/** Things Focus never moves: Sav's routine, nursery runs, appointments somewhere, visitors. */
export const isAnchor = (t: Task) =>
  isNurseryRun(t) || t.visitor === true || (t.spaceId === 'sav' && !!t.at && !t.flex) || (t.kind === 'event' && !!t.place);

/** A bigger job: about 30 minutes or more, or a nice-to-have. */
export const isBig = (t: Task) => (t.estimateMin ?? 0) >= 30 || t.priority === 3;

const hasRealTime = (t: Task) => !!t.at && !t.flex;
const timeOf = (t: Task) => (t.at ? t.at.slice(11, 16) : undefined);

// ---------- Sav home sick ----------

export const savHomeOn = (settings: Pick<Settings, 'dayPlans'>, day: string) => !!settings.dayPlans?.[day]?.savHome;

/** On a day Sav's home: house jobs only during her nap or after 19:30. */
export const BEDTIME = '19:30';
export function inHouseWindow(settings: Pick<Settings, 'savNap'>, hm: string) {
  const nap = settings.savNap ?? { start: '13:00', end: '14:30' };
  return (hm >= nap.start && hm < nap.end) || hm >= BEDTIME;
}

/** The next time a house job can go, at or after hm. */
export function nextHouseSlot(settings: Pick<Settings, 'savNap'>, hm: string) {
  const nap = settings.savNap ?? { start: '13:00', end: '14:30' };
  if (inHouseWindow(settings, hm)) return hm;
  return hm < nap.start ? nap.start : BEDTIME;
}

/** Should this house job wait right now because Sav's home? (Used by the lists and the nudges.) */
export function houseBlocked(state: State, t: Task, day: string, at: Date) {
  return savHomeOn(state.settings, day) && isHouseJob(t) && !inHouseWindow(state.settings, fmtTime(at));
}

/**
 * The best day in the next week for a bigger job (or a trip out): her dad's Saturdays first, then
 * nursery days, then the day with the fewest fixed things.
 */
export function nextFreeDay(state: State, from: Date): string {
  const options: { day: string; tier: number; fixed: number; i: number }[] = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(from);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + i);
    const day = dayKey(d);
    const weekday = d.getDay() >= 1 && d.getDay() <= 5;
    const tier = savAwayByPattern(state.settings, day) ? 0 : weekday && !savHomeOn(state.settings, day) ? 1 : 2;
    const fixed = agendaFor(state, day).filter((a) => !a.done && !a.task.flex).length;
    options.push({ day, tier, fixed, i });
  }
  options.sort((a, b) => a.tier - b.tier || a.fixed - b.fixed || a.i - b.i);
  return options[0].day;
}

// ---------- Moves ----------

export type Move = {
  taskId: string;
  title: string;
  /** "14:00" or "Today". */
  fromLabel: string;
  /** Where it goes: a new time today, another day (keeping its time), or nowhere (not needed today). */
  to?: { day: string; time?: string };
  toLabel: string;
  why: string;
  /** Offered but left unticked (a must-do): she ticks it if she wants it moved. */
  optional?: boolean;
};

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function whenLabel(day: string, time: string | undefined, today: string) {
  const d = parseLocal(day);
  const name = day === today ? 'Today' : d ? `${DAY_SHORT[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}` : day;
  return time ? `${name} ${time}` : name;
}

function moveTo(t: Task, day: string, time: string | undefined, today: string, why: string): Move {
  const keepTime = time ?? (hasRealTime(t) ? timeOf(t) : undefined);
  return { taskId: t.id, title: t.title, fromLabel: hasRealTime(t) ? timeOf(t)! : 'Today', to: { day, time: keepTime }, toLabel: whenLabel(day, keepTime, today), why };
}

/** The next day (after today) a repeating thing happens. */
function nextOccurrence(t: Task, now: Date): string | null {
  for (let i = 1; i <= 14; i++) {
    const d = new Date(now);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + i);
    const key = dayKey(d);
    if (occurrenceOn(t, key) || (t.flex && flexOn(t, key))) return key;
  }
  return null;
}

/** Today's open things, timed and not, that aren't private. */
function todaysOpen(state: State, day: string): Task[] {
  const seen = new Set<string>();
  const out: Task[] = [];
  for (const a of agendaFor(state, day)) if (!a.done && !seen.has(a.task.id)) (seen.add(a.task.id), out.push(a.task));
  for (const t of tasksFor(state, day)) if (!isDoneOn(t, day) && !seen.has(t.id)) (seen.add(t.id), out.push(t));
  return out.filter((t) => !isPrivateSpace(t.spaceId, state.spaces) && t.kind !== 'buy' && t.kind !== 'note');
}

/**
 * Sav's off sick: nursery runs aren't needed, trips out and bigger jobs move to the next free day,
 * and house jobs with a time move into her nap or after 19:30. Nothing is dropped.
 */
export function sickDayMoves(state: State, now: Date): Move[] {
  const day = dayKey(now);
  const hm = fmtTime(now);
  const free = nextFreeDay(state, now);
  const moves: Move[] = [];
  for (const t of todaysOpen(state, day)) {
    if (isNurseryRun(t)) {
      moves.push({ taskId: t.id, title: t.title, fromLabel: timeOf(t) ?? 'Today', toLabel: 'Not needed today', why: "Sav's home. Back as usual next time" });
      continue;
    }
    if (t.visitor || (t.kind === 'event' && t.place) || (t.spaceId === 'sav' && hasRealTime(t))) continue; // appointments and Sav's routine stay
    const repeats = !!t.repeatDays?.length;
    // A real deadline before the free day: it stays (moving it would miss the deadline).
    const deadlineFirst = (!!t.dueAt && t.dueAt.slice(0, 10) < free) || (!!t.dueDay && t.dueDay < free);
    const out = needsGoingOut(t);
    // Bigger one-off jobs move; everyday jobs (kitchen reset) don't, they fit round Sav instead.
    const big = !repeats && isBig(t) && t.kind !== 'event';
    if ((out || big) && !deadlineFirst) {
      const why = out ? 'Needs you to go out' : 'A bigger job, for a day with more time';
      // Something that repeats anyway (the gym) just skips today: the next one is the move.
      if (repeats) {
        const next = nextOccurrence(t, now);
        moves.push({ taskId: t.id, title: t.title, fromLabel: timeOf(t) ?? 'Today', toLabel: 'Skipped today', why: next ? `${why}. Next one ${whenLabel(next, timeOf(t), day)}` : why });
      } else {
        // A must-do is offered, not ticked: she decides.
        const m = moveTo(t, free, undefined, day, t.priority === 1 ? `${why}. It's a must-do, so tick it only if it can wait` : why);
        moves.push(t.priority === 1 ? { ...m, optional: true } : m);
      }
      continue;
    }
    if (isHouseJob(t) && hasRealTime(t)) {
      const at = timeOf(t)!;
      if (at < hm) continue; // already gone by: it stays on the list
      const slot = nextHouseSlot(state.settings, at);
      if (slot !== at) moves.push(moveTo(t, day, slot, day, slot === BEDTIME ? "After Sav's in bed" : "While Sav naps"));
    }
  }
  return moves;
}

/** Put a move into effect. Repeating things skip today and get a one-off copy at the new time. */
export function applyMove(tasks: Task[], move: Move, today: string, newId: () => string): Task[] {
  const t = tasks.find((x) => x.id === move.taskId);
  if (!t) return tasks;
  const repeats = !!t.repeatDays?.length;
  if (repeats) {
    const skipped = { ...t, skipDays: [...new Set([...(t.skipDays ?? []), today])] };
    const out = tasks.map((x) => (x.id === t.id ? skipped : x));
    if (!move.to) return out;
    const { repeatDays: _r, seed: _s, doneDays: _d, partialDays: _p, skipDays: _k, history: _h, timer: _t, ...rest } = t;
    const time = move.to.time ?? timeOf(t);
    const copy: Task = {
      ...rest,
      id: newId(),
      createdAt: new Date().toISOString(),
      done: false,
      ...(t.at ? { at: `${move.to.day}T${time ?? '09:00'}` } : { day: move.to.day }),
    };
    return [...out, copy];
  }
  if (!move.to) return tasks;
  return tasks.map((x) => {
    if (x.id !== t.id) return x;
    if (x.at) return { ...x, at: `${move.to!.day}T${move.to!.time ?? timeOf(x) ?? '09:00'}`, day: undefined };
    return { ...x, day: move.to!.day, ...(move.to!.time ? { after: move.to!.time } : {}) };
  });
}

// ---------- What came up (Claude) ----------

export type ComeUpAdd = { title: string; room?: string; estimateMin?: number };
export type ComeUpEvent = { title: string; at: string; place?: string; visitor: boolean; rooms: string[] };
export type ComeUpPlan = { reply: string; savSick: boolean; add: ComeUpAdd[]; events: ComeUpEvent[]; moves: Move[] };

/** Today's remaining things, given to Claude by short refs, and marked fixed when Focus won't move them. */
export type ItemRef = { ref: string; id: string; title: string; time?: string; place?: string; room?: string; estimateMin?: number; fixed: boolean };

export function comeUpItems(state: State, now: Date): ItemRef[] {
  return todaysOpen(state, dayKey(now))
    .slice(0, 40)
    .map((t, i) => ({
      ref: `i${i + 1}`,
      id: t.id,
      title: t.title,
      time: hasRealTime(t) ? timeOf(t) : undefined,
      place: t.place,
      room: t.room,
      estimateMin: t.estimateMin,
      fixed: isAnchor(t),
    }));
}

export const COME_UP_TOOL = {
  name: 'rework_the_day',
  description: "Rework Thulani's day around what has just come up, for her to confirm.",
  input_schema: {
    type: 'object',
    properties: {
      reply: { type: 'string', description: 'One short, warm line in plain British English. No exclamation marks.' },
      sav_sick: { type: 'boolean', description: 'true only if she says Sav is off sick or home from nursery today.' },
      add: {
        type: 'array',
        description: 'Short jobs to put at the top of today because of what came up (for a visitor: clear the path to where they need to go, a quick tidy where they will walk). Two to four at most.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Starts with a verb, short, no full stop.' },
            room: { type: 'string', description: 'Room slug from her rooms, or "".' },
            estimate_min: { type: 'integer', minimum: 1 },
          },
          required: ['title'],
        },
      },
      events: {
        type: 'array',
        description: 'Anything with a real time she mentions (the gas engineer at 11:00).',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            at: { type: 'string', description: 'Local YYYY-MM-DDTHH:MM.' },
            place: { type: 'string', description: 'Only if it is away from home.' },
            visitor: { type: 'boolean', description: 'true if someone is coming to the house.' },
            rooms: { type: 'array', items: { type: 'string' }, description: 'Room slugs the visitor will need to get to.' },
          },
          required: ['title', 'at'],
        },
      },
      moves: {
        type: 'array',
        description: 'Things on her list that should move because of this. Never anything marked fixed.',
        items: {
          type: 'object',
          properties: {
            ref: { type: 'string' },
            to: { type: 'string', description: 'New time today as HH:MM, or another day as YYYY-MM-DD, or YYYY-MM-DDTHH:MM.' },
            why: { type: 'string', description: 'A few words.' },
          },
          required: ['ref', 'to'],
        },
      },
    },
    required: ['reply', 'add', 'events', 'moves'],
  },
};

export function comeUpPrompt(opts: { items: ItemRef[]; rooms: { name: string; slug: string }[]; now: Date; firstName: string; savNap: Settings['savNap'] }) {
  const { items, rooms, now } = opts;
  return [
    `You are Focus, ${opts.firstName}'s calm home PA. She's a solo parent; her daughter Sav is a toddler at nursery on weekdays. Something has just come up and she's telling you about it, out loud, in her own words.`,
    `It is ${dayKey(now)} ${fmtTime(now)} on her phone. Work everything out from this.`,
    items.length
      ? `What's left on today, as ref: title [time] [place] [room] [about N min] [FIXED]:\n${items
          .map((i) => `${i.ref}: ${i.title}${i.time ? ` [${i.time}]` : ''}${i.place ? ` [at ${i.place}]` : ''}${i.room ? ` [${i.room}]` : ''}${i.estimateMin ? ` [about ${i.estimateMin} min]` : ''}${i.fixed ? ' [FIXED]' : ''}`)
          .join('\n')}`
      : 'Nothing else is on today.',
    `Her rooms (slug: name): ${rooms.map((r) => `${r.slug}: ${r.name}`).join(', ')}.`,
    [
      'Rules:',
      '- Nothing is ever dropped. If something can no longer happen today, move it, never remove it.',
      '- Never move anything marked FIXED (nursery drop off and pick up, Sav\'s dinner and bedtime, appointments somewhere, visitors).',
      '- For a visitor: add an event at their time with visitor true and the rooms they need, and add two or three short jobs at the top (clear the path to where they need to go, a quick tidy where they will walk). Move anything that clashes with their visit.',
      '- Running late: move the next things that no longer fit, a little later today if there is room, otherwise to another day.',
      `- Sav off sick: set sav_sick true and leave the moves to Focus (it has its own rules: house jobs only in her nap ${opts.savNap.start} to ${opts.savNap.end} or after 19:30, nothing that needs going out).`,
      '- No made-up times: only give a time when there is a real one.',
      '- Between about 17:15 and 19:30 she is with Sav: no house jobs there.',
      '- Keep it small: two to four added jobs at most. Plain British English, warm, never preachy.',
    ].join('\n'),
    `Always answer by calling the ${COME_UP_TOOL.name} tool exactly once.`,
  ].join('\n\n');
}

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAYTIME = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Check what Claude sent back. Only real refs move, never a fixed thing, never into the past; rooms
 * must be hers; times must be real. Anything that doesn't pass is left where it is.
 */
export function cleanComeUp(input: any, ctx: { items: ItemRef[]; tasks: Task[]; roomSlugs: string[]; now: Date }): ComeUpPlan {
  const today = dayKey(ctx.now);
  const hm = fmtTime(ctx.now);
  const rooms = new Set(ctx.roomSlugs);
  const room = (r: unknown) => {
    const s = slug(String(r ?? ''));
    return rooms.has(s) ? s : undefined;
  };
  const byRef = new Map(ctx.items.map((i) => [i.ref, i]));
  const add: ComeUpAdd[] = (Array.isArray(input?.add) ? input.add : [])
    .map((a: any) => ({ title: String(a?.title ?? '').trim().replace(/\.$/, ''), room: room(a?.room), estimateMin: Number.isFinite(a?.estimate_min) && a.estimate_min > 0 ? Math.round(a.estimate_min) : undefined }))
    .filter((a: ComeUpAdd) => a.title.length > 1)
    .slice(0, 4);
  const events: ComeUpEvent[] = (Array.isArray(input?.events) ? input.events : [])
    .map((e: any) => ({
      title: String(e?.title ?? '').trim(),
      at: String(e?.at ?? '').trim(),
      place: e?.place ? String(e.place).trim() : undefined,
      visitor: e?.visitor === true,
      rooms: (Array.isArray(e?.rooms) ? e.rooms : []).map(room).filter(Boolean) as string[],
    }))
    .filter((e: ComeUpEvent) => e.title && DAYTIME.test(e.at) && e.at.slice(0, 10) >= today)
    .slice(0, 3);
  const moves: Move[] = [];
  const seen = new Set<string>();
  for (const m of Array.isArray(input?.moves) ? input.moves : []) {
    const item = byRef.get(String(m?.ref ?? '').trim());
    if (!item || item.fixed || seen.has(item.id)) continue;
    const task = ctx.tasks.find((t) => t.id === item.id);
    if (!task || isAnchor(task)) continue;
    const to = String(m?.to ?? '').trim();
    let dest: { day: string; time?: string } | null = null;
    if (HM.test(to) && to > hm) dest = { day: today, time: to };
    else if (DAYTIME.test(to) && (to.slice(0, 10) > today || (to.slice(0, 10) === today && to.slice(11) > hm))) dest = { day: to.slice(0, 10), time: to.slice(11) };
    else if (DAY.test(to) && to > today) dest = { day: to };
    if (!dest) continue; // no good destination: it stays where it is
    seen.add(item.id);
    moves.push(moveTo(task, dest.day, dest.time, today, String(m?.why ?? '').trim() || 'To fit round what came up'));
  }
  return { reply: String(input?.reply ?? '').trim() || "Here's the day reworked.", savSick: input?.sav_sick === true, add, events, moves };
}

/** What she ticked on the review screen, put into effect. Only ever adds or moves: nothing is dropped. */
export function applyComeUp(state: State, plan: Pick<ComeUpPlan, 'add' | 'events' | 'moves' | 'savSick'>, now: Date, newId: () => string): State {
  const today = dayKey(now);
  const created = now.toISOString();
  let tasks = state.tasks;
  for (const m of plan.moves) tasks = applyMove(tasks, m, today, newId);
  const added: Task[] = [
    ...plan.add.map<Task>((a) => ({
      id: newId(),
      title: a.title,
      kind: 'task',
      room: a.room,
      spaceId: a.room ? 'home' : undefined,
      estimateMin: a.estimateMin,
      priority: 1,
      day: today,
      topDay: today,
      createdAt: created,
      done: false,
    })),
    ...plan.events.map<Task>((e) => ({
      id: newId(),
      title: e.title,
      kind: 'event',
      at: e.at,
      place: e.place,
      ...(e.visitor ? { visitor: true, visitorRooms: e.rooms } : {}),
      createdAt: created,
      done: false,
    })),
  ];
  const settings = plan.savSick
    ? { ...state.settings, dayPlans: { ...state.settings.dayPlans, [today]: { ...(state.settings.dayPlans?.[today] ?? {}), savHome: true } } }
    : state.settings;
  return { ...state, tasks: [...tasks, ...added], settings };
}

/** A message to nursery for her to send herself. Focus never sends it. */
export function nurseryMessage(firstName: string) {
  return `Hi, Sav won't be in today, she's not very well. I'll let you know about tomorrow. Thanks, ${firstName}`;
}

// ---------- Waiting mode ----------

export type Waiting = { key: string; title: string; until: Date; visitorRooms: string[] };

/** Visitors: from an hour before. Leave-by times and appointments somewhere: from 30 minutes before. */
const VISITOR_WAIT_MIN = 60;
const LEAVE_WAIT_MIN = 30;

/**
 * Is she waiting for something right now? Only before a visitor, an appointment with a place, or a
 * leave-by time. Never before cooking, Sav's dinner or bedtime (they have no place and aren't visitors).
 */
export function waitingFor(state: State, now: Date): Waiting | null {
  const day = dayKey(now);
  const off = new Set(state.settings.dayPlans?.[day]?.waitingOff ?? []);
  const found: Waiting[] = [];
  for (const a of agendaFor(state, day)) {
    if (a.done || isPrivateSpace(a.task.spaceId, state.spaces)) continue;
    const key = `${a.task.id}|${day}`;
    if (off.has(key)) continue;
    let until: Date | null = null;
    let from = 0;
    if (a.task.visitor) {
      until = a.at;
      from = VISITOR_WAIT_MIN;
    } else if (a.leaveAt) {
      until = a.leaveAt;
      from = LEAVE_WAIT_MIN;
    } else if (a.task.place) {
      until = a.at;
      from = LEAVE_WAIT_MIN;
    }
    if (!until) continue;
    const ms = until.getTime() - now.getTime();
    if (ms > 0 && ms <= from * 60000)
      found.push({ key, title: a.leaveAt && !a.task.visitor ? `Leave for ${a.task.title}` : a.task.title, until, visitorRooms: a.task.visitorRooms ?? [] });
  }
  found.sort((x, y) => x.until.getTime() - y.until.getTime());
  return found[0] ?? null;
}

/** Three small jobs to do while you wait: the smallest, never in the rooms a visitor needs. */
export function waitPicks(state: State, now: Date, w: Waiting, n = 3): Task[] {
  const day = dayKey(now);
  const avoid = new Set(w.visitorRooms);
  const minsLeft = (w.until.getTime() - now.getTime()) / 60000;
  return tasksFor(state, day)
    .filter(
      (t) =>
        !isDoneOn(t, day) &&
        t.kind === 'task' &&
        !hasRealTime(t) &&
        !isPrivateSpace(t.spaceId, state.spaces) &&
        !(t.room && avoid.has(t.room)) &&
        !notYet(t, now) &&
        !houseBlocked(state, t, day, now) &&
        (t.estimateMin ?? 10) <= Math.max(10, Math.min(15, minsLeft)),
    )
    .sort((a, b) => (a.estimateMin ?? 10) - (b.estimateMin ?? 10))
    .slice(0, n);
}
