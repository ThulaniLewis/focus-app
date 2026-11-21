import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalise } from '../src/lib/normalise';
import {
  agendaFor,
  dayKey,
  elapsedSec,
  estimateRatio,
  fmtTime,
  minutesLeftToday,
  nextAnchor,
  occurrenceOn,
  parseLocal,
  realisticMin,
  slug,
  tasksFor,
  wakeFor,
} from '../src/lib/time';
import { DEFAULT_SETTINGS, DEFAULT_SPACES, type State, type Task } from '../src/lib/types';
import { migrate } from '../src/lib/migrate';
import { savAwayOn } from '../src/lib/views';

const base = (over: Partial<Task>): Task => ({ id: Math.random().toString(), title: 'x', kind: 'task', createdAt: '', done: false, ...over });

const nursery = base({ title: 'Nursery drop', kind: 'event', at: '2026-11-17T08:15', repeatDays: [1, 2, 3, 4, 5], place: 'nursery' });
const state = (tasks: Task[]): State => ({ tasks, notes: [], spaces: DEFAULT_SPACES, checkins: [], settings: { ...DEFAULT_SETTINGS, bufferMin: 10, dayEnd: '21:30' } });

test('parseLocal reads local time, not UTC', () => {
  const d = parseLocal('2026-11-17T08:15')!;
  assert.equal(d.getHours(), 8);
  assert.equal(d.getMinutes(), 15);
  assert.equal(dayKey(d), '2026-11-17');
});

test('weekday repeat shows Tue to Fri, not weekends or before start', () => {
  assert.ok(occurrenceOn(nursery, '2026-11-17')); // Tue
  assert.ok(occurrenceOn(nursery, '2026-11-20')); // Fri
  assert.equal(occurrenceOn(nursery, '2026-11-21'), null); // Sat
  assert.equal(occurrenceOn(nursery, '2026-11-16'), null); // Mon, before it started
  assert.equal(fmtTime(occurrenceOn(nursery, '2026-11-23')!), '08:15');
});

test('leave-by = start - travel (20) - buffer (10)', () => {
  const [a] = agendaFor(state([nursery]), '2026-11-17');
  assert.equal(fmtTime(a.leaveAt!), '07:45');
  assert.equal(a.placeUnknown, false);
});

test('unknown place is flagged, no leave-by guessed', () => {
  const t = base({ title: 'Dentist', kind: 'event', at: '2026-11-19T14:00', place: 'Bromley dentist' });
  const [a] = agendaFor(state([t]), '2026-11-19');
  assert.equal(a.leaveAt, undefined);
  assert.equal(a.placeUnknown, true);
});

test('wake-by works back from the first leave-by', () => {
  const w = wakeFor(state([nursery]), '2026-11-18')!;
  assert.equal(fmtTime(w.wake), '06:45'); // 07:45 - 60
});

test('next anchor is the leave time, then the event', () => {
  const s = state([nursery]);
  assert.equal(nextAnchor(s, new Date(2026, 10, 17, 7, 0))!.label, 'Leave for Nursery drop');
  assert.equal(nextAnchor(s, new Date(2026, 10, 17, 7, 50))!.label, 'Nursery drop');
  assert.equal(nextAnchor(s, new Date(2026, 10, 17, 9, 0)), null);
});

test('ticking a repeat for one day leaves other days open', () => {
  const t = { ...nursery, doneDays: ['2026-11-17'] };
  assert.equal(agendaFor(state([t]), '2026-11-17')[0].done, true);
  assert.equal(agendaFor(state([t]), '2026-11-18')[0].done, false);
});

test('time left today', () => {
  assert.equal(minutesLeftToday(new Date(2026, 10, 17, 20, 30), '21:30'), 60);
  assert.equal(minutesLeftToday(new Date(2026, 10, 17, 22, 0), '21:30'), 0);
});

test('timer counts paused time plus running time', () => {
  const now = new Date('2026-11-17T10:10:00Z');
  assert.equal(elapsedSec({ accumulatedSec: 60, startedAt: '2026-11-17T10:05:00Z' }, now), 360);
  assert.equal(elapsedSec({ accumulatedSec: 90 }, now), 90);
});

