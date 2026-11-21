import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claimHighlight, requestHighlight } from '../src/lib/highlight';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('a row on screen claims the tap, so no fallback', async () => {
  let fell = false;
  requestHighlight('laundry', () => (fell = true), 30);
  claimHighlight('laundry');
  await wait(50);
  assert.equal(fell, false);
});

test('no row on screen: the job options open instead', async () => {
  let fell = false;
  requestHighlight('laundry-yesterday', () => (fell = true), 30);
  await wait(50);
  assert.equal(fell, true);
});
