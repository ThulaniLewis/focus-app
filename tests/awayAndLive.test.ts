// Brief 4 Parts 2 and 5 (grab lists at a place, away mode) and brief 1b Fix 3 (live traffic).
// Made-up places, names and ids: nothing here is anyone's real life.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { awayAskAt, awayCard, homeLinkedIds, pausedByAway } from '../src/lib/awayMode';
import { cleanGrabLists } from '../src/lib/dumpShapes';
import { EMPTY_GEO, type GeoData, type GeoLogEntry, type GeoPlace, placeActions } from '../src/lib/geo';
import { type Away, finishGrab, leftLine, newGrabList, showWhenLine, tickGrabItem, unticked } from '../src/lib/grabLists';
import { applyLive, dueCheck, liveAgenda, type LiveTrip, tripsToday } from '../src/lib/liveTraffic';
import { plan } from '../src/lib/nudges';
import { agendaFor } from '../src/lib/time';
import { DEFAULT_SETTINGS, DEFAULT_SPACES, type State, type Task } from '../src/lib/types';

const HOME: GeoPlace = { id: 'home', name: 'Home', type: 'home', lat: 51.43, lon: -0.05, radiusM: 175 };
const SCHOOL: GeoPlace = { id: 'oaks', name: 'Oaks nursery', type: 'school', lat: 51.44, lon: -0.05, radiusM: 120, trips: 'Oaks' };
const FAMILY: GeoPlace = { id: 'fam', name: "Gran's", type: 'family', lat: 51.41, lon: -0.02, radiusM: 120 };
const WORK: GeoPlace = { id: 'work', name: 'Office', type: 'work', lat: 51.5, lon: -0.1, radiusM: 150 };
const PLACES = [HOME, SCHOOL, FAMILY, WORK];

const settings = { ...DEFAULT_SETTINGS, savPattern: null, places: [{ id: 'oaks', name: 'Oaks', travelMin: 15 }], bufferMin: 5 };
const st = (tasks: Task[]): State => ({ tasks, notes: [], spaces: DEFAULT_SPACES, checkins: [], settings });
const task = (t: Partial<Task> & { id: string; title: string }): Task => ({ kind: 'task', createdAt: '2026-11-01T00:00:00.000Z', done: false, ...t });
const geo = (g: Partial<GeoData>): GeoData => ({ ...EMPTY_GEO, places: PLACES, ...g });
const ev = (event: 'arrive' | 'leave', place: GeoPlace, at: Date): GeoLogEntry => ({ at: at.toISOString(), placeId: place.id, placeName: place.name, event, source: 'background' });

const LIST = () =>
  newGrabList(
    {
      title: 'Grab from home',
      placeId: 'home',
      items: [{ text: 'Amazon parcel' }, { text: 'Contact lenses' }, { text: 'Makeup' }, { text: 'Underwear' }, { text: 'Nose piercing', ifFound: true }],
    },
    new Date('2026-11-27T22:10:00'),
  );

// ---------- Part 2 ----------

test('grab list: one question with the place filled in, home picked from the title when Claude leaves it out', () => {
  assert.equal(showWhenLine(HOME), 'Show you this list when you get home?');
  assert.equal(showWhenLine(FAMILY), "Show you this list when you get to Gran's?");
  const [g] = cleanGrabLists([{ title: 'grab from home', items: ['socks'] }], PLACES);
  assert.equal(g.placeId, 'home');
  const [n] = cleanGrabLists([{ title: 'For the trip', place_id: 'nowhere', items: ['socks'] }], PLACES);
  assert.equal(n.placeId, undefined);
});

test('arriving home: the list opens full screen, away mode ends, and the list comes first', () => {
  const g = LIST();
  const away: Away = { placeId: 'fam', placeName: "Gran's", since: '2026-11-27T22:10:00.000Z', nights: ['2026-11-27'] };
  const at = new Date('2026-11-28T08:30:00');
  const r = placeActions(geo({ grabLists: [g], away }), [ev('leave', FAMILY, at), ev('arrive', HOME, at)], [], at);
  assert.equal(r.notices[0].title, "You're home. Here's what you came for.");
  assert.deepEqual(r.notices[0].open, { to: 'grab', listId: g.id });
  assert.match(r.notices[0].body, /Amazon parcel, Contact lenses, Makeup, Underwear/);
  assert.ok(!r.notices[0].body.includes('Nose piercing'));
  assert.ok(r.data.away?.endedAt, 'away mode ends on getting home');
  assert.ok(r.data.grabLists[0].shownAt);
});

