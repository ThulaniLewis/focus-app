// Brief 4 / big build section 0: the whole picture Claude is given with a dump, built in one place
// so later steps (wind down, check-ins) can share it. Pure, tested. Only names and times go in: no
// coordinates. Where she is and her places are phone only, and only leave the phone through the
// focus-claude function.
import type { DiaryEvent } from './calendar';
import type { GeoPlace, Presence } from './geo';
import type { GrabList } from './grabLists';
import { typeInfo } from './placeTypes';
import { agendaFor, dayKey, fmtTime } from './time';
import type { State, Task } from './types';
import { DAY_NAMES, diaryOn, MONTH_SHORT, savSaturday } from './views';

export type DumpContextInput = {
  state: Pick<State, 'tasks' | 'settings'>;
  now: Date;
  /** Phone only. Leave out on the tablet. */
  places?: GeoPlace[];
  presence?: Presence;
  grabLists?: GrabList[];
  away?: { placeName: string } | null;
  /** The phone's own diary, if she lets Focus read it. */
  events?: DiaryEvent[];
};

const dayLabel = (day: string) => {
  const d = new Date(`${day}T00:00:00`);
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
};

/** Focus's own all-day events (her child with someone for the day), as diary entries. */
export function allDayEvents(tasks: Task[]): DiaryEvent[] {
  return tasks
    .filter((t) => t.kind === 'event' && t.allDay && t.day && !t.done)
    .map((t) => {
      const start = new Date(`${t.day}T00:00:00`);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      return { id: `focus-${t.id}`, title: t.title, start, end, allDay: true, calendar: 'Focus' };
    });
}

function diaryLines(input: DumpContextInput, day: string): string[] {
  const state = input.state as State;
  const timed = agendaFor(state, day).map((a) => `${fmtTime(a.at)} ${a.task.title}${a.task.place ? ` (${a.task.place})` : ''}${a.done ? ', done' : ''}`);
  const events = [...(input.events ?? []), ...allDayEvents(state.tasks)];
  const diary = diaryOn(events, day).map((e) => `${e.allDay ? 'All day' : fmtTime(e.start)} ${e.title}`);
  return [...diary.filter((l) => l.startsWith('All day')), ...[...timed, ...diary.filter((l) => !l.startsWith('All day'))].sort()];
}

/** The lines that go in the prompt. */
export function dumpContext(input: DumpContextInput): string {
  const { state, now } = input;
  const today = dayKey(now);
  const tmr = new Date(now);
  tmr.setDate(tmr.getDate() + 1);
  const tomorrow = dayKey(tmr);
  const places = input.places ?? [];
  const lines: string[] = [];

  if (places.length) {
    const p = input.presence;
    const here = p?.placeId ? places.find((x) => x.id === p.placeId) : undefined;
    const since = p?.since ? ` since ${fmtTime(new Date(p.since))}` : '';
    lines.push(
      here
        ? `Where she is now: at ${here.name} (${typeInfo(here.type).label})${since}.`
        : p?.since
          ? `Where she is now: not at any of her saved places${since}.`
          : 'Where she is now: not known yet.',
    );
    lines.push(`Her saved places, as id: name (type): ${places.map((x) => `${x.id}: ${x.name} (${typeInfo(x.type).label})`).join(', ')}.`);
  }
  if (input.away) lines.push(`She is away from home at the moment, at ${input.away.placeName}. Her home routine is paused.`);
  lines.push(`Her day ends at ${state.settings.dayEnd}.`);

  for (const [label, day] of [['Today', today], ['Tomorrow', tomorrow]] as const) {
    const l = diaryLines(input, day);
    lines.push(`${label} (${dayLabel(day)}) in her diary: ${l.length ? l.join('; ') : 'nothing fixed'}.`);
  }

  // Fixed rhythms: whose day it is with her child, from her own pattern and diary.
  const events = [...(input.events ?? []), ...allDayEvents(state.tasks as Task[])];
  for (const day of [today, tomorrow]) {
    const sat = savSaturday(events, day, state.settings);
    if (sat) lines.push(`${dayLabel(day)}: her child is ${sat.away ? 'with their other parent' : 'with her'} (from her ${sat.from === 'diary' ? 'diary' : 'every-other-week pattern'}).`);
  }
  const weekday = (day: string) => {
    const n = new Date(`${day}T00:00:00`).getDay();
    return n >= 1 && n <= 5;
  };
  if (!weekday(tomorrow)) lines.push(`Tomorrow is a weekend day: no nursery or school runs unless her diary says so.`);

  const open = (input.grabLists ?? []).filter((g) => !g.closedAt);
  if (open.length) lines.push(`Lists she already has open: ${open.map((g) => `${g.title} (${g.items.filter((i) => !i.done).length} left)`).join('; ')}.`);
  return lines.join('\n');
}
