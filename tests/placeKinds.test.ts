// Brief 1b, Fix 2: places know what they are. Made-up places and people only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  countLookup,
  draftFor,
  EMPTY_GEO,
  type Fix,
  type GeoData,
  type GeoLogEntry,
  type GeoPlace,
  LOOKUPS_A_DAY,
  observe,
  parseGeo,
  placeActions,
  type PlaceReminder,
  remindersAt,
  stillCheck,
  warnAt,
} from '../src/lib/geo';
import { cleanPlaceReminders, confirmLine, placesPrompt } from '../src/lib/placeTalk';
import { does, PLACE_TYPES, sentence, summaryLine } from '../src/lib/placeTypes';
import { tripsLine, tripsTo } from '../src/lib/placeTrips';
import { nextLeave, workList } from '../src/lib/workRoutine';
import { DEFAULT_SETTINGS, DEFAULT_SPACES, type State, type Task } from '../src/lib/types';

const HOME: GeoPlace = { id: 'home', name: 'Home', type: 'home', lat: 51.43, lon: -0.05, radiusM: 175 };
const SCHOOL: GeoPlace = { id: 'oaks', name: "Ada's nursery", type: 'school', lat: 51.44, lon: -0.05, radiusM: 120, trips: 'Little Oaks' };
const OFFICE: GeoPlace = { id: 'office', name: 'Office', type: 'work', lat: 51.5, lon: -0.1, radiusM: 150, workSpaceId: 'work' };
const GYM: GeoPlace = { id: 'gym', name: 'The gym', type: 'gym', lat: 51.42, lon: -0.04, radiusM: 120, gymTaskId: 'gym-task' };
const PLACES = [HOME, SCHOOL, OFFICE, GYM];

const at = (day: string, hm: string) => new Date(`${day}T${hm}:00`);
const WED = '2026-11-25';
const THU = '2026-11-26';
const FRI = '2026-11-27';
const ev = (placeId: string, event: 'arrive' | 'leave', when: Date): GeoLogEntry => ({ at: when.toISOString(), placeId, placeName: placeId, event, source: 'background' });
const geo = (extra: Partial<GeoData> = {}): GeoData => ({ ...EMPTY_GEO, places: PLACES, ...extra });

test('"Tell nursery Ada is late on Friday" in a dump: one place reminder, after a yes, and it goes off on Thursday', () => {
  // What the model sends back, checked: only her places, sensible days, no repeats, nothing for a place she doesn't have.
  const said = [
    { place_id: 'oaks', text: 'tell staff Ada will be in late on Friday', when: 'arrive', by_day: FRI },
    { place_id: 'oaks', text: 'Tell staff Ada will be in late on Friday', when: 'arrive', by_day: FRI },
    { place_id: 'nowhere', text: 'Something', when: 'arrive' },
    { place_id: 'oaks', text: 'Old news', when: 'arrive', by_day: '2026-11-01' },
  ];
  const got = cleanPlaceReminders(said, PLACES, WED);
  assert.equal(got.length, 2);
  assert.deepEqual(got[0], { placeId: 'oaks', text: 'Tell staff Ada will be in late on Friday', when: 'arrive', byDay: FRI });
  assert.equal(got[1].byDay, undefined); // a day already gone is dropped, not trusted
  assert.equal(confirmLine(got[0], SCHOOL.name), "When you arrive at Ada's nursery, remind you to tell staff Ada will be in late on Friday.");

  // Only kept after yes: here, the yes adds it.
  const rem: PlaceReminder = { ...got[0], id: 'r1', createdAt: at(WED, '21:40').toISOString() };
  const d = geo({ reminders: [rem] });
  // Thursday's drop off: it goes off, full screen, and is marked shown.
  const thu = placeActions(d, [ev('oaks', 'arrive', at(THU, '08:24'))], [], at(THU, '08:25'));
  assert.equal(thu.notices.length, 1);
  assert.equal(thu.notices[0].kind, 'full-screen');
  assert.equal(thu.notices[0].title, "You're at Ada's nursery");
  assert.equal(thu.notices[0].body, 'Tell staff Ada will be in late on Friday');
  assert.deepEqual(thu.notices[0].open, { to: 'reminders', placeId: 'oaks' });
  assert.ok(thu.data.reminders[0].shownAt);
  // After Friday it never goes off.
  assert.deepEqual(placeActions(d, [ev('oaks', 'arrive', at('2026-11-30', '08:24'))], [], at('2026-11-30', '08:25')).notices, []);
});

