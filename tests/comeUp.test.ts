import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyComeUp,
  cleanComeUp,
  comeUpItems,
  houseBlocked,
  inHouseWindow,
  nextFreeDay,
  sickDayMoves,
  waitingFor,
  waitPicks,
} from '../src/lib/comeUp';
import { topPicks } from '../src/lib/picks';
import { DEFAULT_SETTINGS, DEFAULT_SPACES, type State, type Task } from '../src/lib/types';
import { tasksFor } from '../src/lib/time';

const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, kind: 'task', createdAt: '', done: false, ...extra });
const state = (tasks: Task[], settings: Partial<State['settings']> = {}): State => ({
  tasks,
  notes: [],
  spaces: DEFAULT_SPACES,
  checkins: [],
  settings: { ...DEFAULT_SETTINGS, ...settings },
});
let n = 0;
const newId = () => `new${n++}`;

// Friday 20 November 2026. Sav's with her dad on Saturday 21 (every 2 weeks from then).
const FRI = new Date('2026-11-20T08:30');

const day = (extra: Task[] = []) =>
  state([
    task('drop', { title: 'Drop Sav at nursery', at: '2026-11-16T08:00', repeatDays: [1, 2, 3, 4, 5], place: 'Nursery', spaceId: 'sav', seed: 'nursery-drop' }),
    task('pick', { title: 'Pick Sav up', at: '2026-11-16T17:45', repeatDays: [1, 2, 3, 4, 5], place: 'Nursery', spaceId: 'sav', seed: 'nursery-pickup' }),
    task('gym', { title: 'Gym', at: '2026-11-16T14:00', repeatDays: [1, 2, 3, 4, 5], estimateMin: 75, nag: true }),
    task('tidy', { title: 'Tidy one room, 15 minutes', at: '2026-11-16T12:30', repeatDays: [1, 2, 3, 4, 5], spaceId: 'home', estimateMin: 15, nag: true }),
    task('laundry', { title: 'Laundry: one load on', at: '2026-11-16T10:00', repeatDays: [1, 2, 3, 4, 5], spaceId: 'home', estimateMin: 10, nag: true }),
    task('dinner', { title: "Sav's dinner", at: '2026-11-16T18:00', repeatDays: [0, 1, 2, 3, 4, 5, 6], spaceId: 'sav', room: 'kitchen' }),
    task('essay', { title: 'Whittington written exercise', day: '2026-11-20', estimateMin: 150, spaceId: 'jobs' }),
    task('wipe', { title: 'Wipe the worktop', day: '2026-11-20', room: 'kitchen', spaceId: 'home', estimateMin: 5 }),
    ...extra,
  ]);

test('next free day: her dad\'s Saturday first, then nursery days, then the fewest fixed things', () => {
  assert.equal(nextFreeDay(day(), FRI), '2026-11-21'); // Saturday with her dad
  // From Saturday, the next dad Saturday is two weeks away, so a nursery day wins.
  assert.equal(nextFreeDay(day(), new Date('2026-11-21T09:00')), '2026-11-23');
});

test('Sav off sick: nursery runs not needed, going out and big jobs move, house jobs into nap or after 19:30', () => {
  const s = day();
  const moves = sickDayMoves(s, FRI);
  const by = (id: string) => moves.find((m) => m.taskId === id);
  assert.equal(by('drop')?.toLabel, 'Not needed today');
  assert.equal(by('pick')?.toLabel, 'Not needed today');
  // Going out, and it repeats anyway: skip today, the next one is Monday.
  assert.equal(by('gym')?.to, undefined);
  assert.equal(by('gym')?.why, 'Needs you to go out. Next one Mon 23/11 14:00');
  assert.equal(by('essay')?.to?.day, '2026-11-21'); // a one-off bigger job: to her dad's Saturday
  assert.deepEqual(by('laundry')?.to, { day: '2026-11-20', time: '13:00' }); // into the nap
  assert.equal(by('tidy')?.to?.time, '13:00');
  assert.equal(by('dinner'), undefined); // Sav's routine stays
  assert.equal(by('wipe'), undefined); // untimed: it just waits for the nap
});

