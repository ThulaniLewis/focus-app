// Brief 4 Part 1: what a dump can turn into. Claude works out what the whole dump is for first, then
// picks one or more of these shapes. The shapes are data: add one here (and its field) and the prompt
// and the tool pick it up. Grab lists and away are phone only (they live in the places store).
// Nothing here knows any of her places or people: those come from her own data.
import type { GeoPlace } from './geo';

export type ShapeId = 'grab-list' | 'diary' | 'place-reminder' | 'away' | 'tasks' | 'shopping' | 'note';

export type Shape = {
  id: ShapeId;
  name: string;
  /** When to use it, in the words Claude is given. */
  when: string;
  /** What she gets, and the rules for it. */
  gets: string;
  /** Where it goes in the tool answer. */
  field: string;
  /** Needs the phone (places, location). */
  phoneOnly?: boolean;
};

export const SHAPES: Shape[] = [
  {
    id: 'grab-list',
    name: 'Grab list',
    when: 'she wants help remembering what to get, bring, collect or pack for one trip or one place ("help me remember what I need from home", "I need to pick up…").',
    gets: 'One checklist with one short title from what she said ("Grab from home"), tied to the place it is for (place_id). Pick the place from what she said and from where she is now: the place she is going to fetch things from. Never a place the dump rules out (a nursery or school when her child is not going, or on a weekend). Every thing to fetch is one item on the list, not a task. No spaces, no rooms, no time estimates. If she says "if I can find it" or "maybe", set if_found on that item.',
    field: 'grab_lists',
    phoneOnly: true,
  },
  {
    id: 'diary',
    name: 'Diary event',
    when: 'something happens at a fixed time or on a fixed day: an appointment, a repair, someone having her child for the day.',
    gets: 'An item with kind "event", worded as the event ("Tyre repair", not "Get tyre fixed"). Never a task and never a tick box. With a time, set "at". If it lasts the day or has no time (her child is with someone for the day), set all_day true and "day", and no "at". It is a one-off: it never changes her regular week.',
    field: 'items',
  },
  {
    id: 'place-reminder',
    name: 'Place reminder',
    when: 'something to do or say when she gets to (or leaves) one of her places ("when I\'m at Mum\'s remind me to take her dish back").',
    gets: 'A place reminder (see below). Not a grab list: one thing to do there, not a set of things to fetch.',
    field: 'place_reminders',
    phoneOnly: true,
  },
  {
    id: 'away',
    name: 'Away from home',
    when: 'she says she is staying somewhere else tonight, or her normal day at home is not happening ("I\'m staying at my parents\'", "I\'m away tonight").',
    gets: 'Set "away" once: where she is staying (place_id if it is one of her places, otherwise a short name), until_day if she says when she is back, and a few words on why. Focus pauses the home routine while she is away.',
    field: 'away',
    phoneOnly: true,
  },
  {
    id: 'tasks',
    name: 'Tasks',
    when: 'ordinary things to do.',
    gets: 'Items with kind "task", sorted into her spaces, as the rules below.',
    field: 'items',
  },
  {
    id: 'shopping',
    name: 'Shopping',
    when: 'things to buy.',
    gets: 'Items with kind "buy", as the rules below.',
    field: 'items',
  },
  {
    id: 'note',
    name: 'Note',
    when: 'thoughts, feelings, context worth keeping that are not things to do.',
    gets: 'Items with kind "note". These are private.',
    field: 'items',
  },
];

export const shapesFor = (phone: boolean) => SHAPES.filter((s) => phone || !s.phoneOnly);

/** The "work out what it's for first" part of the dump prompt. */
export function shapesPrompt(phone: boolean): string {
  return [
    'First, read the whole message as one thing, together with what is going on for her right now (above). Work out what she is asking for, and what she needs Focus to make. Do not go sentence by sentence. Put that in "understood" as one plain line.',
    'Then make it, choosing from these shapes. One message can make several, and most make only one or two. Only make what she asked for.',
    ...shapesFor(phone).map((s) => `- ${s.name}: when ${s.when} ${s.gets}`),
    'Things that belong to a grab list are never also items. Facts in passing ("my dad is taking me home") are context, not tasks.',
  ].join('\n');
}

