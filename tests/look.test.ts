import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schemeFor, windDownAt } from '../src/lib/look';
import { DEFAULT_SETTINGS, DEFAULT_SPACES, type State, type Task } from '../src/lib/types';

const at = (hm: string) => new Date(`2026-11-21T${hm}:00`);
const state = (tasks: Task[]): State => ({ tasks, notes: [], spaces: DEFAULT_SPACES, checkins: [], settings: DEFAULT_SETTINGS });

test('Light and Dark stay put whatever the time', () => {
  assert.equal(schemeFor('light', at('23:30'), '22:00'), 'light');
  assert.equal(schemeFor('dark', at('12:00'), '22:00'), 'dark');
});

test('Match phone: light by day, dark from wind down until morning', () => {
  assert.equal(schemeFor('match', at('06:29'), '22:00'), 'dark');
  assert.equal(schemeFor('match', at('06:30'), '22:00'), 'light');
  assert.equal(schemeFor('match', at('21:59'), '22:00'), 'light');
  assert.equal(schemeFor('match', at('22:00'), '22:00'), 'dark');
  assert.equal(schemeFor(undefined, at('23:00'), '22:00'), 'dark'); // missing means Match phone
});

test('wind down comes from the plan: move the job and dark moves with it', () => {
  const wind = (time: string): Task => ({ id: 'w', title: 'Wind down: open Focus, check tomorrow', kind: 'task', createdAt: '', done: false, seed: 'wind-down', at: `2026-11-21T${time}:00` } as Task);
  assert.equal(windDownAt(state([wind('21:15')]), '2026-11-21'), '21:15');
  assert.equal(windDownAt(state([]), '2026-11-21'), DEFAULT_SETTINGS.dayEnd); // no wind down job: end of day
});
