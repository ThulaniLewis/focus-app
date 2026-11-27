// Brief 1b, Fix 2 addition: tasks linked to places. Made-up places and people only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_GEO, type GeoData, type GeoLogEntry, type GeoPlace, parseGeo, placeActions, type PlaceReminder } from '../src/lib/geo';
import { arrivedAt, askLine, didLine, linkedDue, suggestLink, type TaskLink } from '../src/lib/placeLinks';
import { sentence, summaryLine } from '../src/lib/placeTypes';
import { DEFAULT_SETTINGS, DEFAULT_SPACES, type State, type Task } from '../src/lib/types';

const HOME: GeoPlace = { id: 'home', name: 'Home', type: 'home', lat: 51.43, lon: -0.05, radiusM: 175 };
const NURSERY: GeoPlace = { id: 'oaks', name: "Ada's nursery", type: 'school', lat: 51.44, lon: -0.05, radiusM: 120 };
const OFFICE: GeoPlace = { id: 'office', name: 'Office', type: 'work', lat: 51.5, lon: -0.1, radiusM: 150 };
const MUM: GeoPlace = { id: 'mum', name: "Mum and Dad's", type: 'family', lat: 51.41, lon: -0.02, radiusM: 120 };
const PLACES = [HOME, NURSERY, OFFICE, MUM];

const at = (day: string, hm: string) => new Date(`${day}T${hm}:00`);
const THU = '2026-11-26';
const SAT = '2026-11-28';
const ev = (placeId: string, event: 'arrive' | 'leave', when: Date): GeoLogEntry => ({ at: when.toISOString(), placeId, placeName: placeId, event, source: 'background' });

const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, kind: 'task', createdAt: '', done: false, ...extra });
const DROP = task('drop', { title: 'Drop Ada off', at: '2026-11-02T08:30', repeatDays: [1, 2, 3, 4, 5] });
const PICK = task('pick', { title: 'Pick Ada up', at: '2026-11-02T17:30', repeatDays: [1, 2, 3, 4, 5] });
const state = (tasks: Task[]): Pick<State, 'tasks' | 'settings'> => ({ tasks, settings: { ...DEFAULT_SETTINGS } });
void DEFAULT_SPACES;

const link = (taskId: string, placeId = 'oaks', extra: Partial<TaskLink> = {}): TaskLink => ({ taskId, placeId, createdAt: at('2026-11-20', '09:00').toISOString(), ...extra });
const geo = (extra: Partial<GeoData> = {}): GeoData => ({ ...EMPTY_GEO, places: PLACES, links: [link('drop'), link('pick')], ...extra });

const arrive = (d: GeoData, tasks: Task[], day: string, hm: string) => placeActions(d, [ev('oaks', 'arrive', at(day, hm))], [], at(day, hm), linkedDue(state(tasks), d.links, day));
const leave = (d: GeoData, tasks: Task[], day: string, hm: string) => placeActions(d, [ev('oaks', 'leave', at(day, hm))], [], at(day, hm), linkedDue(state(tasks), d.links, day));

test('arriving with a linked task due: "Have you dropped Ada off?", one card', () => {
  const r = arrive(geo(), [DROP, PICK], THU, '08:24');
  assert.equal(r.notices.length, 1);
  assert.equal(r.notices[0].kind, 'full-screen');
  assert.equal(r.notices[0].title, "You're at Ada's nursery");
  // Both are due on Thursday and open, so both are asked about. Focus never ticks either by itself.
  assert.equal(r.notices[0].body, 'Have you dropped Ada off? · Have you picked Ada up?');
  assert.deepEqual(r.notices[0].open, { to: 'reminders', placeId: 'oaks' });
  assert.ok(r.data.links.every((l) => l.shownAt));
});

test('nothing due: no prompt (a Saturday, or already done today)', () => {
  assert.deepEqual(arrive(geo(), [DROP, PICK], SAT, '10:00').notices, []);
  const done = [{ ...DROP, doneDays: [THU] }, { ...PICK, doneDays: [THU] }];
  assert.deepEqual(arrive(geo(), done, THU, '08:24').notices, []);
  // Not today (Skip today) on both: not asked again that day.
  const skipped = geo({ links: [link('drop', 'oaks', { notToday: THU }), link('pick', 'oaks', { notToday: THU })] });
  assert.deepEqual(arrive(skipped, [DROP, PICK], THU, '08:24').notices, []);
  // A task with no link: nothing.
  assert.deepEqual(arrive(geo({ links: [] }), [DROP, PICK], THU, '08:24').notices, []);
});

