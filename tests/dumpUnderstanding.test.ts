// Brief 4 Part 1: work out what the dump is for first. The real 27 Nov dump is used word for word, with
// a stand-in for what Claude should send back given the new prompt and context. The live model can only
// be checked on the phone (the key lives in Supabase). Made-up places and ids.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allDayEvents, dumpContext } from '../src/lib/dumpContext';
import { cleanAway, cleanGrabLists, shapesFor, shapesPrompt } from '../src/lib/dumpShapes';
import type { GeoPlace } from '../src/lib/geo';
import { grabComplete, newGrabList, tickGrabItem } from '../src/lib/grabLists';
import { normalise } from '../src/lib/normalise';
import { spaceView } from '../src/lib/spaceView';
import { tasksFor } from '../src/lib/time';
import { DEFAULT_SETTINGS, DEFAULT_SPACES, type State, type Task } from '../src/lib/types';
import { savSaturday } from '../src/lib/views';

export const DUMP_27_NOV =
  "ok so I am currently staying at my parents house because a punctured attire my tyre is going to be fixed tomorrow morning at 10 o'clock in the morning I need some help because I need to my Dad is taking me home so that I can collect some bits I just need you to help me remember what I need to connect so I need the Amazon package so that is behind the really been outside I need savannah's clothes for tomorrow socks and anything she may need for being with her dad tomorrow she's with her dad tomorrow which is an impromptu additional day that he's doing I need my clothes my underwear my makeup definitely my makeup my contact lenses and if I can find a nose piercing as well";

const HOME: GeoPlace = { id: 'home', name: 'Home', type: 'home', lat: 51.43, lon: -0.05, radiusM: 175 };
const NURSERY: GeoPlace = { id: 'oaks', name: "Ada's nursery", type: 'school', lat: 51.44, lon: -0.05, radiusM: 120 };
const PARENTS: GeoPlace = { id: 'mum', name: "Mum and Dad's", type: 'family', lat: 51.41, lon: -0.02, radiusM: 120 };
const PLACES = [HOME, NURSERY, PARENTS];
const FRI_2206 = new Date('2026-11-27T22:06:00');
const settings = { ...DEFAULT_SETTINGS, savPattern: { anchor: '2026-11-21', weeks: 2 } };
const state = (tasks: Task[] = []): State => ({ tasks, notes: [], spaces: DEFAULT_SPACES, checkins: [], settings });

// What Claude should send back for the 27 Nov dump, as the new prompt asks.
const ANSWER = {
  understood: "She's staying at her parents' tonight after a puncture, and wants a list of what to grab from home. Tyre repair 10:00 tomorrow; Sav is with her dad tomorrow, an extra day.",
  items: [
    { title: 'Tyre repair', kind: 'event', at: '2026-11-28T10:00' },
    { title: 'Ada with her dad (extra day)', kind: 'event', all_day: true, day: '2026-11-28', space_id: 'sav' },
  ],
  grab_lists: [
    {
      title: 'Grab from home',
      place_id: 'home',
      items: [
        { text: 'Amazon parcel (outside, behind the bin)' },
        { text: "Ada's clothes for tomorrow" },
        { text: "Ada's socks" },
        { text: "Anything Ada needs for her dad's" },
        { text: 'My clothes' },
        { text: 'My underwear' },
        { text: 'My makeup' },
        { text: 'Contact lenses' },
        { text: 'Nose piercing', if_found: true },
        { text: 'Phone charger' },
      ],
    },
  ],
  away: { place_id: 'mum', reason: 'tyre puncture' },
  notes: [],
  reply: "Here's your list for home. Tyre's at 10.",
};

