// Reads and writes the calendars already on the phone (Google, Outlook, Samsung),
// so Focus needs no extra sign-in for the diary.
import * as Calendar from 'expo-calendar/legacy';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { addMin, parseLocal } from './time';

export type DiaryEvent = { id: string; title: string; start: Date; end: Date; allDay: boolean; calendar: string };

export async function calendarAllowed(ask = false): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const current = await Calendar.getCalendarPermissionsAsync();
    if (current.granted) return true;
    if (!ask) return false;
    return (await Calendar.requestCalendarPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

async function writableCalendar() {
  const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writable = cals.filter((c) => c.allowsModifications && c.isVisible !== false);
  const outlook = (c: Calendar.Calendar) => /hotmail|outlook|live\.|msn/i.test(`${c.source?.name ?? ''} ${c.ownerAccount ?? ''}`);
  return (
    writable.find((c) => outlook(c) && /calendar/i.test(c.title)) ??
    writable.find(outlook) ??
    writable.find((c) => c.isPrimary) ??
    writable.find((c) => (c.source?.type ?? '').toLowerCase().includes('google')) ??
    writable.find((c) => (c.source?.name ?? '').includes('@')) ??
    writable[0]
  );
}

export async function writeCalendarName(): Promise<string | null> {
  if (!(await calendarAllowed())) return null;
  try {
    const c = await writableCalendar();
    return c ? `${c.title}${c.source?.name && c.source.name !== c.title ? ` (${c.source.name})` : ''}` : null;
  } catch {
    return null;
  }
}

/** Copies a Focus event into the phone's calendar. Returns its id, or null. */
export async function addToCalendar(title: string, at: string, place?: string, durationMin = 60): Promise<string | null> {
  if (!(await calendarAllowed(true))) return null;
  try {
    const cal = await writableCalendar();
    const start = parseLocal(at);
    if (!cal || !start) return null;
    return await Calendar.createEventAsync(cal.id, {
      title,
      startDate: start,
      endDate: addMin(start, durationMin),
      location: place,
      notes: 'Added by Focus',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  } catch {
    return null;
  }
}

export async function loadDiary(from: Date, to: Date): Promise<DiaryEvent[]> {
  if (!(await calendarAllowed())) return [];
  try {
    const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const visible = cals.filter((c) => c.isVisible !== false);
    if (!visible.length) return [];
    const events = await Calendar.getEventsAsync(visible.map((c) => c.id), from, to);
    const names = new Map(visible.map((c) => [c.id, c.title]));
    return events
      .filter((e) => !(e.notes ?? '').includes('Added by Focus'))
      .map((e) => ({
        id: `${e.id}-${String(e.startDate)}`,
        title: e.title || 'Busy',
        start: new Date(e.startDate),
        end: new Date(e.endDate),
        allDay: !!e.allDay,
        calendar: names.get(e.calendarId) ?? '',
      }))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  } catch {
    return [];
  }
}

/** Diary events for the next `days` days, refreshed when the screen asks. */
export function useDiary(enabled: boolean, days = 8, refreshKey = 0) {
  const [events, setEvents] = useState<DiaryEvent[]>([]);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      if (!enabled) return setEvents([]);
      const ok = await calendarAllowed();
      if (!live) return;
      setAllowed(ok);
      if (!ok) return;
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      const to = new Date(from);
      to.setDate(to.getDate() + days);
      const ev = await loadDiary(from, to);
      if (live) setEvents(ev);
    })();
    return () => {
      live = false;
    };
  }, [enabled, days, refreshKey]);
  return { events, allowed };
}

export type DiaryCheck = { allowed: boolean; calendars: { title: string; account: string }[]; outlook: boolean };

/** What Focus can see, in plain terms, for the diary check card. */
export async function checkDiary(): Promise<DiaryCheck> {
  const allowed = await calendarAllowed();
  if (!allowed) return { allowed, calendars: [], outlook: false };
  try {
    const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const calendars = cals
      .filter((c) => c.isVisible !== false)
      .map((c) => ({ title: c.title, account: c.source?.name ?? c.ownerAccount ?? '' }));
    const outlook = calendars.some((c) => /hotmail|outlook|live\.|msn/i.test(`${c.account} ${c.title}`));
    return { allowed, calendars, outlook };
  } catch {
    return { allowed, calendars: [], outlook: false };
  }
}
