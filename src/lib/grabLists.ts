// Grab lists (brief 4): one checklist for one trip or place ("Grab from home"), and away from home.
// Phone only: they live in the places store with the rest of her location data. Pure helpers, tested.
import type { SuggestedAway, SuggestedGrabList } from './dumpShapes';

export type GrabItem = { id: string; text: string; ifFound?: boolean; done?: boolean };
export type GrabList = { id: string; title: string; placeId?: string; items: GrabItem[]; createdAt: string; closedAt?: string };
export type Away = SuggestedAway & { since: string; endedAt?: string };

const rid = () => Math.random().toString(36).slice(2, 10);

export function newGrabList(s: SuggestedGrabList, now: Date): GrabList {
  return { id: rid(), title: s.title, ...(s.placeId ? { placeId: s.placeId } : {}), items: s.items.map((i) => ({ id: rid(), text: i.text, ...(i.ifFound ? { ifFound: true } : {}) })), createdAt: now.toISOString() };
}

/** Everything she has to get is ticked. "If you find it" items never block it. */
export const grabComplete = (g: GrabList) => g.items.every((i) => i.done || i.ifFound);

export function tickGrabItem(g: GrabList, itemId: string, now: Date): GrabList {
  const items = g.items.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i));
  const next = { ...g, items };
  return items.every((i) => i.done) ? { ...next, closedAt: now.toISOString() } : next;
}

export const openGrabLists = (lists: GrabList[]) => lists.filter((g) => !g.closedAt);

export const awayNow = (a: Away | null | undefined): Away | null => (a && !a.endedAt ? a : null);

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function cleanGrabList(raw: any, placeIds: Set<string>): GrabList | null {
  if (!raw || typeof raw.id !== 'string' || typeof raw.title !== 'string' || !Array.isArray(raw.items)) return null;
  const items: GrabItem[] = raw.items
    .filter((i: any) => i && typeof i.id === 'string' && typeof i.text === 'string')
    .map((i: any) => ({ id: i.id, text: i.text, ...(i.ifFound ? { ifFound: true } : {}), ...(i.done ? { done: true } : {}) }));
  return {
    id: raw.id,
    title: raw.title,
    ...(typeof raw.placeId === 'string' && placeIds.has(raw.placeId) ? { placeId: raw.placeId } : {}),
    items,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date(0).toISOString(),
    ...(typeof raw.closedAt === 'string' ? { closedAt: raw.closedAt } : {}),
  };
}

export function cleanAwayRecord(raw: any, placeIds: Set<string>): Away | null {
  if (!raw || typeof raw.placeName !== 'string' || typeof raw.since !== 'string') return null;
  return {
    placeName: raw.placeName,
    since: raw.since,
    ...(typeof raw.placeId === 'string' && placeIds.has(raw.placeId) ? { placeId: raw.placeId } : {}),
    ...(typeof raw.untilDay === 'string' && DAY.test(raw.untilDay) ? { untilDay: raw.untilDay } : {}),
    ...(typeof raw.reason === 'string' ? { reason: raw.reason } : {}),
    ...(typeof raw.endedAt === 'string' ? { endedAt: raw.endedAt } : {}),
  };
}