test('the context bundle: where she is, her places with types, the diary, the weekend and the rhythm', () => {
  const ctx = dumpContext({ state: state(), now: FRI_2206, places: PLACES, presence: { placeId: 'mum', since: '2026-11-27T17:40:00.000Z', pending: null } });
  assert.match(ctx, /Where she is now: at Mum and Dad's \(Family\)/);
  assert.match(ctx, /home: Home \(Home\)/);
  assert.match(ctx, /oaks: Ada's nursery \(Nursery or school\)/);
  assert.match(ctx, /Her day ends at 22:30/);
  assert.match(ctx, /Tomorrow \(Saturday 28 Nov\)/);
  assert.match(ctx, /Tomorrow is a weekend day: no nursery or school runs/);
  // 28 Nov is a home Saturday by the every-other-week pattern (21 Nov was a dad Saturday).
  assert.match(ctx, /Saturday 28 Nov: her child is with her \(from her every-other-week pattern\)/);
  // The tablet gets no places or where she is.
  const tablet = dumpContext({ state: state(), now: FRI_2206 });
  assert.doesNotMatch(tablet, /Where she is|Mum and Dad/);
});

test('the prompt works out what the dump is for first, and offers the shapes as data', () => {
  const p = shapesPrompt(true);
  assert.match(p, /read the whole message as one thing/);
  assert.match(p, /Do not go sentence by sentence/);
  for (const s of ['Grab list', 'Diary event', 'Place reminder', 'Away from home', 'Tasks', 'Shopping', 'Note']) assert.ok(p.includes(`- ${s}:`), s);
  // Phone-only shapes never go to the tablet.
  assert.deepEqual(shapesFor(false).map((s) => s.id), ['diary', 'tasks', 'shopping', 'note']);
});

test('27 Nov dump: one grab list of 10 for home, two diary events, away tonight, nothing else', () => {
  const grabs = cleanGrabLists(ANSWER.grab_lists, PLACES);
  assert.equal(grabs.length, 1);
  assert.equal(grabs[0].title, 'Grab from home');
  assert.equal(grabs[0].placeId, 'home');
  assert.equal(grabs[0].items.length, 10);
  assert.deepEqual(grabs[0].items.filter((i) => i.ifFound).map((i) => i.text), ['Nose piercing']);

  const r = normalise(ANSWER, settings, DEFAULT_SPACES);
  assert.equal(r.items.length, 2);
  const [tyre, sav] = r.items;
  assert.equal(tyre.kind, 'event');
  assert.equal(tyre.at, '2026-11-28T10:00');
  assert.equal(sav.kind, 'event');
  assert.equal(sav.allDay, true);
  assert.equal(sav.day, '2026-11-28');
  assert.equal(sav.at, undefined);
  // No time estimates, no rooms, nothing private.
  assert.ok(r.items.every((i) => !i.estimateMin && !i.room && i.kind !== 'note'));

  const away = cleanAway(ANSWER.away, PLACES, '2026-11-27');
  assert.deepEqual(away, { placeId: 'mum', placeName: "Mum and Dad's", reason: 'tyre puncture' });
});

test('an all-day diary event is never a tick box, shows in the diary, and counts for whose day it is', () => {
  const sav: Task = { id: 's1', title: 'Ada with her dad (extra day)', kind: 'event', allDay: true, day: '2026-11-28', spaceId: 'sav', createdAt: '', done: false };
  assert.deepEqual(tasksFor(state([sav]), '2026-11-28'), []);
  const ev = allDayEvents([sav]);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].allDay, true);
  // Her awayWords ("dad") on a diary entry win over the pattern for that Saturday only.
  assert.deepEqual(savSaturday(ev, '2026-11-28', settings), { away: true, from: 'diary' });
  assert.deepEqual(savSaturday(ev, '2026-12-12', settings), { away: false, from: 'pattern' });
  // In its space: shown with its day, not in the to-do list.
  const v = spaceView([sav], FRI_2206);
  assert.deepEqual(v.dated.map((d) => d.label), ['28 Nov, all day']);
  assert.deepEqual(v.next, []);
});

test('grab list: "if you find it" never blocks Done; ticking everything closes it', () => {
  const g = newGrabList({ title: 'Grab from home', placeId: 'home', items: [{ text: 'Makeup' }, { text: 'Nose piercing', ifFound: true }] }, FRI_2206);
  assert.equal(grabComplete(g), false);
  const one = tickGrabItem(g, g.items[0].id, FRI_2206);
  assert.equal(grabComplete(one), true);
  assert.equal(one.closedAt, undefined); // still open until she taps Done or ticks the last one
  const both = tickGrabItem(one, g.items[1].id, FRI_2206);
  assert.ok(both.closedAt);
});