test('leaving without answering: one nudge only, and Not yet still gets it', () => {
  const tasks = [DROP];
  const a = arrive(geo({ links: [link('drop', 'oaks', { notYetAt: at(THU, '08:25').toISOString() })] }), tasks, THU, '08:24');
  const l = leave(a.data, tasks, THU, '08:41');
  assert.equal(l.notices.length, 1);
  assert.equal(l.notices[0].kind, 'notify');
  assert.equal(l.notices[0].title, 'Did you drop Ada off?');
  // Leaving again (back for a moment, gone again) with nothing new shown: nothing more.
  const again = leave(l.data, tasks, THU, '09:30');
  assert.deepEqual(again.notices, []);
  // Done before leaving: no nudge.
  const doneFirst = leave(a.data, [{ ...DROP, doneDays: [THU] }], THU, '08:41');
  assert.deepEqual(doneFirst.notices, []);
});

test('a linked task and a place reminder: one card on arriving, one nudge on leaving', () => {
  const rem: PlaceReminder = { id: 'r1', placeId: 'oaks', text: 'Tell staff Ada will be in late on Friday', when: 'arrive', byDay: '2026-11-27', createdAt: at('2026-11-25', '21:40').toISOString() };
  const a = arrive(geo({ links: [link('drop')], reminders: [rem] }), [DROP], THU, '08:24');
  assert.equal(a.notices.length, 1);
  assert.equal(a.notices[0].body, 'Have you dropped Ada off? · Tell staff Ada will be in late on Friday');
  const l = leave(a.data, [DROP], THU, '08:41');
  assert.equal(l.notices.length, 1);
  assert.equal(l.notices[0].title, 'Did you drop Ada off and tell staff Ada will be in late on Friday?');
  assert.deepEqual(leave(l.data, [DROP], THU, '09:00').notices, []);
});

test('Done uses the real arrival time from the Places log', () => {
  const log = [ev('home', 'leave', at(THU, '08:05')), ev('oaks', 'arrive', at(THU, '08:24')), ev('oaks', 'leave', at(THU, '08:41'))];
  assert.equal(arrivedAt(log, 'oaks', at(THU, '08:50')), at(THU, '08:24').toISOString());
  assert.equal(arrivedAt(log, 'oaks', at('2026-11-27', '08:50')), null); // yesterday's arrival doesn't count
  assert.equal(arrivedAt(log, 'mum', at(THU, '08:50')), null);
});

test('switched off at a place, or a type that takes no links: quiet', () => {
  const off = geo({ places: PLACES.map((p) => (p.id === 'oaks' ? { ...p, off: ['linked-tasks' as const] } : p)) });
  assert.deepEqual(arrive(off, [DROP], THU, '08:24').notices, []);
  const atWork = geo({ links: [link('drop', 'office')] });
  const r = placeActions(atWork, [ev('office', 'arrive', at(THU, '08:58'))], [], at(THU, '08:59'), linkedDue(state([DROP]), atWork.links, THU));
  assert.ok(r.notices.every((n) => !n.body.includes('Have you')));
});

test('suggesting a link: the place word, never just a name', () => {
  assert.equal(suggestLink('Drop Ada to nursery', PLACES)?.id, 'oaks');
  assert.equal(suggestLink("Take Mum's dish back", PLACES)?.id, 'mum');
  assert.equal(suggestLink('Give Ada a bath', PLACES), null); // "Ada" is whose nursery, not the place
  assert.equal(suggestLink('Print the slides at the office', PLACES), null); // work takes no linked tasks
  assert.equal(suggestLink('Hoover the stairs', PLACES), null);
});

test('the words: asking, nudging, the sentence and the Places row', () => {
  assert.equal(askLine('Drop Ada off'), 'Have you dropped Ada off?');
  assert.equal(askLine('Pick Ada up.'), 'Have you picked Ada up?');
  assert.equal(askLine('Water the plants'), 'Have you watered the plants?');
  assert.equal(askLine('Sort the shed'), 'Done yet: Sort the shed?');
  assert.equal(didLine(['Drop Ada off']), 'Did you drop Ada off?');
  assert.equal(didLine(['A', 'B', 'C']), 'Did you do the 3 things for here?');
  assert.equal(sentence('linked-tasks', { name: NURSERY.name, type: 'school' }), 'Any tasks linked here, Focus asks about when you arrive.');
  assert.equal(summaryLine(NURSERY, 1, 2), 'Nursery or school · drop off and pick up · 2 linked tasks · 1 reminder');
});

test('old saved data has no links; links for a deleted place go', () => {
  const old = parseGeo({ places: PLACES, reminders: [] });
  assert.deepEqual(old.links, []);
  const kept = parseGeo({ places: PLACES, links: [link('drop'), link('x', 'gone'), { nonsense: true }] });
  assert.deepEqual(kept.links.map((l) => l.taskId), ['drop']);
});