test('the dump only offers places that take reminders, and says nothing when there are none', () => {
  assert.equal(placesPrompt([]), '');
  assert.equal(placesPrompt([HOME]), ''); // home has no reminders
  const p = placesPrompt(PLACES);
  assert.ok(p.includes("oaks: Ada's nursery") && p.includes('office: Office') && !p.includes('home: Home'));
  assert.deepEqual(cleanPlaceReminders([{ place_id: 'home', text: 'Water plants', when: 'arrive' }], PLACES, WED), []);
});

test('leaving without ticking it: one "Did you …?", never twice', () => {
  const rem: PlaceReminder = { id: 'r1', placeId: 'oaks', text: 'Tell staff Ada will be in late on Friday', when: 'arrive', byDay: FRI, createdAt: at(WED, '21:00').toISOString() };
  let d = placeActions(geo({ reminders: [rem] }), [ev('oaks', 'arrive', at(THU, '08:24'))], [], at(THU, '08:25')).data;
  const left = placeActions(d, [ev('oaks', 'leave', at(THU, '08:40'))], [], at(THU, '08:41'));
  assert.equal(left.notices.length, 1);
  assert.equal(left.notices[0].title, 'Did you tell staff Ada will be in late on Friday?');
  assert.equal(left.notices[0].kind, 'notify');
  d = left.data;
  assert.deepEqual(placeActions(d, [ev('oaks', 'leave', at(THU, '08:50'))], [], at(THU, '08:51')).notices, []);
  // Ticked: nothing on leaving.
  const ticked = placeActions(geo({ reminders: [{ ...rem, shownAt: at(THU, '08:25').toISOString(), doneAt: at(THU, '08:30').toISOString() }] }), [ev('oaks', 'leave', at(THU, '08:40'))], [], at(THU, '08:41'));
  assert.deepEqual(ticked.notices, []);
});

test('no visit before Friday: one warning, the day before, with a draft she sends herself', () => {
  const rem: PlaceReminder = { id: 'r1', placeId: 'oaks', text: 'Tell staff Ada will be in late on Friday', when: 'arrive', byDay: FRI, createdAt: at(WED, '21:00').toISOString() };
  const w = warnAt(rem);
  assert.ok(w);
  assert.equal(w!.toISOString(), at(THU, '18:00').toISOString());
  assert.equal(warnAt({ ...rem, doneAt: at(THU, '08:30').toISOString() }), null); // done: no warning
  assert.equal(warnAt({ ...rem, createdAt: at(THU, '19:00').toISOString() }), null); // made after: she knows
  assert.equal(warnAt({ ...rem, byDay: undefined }), null);
  assert.equal(draftFor(rem), 'Hi, just to let you know Ada will be in late on Friday. Thanks');
  assert.equal(draftFor({ text: 'Take the forms back' }), 'Take the forms back');
});

test('every-time reminders come back on the next visit; leave reminders go off on leaving', () => {
  const every: PlaceReminder = { id: 'e', placeId: 'gym', text: 'Fill your water bottle', when: 'arrive', every: true, createdAt: at(WED, '07:00').toISOString(), doneAt: at(WED, '07:30').toISOString() };
  assert.equal(remindersAt([every], 'gym', at(WED, '09:00')).length, 0); // done today
  assert.equal(remindersAt([every], 'gym', at(THU, '07:00')).length, 1); // back tomorrow
  const out: PlaceReminder = { id: 'l', placeId: 'gym', text: 'Take your towel', when: 'leave', createdAt: at(WED, '07:00').toISOString() };
  const r = placeActions(geo({ reminders: [out] }), [ev('gym', 'arrive', at(THU, '07:00'))], [], at(THU, '07:01'));
  assert.equal(r.notices.filter((n) => n.title.startsWith("You're leaving")).length, 0);
  const l = placeActions(r.data, [ev('gym', 'leave', at(THU, '08:00'))], [], at(THU, '08:01'));
  assert.equal(l.notices[0].title, "You're leaving The gym");
});

