// Fixes after Stage 1 testing: dev report double entries, stop wording and room names, weather
// (local times, sync of the town), the Day ends line, and which device this is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendChange, appendLog, buildReport, REPEAT_WINDOW_MS, type DevEvent } from '../src/lib/devlog';
import { dashFits, DASH_MIN_WIDTH_CHOSEN, parseRole, roleFromScreen } from '../src/lib/deviceLayout';
import { applyRemote, localRows, toPush, afterPush, type Row } from '../src/lib/sync';
import { dayEndLine, slug } from '../src/lib/time';
import { DEFAULT_SETTINGS, DEFAULT_SPACES, type State } from '../src/lib/types';
import { findTown, nextLeaveAt, parseForecast, phoneWeatherLine, weatherNote } from '../src/lib/weather';

const state = (extra: Partial<State> = {}, settings: Partial<State['settings']> = {}): State => ({
  tasks: [], notes: [], spaces: DEFAULT_SPACES, checkins: [], settings: { ...DEFAULT_SETTINGS, ...settings }, ...extra,
});
const iso = (s: string) => new Date(s).toISOString();
const change = (at: string, label: string, ids: string[] = []): Extract<DevEvent, { kind: 'change' }> => ({ at: iso(at), kind: 'change', label, tasks: ids.map((id) => ({ id, title: id })) });

// ---- Dev report ----

test('one tap that fires twice is logged once, but a real second tap later is kept', () => {
  let log: DevEvent[] = [];
  log = appendChange(log, change('2026-11-21T10:00:00', 'Ticked', ['a']));
  log = appendChange(log, change('2026-11-21T10:00:00', 'Ticked', ['a']));
  assert.equal(log.length, 1);
  log = appendChange(log, change('2026-11-21T10:00:00', 'Ticked', ['b'])); // another job
  log = appendChange(log, change('2026-11-21T10:00:00', 'Snoozed', ['b'])); // another action
  assert.equal(log.length, 3);
  const later = new Date(new Date('2026-11-21T10:00:00').getTime() + REPEAT_WINDOW_MS + 1000).toISOString();
  log = appendChange(log, { ...change('2026-11-21T10:00:00', 'Snoozed', ['b']), at: later });
  assert.equal(log.length, 4);
});

const stopState = () =>
  state({}, {
    rooms: [{ name: 'Thulani bedroom', floor: 'up' }] as any,
    momentumLog: [
      { at: iso('2026-11-21T09:00'), room: 'thulani-bedroom', job: 'Tidy floor', choice: 'stop' },
      { at: iso('2026-11-21T09:10'), room: 'thulani-bedroom', choice: 'five' },
      { at: iso('2026-11-21T09:20'), room: 'thulani-bedroom', choice: 'avoid', reason: 'too-much' },
    ],
    roundLog: [{ day: '2026-11-21', room: 'thulani-bedroom', min: 12, done: 3 }] as any,
  });

test('the report puts "stop" under Stopped for now, not Lost momentum, in plain words', () => {
  assert.equal(slug('Thulani bedroom'), 'thulani-bedroom');
  const r = buildReport(stopState(), { includePrivate: false, now: new Date('2026-11-21T12:00'), device: 'phone' });
  const section = (name: string) => r.split(`## ${name}\n`)[1].split('\n## ')[0];
  assert.ok(section('Lost momentum').includes('Asked for 5 more minutes'));
  assert.ok(!section('Lost momentum').includes('Stopped'));
  assert.ok(section('Stopped for now').includes('Stopped for now'));
  assert.ok(section('Avoiding and skipping').includes("there's too much"));
});

test('rooms show by name in the report, never as ids', () => {
  const r = buildReport(stopState(), { includePrivate: false, now: new Date('2026-11-21T12:00'), device: 'phone' });
  assert.ok(r.includes('Thulani bedroom'));
  assert.ok(!r.includes('thulani-bedroom'));
  assert.ok(!/: (five|tiny|break|stop|avoid|skip)\b/.test(r));
});

test('appendLog still appends', () => {
  assert.equal(appendLog(undefined, change('2026-11-21T10:00', 'x')).length, 1);
});

// ---- Day ends ----

test('the corner says what the time is: Day ends 22:30 and how long is left', () => {
  assert.equal(dayEndLine(600, '22:30'), 'Day ends 22:30 · 10h left');
  assert.equal(dayEndLine(45, '22:30'), 'Day ends 22:30 · 45 min left');
  assert.equal(dayEndLine(0, '22:30'), 'Day done. Rest.');
});

// ---- Weather ----