test('sick day: no false trips out, deadlines and everyday jobs stay, must-dos are only offered', () => {
  const s = day([
    task('bags', { title: 'Kitchen: empty the shopping bags on the floor', room: 'kitchen', spaceId: 'home', day: '2026-11-20', estimateMin: 10 }),
    task('shop', { title: 'Go to the shop for nappies', day: '2026-11-20' }),
    task('closes', { title: 'HMPPS statements (closes today)', day: '2026-11-20', estimateMin: 105, priority: 1, dueAt: '2026-11-20T23:59' }),
    task('must', { title: 'Whittington exercise', day: '2026-11-20', estimateMin: 150, priority: 1 }),
    task('reset', { title: 'Kitchen reset', at: '2026-11-16T19:45', repeatDays: [0, 1, 2, 3, 4, 5, 6], room: 'kitchen', spaceId: 'home', estimateMin: 45 }),
  ]);
  const by = (id: string) => sickDayMoves(s, FRI).find((m) => m.taskId === id);
  assert.equal(by('bags'), undefined);
  assert.equal(by('shop')?.why, 'Needs you to go out');
  assert.equal(by('closes'), undefined); // the deadline is before Saturday
  assert.equal(by('must')?.optional, true);
  assert.equal(by('reset'), undefined); // 19:45 is already after bedtime, and it's an everyday job
});

test('applying a plan never drops anything, and repeating things skip today with a copy', () => {
  const s = day();
  const moves = sickDayMoves(s, FRI);
  const next = applyComeUp(s, { add: [], events: [], moves, savSick: true }, FRI, newId);
  for (const t of s.tasks) assert.ok(next.tasks.some((x) => x.id === t.id), `${t.id} is still there`);
  const gym = next.tasks.find((t) => t.id === 'gym')!;
  assert.deepEqual(gym.skipDays, ['2026-11-20']);
  assert.ok(!next.tasks.some((t) => t.title === 'Gym' && !t.repeatDays)); // no extra gym added
  // Laundry repeats too, but it moves into the nap today as a one-off copy.
  assert.deepEqual(next.tasks.find((t) => t.id === 'laundry')!.skipDays, ['2026-11-20']);
  assert.ok(next.tasks.some((t) => t.title === 'Laundry: one load on' && t.at === '2026-11-20T13:00' && !t.repeatDays));
  assert.equal(next.tasks.find((t) => t.id === 'essay')!.day, '2026-11-21');
  assert.equal(next.settings.dayPlans['2026-11-20'].savHome, true);
});

test('Sav home: house jobs only in her nap or after 19:30', () => {
  const s = applyComeUp(day(), { add: [], events: [], moves: [], savSick: true }, FRI, newId);
  const wipe = s.tasks.find((t) => t.id === 'wipe')!;
  assert.equal(inHouseWindow(s.settings, '13:10'), true);
  assert.equal(inHouseWindow(s.settings, '15:00'), false);
  assert.equal(houseBlocked(s, wipe, '2026-11-20', new Date('2026-11-20T10:00')), true);
  assert.equal(houseBlocked(s, wipe, '2026-11-20', new Date('2026-11-20T13:15')), false);
  assert.equal(houseBlocked(s, wipe, '2026-11-20', new Date('2026-11-20T19:45')), false);
  assert.ok(!topPicks(s, '2026-11-20', new Date('2026-11-20T10:00'), 10).some((p) => p.task.id === 'wipe'));
});

