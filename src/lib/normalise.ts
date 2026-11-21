import { slug } from './time';
import { FOOD_GROUPS, type Settings, type Space } from './types';

export type ParsedItem = {
  title: string;
  kind: 'task' | 'event' | 'buy' | 'note';
  spaceId?: string;
  room?: string; // room slug
  grab?: { item: string; fromRoom: string };
  at?: string;
  /** Tasks for a particular day. */
  day?: string;
  /** A real deadline. */
  dueAt?: string;
  repeatDays?: number[];
  place?: string;
  estimateMin?: number;
  list?: 'food' | 'other';
  group?: string;
};

export type ParseResult = { items: ParsedItem[]; notes: string[]; reply: string };

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Clean up whatever came back so the app never trusts it blindly. */
export function normalise(input: any, settings: Settings, spaces: Space[]): ParseResult {
  const roomSlugs = new Set(settings.rooms.map((r) => slug(r.name)));
  const fixRoom = (r: unknown) => {
    if (typeof r !== 'string') return undefined;
    const s = slug(r);
    return roomSlugs.has(s) ? s : undefined;
  };
  const spaceIds = new Set(spaces.map((s) => s.id));
  const privateSpace = spaces.find((s) => s.kind === 'private');
  const shoppingSpace = spaces.find((s) => s.kind === 'shopping');
  const homeSpace = spaces.find((s) => s.kind === 'home');

  const items: ParsedItem[] = [];
  for (const raw of Array.isArray(input?.items) ? input.items : []) {
    if (!raw || typeof raw.title !== 'string' || !raw.title.trim()) continue;
    const at = typeof raw.at === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw.at) ? raw.at.slice(0, 16) : undefined;
    let kind: ParsedItem['kind'] = raw.kind === 'buy' ? 'buy' : raw.kind === 'note' ? 'note' : at ? 'event' : 'task';
    if (kind === 'event' && !at) kind = 'task';
    const fromRoom = fixRoom(raw.grab?.from_room);
    let spaceId: string | undefined = typeof raw.space_id === 'string' && spaceIds.has(raw.space_id) ? raw.space_id : undefined;
    const room = kind === 'task' ? fixRoom(raw.room) : undefined;

    let list: ParsedItem['list'];
    let group: string | undefined;
    if (kind === 'buy') {
      list = raw.list === 'other' ? 'other' : 'food';
      if (list === 'food') {
        group = FOOD_GROUPS.find((g) => g.toLowerCase() === String(raw.group ?? '').toLowerCase()) ?? 'Household';
      } else {
        group = typeof raw.group === 'string' && raw.group.trim() ? titleCase(raw.group.trim()) : 'Other';
      }
      spaceId = shoppingSpace?.id ?? spaceId;
    }
    if (kind === 'note') spaceId = privateSpace?.id ?? spaceId;
    if (!spaceId && room) spaceId = homeSpace?.id;

    items.push({
      title: raw.title.trim(),
      kind,
      spaceId,
      room,
      grab: kind === 'task' && fromRoom && typeof raw.grab?.item === 'string' ? { item: raw.grab.item, fromRoom } : undefined,
      at: kind === 'event' ? at : undefined,
      day: kind === 'task' && typeof raw.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.day) ? raw.day : undefined,
      dueAt: kind === 'task' && typeof raw.due === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw.due) ? raw.due.slice(0, 16) : undefined,
      repeatDays:
        kind === 'event' && Array.isArray(raw.repeat_days)
          ? [...new Set<number>(raw.repeat_days.filter((d: any) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
          : undefined,
      place: kind === 'event' && typeof raw.place === 'string' && raw.place.trim() ? raw.place.trim() : undefined,
      estimateMin: kind === 'task' && Number.isFinite(raw.estimate_min) && raw.estimate_min > 0 ? Math.round(raw.estimate_min) : undefined,
      list,
      group,
    });
  }
  const notes = (Array.isArray(input?.notes) ? input.notes : []).filter((n: any) => typeof n === 'string' && n.trim());
  const reply = typeof input?.reply === 'string' ? input.reply : '';
  return { items, notes, reply };
}