test('estimate ratio needs 3 timed tasks, then uses the median', () => {
  const done = (e: number, a: number) => base({ done: true, doneAt: '2026-11-17', estimateMin: e, actualMin: a });
  assert.equal(estimateRatio([done(10, 20), done(10, 15)]), null);
  assert.equal(estimateRatio([done(10, 20), done(10, 15), done(10, 30)]), 2);
  assert.equal(realisticMin(10, 2), 20);
  assert.equal(realisticMin(10, null), 10);
});

test('unfinished tasks carry forward, done ones drop off next day', () => {
  const a = base({ title: 'a', day: '2026-11-17' });
  const b = base({ title: 'b', day: '2026-11-17', done: true, doneAt: '2026-11-17T09:00:00Z' });
  const titles = tasksFor(state([a, b]), '2026-11-18').map((t) => t.title);
  assert.deepEqual(titles, ['a']);
});

test('normalise cleans up model output', () => {
  const r = normalise(
    {
      items: [
        { title: 'Take rubbish out', kind: 'task', room: 'Savannah Bedroom', grab: { item: 'bin bag', from_room: 'kitchen' }, estimate_min: 5 },
        { title: 'Nursery drop', kind: 'event', at: '2026-11-17T08:15:00', repeat_days: [5, 1, 2, 2, 9], place: 'Nursery' },
        { title: '  ' },
        { title: 'Garage tidy', kind: 'task', room: 'garage' },
      ],
      notes: ['Focus note: want a bigger clock', 3],
      reply: 'Got it.',
    },
    DEFAULT_SETTINGS,
    DEFAULT_SPACES,
  );
  assert.equal(r.items.length, 3);
  assert.equal(r.items[0].room, 'savannah-bedroom');
  assert.equal(r.items[0].spaceId, 'home'); // a room means the Home space
  assert.deepEqual(r.items[0].grab, { item: 'bin bag', fromRoom: 'kitchen' });
  assert.equal(r.items[1].at, '2026-11-17T08:15');
  assert.deepEqual(r.items[1].repeatDays, [1, 2, 5]);
  assert.equal(r.items[2].room, undefined);
  assert.deepEqual(r.notes, ['Focus note: want a bigger clock']);
});

test('shopping goes to the Shopping space in aisle groups, personal notes go private', () => {
  const r = normalise(
    {
      items: [
        { title: 'Bananas', kind: 'buy', list: 'food', group: 'fruit and veg' },
        { title: 'Mystery item', kind: 'buy', group: 'nonsense' },
        { title: 'Winter boots for Sav', kind: 'buy', list: 'other', group: 'clothes' },
        { title: 'Felt flat after the call today', kind: 'note', space_id: 'jobs' },
        { title: 'Chase recruiter', kind: 'task', space_id: 'jobs' },
        { title: 'Made up space', kind: 'task', space_id: 'nope' },
      ],
    },
    DEFAULT_SETTINGS,
    DEFAULT_SPACES,
  );
  const [a, b, c, d, e, f] = r.items;
  assert.deepEqual([a.spaceId, a.list, a.group], ['shopping', 'food', 'Fruit and veg']);
  assert.equal(b.group, 'Household');
  assert.deepEqual([c.list, c.group], ['other', 'Clothes']);
  assert.deepEqual([d.kind, d.spaceId], ['note', 'me']);
  assert.equal(e.spaceId, 'jobs');
  assert.equal(f.spaceId, undefined);
});

test('a renamed space keeps its id, so sorting still finds it', () => {
  const spaces = DEFAULT_SPACES.map((s) => (s.id === 'jobs' ? { ...s, name: 'Work' } : s));
  const r = normalise({ items: [{ title: 'Prep for Monday', kind: 'task', space_id: 'jobs' }] }, DEFAULT_SETTINGS, spaces);
  assert.equal(r.items[0].spaceId, 'jobs');
});

test('old saved data upgrades: string rooms become rooms with floors', () => {
  const m = migrate({ tasks: [], notes: [], settings: { ...DEFAULT_SETTINGS, rooms: ['Kitchen', 'Garage'] } });
  assert.deepEqual(m.settings.rooms, [{ name: 'Kitchen', floor: 'down' }, { name: 'Garage', floor: '' }]);
  assert.equal(m.spaces.length, DEFAULT_SPACES.length);
});