test('cleaning: only her places, no empty or repeated items, away needs somewhere and never home', () => {
  const g = cleanGrabLists([{ title: 'grab', place_id: 'nowhere', items: ['a', 'A', '', { text: ' b ' }] }, { title: 'empty', items: [] }], PLACES);
  assert.deepEqual(g, [{ title: 'Grab', items: [{ text: 'A' }, { text: 'B' }] }]);
  assert.equal(cleanAway({ place_id: 'home' }, PLACES, '2026-11-27'), null);
  assert.equal(cleanAway({}, PLACES, '2026-11-27'), null);
  assert.deepEqual(cleanAway({ place_name: 'Hotel', until_day: '2026-11-20' }, PLACES, '2026-11-27'), { placeName: 'Hotel' });
});

test('a normal mixed dump still sorts as before', () => {
  const r = normalise(
    { items: [{ title: 'Bananas', kind: 'buy', list: 'food', group: 'Fruit and veg' }, { title: 'Hoover the stairs', kind: 'task', space_id: 'home', estimate_min: 15 }, { title: 'Dentist', kind: 'event', at: '2026-12-03T14:00' }], notes: [], reply: 'ok' },
    settings,
    DEFAULT_SPACES,
  );
  assert.deepEqual(r.items.map((i) => [i.kind, i.spaceId]), [['buy', 'shopping'], ['task', 'home'], ['event', undefined]]);
  assert.equal(r.items[1].estimateMin, 15);
  // An event with no time and no all_day still falls back to a task, as before.
  const r2 = normalise({ items: [{ title: 'Call the bank', kind: 'event', day: '2026-12-01' }], notes: [], reply: '' }, settings, DEFAULT_SPACES);
  assert.equal(r2.items[0].kind, 'task');
});

// ---- Part 3: privacy only when she means it ----
test('a packing item is never private because of what it is, and never drags others in', () => {
  const r = normalise(
    {
      items: [
        { title: 'Pack my underwear', kind: 'task', space_id: 'me' },
        { title: 'Pack my makeup', kind: 'task', space_id: 'me' },
        { title: 'Book the smear test', kind: 'task', space_id: 'me', private: true },
        { title: "I'm feeling really flat today", kind: 'note' },
      ],
      notes: [],
      reply: '',
    },
    settings,
    DEFAULT_SPACES,
  );
  assert.deepEqual(r.items.map((i) => [i.title, i.kind, i.spaceId]), [
    ['Pack my underwear', 'task', undefined],
    ['Pack my makeup', 'task', undefined],
    ['Book the smear test', 'task', 'me'],
    ["I'm feeling really flat today", 'note', 'me'],
  ]);
});

// ---- Part 4: smaller fixes ----
test('rooms: outside, behind the bin or in the car is never the hallway', () => {
  const s = { ...settings, rooms: [...settings.rooms, { name: 'Hallway', floor: 'down' as const }] };
  const r = normalise(
    { items: [{ title: 'Bring in the Amazon parcel from behind the bin outside', kind: 'task', room: 'hallway' }, { title: 'Get the car seat from in the car', kind: 'task', room: 'hallway' }, { title: 'Hoover the hallway', kind: 'task', room: 'hallway' }], notes: [], reply: '' },
    s,
    DEFAULT_SPACES,
  );
  assert.deepEqual(r.items.map((i) => i.room), [undefined, undefined, 'hallway']);
});

test('the wind down nudge is one plain line: "Ready to wind down?" and what tomorrow starts with', async () => {
  const { plan } = await import('../src/lib/nudges');
  const wind: Task = { id: 'w', seed: 'wind-down', title: 'Wind down: open Focus, check tomorrow', kind: 'event', at: '2026-11-20T22:00', repeatDays: [0, 1, 2, 3, 4, 5, 6], nag: true, estimateMin: 10, createdAt: '', done: false };
  const tyre: Task = { id: 't', title: 'Tyre repair', kind: 'event', at: '2026-11-28T10:00', createdAt: '', done: false };
  const out = plan(state([wind, tyre]), new Date('2026-11-27T21:00:00')).filter((p) => p.nag?.taskId === 'w' && p.nag.day === '2026-11-27');
  assert.ok(out.length >= 1);
  for (const p of out) {
    assert.equal(p.title, 'Ready to wind down?');
    assert.equal(p.body, 'Tomorrow starts with Tyre repair at 10:00.');
    assert.doesNotMatch(`${p.title} ${p.body}`, /Still to do|Wind down:|About \d+ min/);
  }
});
