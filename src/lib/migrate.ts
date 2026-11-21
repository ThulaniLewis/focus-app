// Brings saved data from older builds up to date. Pure, so it can be tested.
import { DEFAULT_ROOMS, DEFAULT_SETTINGS, DEFAULT_SPACES, OLD_DEFAULT_ROOMS, type Room, type State } from './types';

function migrateRooms(raw: unknown): Room[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_ROOMS;
  if (raw.every((r) => typeof r === 'string')) {
    if (JSON.stringify(raw) === JSON.stringify(OLD_DEFAULT_ROOMS)) return DEFAULT_ROOMS;
    return (raw as string[]).map((name) => ({
      name,
      floor: DEFAULT_ROOMS.find((d) => d.name.toLowerCase() === name.toLowerCase())?.floor ?? '',
    }));
  }
  return (raw as any[])
    .filter((r) => r && typeof r.name === 'string')
    .map((r) => ({ name: r.name, floor: r.floor === 'up' || r.floor === 'down' ? r.floor : '' }));
}

export function migrate(saved: any): State {
  const s = saved && typeof saved === 'object' ? saved : {};
  const settings = { ...DEFAULT_SETTINGS, ...(s.settings ?? {}) };
  settings.rooms = migrateRooms(s.settings?.rooms);
  if (!Array.isArray(settings.awayWords)) settings.awayWords = DEFAULT_SETTINGS.awayWords;
  if (!settings.dayPlans || typeof settings.dayPlans !== 'object') settings.dayPlans = {};
  return {
    tasks: Array.isArray(s.tasks) ? s.tasks : [],
    notes: Array.isArray(s.notes) ? s.notes : [],
    spaces: Array.isArray(s.spaces) && s.spaces.length ? s.spaces : DEFAULT_SPACES,
    checkins: Array.isArray(s.checkins) ? s.checkins : [],
    settings,
    // Phone-only extras (never synced): keep them through a reload.
    ...(s.sleep && Array.isArray(s.sleep.nights) ? { sleep: s.sleep } : {}),
    ...(s.sleepReading === 'yes' || s.sleepReading === 'no' ? { sleepReading: s.sleepReading } : {}),
  };
}