test('Saturday diary entry mentioning dad means Sav is away', () => {
  const ev = (title: string, start: string, end: string) => ({ id: title, title, start: new Date(start), end: new Date(end), allDay: false, calendar: '' });
  const events = [ev("Sav at her dad's", '2026-11-21T09:00', '2026-11-21T18:00'), ev('Daddy day care class', '2026-11-28T10:00', '2026-11-28T11:00')];
  assert.ok(savAwayOn(events, '2026-11-21', ['dad']));
  assert.equal(savAwayOn(events, '2026-11-22', ['dad']), undefined);
  assert.equal(savAwayOn(events, '2026-11-28', ['dad']), undefined); // "Daddy" is not "dad"
  assert.equal(savAwayOn(events, '2026-11-21', []), undefined);
});

import { applySetup, DINNER, HOUSE_RESET, JOB_DEADLINES, PROJECTS, SAFETY_ROUND, STARTERS } from '../src/lib/seed';
import { plan } from '../src/lib/nudges';
import { savSaturday } from '../src/lib/views';
import { savAwayByPattern } from '../src/lib/time';

test('every other Saturday from 21 Nov is her dad\'s', () => {
  const s = DEFAULT_SETTINGS;
  assert.equal(savAwayByPattern(s, '2026-11-21'), true);
  assert.equal(savAwayByPattern(s, '2026-11-28'), false);
  assert.equal(savAwayByPattern(s, '2026-12-05'), true);
  assert.equal(savAwayByPattern(s, '2026-11-22'), false); // a Sunday never counts
  assert.equal(savAwayByPattern(s, '2027-04-03'), false); // across the clocks changing
  assert.equal(savAwayByPattern(s, '2027-04-10'), true);
});

test('a diary entry beats the pattern', () => {
  const ev = { id: '1', title: "Sav at dad's", start: new Date('2026-11-28T09:00'), end: new Date('2026-11-28T18:00'), allDay: false, calendar: '' };
  assert.deepEqual(savSaturday([ev], '2026-11-28', DEFAULT_SETTINGS), { away: true, from: 'diary' });
  assert.deepEqual(savSaturday([], '2026-11-28', DEFAULT_SETTINGS), { away: false, from: 'pattern' });
  assert.equal(savSaturday([], '2026-11-27', DEFAULT_SETTINGS), null);
});

test('setup adds the starter week once, and Saturday gym only on her dad\'s Saturdays', () => {
  let n = 0;
  const mk = () => `id${n++}`;
  const base = migrate({ tasks: [], notes: [], settings: { ...DEFAULT_SETTINGS, dayEnd: '21:30', bufferMin: 10, setupVersion: 0 } });
  const once = applySetup(base, new Date('2026-11-18T15:00'), mk);
  assert.equal(once.tasks.length, STARTERS.length + HOUSE_RESET.length + SAFETY_ROUND.length + PROJECTS.length + JOB_DEADLINES.length + 1 + DINNER.length);
  assert.equal(once.settings.dayEnd, '22:30');
  assert.equal(applySetup(once, new Date(), mk), once); // second run does nothing
  const sat21 = agendaFor(once, '2026-11-21').map((a) => a.task.seed);
  const sat28 = agendaFor(once, '2026-11-28').map((a) => a.task.seed);
  assert.ok(sat21.includes('gym-saturday') && !sat21.includes('sav-dinner'));
  assert.ok(!sat28.includes('gym-saturday') && sat28.includes('sav-dinner'));
  // Weekday: leave for nursery 07:35 (08:00 minus 20 travel minus 5 buffer), up by 06:35.
  const drop = agendaFor(once, '2026-11-19').find((a) => a.task.seed === 'nursery-drop')!;
  assert.equal(fmtTime(drop.leaveAt!), '07:35');
  assert.equal(fmtTime(wakeFor(once, '2026-11-19')!.wake), '06:35');
});

