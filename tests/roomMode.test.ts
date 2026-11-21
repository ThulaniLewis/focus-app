import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avoidFirst, firstStep, jobSubline, lastTimeLine, logAvoid, nextDadSaturday, roomJobs, roundEstimateMin, startLabel } from '../src/lib/roomMode';
import { localRows, toPush } from '../src/lib/sync';
import { DEFAULT_SETTINGS, DEFAULT_SPACES, type State, type Task } from '../src/lib/types';

const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, kind: 'task', createdAt: '', done: false, ...extra });
const state = (tasks: Task[], settings: Partial<State['settings']> = {}): State => ({
  tasks,
  notes: [],
  spaces: DEFAULT_SPACES,
  checkins: [],
  settings: { ...DEFAULT_SETTINGS, ...settings },
});

test('the start button: "Start your bedroom" for her own room, real capitals otherwise', () => {
  assert.equal(startLabel(DEFAULT_SETTINGS, 'thulani-bedroom'), 'Start your bedroom');
  assert.equal(startLabel(DEFAULT_SETTINGS, 'kitchen'), 'Start the Kitchen');
  assert.equal(startLabel(DEFAULT_SETTINGS, 'savannah-bedroom'), 'Start the Savannah Bedroom');
  assert.equal(startLabel(DEFAULT_SETTINGS, 'living-room'), 'Start the Living room');
});

test('"Last time it took" comes from the latest round of that room, and hides with no history', () => {
  assert.equal(lastTimeLine({ roundLog: [] }, 'kitchen'), null);
  const roundLog = [
    { room: 'kitchen', day: '2026-11-17', min: 40, done: 3 },
    { room: 'bathroom', day: '2026-11-18', min: 12, done: 2 },
    { room: 'kitchen', day: '2026-11-19', min: 32, done: 4 },
  ];
  assert.equal(lastTimeLine({ roundLog }, 'kitchen'), 'Last time it took 32 min. Do them in any order.');
  assert.equal(lastTimeLine({ roundLog }, 'toilet'), null);
});

test('the round estimate: past rounds first, otherwise the jobs added up', () => {
  const now = new Date('2026-11-20T19:45');
  const s = state([
    task('a', { room: 'kitchen', estimateMin: 10, day: '2026-11-20' }),
    task('b', { room: 'kitchen', estimateMin: 15, day: '2026-11-20' }),
    // Cooking at a real time isn't part of the tidy round.
    task('cook', { kind: 'event', room: 'kitchen', estimateMin: 60, at: '2026-11-20T18:00' }),
  ]);
  assert.equal(roundEstimateMin(s, 'kitchen', now), 25);
  const withLog = { ...s, settings: { ...s.settings, roundLog: [{ room: 'kitchen', day: '2026-11-19', min: 30, done: 2 }, { room: 'kitchen', day: '2026-11-18', min: 36, done: 2 }] } };
  assert.equal(roundEstimateMin(withLog, 'kitchen', now), 33);
});

test('room jobs: done ones sink to the bottom with their time, private ones never show', () => {
  const now = new Date('2026-11-20T09:00');
  const s = state([
    task('done', { room: 'kitchen', day: '2026-11-20', done: true, doneAt: new Date('2026-11-20T07:20').toISOString() }),
    task('open', { room: 'kitchen', day: '2026-11-20', estimateMin: 10 }),
    task('secret', { room: 'kitchen', day: '2026-11-20', spaceId: 'me' }),
    task('elsewhere', { room: 'bathroom', day: '2026-11-20' }),
  ]);
  const jobs = roomJobs(s, 'kitchen', now);
  assert.deepEqual(jobs.map((j) => j.task.id), ['open', 'done']);
  assert.equal(jobs[0].sub, 'About 10 min');
  assert.equal(jobs[1].doneAt, '07:20');
});

test('the grey line: a real time, after bedtime, or how long', () => {
  assert.equal(jobSubline(task('a', { at: '2026-11-20T18:00' })), '18:00');
  assert.equal(jobSubline(task('a', { after: '19:30', estimateMin: 10 })), "After Sav's in bed");
  assert.equal(jobSubline(task('a', { estimateMin: 10 })), 'About 10 min');
  assert.equal(jobSubline(task('a', { at: '2026-11-20T20:00', flex: true })), '');
});

test('a first step comes from the job when it has parts', () => {
  assert.equal(firstStep({ title: 'Kitchen: dishes into the sink, wipe the sides' }), 'Dishes into the sink');
  assert.equal(firstStep({ title: 'Hoover' }), null);
  assert.equal(firstStep({ title: 'Bin the old food', grab: { item: 'a bin bag', fromRoom: 'kitchen' } }), 'Grab a bin bag from the kitchen');
});

test('avoidance logging stays on the phone: never in what syncs', () => {
  const now = new Date('2026-11-20T19:45');
  const momentumLog = logAvoid([], 'kitchen', now, 'too-much');
  assert.deepEqual(momentumLog.map((m) => [m.room, m.choice, m.reason]), [['kitchen', 'avoid', 'too-much']]);
  const s = state([], { momentumLog });
  const rows = [...localRows(s).values()];
  assert.ok(!JSON.stringify(rows).includes('too-much'));
  assert.ok(!JSON.stringify(toPush(s, {})).includes('momentumLog'));
});

test('three days avoided or skipped running: offer the sheet first, until a round is done', () => {
  const at = (d: string) => new Date(`${d}T20:00`);
  let log = logAvoid([], 'kitchen', at('2026-11-17'));
  log = logAvoid(log, 'kitchen', at('2026-11-18'), undefined, 'skip');
  assert.equal(avoidFirst({ momentumLog: log }, 'kitchen', new Date('2026-11-19T10:00')), false); // only two
  log = logAvoid(log, 'kitchen', at('2026-11-19'), 'perfect');
  assert.equal(avoidFirst({ momentumLog: log }, 'kitchen', new Date('2026-11-20T10:00')), true);
  assert.equal(avoidFirst({ momentumLog: log }, 'bathroom', new Date('2026-11-20T10:00')), false);
  // A gap breaks the run.
  assert.equal(avoidFirst({ momentumLog: log }, 'kitchen', new Date('2026-11-22T10:00')), false);
  // Doing a round of it today clears it.
  assert.equal(avoidFirst({ momentumLog: log, roundLog: [{ room: 'kitchen', day: '2026-11-20', min: 10, done: 1 }] }, 'kitchen', new Date('2026-11-20T21:00')), false);
});

test("the next of her dad's Saturdays", () => {
  // Pattern: every 2 weeks from Saturday 21 November 2026.
  assert.equal(nextDadSaturday(DEFAULT_SETTINGS, new Date('2026-11-20T19:00')), '2026-11-21');
  assert.equal(nextDadSaturday(DEFAULT_SETTINGS, new Date('2026-11-21T19:00')), '2026-12-05');
});
