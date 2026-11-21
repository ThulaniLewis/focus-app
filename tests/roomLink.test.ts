import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roomFromLink } from '../src/lib/roomLink';

test('room links', () => {
  assert.equal(roomFromLink('focus://room/kitchen'), 'kitchen');
  assert.equal(roomFromLink('focus:///room/living-room'), 'living-room');
  assert.equal(roomFromLink('focus://room/Living%20room'), 'living-room');
  assert.equal(roomFromLink('focus://room/kitchen/'), 'kitchen');
  assert.equal(roomFromLink('focus://room/sav-s-room?x=1'), 'sav-s-room');
  assert.equal(roomFromLink('exp+focus://room/toilet'), 'toilet');
  assert.equal(roomFromLink('focus://auth#access_token=x'), null);
  assert.equal(roomFromLink('https://example.com/room/kitchen'), null);
  assert.equal(roomFromLink(null), null);
});

import { hallwayLast, isLastRoom } from '../src/lib/time';

test('hallway comes last while other rooms are open', () => {
  const jobs = [{ r: 'hallway' }, { r: 'living-room' }, { r: undefined }, { r: 'kitchen' }];
  assert.deepEqual(hallwayLast(jobs, (j) => j.r).map((j) => j.r), ['living-room', undefined, 'kitchen', 'hallway']);
  assert.deepEqual(hallwayLast([{ r: 'hallway' }, { r: undefined }], (j) => j.r).map((j) => j.r), ['hallway', undefined]);
  assert.equal(isLastRoom('entrance'), true);
  assert.equal(isLastRoom('kitchen'), false);
});
