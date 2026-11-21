import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURES, featureOn, switchFeature } from '../src/lib/features';
import { localRows, toPush } from '../src/lib/sync';
import { migrate } from '../src/lib/migrate';
import { DEFAULT_SETTINGS, DEFAULT_SPACES, type State } from '../src/lib/types';

const state = (extra: Partial<State> = {}): State => ({ tasks: [], notes: [], spaces: DEFAULT_SPACES, checkins: [], settings: DEFAULT_SETTINGS, ...extra });

test('every feature is on until switched off', () => {
  for (const f of FEATURES) assert.equal(featureOn(DEFAULT_SETTINGS, f.id), true, f.id);
});

test('switching one feature off leaves the others on, and it can come back', () => {
  const off = { ...DEFAULT_SETTINGS, ...switchFeature(DEFAULT_SETTINGS, 'sleep', false) };
  assert.equal(featureOn(off, 'sleep'), false);
  assert.equal(featureOn(off, 'punctuality'), true);
  const back = { ...off, ...switchFeature(off, 'sleep', true) };
  assert.equal(featureOn(back, 'sleep'), true);
});

test('feature ids are unique and every one has a name', () => {
  const ids = FEATURES.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const f of FEATURES) assert.ok(f.name && f.about);
});

test('switches stay on this device: never in what syncs', () => {
  const s = state({ settings: { ...DEFAULT_SETTINGS, ...switchFeature(DEFAULT_SETTINGS, 'sleep', false) } });
  const shared = JSON.stringify([...localRows(s).values(), ...toPush(s, {})]);
  assert.ok(!shared.includes('"features"'));
});

test('switches survive a reload', () => {
  const saved = JSON.parse(JSON.stringify(state({ settings: { ...DEFAULT_SETTINGS, features: { punctuality: false } } })));
  const back = migrate(saved);
  assert.equal(featureOn(back.settings, 'punctuality'), false);
});
