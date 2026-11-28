// Grab lists (brief 4): one checklist for one trip or place ("Grab from home"), and away from home.
// Phone only: they live in the places store with the rest of her location data. Pure helpers, tested.
import type { SuggestedAway, SuggestedGrabList } from './dumpShapes';

export type GrabItem = { id: string; text: string; ifFound?: boolean; done?: boolean };
export type GrabList = {
  id: string;
  title: string;
  placeId?: string;
  items: GrabItem[];
  createdAt: string;
  closedAt?: string;
  /** Last time it opened for her at its place (arriving, or made while there). */
  shownAt?: string;
  /** Last "You left without …" after that. */
  nudgedAt?: string;
};
export type Away = SuggestedAway & {
  since: string;
  endedAt?: string;
  /** The nights she has said she's away ("YYYY-MM-DD", the evening's day). */
  nights?: string[];
};

const rid = () => Math.random().toString(36).slice(2, 10);

export function newGrabList(s: SuggestedGrabList, now: Date, hereNow = false): GrabList {
  return {
    id: rid(),
    title: s.title,
    ...(s.placeId ? { placeId: s.placeId } : {}),
    items: s.items.map((i) => ({ id: rid(), text: i.text, ...(i.ifFound ? { ifFound: true } : {}) })),
    createdAt: now.toISOString(),
    // Made while she's already at the place: it shows straight away, so leaving without things still nudges.
    ...(hereNow && s.placeId ? { shownAt: now.toISOString() } : {}),
  };
}

/** What she still has to get. "If you find it" items never count. */
export const unticked = (g: GrabList) => g.items.filter((i) => !i.done && !i.ifFound);

/** Open lists for a place. */
export const grabsFor = (lists: GrabList[], placeId: string) => lists.filter((g) => !g.closedAt && g.placeId === placeId);

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** "You left without: contact lenses, makeup. Did you get them?" */
export function leftLine(g: GrabList): string {
  const names = unticked(g).map((i) => lower(i.text));
  const shown = names.length > 4 ? `${names.slice(0, 4).join(', ')} and ${names.length - 4} more` : names.join(', ');
  return `You left without: ${shown}. Did you get ${names.length === 1 ? 'it' : 'them'}?`;
}

/** The leaving nudge's answers. Done ticks everything; Didn't need closes it; Forgot keeps it for next time. */
export function finishGrab(g: GrabList, how: 'got' | 'forgot' | 'not-needed', now: Date): GrabList {
  if (how === 'forgot') {
    const { shownAt: _s, nudgedAt: _n, ...rest } = g;
    return rest;
  }
  const items = how === 'got' ? g.items.map((i) => (i.ifFound ? i : { ...i, done: true })) : g.items;
  return { ...g, items, closedAt: now.toISOString() };
}

/** The one question on the dump's review: "Show you this list when you get home?" */
export const showWhenLine = (place: { name: string; type: string }) =>
  place.type === 'home' ? 'Show you this list when you get home?' : `Show you this list when you get to ${place.name}?`;

/** The arrival card's heading: "You're home. Here's what you came for." */
export const arriveLine = (place: { name: string; type: string }) =>
  `${place.type === 'home' ? "You're home" : `You're at ${place.name}`}. Here's what you came for.`;

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
    ...(typeof raw.shownAt === 'string' ? { shownAt: raw.shownAt } : {}),
    ...(typeof raw.nudgedAt === 'string' ? { nudgedAt: raw.nudgedAt } : {}),
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
    ...(Array.isArray(raw.nights) ? { nights: raw.nights.filter((d: unknown): d is string => typeof d === 'string' && DAY.test(d)) } : {}),
  };
}