test('leaving with three things unticked: one nudge naming them; the nose piercing never counts; never twice', () => {
  let g = LIST();
  const arrive = new Date('2026-11-28T08:30:00');
  let d = placeActions(geo({ grabLists: [g] }), [ev('arrive', HOME, arrive)], [], arrive).data;
  g = d.grabLists[0];
  g = tickGrabItem(g, g.items[0].id, arrive);
  d = { ...d, grabLists: [g] };
  const out = new Date('2026-11-28T08:50:00');
  const r = placeActions(d, [ev('leave', HOME, out)], [], out);
  assert.equal(r.notices.length, 1);
  assert.equal(r.notices[0].title, 'You left without: contact lenses, makeup, underwear. Did you get them?');
  assert.deepEqual(r.notices[0].open, { to: 'grab', listId: g.id, left: true });
  const again = placeActions(r.data, [ev('leave', HOME, new Date('2026-11-28T08:55:00'))], [], new Date('2026-11-28T08:55:00'));
  assert.equal(again.notices.length, 0);
});

test('Done, Forgot, Didn\'t need: done closes with no leftovers; forgot keeps it for next time', () => {
  const g = { ...LIST(), shownAt: 'x', nudgedAt: 'y' };
  const now = new Date('2026-11-28T09:00:00');
  const got = finishGrab(g, 'got', now);
  assert.ok(got.closedAt);
  assert.equal(unticked(got).length, 0);
  assert.ok(!got.items.find((i) => i.ifFound)?.done, 'the nose piercing is not claimed as found');
  const forgot = finishGrab(g, 'forgot', now);
  assert.equal(forgot.closedAt, undefined);
  assert.equal(forgot.shownAt, undefined);
  assert.ok(finishGrab(g, 'not-needed', now).closedAt);
  assert.equal(leftLine({ ...g, items: [{ id: 'a', text: 'Keys' }] }), 'You left without: keys. Did you get it?');
});

test('a list made while she is already there counts as shown straight away', () => {
  const g = newGrabList({ title: 'Grab from home', placeId: 'home', items: [{ text: 'Keys' }] }, new Date('2026-11-28T08:00:00'), true);
  assert.ok(g.shownAt);
});

// ---------- Part 5 ----------

const WIND_DOWN = task({ id: 'wd', title: 'Wind down: open Focus, check tomorrow', seed: 'wind-down', at: '2026-11-01T22:00', repeatDays: [0, 1, 2, 3, 4, 5, 6], nag: true });
const KITCHEN = task({ id: 'k', title: 'Kitchen reset', at: '2026-11-01T20:30', repeatDays: [0, 1, 2, 3, 4, 5, 6], nag: true, room: 'kitchen', spaceId: 'home' });
const BINS = task({ id: 'b', title: 'Bins out', at: '2026-11-01T20:00', repeatDays: [5], nag: true, spaceId: 'home' });
const TYRE = task({ id: 't', title: 'Tyre repair', kind: 'event', at: '2026-11-28T10:00' });
const WITH_DAD = task({ id: 'sd', title: 'Ada with her dad', kind: 'event', allDay: true, day: '2026-11-28' });
const DROP = task({ id: 'drop', title: 'Drop off', at: '2026-11-01T08:00', repeatDays: [1, 2, 3, 4, 5], place: 'Oaks' });

