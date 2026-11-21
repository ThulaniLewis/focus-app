import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendLog, buildReport, costOf, MAX_EVENTS, touched, weekSummary, type DevEvent } from '../src/lib/devlog';
import { migrate } from '../src/lib/migrate';
import { plan } from '../src/lib/nudges';
import { applySetup } from '../src/lib/seed';
import { daysLabel, spaceView } from '../src/lib/spaceView';
import { localRows, toPush } from '../src/lib/sync';
import { DEFAULT_SETTINGS, DEFAULT_SPACES, type State, type Task } from '../src/lib/types';
import { forecastUrl, parseForecast, parsePlace, roughly, weatherAdvice } from '../src/lib/weather';

const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, kind: 'task', createdAt: '2026-11-01T00:00:00.000Z', done: false, ...extra });
const state = (tasks: Task[], extra: Partial<State> = {}): State => ({ tasks, notes: [], spaces: DEFAULT_SPACES, checkins: [], settings: DEFAULT_SETTINGS, ...extra });
const iso = (s: string) => new Date(s).toISOString();

// ---- Dev report ----

test('Claude cost comes from list prices, per million tokens', () => {
  assert.equal(costOf('claude-sonnet-5-5', 1_000_000, 0), 2);
  assert.equal(costOf('claude-sonnet-5-5', 0, 1_000_000), 10);
  assert.equal(costOf('claude-opus-5-5', 1000, 500), (1000 * 4 + 500 * 20) / 1e6);
  assert.equal(costOf('some-other-model', 1, 1), null);
});

test('the log keeps the newest events and drops the oldest past the cap', () => {
  let log: DevEvent[] = [];
  for (let i = 0; i < MAX_EVENTS + 5; i++) log = appendLog(log, { at: iso('2026-11-21T10:00'), kind: 'change', label: `c${i}` });
  assert.equal(log.length, MAX_EVENTS);
  assert.equal((log[0] as any).label, 'c5');
});

test('a change logs the jobs it touched: changed, added and removed', () => {
  const a = task('a'), b = task('b'), c = task('c');
  const after = [{ ...a, done: true }, b, task('d')];
  assert.deepEqual(touched([a, b, c], after).map((t) => t.id).sort(), ['a', 'c', 'd']);
});

test('the week summary counts dictations, tasks made, skips and cost', () => {
  const now = new Date('2026-11-21T12:00');
  const log: DevEvent[] = [
    { at: iso('2026-11-20T10:00'), kind: 'dictation', said: 'bins and milk', made: [{ id: '', title: 'Bins' }, { id: '', title: 'Milk' }], ticked: [], started: [] },
    { at: iso('2026-11-20T11:00'), kind: 'change', label: 'Snoozed' },
    { at: iso('2026-11-20T11:05'), kind: 'change', label: 'Ticked' },
    { at: iso('2026-11-20T10:00'), kind: 'claude', call: 'dump', model: 'claude-sonnet-5-5', inputTokens: 1_000_000, outputTokens: 0 },
    { at: iso('2026-11-01T10:00'), kind: 'dictation', said: 'old', made: [{ id: '', title: 'Old' }], ticked: [], started: [] },
  ];
  const s = weekSummary(log, now);
  assert.deepEqual({ d: s.dictations, m: s.tasksMade, k: s.skippedOrMoved, calls: s.calls, cost: s.costUsd }, { d: 1, m: 2, k: 1, calls: 1, cost: 2 });
});

test('private items show as "private item" in the report unless she includes them', () => {
  const log: DevEvent[] = [
    { at: iso('2026-11-20T10:00'), kind: 'dictation', said: 'pay the credit card', made: [{ id: '', title: 'Pay the credit card', spaceId: 'money' }], ticked: [], started: [] },
    { at: iso('2026-11-20T11:00'), kind: 'change', label: 'Ticked', tasks: [{ id: 'x', title: 'Write in my journal', spaceId: 'me' }] },
  ];
  const s = state([], { devLog: log });
  const hidden = buildReport(s, { includePrivate: false, now: new Date('2026-11-21T12:00'), device: 'phone' });
  assert.ok(!hidden.includes('credit card'));
  assert.ok(!hidden.includes('journal'));
  assert.ok(hidden.includes('private item'));
  const shown = buildReport(s, { includePrivate: true, now: new Date('2026-11-21T12:00'), device: 'phone' });
  assert.ok(shown.includes('credit card') && shown.includes('journal'));
});

