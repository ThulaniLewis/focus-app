import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aboutHours, addNights, applyEasierDay, asleepIn, easierDay, lastTwo, nightFor, shortNightLine } from '../src/lib/sleep';
import { localRows, toPush } from '../src/lib/sync';
import { migrate } from '../src/lib/migrate';
import { DEFAULT_SETTINGS, DEFAULT_SPACES, type State, type Task } from '../src/lib/types';

const iso = (s: string) => new Date(s).toISOString();
const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, kind: 'task', createdAt: '', done: false, ...extra });
const state = (tasks: Task[], extra: Partial<State> = {}): State => ({ tasks, notes: [], spaces: DEFAULT_SPACES, checkins: [], settings: DEFAULT_SETTINGS, ...extra });

test('asleep time leaves out the awake bits; a broken night counts as one', () => {
  const s = {
    startTime: iso('2026-11-19T23:30'),
    endTime: iso('2026-11-20T03:30'),
    stages: [
      { startTime: iso('2026-11-19T23:30'), endTime: iso('2026-11-20T02:00'), stage: 4 },
      { startTime: iso('2026-11-20T02:00'), endTime: iso('2026-11-20T02:30'), stage: 1 }, // awake
      { startTime: iso('2026-11-20T02:30'), endTime: iso('2026-11-20T03:30'), stage: 5 },
    ],
  };
  assert.equal(asleepIn(s), 210);
  const second = { startTime: iso('2026-11-20T04:30'), endTime: iso('2026-11-20T06:00') }; // no stages
  const night = nightFor([s, second, { startTime: iso('2026-11-20T14:30'), endTime: iso('2026-11-20T15:00') }], '2026-11-20')!;
  assert.equal(night.asleepMin, 300); // the afternoon nap isn't last night
  assert.equal(nightFor([], '2026-11-20'), null);
});

test('the short night line, kindly, with the night before', () => {
  const n = (day: string, h: number) => ({ day, asleepMin: h * 60, start: '', end: '' });
  assert.equal(shortNightLine(n('2026-11-20', 7), undefined), null); // not short
  assert.equal(shortNightLine(n('2026-11-20', 5), n('2026-11-19', 4)), 'A short night, about 5 hours. Better than the night before.');
  assert.equal(shortNightLine(n('2026-11-20', 4.5), n('2026-11-19', 6)), 'A short night, about 4 and a half hours. A bit less than the night before.');
  assert.equal(shortNightLine(n('2026-11-20', 5), undefined), 'A short night, about 5 hours.');
  assert.equal(aboutHours(60), 'about 1 hour');
  const s = addNights(undefined, [n('2026-11-19', 4), n('2026-11-20', 5)]);
  assert.equal(lastTwo(s, '2026-11-20').before?.day, '2026-11-19');
  assert.equal(lastTwo(s, '2026-11-21').last, undefined); // no night logged for today yet
});

const FRI = new Date('2026-11-20T08:30');
const dayTasks = [
  task('drop', { at: '2026-11-16T08:00', repeatDays: [1, 2, 3, 4, 5], place: 'Nursery', spaceId: 'sav', seed: 'nursery-drop' }),
  task('call', { kind: 'event', title: 'Call with Zak', at: '2026-11-20T12:45', estimateMin: 30 }),
  task('wind', { title: 'Wind down: open Focus, check tomorrow', at: '2026-11-16T22:00', repeatDays: [0, 1, 2, 3, 4, 5, 6], seed: 'wind-down' }),
  task('essay', { title: 'Write the statements', day: '2026-11-20', estimateMin: 105, priority: 1 }),
  task('small', { day: '2026-11-20', estimateMin: 10 }),
];

test('an easier day: a nap round fixed things, the biggest job, an earlier wind down', () => {
  const offer = easierDay(state(dayTasks), FRI);
  assert.equal(offer.nap, '13:25'); // the call runs 12:35 to 13:25 with a little room either side
  assert.equal(offer.biggest?.task.id, 'essay');
  assert.equal(offer.biggest?.saturday, '2026-11-21'); // her dad's Saturday
  assert.equal(offer.windDown?.to?.time, '21:15');
  // No nap on a weekend, or with Sav home sick.
  assert.equal(easierDay(state(dayTasks), new Date('2026-11-22T08:30')).nap, undefined);
  const sick = state(dayTasks, { settings: { ...DEFAULT_SETTINGS, dayPlans: { '2026-11-20': { savHome: true } } } });
  assert.equal(easierDay(sick, FRI).nap, undefined);
});

test('taking the offers never drops anything; wind down moves for tonight only', () => {
  const s = state(dayTasks);
  const offer = easierDay(s, FRI);
  let n = 0;
  const next = applyEasierDay(s, offer, { nap: true, biggest: 'saturday', windDown: true }, FRI, () => `new${n++}`);
  for (const t of s.tasks) assert.ok(next.tasks.some((x) => x.id === t.id));
  assert.ok(next.tasks.some((t) => t.kind === 'event' && t.at === '2026-11-20T13:25'));
  assert.equal(next.tasks.find((t) => t.id === 'essay')!.day, '2026-11-21');
  assert.deepEqual(next.tasks.find((t) => t.id === 'wind')!.skipDays, ['2026-11-20']);
  assert.ok(next.tasks.some((t) => t.title.startsWith('Wind down') && t.at === '2026-11-20T21:15' && !t.repeatDays));
  const first = applyEasierDay(s, offer, { nap: false, biggest: 'first', windDown: false }, FRI, () => 'x');
  assert.equal(first.tasks.find((t) => t.id === 'essay')!.topDay, '2026-11-20');
});

test('sleep never reaches what syncs, and survives a reload on the phone', () => {
  const s = state([], { sleep: { nights: [{ day: '2026-11-20', asleepMin: 300, start: 'x', end: 'y' }] }, sleepReading: 'yes' });
  const shared = JSON.stringify([...localRows(s).values(), ...toPush(s, {})]);
  assert.ok(!shared.includes('asleepMin') && !shared.includes('sleep'));
  const back = migrate(JSON.parse(JSON.stringify(s)));
  assert.equal(back.sleep?.nights[0].asleepMin, 300);
  assert.equal(back.sleepReading, 'yes');
});