const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, kind: 'task', createdAt: '', done: false, ...extra });
const state = (tasks: Task[]): State => ({
  tasks,
  notes: [],
  spaces: [...DEFAULT_SPACES, { id: 'work', name: 'Work', kind: 'general', privacy: 'everywhere', icon: 'briefcase' }],
  checkins: [],
  settings: { ...DEFAULT_SETTINGS, places: [{ id: 'lo', name: 'Little Oaks', travelMin: 20 }], bufferMin: 5 },
});

test('arriving at the office: the work routine, with the work list and when to leave', () => {
  const r = placeActions(geo(), [ev('office', 'arrive', at(THU, '08:58'))], ['Milk'], at(THU, '08:59'));
  assert.equal(r.notices.length, 1); // no shopping list at work
  assert.equal(r.notices[0].kind, 'full-screen');
  assert.deepEqual(r.notices[0].open, { to: 'work', placeId: 'office' });

  const s = state([
    task('report', { title: 'Send the November report', spaceId: 'work' }),
    task('done', { title: 'Old', spaceId: 'work', done: true }),
    task('home-job', { title: 'Hoover', spaceId: 'home' }),
    task('pick', { title: 'Pick Ada up', at: `${THU}T17:30`, place: 'Little Oaks' }),
  ]);
  assert.deepEqual(workList(s, OFFICE, at(THU, '09:00')).map((t) => t.title), ['Send the November report']);
  assert.deepEqual(workList(s, { workSpaceId: undefined }, at(THU, '09:00')), []);
  const leave = nextLeave(s, at(THU, '09:00'));
  assert.equal(leave?.title, 'Pick Ada up');
  assert.equal(leave?.leaveAt.toISOString(), at(THU, '17:05').toISOString()); // 20 min + 5 min buffer
  assert.equal(nextLeave(s, at(THU, '18:00')), null);
});

test('the gym ticks its task off, once a day', () => {
  let d = placeActions(geo(), [ev('gym', 'arrive', at(THU, '07:00'))], [], at(THU, '07:01')).data;
  d = placeActions(d, [ev('gym', 'arrive', at(THU, '18:00'))], [], at(THU, '18:01')).data;
  assert.deepEqual(d.ticks, [{ taskId: 'gym-task', day: THU }]);
  const off = geo({ places: PLACES.map((p) => (p.id === 'gym' ? { ...p, off: ['gym-tick' as const] } : p)) });
  assert.deepEqual(placeActions(off, [ev('gym', 'arrive', at(THU, '07:00'))], [], at(THU, '07:01')).data.ticks, []);
});

test('a nursery shows its trips; no place type has a switch that does not belong to it', () => {
  const s = state([
    task('drop', { title: 'Drop off', at: `${WED}T08:00`, repeatDays: [1, 2, 3, 4, 5], place: 'Little Oaks' }),
    task('pick', { title: 'Pick up', at: `${WED}T17:15`, repeatDays: [1, 2, 3, 4, 5], place: 'little oaks' }),
    task('dentist', { title: 'Dentist', at: `${WED}T10:00`, place: 'Dentist' }),
  ]);
  const trips = tripsLine(tripsTo(s.tasks, SCHOOL.trips));
  assert.equal(trips, 'Drop off 08:00 and Pick up 17:15, weekdays');
  assert.equal(sentence('leave-by', { ...SCHOOL, trips }), 'Drop off 08:00 and Pick up 17:15, weekdays. Focus works out when to leave.');

  for (const t of PLACE_TYPES) {
    const place = { type: t.id };
    for (const b of ['offer-shopping-list', 'leave-by', 'reminders', 'work-routine', 'gym-tick'] as const) assert.equal(does(place, b), t.behaviours.includes(b), `${t.id} ${b}`);
    // Only a food shop ever mentions the shopping list.
    for (const b of t.behaviours) if (t.id !== 'food-shop') assert.ok(!/shopping/i.test(sentence(b, { name: 'X', type: t.id })), `${t.id} ${b}`);
  }
  assert.deepEqual(typeInfoBehaviours('home'), []);
  assert.equal(summaryLine(HOME, 0), 'Notes when you get in and head out');
  // A saved switch that doesn't fit the type is dropped on load.
  const loaded = parseGeo({ places: [{ ...HOME, off: ['offer-shopping-list'] }, { ...SCHOOL, off: ['reminders', 'gym-tick'] }] });
  assert.equal(loaded.places[0].off, undefined);
  assert.deepEqual(loaded.places[1].off, ['reminders']);
});

