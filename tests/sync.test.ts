import { test } from 'node:test';
import assert from 'node:assert/strict';
import { afterPush, applyRemote, localRows, toPush } from '../src/lib/sync';
import { applySetup } from '../src/lib/seed';
import { migrate } from '../src/lib/migrate';
import type { State, Task } from '../src/lib/types';

const fresh = (prefix: string) => {
  let n = 0;
  return applySetup(migrate({}), new Date('2026-11-18T08:00'), () => `${prefix}${n++}`);
};
const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, kind: 'task', createdAt: '', done: false, ...extra });

test('private things never leave the phone', () => {
  const s: State = { ...fresh('p'), tasks: [task('a', { spaceId: 'home' }), task('secret', { spaceId: 'me' }), task('bill', { spaceId: 'money' })] };
  const rows = toPush(s, {});
  const ids = rows.map((r) => r.id);
  assert.ok(ids.includes('t:a'));
  assert.ok(!ids.some((id) => id.includes('secret') || id.includes('bill')));
  const spaces = rows.find((r) => r.id === 'spaces')!.data as { id: string }[];
  assert.ok(!spaces.some((sp) => sp.id === 'me' || sp.id === 'money'));
  const settingRows = rows.filter((r) => r.kind === 'settings');
  assert.ok(settingRows.length > 0);
  for (const r of settingRows) {
    assert.ok(r.id.startsWith('s:'));
    assert.ok(!('momentumLog' in r.data) && !('comeBack' in r.data) && !('model' in r.data));
  }
  assert.ok(!ids.some((id) => /momentumLog|comeBack|model/.test(id)));
});

test('only changes are sent after the first sync', () => {
  const s: State = { ...fresh('p'), tasks: [task('a'), task('b')] };
  const shadow = afterPush({}, toPush(s, {}));
  assert.equal(toPush(s, shadow).length, 0);
  const changed = { ...s, tasks: [{ ...s.tasks[0], done: true }, s.tasks[1]] };
  assert.deepEqual(toPush(changed, shadow).map((r) => r.id), ['t:a']);
  const deleted = { ...s, tasks: [s.tasks[1]] };
  assert.deepEqual(toPush(deleted, shadow).map((r) => [r.id, r.deleted]), [['t:a', true]]);
});

test('the phone joining after the tablet keeps its ticks and its own jobs', () => {
  const tablet = fresh('tablet');
  const rows = toPush(tablet, {}).map((r) => ({ ...r, updated_by: 'tablet' }));
  const phone0 = fresh('phone');
  const kitchen = phone0.tasks.find((t) => t.seed === 'kitchen')!;
  const phone: State = {
    ...phone0,
    tasks: [...phone0.tasks.map((t) => (t.id === kitchen.id ? { ...t, doneDays: ['2026-11-19'] } : t)), task('mine', { spaceId: 'home' })],
  };
  const { state, shadow } = applyRemote(phone, {}, rows, { firstSync: true });
  const k = state.tasks.filter((t) => t.seed === 'kitchen');
  assert.equal(k.length, 1);
  assert.deepEqual(k[0].doneDays, ['2026-11-19']); // the phone's tick survives
  assert.ok(state.tasks.some((t) => t.id === 'mine'));
  // And the phone's versions get sent up, so the tablet catches up.
  assert.ok(toPush(state, shadow).some((r) => r.id === `t:${k[0].id}`));
});

test('the tablet joining takes the phone list, so starter jobs are not doubled', () => {
  const phone = fresh('phone');
  const rows = toPush(phone, {}).map((r) => ({ ...r, updated_by: 'phone' }));
  const tablet = fresh('tablet');
  const { state } = applyRemote(tablet, {}, rows, { firstSync: true });
  const shared = (st: State) => st.tasks.filter((t) => t.spaceId !== 'me' && t.spaceId !== 'money');
  assert.equal(shared(state).length, shared(phone).length);
  assert.ok(state.tasks.every((t) => !t.id.startsWith('tablet') || t.spaceId === 'me' || t.spaceId === 'money'));
});

test('a tick on one device shows on the other; an unsent change here wins', () => {
  const s: State = { ...fresh('p'), tasks: [task('a'), task('b')] };
  const shadow = afterPush({}, toPush(s, {}));
  const fromTablet = [{ id: 't:a', kind: 'task' as const, data: { ...s.tasks[0], done: true }, updated_by: 'tablet' }];
  const r1 = applyRemote(s, shadow, fromTablet);
  assert.equal(r1.state.tasks.find((t) => t.id === 'a')!.done, true);
  // Nothing to send back afterwards.
  assert.equal(toPush(r1.state, r1.shadow).length, 0);
  // If this device changed "a" and hasn't sent it yet, keep this device's version.
  const mine = { ...s, tasks: [{ ...s.tasks[0], title: 'renamed here' }, s.tasks[1]] };
  const r2 = applyRemote(mine, shadow, fromTablet);
  assert.equal(r2.state.tasks.find((t) => t.id === 'a')!.title, 'renamed here');
});

test('a delete on the other device removes it here, private things are never touched', () => {
  const s: State = { ...fresh('p'), tasks: [task('a'), task('secret', { spaceId: 'me' })] };
  const shadow = afterPush({}, toPush(s, {}));
  const r = applyRemote(s, shadow, [
    { id: 't:a', kind: 'task', data: null, deleted: true },
    { id: 't:secret', kind: 'task', data: null, deleted: true },
  ]);
  assert.deepEqual(r.state.tasks.map((t) => t.id), ['secret']);
});

test('shared settings come across, phone-only settings stay (old single settings row)', () => {
  const s = fresh('p');
  const shadow = afterPush({}, toPush(s, {}));
  const r = applyRemote(s, shadow, [{ id: 'settings', kind: 'settings', data: { dayEnd: '23:00', model: 'evil' } }]);
  assert.equal(r.state.settings.dayEnd, '23:00');
  assert.equal(r.state.settings.model, s.settings.model);
  assert.ok(localRows(r.state).get('s:dayEnd'));
  // Taken in full: nothing to send back.
  assert.equal(toPush(r.state, r.shadow).length, 0);
});

test('each setting is its own row, so changes to different settings on each device both survive', () => {
  const s = fresh('p');
  const shadow = afterPush({}, toPush(s, {}));
  // The phone changes dayEnd and hasn't sent it yet; the tablet changed bufferMin.
  const phone = { ...s, settings: { ...s.settings, dayEnd: '21:15' } };
  assert.notEqual(s.settings.dayEnd, '21:15');
  const r = applyRemote(phone, shadow, [{ id: 's:bufferMin', kind: 'settings', data: { bufferMin: 25 }, updated_by: 'tablet' }]);
  assert.equal(r.state.settings.bufferMin, 25);
  assert.equal(r.state.settings.dayEnd, '21:15');
  // Only the phone's own change goes up.
  assert.deepEqual(toPush(r.state, r.shadow).map((x) => x.id), ['s:dayEnd']);
  // A phone-only setting can't come in through a per-setting row.
  const evil = applyRemote(s, shadow, [{ id: 's:model', kind: 'settings', data: { model: 'evil' } }]);
  assert.equal(evil.state.settings.model, s.settings.model);
});

test('an echo of what is already here returns the same state', () => {
  const s = fresh('p');
  const shadow = afterPush({}, toPush(s, {}));
  const rows = toPush(s, {}).map((x) => ({ ...x, updated_by: 'tablet' }));
  assert.equal(applyRemote(s, shadow, rows).state, s);
});