test('nudges repeat until the next job or checkpoint, and stop once ticked', () => {
  let n = 0;
  const st = applySetup(migrate({}), new Date('2026-11-18T08:00'), () => `id${n++}`);
  const now = new Date('2026-11-25T09:00'); // a nursery day
  const cook = (s: typeof st) => plan(s, now).filter((p) => p.title.includes('Cook dinner') && p.at.getDate() === 25);
  // Every 15 minutes from 16:00, quiet once it's time to leave for pick up at 16:50.
  assert.deepEqual(cook(st).map((p) => fmtTime(p.at)), ['16:00', '16:15', '16:30', '16:45']);
  assert.ok(cook(st).every((p) => p.thread === cook(st)[0].thread)); // one stack in the tray
  const id = st.tasks.find((t) => t.seed === 'cook-weekday')!.id;
  const ticked = { ...st, tasks: st.tasks.map((t) => (t.id === id ? { ...t, doneDays: ['2026-11-25'] } : t)) };
  assert.equal(cook(ticked).length, 0);
  const snoozed = { ...st, tasks: st.tasks.map((t) => (t.id === id ? { ...t, snoozeUntil: new Date('2026-11-25T16:20').toISOString() } : t)) };
  assert.deepEqual(cook(snoozed).map((p) => fmtTime(p.at)), ['16:20', '16:45']); // then quiet at 16:50
});

test('no made-up times: house jobs get gentle next-up check-ins, never "still to do" nags', () => {
  let n = 0;
  const st = applySetup(migrate({}), new Date('2026-11-18T08:00'), () => `id${n++}`);
  const p = plan(st, new Date('2026-11-25T08:00'));
  assert.ok(!p.some((x) => x.title.startsWith('Still to do: Tidy one room')));
  const next = p.filter((x) => x.title.startsWith('Next up:') && x.at.getDate() === 25);
  assert.ok(next.length >= 2);
  assert.ok(next.every((x) => !x.loud && x.thread === 'next'));
  // Evening ones wait for Sav's bedtime.
  const kitchen = st.tasks.find((t) => t.seed === 'kitchen')!;
  assert.equal(kitchen.after, '19:30');
});

test('a deadline counts back loudly: start by, an hour left, due now', () => {
  let n = 0;
  const st = applySetup(migrate({}), new Date('2026-11-18T08:00'), () => `id${n++}`);
  const w = plan(st, new Date('2026-11-19T21:00')).filter((x) => x.title.includes('Whittington written exercise') && x.thread !== 'next');
  assert.deepEqual(w.map((x) => [fmtTime(x.at), x.title.split(':')[0], !!x.loud]), [
    ['09:15', 'Time to start', true],
    ['11:00', '1 hour left', true],
    ['12:00', 'Due now', true],
  ]);
});

test('a checkpoint ends nudges about earlier jobs', () => {
  let n = 0;
  const st = applySetup(migrate({}), new Date('2026-11-18T08:00'), () => `id${n++}`);
  const job = { id: 'late-job', title: 'Bathroom: wipe the sink', kind: 'task' as const, createdAt: '', done: false, nag: true, at: '2026-11-25T19:10' };
  const withJob = { ...st, tasks: [...st.tasks, job] };
  const p = plan(withJob, new Date('2026-11-25T09:00')).filter((x) => x.title.includes('wipe the sink'));
  // 19:10 and 19:25, then Sav is asleep at 19:30: no more about the bathroom.
  assert.deepEqual(p.map((x) => fmtTime(x.at)), ['19:10', '19:25']);
});

test('Thursday 19 Nov: house first, routine job blocks skipped, deadlines kept, nothing double booked', () => {
  let n = 0;
  const st = applySetup(migrate({}), new Date('2026-11-18T16:00'), () => `id${n++}`);
  const thu = agendaFor(st, '2026-11-19');
  const thuList = tasksFor(st, '2026-11-19');
  assert.ok(!thuList.some((t) => t.spaceId === 'jobs' && t.flex)); // Thursday is all house
  assert.ok(tasksFor(st, '2026-11-20').some((t) => t.seed === 'job-hmpps'));
  // House jobs have no made-up times now: they're in the day's list, in order, not the timed plan.
  assert.ok(thuList.some((t) => t.seed === 'hr-kitchen-wash'));
  assert.ok(!thu.some((a) => a.task.seed === 'hr-kitchen-wash'));
  assert.ok(tasksFor(st, '2026-11-23').some((t) => t.seed === 'jobs-apply')); // routine back next week
  for (const day of ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24']) {
    const items = agendaFor(st, day);
    for (let i = 1; i < items.length; i++) {
      const prev = items[i - 1];
      const end = prev.at.getTime() + (prev.task.estimateMin ?? 0) * 60000;
      assert.ok(end <= items[i].at.getTime(), `${day}: ${prev.task.title} runs into ${items[i].task.title}`);
    }
  }
  assert.ok(!tasksFor(st, '2026-11-19').some((t) => t.someday));
  // The safety round from Wednesday carries over if it isn't done.
  assert.equal(tasksFor(st, '2026-11-19').filter((t) => t.seed?.startsWith('safety')).length, SAFETY_ROUND.length);
  // The everyday tidy slot waits until the reset is through.
  assert.ok(!thuList.some((t) => t.seed === 'tidy-room'));
  assert.ok(tasksFor(st, '2026-11-25').some((t) => t.seed === 'tidy-room'));
});