test('away tonight: no home wind down and no house jobs, just the short away card; diary events still come', () => {
  const s = st([WIND_DOWN, KITCHEN, BINS, TYRE, WITH_DAD]);
  const now = new Date('2026-11-27T19:00:00');
  const away: Away = { placeId: 'fam', placeName: "Gran's", since: '2026-11-27T18:30:00.000Z', nights: ['2026-11-27'] };
  const p = plan(s, now, { away });
  const tonight = p.filter((x) => x.at.getTime() < new Date('2026-11-28T00:00:00').getTime());
  assert.ok(!tonight.some((x) => /Kitchen|Bins|Ready to wind down/.test(x.title)), tonight.map((x) => x.title).join(' | '));
  const card = tonight.find((x) => x.title === "You're at Gran's tonight.");
  assert.ok(card);
  assert.equal(card!.body, 'Tomorrow: Tyre repair 10:00, Ada with her dad. Anything to add?');
  assert.equal(card!.at.getHours(), 22);
  assert.ok(p.some((x) => x.title.startsWith('Tyre repair')), 'the diary event still nudges');
  // Home again: everything picks up, nothing marked missed.
  const back = plan(s, now, { away: { ...away, endedAt: '2026-11-27T19:00:00.000Z' } });
  assert.ok(back.some((x) => x.title === 'Kitchen reset'));
  assert.ok(back.some((x) => x.title === 'Ready to wind down?'));
});

test('away more than one night: "Still away tonight?" once the next evening', () => {
  const s = st([WIND_DOWN, KITCHEN]);
  const away: Away = { placeId: 'fam', placeName: "Gran's", since: '2026-11-27T18:30:00.000Z', nights: ['2026-11-27'] };
  const p = plan(s, new Date('2026-11-28T09:00:00'), { away });
  const still = p.filter((x) => x.title === 'Still away tonight?' && x.at.getDate() === 28);
  assert.equal(still.length, 1);
  assert.equal(still[0].at.getHours(), 21); // an hour before her own wind down
  assert.deepEqual(still[0].data, { open: 'away', placeId: 'still' });
});

test('what pauses: house jobs, home space, home-linked; never trips, events or her own jobs', () => {
  const s = st([]);
  const linked = homeLinkedIds(PLACES, [{ taskId: 'x', placeId: 'home' }]);
  assert.ok(pausedByAway(KITCHEN, s, linked));
  assert.ok(pausedByAway(BINS, s, linked));
  assert.ok(pausedByAway(WIND_DOWN, s, linked));
  assert.ok(pausedByAway(task({ id: 'x', title: 'Water plants' }), s, linked));
  assert.ok(!pausedByAway(TYRE, s, linked));
  assert.ok(!pausedByAway(DROP, s, linked));
  assert.ok(!pausedByAway(task({ id: 'j', title: 'Job application', spaceId: 'jobs', nag: true, at: '2026-11-27T10:00' }), s, linked));
});

test('the evening question: only at family or other places, 30 minutes into her evening, never once away', () => {
  const s = st([WIND_DOWN]);
  const at = awayAskAt(s, FAMILY, new Date('2026-11-27T17:00:00'), null);
  assert.equal(at?.toTimeString().slice(0, 5), '21:30');
  assert.equal(awayAskAt(s, FAMILY, new Date('2026-11-27T21:45:00'), null)?.toTimeString().slice(0, 5), '22:15');
  assert.equal(awayAskAt(s, HOME, new Date('2026-11-27T17:00:00'), null), null);
  assert.equal(awayAskAt(s, WORK, new Date('2026-11-27T17:00:00'), null), null);
  assert.equal(awayAskAt(s, FAMILY, new Date('2026-11-27T17:00:00'), { placeName: "Gran's", since: 'x' }), null);
  assert.equal(awayCard(st([]), { placeName: "Gran's", since: 'x' }, new Date('2026-11-27T22:00:00')).body, 'Nothing fixed tomorrow. Anything to add?');
});

// ---------- Fix 3: live traffic ----------

const MON_0700 = new Date('2026-11-30T07:00:00');
const HOOVER = task({ id: 'h', title: 'Hoover the stairs', at: '2026-11-30T07:30', estimateMin: 15, nag: true });
const liveState = st([DROP, HOOVER]);
const trip = () => tripsToday(liveState, PLACES, 'home', MON_0700)[0];