test('weather reads Open-Meteo times as local time', () => {
  const j = {
    current: { temperature_2m: 7.3 },
    daily: { temperature_2m_max: [9], temperature_2m_min: [3] },
    hourly: { time: ['2026-11-21T12:00', '2026-11-21T13:00', '2026-11-21T14:00'], precipitation_probability: [0, 0, 90], precipitation: [0, 0, 0] },
  };
  const w = parseForecast(j, new Date('2026-11-21T12:30'))!;
  assert.equal(w.summary, 'rain from 14:00');
  assert.equal(w.rainFrom!.getHours(), 14);
});

test('with no town, or when the weather fails, the card says so instead of nothing', () => {
  assert.equal(weatherNote({ kind: 'no-town' }).title, 'Set your town in Settings');
  assert.equal(weatherNote({ kind: 'error', message: 'x' }).title, 'Weather unavailable');
});

test('finding a town: found, not found, and offline', async () => {
  const reply = (body: unknown) => (async () => ({ ok: true, status: 200, json: async () => body }) as any) as typeof fetch;
  const found = await findTown('Croydon', reply({ results: [{ name: 'Croydon', latitude: 51.38, longitude: -0.1 }] }));
  assert.ok('place' in found && found.place.lat === 51.4);
  assert.ok('error' in (await findTown('Nowhere', reply({}))));
  assert.ok('error' in (await findTown('x', (async () => { throw new Error('offline'); }) as any)));
});

test('the tablet never overwrites the phone town just because it has not got one yet', () => {
  const phone = state({}, { weatherPlace: { name: 'Croydon', lat: 51.4, lon: -0.1 } });
  const tablet = state({}, {}); // weatherPlace never set
  // The tablet already synced before the town existed: it has no shadow for it.
  const shadowT = afterPush({}, [...localRows(tablet).values()].filter((r) => r.id !== 's:weatherPlace'));
  assert.ok(!toPush(tablet, shadowT).some((r) => r.id === 's:weatherPlace'));
  // The phone's town arrives: the tablet takes it.
  const row: Row = { id: 's:weatherPlace', kind: 'settings', data: { weatherPlace: phone.settings.weatherPlace }, updated_by: 'phone' };
  const got = applyRemote(tablet, shadowT, [row]);
  assert.equal(got.state.settings.weatherPlace?.name, 'Croydon');
  // "Stop showing weather" on the phone (null) reaches the tablet too.
  const cleared = applyRemote(got.state, got.shadow, [{ ...row, data: { weatherPlace: null } }]);
  assert.equal(cleared.state.settings.weatherPlace, null);
});

// ---- Which device ----

test('device role: remembered values only, and the screen decides until one is chosen', () => {
  assert.equal(parseRole('tablet'), 'tablet');
  assert.equal(parseRole('phone'), 'phone');
  assert.equal(parseRole('nonsense'), null);
  assert.equal(parseRole(null), null);
  assert.equal(roleFromScreen(1280, 800), 'tablet');
  assert.equal(roleFromScreen(412, 915), 'phone');
});

test('the Dash shows for the kitchen tablet in landscape, never on the phone', () => {
  assert.equal(dashFits('tablet', 1280, 800), true);
  assert.equal(dashFits('tablet', 800, 1280), false);
  assert.equal(dashFits('phone', 1280, 800), false);
  assert.equal(dashFits('tablet', 800, 600), false);
  assert.equal(dashFits('tablet', DASH_MIN_WIDTH_CHOSEN, 600, true), true); // she chose it herself
});

// ---- Weather on the phone's Today ----

test('phone Today: one weather line under the date, same words as the Dash', () => {
  const weather = { temp: 11, high: 13, low: 6, summary: 'rain from 17:30', rainFrom: new Date('2026-11-20T17:30'), fetchedAt: 0 };
  assert.equal(phoneWeatherLine({ kind: 'ok', weather }, new Date('2026-11-20T17:30')), '11°, rain from 17:30. Take a coat when you leave at 17:30');
  assert.equal(phoneWeatherLine({ kind: 'ok', weather: { ...weather, rainFrom: null, summary: 'dry for now' } }, null), '11°, dry for now. High 13°, low 6°');
  assert.equal(phoneWeatherLine({ kind: 'no-town' }, null), 'Set your town in Settings');
  assert.equal(phoneWeatherLine({ kind: 'error', message: 'offline' }, null), 'Weather unavailable');
  assert.equal(phoneWeatherLine({ kind: 'loading' }, null), null);
});

test('the coat is for the next time she leaves today, not one already gone', () => {
  const now = new Date('2026-11-20T15:00');
  const gone = { leaveAt: new Date('2026-11-20T07:50') };
  const later = { leaveAt: new Date('2026-11-20T16:55') };
  assert.equal(nextLeaveAt([gone, { done: true, leaveAt: new Date('2026-11-20T16:00') }, later], now), later.leaveAt);
  assert.equal(nextLeaveAt([gone], now), null);
});
