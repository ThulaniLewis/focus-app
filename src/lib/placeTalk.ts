// Place reminders made by talking: what Claude is told, what it may send back, and how Focus checks it
// with her before keeping it ("When you arrive at X, remind you to …" Yes, change it or no).
// Plain logic, tested. Places are named from her own data; nothing here knows any of them.
import { type GeoPlace } from './geo';
import { does } from './placeTypes';

/** A place reminder Focus suggests. Nothing is kept until she says yes. */
export type SuggestedReminder = { placeId: string; text: string; when: 'arrive' | 'leave'; byDay?: string; every?: boolean };

/** The extra field in the dump tool. */
export const PLACE_REMINDERS_FIELD = {
  type: 'array',
  description: 'Things she needs to do or say when she gets to (or leaves) one of her places. Only for places in her list.',
  items: {
    type: 'object',
    properties: {
      place_id: { type: 'string' },
      text: { type: 'string', description: 'Short, starting with a verb, in her words: "Tell staff Ada will be in late on Friday"' },
      when: { type: 'string', enum: ['arrive', 'leave'] },
      by_day: { type: 'string', description: 'The day it is about, YYYY-MM-DD, if there is one' },
      every: { type: 'boolean', description: 'True only if she says every time' },
    },
    required: ['place_id', 'text', 'when'],
  },
};

/** The places that can hold reminders, for the prompt. */
export const reminderPlaces = (places: GeoPlace[]) => places.filter((p) => does(p, 'reminders'));

/** What Claude is told about her places. Empty when she has none (the tablet, or none set up). */
export function placesPrompt(places: GeoPlace[]): string {
  const ok = reminderPlaces(places);
  if (!ok.length) return '';
  return [
    `Her places, as id: name: ${ok.map((p) => `${p.id}: ${p.name}`).join(', ')}.`,
    'If something she says needs doing or saying when she gets to one of these places ("I need to tell nursery…", "take Mum\'s dish back"), put it in place_reminders, not items: the place_id, short text starting with a verb, when "arrive" (or "leave" if she says so), and by_day if it is about a particular day. One reminder per thing. Never guess a place she did not mean.',
  ].join('\n');
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Whatever came back, checked: only her places, only sensible days, no repeats. */
export function cleanPlaceReminders(raw: unknown, places: GeoPlace[], today: string): SuggestedReminder[] {
  const ok = new Set(reminderPlaces(places).map((p) => p.id));
  const out: SuggestedReminder[] = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    if (!r || typeof r.text !== 'string' || !r.text.trim() || !ok.has(r.place_id)) continue;
    const text = r.text.trim().replace(/\s+/g, ' ').slice(0, 200);
    const byDay = typeof r.by_day === 'string' && DAY.test(r.by_day) && r.by_day >= today ? r.by_day : undefined;
    if (out.some((x) => x.placeId === r.place_id && x.text.toLowerCase() === text.toLowerCase())) continue;
    out.push({ placeId: r.place_id, text: text.charAt(0).toUpperCase() + text.slice(1), when: r.when === 'leave' ? 'leave' : 'arrive', ...(byDay ? { byDay } : {}), ...(r.every === true ? { every: true } : {}) });
  }
  return out.slice(0, 5);
}

/** "When you arrive at the nursery, remind you to tell staff Ada will be in late on Friday." */
export function confirmLine(r: Pick<SuggestedReminder, 'text' | 'when' | 'every'>, placeName: string): string {
  const what = r.text.charAt(0).toLowerCase() + r.text.slice(1).replace(/\.$/, '');
  return `${r.every ? 'Every time you' : 'When you'} ${r.when === 'leave' ? 'leave' : 'arrive at'} ${placeName}, remind you to ${what}.`;
}