test('what Claude sends back is checked: no fixed things moved, no past times, nothing dropped', () => {
  const s = day();
  const items = comeUpItems(s, FRI);
  const ref = (id: string) => items.find((i) => i.id === id)!.ref;
  const plan = cleanComeUp(
    {
      reply: 'Engineer at 11, sorted.',
      add: [{ title: 'Clear the path to the boiler.', room: 'kitchen', estimate_min: 10 }, { title: 'Tidy the hall', room: 'not-a-room' }],
      events: [{ title: 'Gas engineer', at: '2026-11-20T11:00', visitor: true, rooms: ['kitchen'] }, { title: 'Bad', at: 'eleven' }],
      moves: [
        { ref: ref('pick'), to: '18:30' }, // fixed: refused
        { ref: ref('laundry'), to: '07:00' }, // in the past: refused
        { ref: ref('essay'), to: '2026-11-23' },
        { ref: 'i999', to: '15:00' }, // not a real ref
      ],
    },
    { items, tasks: s.tasks, roomSlugs: ['kitchen', 'living-room'], now: FRI },
  );
  assert.deepEqual(plan.add.map((a) => [a.title, a.room]), [['Clear the path to the boiler', 'kitchen'], ['Tidy the hall', undefined]]);
  assert.deepEqual(plan.events.map((e) => [e.title, e.visitor, e.rooms]), [['Gas engineer', true, ['kitchen']]]);
  assert.deepEqual(plan.moves.map((m) => [m.taskId, m.to?.day]), [['essay', '2026-11-23']]);
  assert.ok(items.find((i) => i.id === 'pick')!.fixed);

  const next = applyComeUp(s, plan, FRI, newId);
  assert.ok(next.tasks.length >= s.tasks.length + 3);
  for (const t of s.tasks) assert.ok(next.tasks.some((x) => x.id === t.id));
  // The added jobs go to the top of today's list.
  assert.equal(tasksFor(next, '2026-11-20')[0].title, 'Clear the path to the boiler');
});

test('waiting mode: before visitors, places and leave-by times only, and "Not now" closes it', () => {
  const engineer = task('eng', { kind: 'event', title: 'Gas engineer', at: '2026-11-20T11:00', visitor: true, visitorRooms: ['kitchen'] });
  const small = [
    task('a', { day: '2026-11-20', estimateMin: 5, room: 'kitchen', spaceId: 'home' }),
    task('b', { day: '2026-11-20', estimateMin: 5, room: 'living-room', spaceId: 'home' }),
    task('c', { day: '2026-11-20', estimateMin: 10 }),
    task('d', { day: '2026-11-20', estimateMin: 8, room: 'bathroom', spaceId: 'home' }),
    task('big', { day: '2026-11-20', estimateMin: 60 }),
  ];
  const s = state([engineer, ...small]);
  assert.equal(waitingFor(s, new Date('2026-11-20T09:30')), null); // too early
  const w = waitingFor(s, new Date('2026-11-20T10:20'))!;
  assert.equal(w.title, 'Gas engineer');
  const picks = waitPicks(s, new Date('2026-11-20T10:20'), w).map((t) => t.id);
  assert.deepEqual(picks, ['b', 'd', 'c']); // smallest first, never the kitchen the engineer needs
  // Cooking and Sav's dinner have no place and aren't visitors: no waiting before them.
  const cook = state([task('cook', { kind: 'event', title: 'Cook dinner', at: '2026-11-20T17:40', room: 'kitchen', spaceId: 'sav' })]);
  assert.equal(waitingFor(cook, new Date('2026-11-20T17:20')), null);
  // A leave-by time counts.
  const dentist = state([task('dentist', { kind: 'event', title: 'Dentist', at: '2026-11-20T15:00', place: 'Nursery' })], { places: [{ id: 'n', name: 'Nursery', travelMin: 20 }] });
  assert.equal(waitingFor(dentist, new Date('2026-11-20T14:20'))?.title, 'Leave for Dentist');
  // Not now.
  const off = { ...s, settings: { ...s.settings, dayPlans: { '2026-11-20': { waitingOff: ['eng|2026-11-20'] } } } };
  assert.equal(waitingFor(off, new Date('2026-11-20T10:20')), null);
});
