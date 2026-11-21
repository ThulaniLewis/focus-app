import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markWith } from '../src/lib/marks';
import type { Task } from '../src/lib/types';

const t = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, kind: 'task', createdAt: '', done: false, ...extra });

test('a room round ticks some, starts some, leaves the rest', () => {
  const tick = markWith(['sofa'], ['floor'], '2026-11-19');
  const [sofa, floor, shelf, kitchen] = [t('sofa'), t('floor'), t('shelf'), t('kitchen', { repeatDays: [4], doneDays: [] })].map(tick);
  assert.equal(sofa.done, true);
  assert.equal(sofa.partial, false);
  assert.equal(floor.done, true);
  assert.equal(floor.partial, true); // shows as "Started, some left"
  assert.equal(shelf.done, false);
  assert.deepEqual(kitchen.doneDays, []);
});

test('repeating jobs are marked for that day only', () => {
  const k = markWith([], ['k'], '2026-11-19')(t('k', { repeatDays: [4], doneDays: ['2026-11-12'] }));
  assert.deepEqual(k.doneDays, ['2026-11-12', '2026-11-19']);
  assert.deepEqual(k.partialDays, ['2026-11-19']);
});

import { plan } from '../src/lib/nudges';
import { DEFAULT_SETTINGS, DEFAULT_SPACES } from '../src/lib/types';

test('a promised come back nudge is scheduled', () => {
  const now = new Date('2026-11-19T13:40:00');
  const at = new Date(now.getTime() + 15 * 60000).toISOString();
  const state = { tasks: [], notes: [], spaces: DEFAULT_SPACES, checkins: [], settings: { ...DEFAULT_SETTINGS, comeBack: { at, title: 'Ready to go again?', body: 'x', kind: 'break' as const } } };
  const p = plan(state, now).find((x) => x.title === 'Ready to go again?');
  assert.ok(p);
  assert.equal(p!.at.toISOString(), at);
});