test('trips: drop off from home to the nursery, usual leave-by 07:40', () => {
  const t = trip();
  assert.equal(t.dest.id, 'oaks');
  assert.equal(t.origin.id, 'home');
  assert.equal(t.usualLeaveAt.toTimeString().slice(0, 5), '07:40');
});

test('normal traffic: no change, no message', () => {
  const r = applyLive(liveState, trip(), undefined, '60', { min: 16, usualMin: 14 }, new Date('2026-11-30T06:45:00'));
  assert.equal(r.notice, null);
  assert.equal(r.rec.leaveAt, trip().usualLeaveAt.toISOString());
});

test('heavy traffic adds 13 minutes: leave-by moves, one message with the numbers, the job before moves, Undo puts it back', () => {
  const t = trip();
  const now = new Date('2026-11-30T07:00:00');
  const r = applyLive(liveState, t, undefined, '30', { min: 28, usualMin: 15 }, now);
  assert.equal(new Date(r.rec.leaveAt).toTimeString().slice(0, 5), '07:27');
  assert.equal(r.notice!.title, "I've moved leaving for Oaks nursery to 07:27");
  assert.match(r.notice!.body, /Traffic is heavier than usual, so it's 28 minutes today instead of 15\./);
  assert.match(r.notice!.body, /Hoover the stairs moved to 07:12\./);
  const moved = liveAgenda(agendaFor(liveState, '2026-11-30'), [r.rec], '2026-11-30');
  assert.equal(moved.find((a) => a.task.id === 'h')!.at.toTimeString().slice(0, 5), '07:12');
  assert.equal(moved.find((a) => a.task.id === 'drop')!.leaveAt!.toTimeString().slice(0, 5), '07:27');
  const undone: LiveTrip = { ...r.rec, undone: true };
  const back = liveAgenda(agendaFor(liveState, '2026-11-30'), [undone], '2026-11-30');
  assert.equal(back.find((a) => a.task.id === 'h')!.at.toTimeString().slice(0, 5), '07:30');
  assert.equal(back.find((a) => a.task.id === 'drop')!.leaveAt!.toTimeString().slice(0, 5), '07:40');
  // Worse after Undo: no more messages about it.
  assert.equal(applyLive(liveState, t, undone, '15', { min: 35, usualMin: 15 }, new Date('2026-11-30T07:10:00')).notice, null);
});

test('traffic clears: the leave-by moves back once, one message, jobs back', () => {
  const t = trip();
  const heavy = applyLive(liveState, t, undefined, '30', { min: 28, usualMin: 15 }, new Date('2026-11-30T07:00:00')).rec;
  const r = applyLive(liveState, t, heavy, '15', { min: 15, usualMin: 15 }, new Date('2026-11-30T07:12:00'));
  assert.equal(r.notice!.title, 'Leaving for Oaks nursery is back to 07:40');
  assert.match(r.notice!.body, /back where they were/);
  assert.deepEqual(r.rec.moved, []);
  assert.equal(applyLive(liveState, t, r.rec, 'leave', { min: 15, usualMin: 15 }, new Date('2026-11-30T07:20:00')).notice, null);
});

test('Google down: the usual time stands, no crash, and the check still counts', () => {
  const r = applyLive(liveState, trip(), undefined, '60', null, new Date('2026-11-30T06:45:00'));
  assert.equal(r.notice, null);
  assert.deepEqual(r.rec.checks, ['60']);
  assert.equal(r.rec.leaveAt, trip().usualLeaveAt.toISOString());
});

test('call count: at most 60, 30, 15 and once on leaving, whatever the positions do', () => {
  const t = trip();
  let rec: LiveTrip | undefined;
  let calls = 0;
  for (let m = 6 * 60; m <= 8 * 60; m += 5) {
    const now = new Date(`2026-11-30T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`);
    const c = dueCheck(t, rec, now, m === 7 * 60 + 35);
    if (!c) continue;
    calls++;
    rec = applyLive(liveState, t, rec, c, { min: 15, usualMin: 15 }, now).rec;
  }
  assert.equal(calls, 4);
});