test('evenings with Sav: no house jobs between 17:30 and 19:30', () => {
  let n = 0;
  const st = applySetup(migrate({}), new Date('2026-11-18T16:00'), () => `id${n++}`);
  for (const day of ['2026-11-19', '2026-11-20', '2026-11-22', '2026-11-23']) {
    for (const a of agendaFor(st, day)) {
      const h = a.at.getHours() * 60 + a.at.getMinutes();
      if (a.task.spaceId === 'home' && !a.task.seed?.startsWith('hr-sav-teddies'))
        assert.ok(h < 17 * 60 + 30 || h >= 19 * 60 + 30, `${day}: ${a.task.title} at ${fmtTime(a.at)}`);
    }
  }
});

test('stopping with some left splits what is left into jobs', async () => {
  const { splitLeftovers } = await import('../src/components/Session.split');
  assert.deepEqual(splitLeftovers('put the clean dishes away, wash the second load and bin the rest; then wipe the hob'), [
    'Put the clean dishes away',
    'Wash the second load and bin the rest',
    'Wipe the hob',
  ]);
});

test('dinner is cooked before pick up on nursery days', () => {
  let n = 0;
  const st = applySetup(migrate({}), new Date('2026-11-18T16:00'), () => `id${n++}`);
  const thu = agendaFor(st, '2026-11-19');
  const pick = thu.find((a) => a.task.seed === 'nursery-pickup')!;
  assert.equal(fmtTime(pick.at), '17:15');
  assert.equal(fmtTime(pick.leaveAt!), '16:50');
  const cook = thu.find((a) => a.task.seed === 'cook-weekday')!;
  assert.equal(fmtTime(cook.at), '16:00');
  assert.ok(cook.at.getTime() + (cook.task.estimateMin ?? 0) * 60000 <= pick.leaveAt!.getTime()); // done before leaving
  assert.ok(!agendaFor(st, '2026-11-21').some((a) => a.task.seed === 'cook-weekend')); // Sav's with her dad
  assert.ok(agendaFor(st, '2026-11-21').some((a) => a.task.seed === 'dinner-me'));
  assert.ok(agendaFor(st, '2026-11-22').some((a) => a.task.seed === 'cook-weekend'));
});

test('how it went: compares with last time and says well done', async () => {
  const { howItWent } = await import('../src/lib/support');
  const t = { id: 'k', title: 'Kitchen', kind: 'task', createdAt: '', done: false, history: [{ day: '2026-11-18', min: 90 }] } as any;
  const lines = howItWent(t, 55, true);
  assert.match(lines[0], /35 min quicker/);
  assert.match(lines[1], /Well done/);
});

test('a job ticked just after midnight in summer time counts for that day', () => {
  // 00:30 BST on 15 June is 23:30 UTC on 14 June.
  const t = { id: 'x', title: 'x', kind: 'task' as const, createdAt: '', done: true, doneAt: '2026-06-14T23:30:00.000Z', day: '2026-06-15' };
  const st = { ...migrate({}), tasks: [t] };
  assert.ok(tasksFor(st, '2026-06-15').some((x) => x.id === 'x'));
  assert.ok(!tasksFor(st, '2026-06-14').some((x) => x.id === 'x'));
});

test("rooms with an apostrophe match everywhere: Sav's room and Sav’s room", () => {
  assert.equal(slug("Sav's room"), 'savs-room');
  assert.equal(slug('Sav’s room'), 'savs-room');
});