export const UNDERSTOOD_FIELD = { type: 'string', description: 'One plain line: what she is asking for, worked out from the whole message and her situation.' };

export const GRAB_LISTS_FIELD = {
  type: 'array',
  description: 'Checklists of things to get, bring, collect or pack for one trip or place.',
  items: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Short, from what she said: "Grab from home"' },
      place_id: { type: 'string', description: 'The place it is for, from her places, if it is one of them' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'The thing, in her words: "Amazon parcel (outside, behind the bin)"' },
            if_found: { type: 'boolean', description: 'True if she said "if I can find it" or similar' },
          },
          required: ['text'],
        },
      },
    },
    required: ['title', 'items'],
  },
};

export const AWAY_FIELD = {
  type: 'object',
  description: 'Only if she says she is staying away from home tonight, or her normal day at home is not happening.',
  properties: {
    place_id: { type: 'string', description: 'Where she is staying, if it is one of her places' },
    place_name: { type: 'string', description: 'Otherwise a short name for where' },
    until_day: { type: 'string', description: 'YYYY-MM-DD she expects to be home, if she says' },
    reason: { type: 'string', description: 'A few words: "tyre puncture"' },
  },
};

export type SuggestedGrabList = { title: string; placeId?: string; items: { text: string; ifFound?: boolean }[] };
export type SuggestedAway = { placeId?: string; placeName: string; untilDay?: string; reason?: string };

const tidy = (s: string, max: number) => s.trim().replace(/\s+/g, ' ').slice(0, max);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Whatever came back, checked: titled, only her places, no empty or repeated items. */
export function cleanGrabLists(raw: unknown, places: GeoPlace[]): SuggestedGrabList[] {
  const ids = new Set(places.map((p) => p.id));
  const out: SuggestedGrabList[] = [];
  for (const g of Array.isArray(raw) ? raw : []) {
    if (!g || typeof g.title !== 'string' || !g.title.trim()) continue;
    const items: SuggestedGrabList['items'] = [];
    for (const it of Array.isArray(g.items) ? g.items : []) {
      const text = typeof it === 'string' ? it : it?.text;
      if (typeof text !== 'string' || !text.trim()) continue;
      const t = cap(tidy(text, 120));
      if (items.some((x) => x.text.toLowerCase() === t.toLowerCase())) continue;
      items.push({ text: t, ...(it?.if_found === true ? { ifFound: true } : {}) });
    }
    if (!items.length) continue;
    const title = cap(tidy(g.title, 60));
    // No place given but the title says home ("Grab from home"): her home place.
    const home = /\bhome\b/i.test(title) ? places.find((p) => p.type === 'home') : undefined;
    const placeId = typeof g.place_id === 'string' && ids.has(g.place_id) ? g.place_id : home?.id;
    out.push({ title, ...(placeId ? { placeId } : {}), items: items.slice(0, 40) });
  }
  return out.slice(0, 3);
}

/** Away from home, checked. Null unless it names somewhere. */
export function cleanAway(raw: unknown, places: GeoPlace[], today: string): SuggestedAway | null {
  const a: any = raw && typeof raw === 'object' ? raw : null;
  if (!a) return null;
  const place = typeof a.place_id === 'string' ? places.find((p) => p.id === a.place_id && p.type !== 'home') : undefined;
  const name = place?.name ?? (typeof a.place_name === 'string' && a.place_name.trim() ? tidy(a.place_name, 60) : '');
  if (!name) return null;
  const untilDay = typeof a.until_day === 'string' && DAY.test(a.until_day) && a.until_day >= today ? a.until_day : undefined;
  const reason = typeof a.reason === 'string' && a.reason.trim() ? tidy(a.reason, 80) : undefined;
  return { ...(place ? { placeId: place.id } : {}), placeName: name, ...(untilDay ? { untilDay } : {}), ...(reason ? { reason } : {}) };
}