const typeInfoBehaviours = (id: string) => PLACE_TYPES.find((t) => t.id === id)!.behaviours;

test('places saved before Fix 2 load fine: old types and rules are tidied away', () => {
  const old = parseGeo({ places: [{ id: 'n', name: 'Nursery', type: 'nursery', lat: 51, lon: 0, radiusM: 120, rules: [{ when: 'leave', action: 'remind-shopping' }] }] });
  assert.equal(old.places[0].type, 'school');
  assert.equal((old.places[0] as any).rules, undefined);
  assert.deepEqual(old.reminders, []);
  assert.equal(old.anySupermarket, false);
  // Reminders for a place that has gone are dropped.
  assert.deepEqual(parseGeo({ places: [HOME], reminders: [{ id: 'x', placeId: 'gone', text: 'Hi', when: 'arrive', createdAt: '' }] }).reminders, []);
});

test('any supermarket: off by default; on, one look-up after standing still, and a daily limit', () => {
  const fixAt = (hm: string, northM = 0): Fix => ({ at: at(THU, hm), lat: 51.47 + northM / 111195, lon: -0.02, accuracyM: 20, source: 'background' });
  let d = observe(geo(), fixAt('10:00')).data; // out (first look, not at a place)
  assert.deepEqual(stillCheck(d, fixAt('10:10')), { still: null, lookUp: false }); // off by default
  d = { ...d, anySupermarket: true };
  let r = stillCheck(d, fixAt('10:00'));
  assert.equal(r.lookUp, false);
  d = { ...d, still: r.still };
  r = stillCheck(d, fixAt('10:02', 20));
  assert.equal(r.lookUp, false); // not long enough
  r = stillCheck(d, fixAt('10:05', 30));
  assert.equal(r.lookUp, true);
  d = { ...d, still: r.still };
  assert.equal(stillCheck(d, fixAt('10:10', 10)).lookUp, false); // once per spot
  // Moved on: a new spot starts.
  assert.equal(stillCheck(d, fixAt('10:20', 500)).still?.asked, undefined);
  // The daily limit.
  let full = { ...d, still: { lat: 51.6, lon: 0, since: at(THU, '11:00').toISOString() } };
  for (let i = 0; i < LOOKUPS_A_DAY; i++) full = countLookup(full, at(THU, '11:00'));
  assert.equal(stillCheck(full, { at: at(THU, '11:10'), lat: 51.6, lon: 0, accuracyM: 20, source: 'background' }).lookUp, false);
});

test('nothing about her life is in the Fix 2 code: names come from her places', () => {
  const root = join(__dirname, '..');
  const files = [
    'src/lib/placeTypes.ts',
    'src/lib/placeTalk.ts',
    'src/lib/placeTrips.ts',
    'src/lib/workRoutine.ts',
    'src/lib/geo.ts',
    'src/lib/geoStore.ts',
    'src/lib/location.ts',
    'src/app/(tabs)/places.tsx',
    'src/app/(tabs)/place/[id].tsx',
    'src/app/(tabs)/place-reminder/[id].tsx',
    'src/app/(tabs)/work/[id].tsx',
    'src/components/PlaceReminderCheck.tsx',
    'src/components/LinkedTasks.tsx',
    'src/lib/placeLinks.ts',
    'src/lib/dumpShapes.ts',
    'src/lib/dumpContext.ts',
    'src/lib/grabLists.ts',
    'src/components/GrabListCard.tsx',
    'src/components/PlacesHost.tsx',
    'supabase/functions/focus-places/index.ts',
  ];
  for (const f of files) {
    const src = readFileSync(join(root, f), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(src, /\b(sav|savannah|niall|sainsbury'?s?|elmers end|sydenham|canary wharf)\b/i, f);
  }
});