test('the dev log stays on this device: never in what syncs', () => {
  const s = state([task('a')], { devLog: [{ at: iso('2026-11-20T10:00'), kind: 'note', text: 'secret note text', screen: 'Today', context: 'x' }] });
  const shared = JSON.stringify([...localRows(s).values(), ...toPush(s, {})]);
  assert.ok(!shared.includes('secret note text'));
  assert.ok(!shared.includes('devLog'));
});

test('the dev log survives a reload', () => {
  const saved = JSON.parse(JSON.stringify(state([], { devLog: [{ at: iso('2026-11-20T10:00'), kind: 'change', label: 'Ticked' }] })));
  assert.equal(migrate(saved).devLog?.length, 1);
});

// ---- Weather ----

test('weather: only a rough position is sent, never the exact one', () => {
  assert.equal(roughly(51.46789), 51.5);
  const url = forecastUrl({ name: 'Croydon', lat: 51.37612, lon: -0.09821 });
  assert.ok(url.includes('latitude=51.4') && url.includes('longitude=-0.1'));
  assert.ok(!url.includes('Croydon'));
  assert.deepEqual(parsePlace({ results: [{ name: 'Croydon', latitude: 51.37612, longitude: -0.09821 }] }, 'croydon'), { name: 'croydon', lat: 51.4, lon: -0.1 });
  assert.equal(parsePlace({ results: [] }, 'nowhere'), null);
});

const forecast = (rainAt: number | null) => ({
  current: { temperature_2m: 11.4 },
  daily: { temperature_2m_max: [13.2], temperature_2m_min: [5.6] },
  hourly: {
    time: Array.from({ length: 24 }, (_, h) => `2026-11-20T${String(h).padStart(2, '0')}:00`),
    precipitation_probability: Array.from({ length: 24 }, (_, h) => (rainAt !== null && h >= rainAt ? 80 : 10)),
    precipitation: Array.from({ length: 24 }, () => 0),
  },
});

test('weather: "11°, rain from 17:00", and a coat if it rains before you leave', () => {
  const now = new Date('2026-11-20T15:10');
  const w = parseForecast(forecast(17), now)!;
  assert.equal(w.temp, 11);
  assert.equal(w.summary, 'rain from 17:00');
  assert.equal(weatherAdvice(w, new Date('2026-11-20T17:00')), 'Take a coat when you leave at 17:00');
  assert.equal(weatherAdvice(w, null), 'High 13°, low 6°');
  const dry = parseForecast(forecast(null), now)!;
  assert.equal(dry.summary, 'dry for now');
  assert.equal(parseForecast({}, now), null);
});

// ---- Space page: real dates, then the next list in order ----

test('repeating jobs are labelled by their days, so the two "Cook dinner"s read apart', () => {
  assert.equal(daysLabel([1, 2, 3, 4, 5]), 'Weekdays');
  assert.equal(daysLabel([0, 6]), 'Weekends');
  assert.equal(daysLabel([0, 1, 2, 3, 4, 5, 6]), 'Every day');
  assert.equal(daysLabel([5, 1, 3]), 'Mon, Wed, Fri');
  const now = new Date('2026-11-21T09:00');
  const v = spaceView(
    [
      task('w', { title: 'Cook dinner', kind: 'event', at: '2026-11-18T16:00', repeatDays: [1, 2, 3, 4, 5] }),
      task('e', { title: 'Cook dinner', kind: 'event', at: '2026-11-18T17:20', repeatDays: [0, 6] }),
    ],
    now,
  );
  assert.deepEqual(v.weekly.map((x) => x.label), ['Weekdays 16:00', 'Weekends 17:20']);
});

