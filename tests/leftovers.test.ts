import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkInMessage, checkInPrompt, cleanCheckIn, type JobRef } from '../src/lib/leftovers';

const jobs: JobRef[] = [
  { ref: 'j1', id: 'bath1', title: 'Bathroom: clean the bath and sink', room: 'bathroom' },
  { ref: 'j2', id: 'bed1', title: 'My bedroom: rubbish off desk', room: 'my-bedroom' },
  { ref: 'j3', id: 'k2', title: 'Mop the floor', room: 'kitchen' },
];
const ctx = { jobs, roomSlugs: ['kitchen', 'bathroom', 'my-bedroom'], stoppedRoom: 'kitchen', today: '2026-11-19', tomorrow: '2026-11-20' };

test('the bathroom and kitchen ramble', () => {
  // What Claude should send back for: cleaned the bathroom while doing the kitchen, all clean
  // except bits on the side to take out; kitchen still has loads; bins to the dump tomorrow.
  const res = cleanCheckIn({
    this_job_done: true, // wrong on purpose: there are kitchen jobs left, so it can't be done
    done_refs: ['j1', 'j9'],
    jobs: [
      { title: 'take the stuff on the side out of the bathroom.', room: 'bathroom', need: true, when: 'today' },
      { title: 'Mop the floor', room: 'kitchen', need: true, when: 'today' }, // already open: skipped
      { title: 'Empty the fridge veg drawer', room: 'kitchen', need: true, when: 'today' },
      { title: 'Tidy then clean the sides', room: 'kitchen', need: true, when: 'today' },
      { title: 'Put the knobs back on the oven', room: 'Kitchen', need: true, when: 'today' },
      { title: 'Take the bins to the dump', room: '', need: true, when: 'tomorrow' },
      { title: 'Clear out the old cupboard', room: 'larder', need: false, when: 'today' },
    ],
    question: '',
  }, ctx);
  assert.deepEqual(res.doneIds, ['bath1']);
  assert.equal(res.thisJobDone, false);
  assert.equal(res.question, undefined);
  assert.deepEqual(res.jobs.map((j) => [j.title, j.room, j.day, j.need]), [
    ['Take the stuff on the side out of the bathroom', 'bathroom', '2026-11-19', true],
    ['Empty the fridge veg drawer', 'kitchen', '2026-11-19', true],
    ['Tidy then clean the sides', 'kitchen', '2026-11-19', true],
    ['Put the knobs back on the oven', 'kitchen', '2026-11-19', true],
    ['Take the bins to the dump', undefined, '2026-11-20', true],
    ['Clear out the old cupboard', 'kitchen', '2026-11-19', false], // unknown room falls back to the stopped room
  ]);
});

test('a question comes through, and junk input is safe', () => {
  assert.equal(cleanCheckIn({ done_refs: [], jobs: [], question: ' Is the bathroom all done? ' }, ctx).question, 'Is the bathroom all done?');
  assert.deepEqual(cleanCheckIn(null, ctx), { thisJobDone: false, doneIds: [], startedIds: [], jobs: [], question: undefined });
});

test('prompt and message', () => {
  const p = checkInPrompt({ stopped: { id: 'k1', title: 'Kitchen: dishes', kind: 'task', createdAt: '', done: false }, stoppedRoom: 'Kitchen', jobs, rooms: [{ name: 'Kitchen', slug: 'kitchen' }], today: '2026-11-19', tomorrow: '2026-11-20', canAsk: false });
  assert.match(p, /j1: Bathroom: clean the bath and sink \[bathroom\]/);
  assert.match(p, /Do not ask any more questions/);
  assert.equal(checkInMessage([{ said: 'did the bathroom' }, { q: 'All done?', said: 'yes' }]), 'What she said: did the bathroom\n\nYou asked: All done?\nShe answered: yes');
});

test('mentioned but not finished is not ticked; bits left means started', () => {
  const res = cleanCheckIn({ done_refs: ['j2'], started_refs: ['j1', 'j2'], jobs: [{ title: 'Take the stuff off the side', room: 'bathroom', need: true, when: 'today' }] }, ctx);
  assert.deepEqual(res.doneIds, ['bed1']);
  assert.deepEqual(res.startedIds, ['bath1']); // j2 is done, so not also started
  assert.equal(res.jobs[0].room, 'bathroom');
});

test('the tick rule is in the prompt', () => {
  const p = checkInPrompt({ stopped: { id: 'k1', title: 'Kitchen', kind: 'task', createdAt: '', done: false }, jobs, rooms: [], today: '2026-11-19', tomorrow: '2026-11-20', canAsk: true });
  assert.match(p, /Never tick a job off just because she mentions it/);
  assert.match(p, /Is the bathroom all done, or is there more to do/);
});
