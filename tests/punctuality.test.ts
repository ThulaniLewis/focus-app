import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTracked, logAnswer, notYetUntil, patternLine, suggestDropTime, unlogAnswer, withTime } from '../src/lib/punctuality';
import { localRows } from '../src/lib/sync';
import { agendaFor, wakeFor } from '../src/lib/time';
import { DEFAULT_SETTINGS, DEFAULT_SPACES, type State, type Task } from '../src/lib/types';

const drop: Task = {
  id: 'drop',
  seed: 'nursery-drop',
  title: 'Drop Sav at nursery',
  kind: 'task',
  at: '2026-11-16T08:00',
  repeatDays: [1, 2, 3, 4, 5],
  place: 'Nursery',
  spaceId: 'sav',
  createdAt: '',
  done: false,
};
const state = (extra: Partial<State['settings']> = {}): State => ({
  tasks: [drop],
  notes: [],
  spaces: DEFAULT_SPACES,
  checkins: [],
  settings: { ...DEFAULT_SETTINGS, ...extra },
});
const days = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'];
const logOf = (late: number[]) => late.reduce((log, m, i) => logAnswer(log, drop, days[i], m, new Date(`${days[i]}T09:00`)), [] as ReturnType<typeof logAnswer>);

test('only fixed times with a place are asked about', () => {
  assert.equal(isTracked(drop), true);
  assert.equal(isTracked({ ...drop, place: undefined }), false);
  assert.equal(isTracked({ ...drop, flex: true }), false);
});

test('the pattern, said kindly, and only after three answers', () => {
  assert.equal(patternLine(logOf([20, 0]), 'nursery-drop'), null);
  assert.equal(patternLine(logOf([20, 20, 0, 30, 10]), 'nursery-drop'), "Late 4 of the last 5, by about 20 minutes. That's just information, not a telling off.");
  assert.equal(patternLine(logOf([0, 0, 0, 0, 0]), 'nursery-drop'), 'On time 5 of the last 5. Nicely done.');
  assert.equal(patternLine(logOf([0, 5, 0]), 'nursery-drop'), 'On time 2 of the last 3.');
});

test('answering again the same day replaces it; un-ticking removes it', () => {
  let log = logAnswer([], drop, '2026-11-20', 20, new Date());
  log = logAnswer(log, drop, '2026-11-20', 0, new Date());
  assert.deepEqual(log.map((e) => e.lateMin), [0]);
  assert.equal(unlogAnswer(log, drop, '2026-11-20').length, 0);
});

test('a drop-off time that fits: after five, late at least three, inside nursery\'s window', () => {
  const now = new Date('2026-11-20T19:00');
  assert.equal(suggestDropTime(state({ punctualityLog: logOf([20, 20, 0, 30]) }), drop, now), null); // only four
  assert.equal(suggestDropTime(state({ punctualityLog: logOf([20, 0, 0, 30, 0]) }), drop, now), null); // late only twice
  const s = suggestDropTime(state({ punctualityLog: logOf([20, 20, 0, 30, 10]) }), drop, now)!;
  assert.equal(s.time, '08:20'); // usual arrival 08:20
  // Very late: kept inside the window (08:30 at the latest).
  assert.equal(suggestDropTime(state({ punctualityLog: logOf([30, 30, 30, 30, 30]) }), drop, now)!.time, '08:30');
  // "Not yet" waits a week.
  const later = state({ punctualityLog: logOf([20, 20, 0, 30, 10]), punctualityNotYet: { 'nursery-drop': notYetUntil(now) } });
  assert.equal(suggestDropTime(later, drop, now), null);
  assert.ok(suggestDropTime(later, drop, new Date('2026-11-28T19:00')));
});

test('accepting moves the leave-by and get-up times with it', () => {
  const before = state({ places: [{ id: 'nursery', name: 'Nursery', travelMin: 20 }] });
  const after = { ...before, tasks: [withTime(drop, '08:20')] };
  const day = '2026-11-23'; // a Monday
  const b = agendaFor(before, day)[0];
  const a = agendaFor(after, day)[0];
  assert.equal(a.at.getTime() - b.at.getTime(), 20 * 60000);
  assert.equal(a.leaveAt!.getTime() - b.leaveAt!.getTime(), 20 * 60000);
  assert.equal(wakeFor(after, day)!.wake.getTime() - wakeFor(before, day)!.wake.getTime(), 20 * 60000);
});

test('the on time log syncs (not private), the "still to ask" list stays on the device', () => {
  const s = state({ punctualityLog: logOf([20]), punctualityAsk: [{ taskId: 'drop', day: '2026-11-20' }] });
  const rows = JSON.stringify([...localRows(s).values()]);
  assert.ok(rows.includes('nursery-drop'));
  assert.ok(!rows.includes('punctualityAsk'));
});