test('job search: no "Repeats 09:30", routine jobs are an ordered list; deadlines and interviews keep their dates', () => {
  const now = new Date('2026-11-21T09:00');
  const v = spaceView(
    [
      task('apply', { title: 'One tailored application', at: '2026-11-18T10:00', repeatDays: [1, 2, 3, 4, 5], flex: true }),
      task('replies', { title: 'Check job replies', at: '2026-11-18T09:30', repeatDays: [1, 2, 3, 4, 5], flex: true }),
      task('nhse', { title: 'NHS England statement', at: '2026-11-22T10:00', flex: true, dueDay: '2026-11-23' }),
      task('stg', { title: "St George's interview", kind: 'event', at: '2026-11-30T09:30', place: "St George's" }),
    ],
    now,
  );
  assert.deepEqual(v.deadlines.map((d) => d.label), ['Due 23 Nov, 2 days left']);
  assert.equal(v.deadlines[0].reminders, 'Reminders at 3 days, 1 day and the morning of');
  assert.deepEqual(v.dated.map((d) => d.label), ['30 Nov 09:30']);
  assert.equal(v.weekly.length, 0);
  assert.deepEqual(v.next.map((t) => t.id), ['replies', 'apply']);
});

// ---- v10 setup ----

test('v10: pick-up in 24-hour time, NHS England becomes "Due 23 Nov"', () => {
  let n = 0;
  const st = applySetup(migrate({}), new Date('2026-11-18T08:00'), () => `id${n++}`);
  const pickup = st.tasks.find((t) => t.seed === 'nursery-pickup')!;
  assert.equal(pickup.title, 'Pick Sav up, latest 17:45');
  assert.ok(!/5:45/.test(pickup.title));
  const nhse = st.tasks.find((t) => t.seed === 'job-nhse')!;
  assert.equal(nhse.dueDay, '2026-11-23');
  assert.ok(!/Closes/.test(nhse.title));
});

test('v10 on an existing install: fixes old titles, leaves her own edits alone', () => {
  let n = 0;
  const v9 = applySetup(migrate({}), new Date('2026-11-18T08:00'), () => `id${n++}`);
  const old = {
    ...v9,
    settings: { ...v9.settings, setupVersion: 9 },
    tasks: v9.tasks.map((t) =>
      t.seed === 'nursery-pickup' ? { ...t, title: 'Pick Sav up (latest 5:45)' } : t.seed === 'job-nhse' ? { ...t, title: 'My own NHS title', dueDay: undefined } : t,
    ),
  };
  const st = applySetup(old, new Date('2026-11-21T08:00'), () => `x${n++}`);
  assert.equal(st.tasks.find((t) => t.seed === 'nursery-pickup')!.title, 'Pick Sav up, latest 17:45');
  const nhse = st.tasks.find((t) => t.seed === 'job-nhse')!;
  assert.equal(nhse.title, 'My own NHS title');
  assert.equal(nhse.dueDay, '2026-11-23');
});

// ---- Countdown alerts ----

test('a "Due 23 Nov" deadline counts down at 3 days, 1 day and the morning of', () => {
  const t = task('nhse', { title: 'NHS England statement', spaceId: 'jobs', dueDay: '2026-11-23' });
  const p = plan(state([t]), new Date('2026-11-19T08:00')).filter((x) => x.thread === 'job-nhse');
  assert.deepEqual(
    p.map((x) => `${x.at.getDate()} ${x.at.getHours()}:${String(x.at.getMinutes()).padStart(2, '0')} ${x.title}`),
    ['20 9:00 3 days left: NHS England statement', '22 9:00 Due tomorrow: NHS England statement', '23 9:00 Due today: NHS England statement'],
  );
  assert.ok(p.every((x) => x.loud));
  // Ticked: no more alerts. Private: never.
  assert.equal(plan(state([{ ...t, done: true }]), new Date('2026-11-19T08:00')).filter((x) => x.thread === 'job-nhse').length, 0);
  assert.equal(plan(state([{ ...t, spaceId: 'money' }]), new Date('2026-11-19T08:00')).filter((x) => x.thread === 'job-nhse').length, 0);
});
