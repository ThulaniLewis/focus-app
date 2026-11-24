import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  defaultRules,
  distanceM,
  EMPTY_GEO,
  type Fix,
  type GeoData,
  type GeoLogEntry,
  type GeoPlace,
  logForDay,
  logLine,
  mergeShopping,
  noticesFor,
  observe,
  parseGeo,
  shoppingItems,
  whereLine,
} from '../src/lib/geo';
import { metresPerPx, tilesFor, worldPx } from '../src/lib/mapTiles';
import { localRows, SHARED_SETTINGS, toPush } from '../src/lib/sync';
import { migrate } from '../src/lib/migrate';
import { DEFAULT_SETTINGS, DEFAULT_SPACES, type State, type Task } from '../src/lib/types';

// A made-up town: home, and a food shop about 600 m north. No real addresses.
const HOME: GeoPlace = { id: 'home', name: 'Home', type: 'home', lat: 51.43, lon: -0.05, radiusM: 175, rules: defaultRules('home') };
const SHOP: GeoPlace = { id: 'shop', name: 'The food shop', type: 'food-shop', lat: 51.4354, lon: -0.05, radiusM: 120, rules: defaultRules('food-shop') };
const PLACES = [HOME, SHOP];
/** A point `m` metres north of home. */
const north = (m: number) => ({ lat: HOME.lat + m / 111195, lon: HOME.lon });

const at = (hm: string) => new Date(`2026-11-24T${hm}:00`);
const fix = (hm: string, m: number, accuracyM = 30): Fix => ({ at: at(hm), ...north(m), accuracyM, source: 'background' });

/** Feed observations in order; collect every confirmed event. */
function run(data: GeoData, obs: Parameters<typeof observe>[1][]) {
  const events: GeoLogEntry[] = [];
  for (const o of obs) {
    const r = observe(data, o);
    data = r.data;
    events.push(...r.events);
  }
  return { data, events };
}

const start = (): GeoData => observe({ ...EMPTY_GEO, places: PLACES }, fix('07:50', 0)).data; // first look: at home, nothing logged

test('the first look sets where she is without logging an arrival', () => {
  const d = start();
  assert.equal(d.presence.placeId, 'home');
  assert.deepEqual(d.log, []);
});

test('a simulated route: home, out, shop, out, home gives the right log and notices', () => {
  const shopAt = distanceM(HOME.lat, HOME.lon, SHOP.lat, SHOP.lon);
  assert.ok(shopAt > 550 && shopAt < 650);
  const { data, events } = run(start(), [
    fix('08:00', 0),
    fix('08:05', 300), // out (first seen)
    fix('08:10', 350), // still out: confirmed, logged at 08:05
    fix('08:15', shopAt), // at the shop (first seen)
    fix('08:20', shopAt + 20), // confirmed, logged at 08:15
    fix('08:40', 300), // out again
    fix('08:45', 250),
    fix('08:55', 10), // home
    fix('09:00', 0),
  ]);
  assert.deepEqual(
    logForDay(data.log, '2026-11-24').map((e) => logLine(e, PLACES)),
    ['Left home 08:05', 'Arrived The food shop 08:15', 'Left The food shop 08:40', 'Arrived home 08:55'],
  );
  assert.equal(events.length, 4);
  assert.equal(whereLine(data, at('09:30')), 'Home since 08:55');

  const list = ['Batteries', 'Bags', 'Bin bags'];
  const leave = noticesFor([events[0]], PLACES, list, at('08:10'));
  assert.equal(leave.length, 1);
  assert.equal(leave[0].kind, 'notify');
  assert.equal(leave[0].body, 'Batteries, Bags, Bin bags. Passing a shop?');
  const arrive = noticesFor([events[1]], PLACES, list, at('08:20'));
  assert.equal(arrive.length, 1);
  assert.equal(arrive[0].kind, 'full-screen');
  assert.equal(arrive[0].title, 'Do you want to see your shopping list?');
  // Arriving home and leaving the shop have no rules: nothing sent.
  assert.deepEqual(noticesFor([events[2], events[3]], PLACES, list, at('09:00')), []);
});

test('hovering at the edge of the circle adds nothing to the log', () => {
  const edge = HOME.radiusM;
  const { data, events } = run(start(), [
    fix('12:00', edge - 10),
    fix('12:01', edge + 25), // in the margin: no news
    fix('12:02', edge + 60), // out, first seen
    fix('12:03', edge - 5), // back in before it held: forgotten
    fix('12:04', edge + 70),
    fix('12:05', edge - 20),
    fix('12:06', edge + 30),
    fix('12:07', edge - 1),
  ]);
  assert.deepEqual(events, []);
  assert.equal(data.presence.placeId, 'home');
  assert.ok(!data.presence.pending);
});

test('a missed geofence: background positions alone still flip the state and log it', () => {
  const { data, events } = run(start(), [fix('14:00', 400), fix('14:06', 420)]);
  assert.equal(data.presence.placeId, null);
  assert.deepEqual(events.map((e) => [e.event, e.placeId, e.at, e.source]), [['leave', 'home', at('14:00').toISOString(), 'background']]);
});

test('geofence events count once they hold, and a leave for somewhere she is not is ignored', () => {
  const d = start();
  const ignored = observe(d, { at: at('10:00'), source: 'geofence', placeId: 'shop', inside: false });
  assert.equal(ignored.data, d);
  const { events } = run(d, [
    { at: at('10:00'), source: 'geofence', placeId: 'home', inside: false },
    fix('10:04', 400),
  ]);
  assert.deepEqual(events.map((e) => [e.event, e.source]), [['leave', 'geofence']]);
});

test('reconcile: the log says she left home, then a position inside the circle logs the real arrival time', () => {
  let { data } = run(start(), [fix('15:00', 380), fix('15:05', 390)]);
  assert.equal(data.presence.placeId, null);
  const back = run(data, [fix('16:42', 20), fix('16:50', 5)]);
  assert.deepEqual(back.events.map((e) => [e.event, e.at]), [['arrive', at('16:42').toISOString()]]);
  data = back.data;
  assert.equal(whereLine(data, at('17:00')), 'Home since 16:42');
});

test('a sharp check as Focus opens corrects the state straight away; a vague one waits', () => {
  const d = start();
  const vague = observe(d, { at: at('11:00'), ...north(800), accuracyM: 120, source: 'app-open' });
  assert.deepEqual(vague.events, []);
  const sharp = observe(d, { at: at('11:00'), ...north(800), accuracyM: 20, source: 'app-open' });
  assert.deepEqual(sharp.events.map((e) => [e.event, e.source]), [['leave', 'app-open']]);
  const fuzzy = observe(d, { at: at('11:00'), ...north(800), accuracyM: 900, source: 'background' });
  assert.equal(fuzzy.data, d); // too vague to say anything
});

test('leaving with an empty list sends nothing; old news is not sent', () => {
  const { events } = run(start(), [fix('08:05', 300), fix('08:10', 300)]);
  assert.deepEqual(noticesFor(events, PLACES, [], at('08:10')), []);
  assert.deepEqual(noticesFor(events, PLACES, ['Milk'], at('09:00')), []); // found out 55 minutes later
  assert.equal(noticesFor(events, PLACES, ['Milk'], at('08:10')).length, 1);
});

test('one notice per departure, and long lists are cut short', () => {
  const { events } = run(start(), [fix('08:05', 300), fix('08:10', 300), fix('08:15', 320), fix('08:20', 330)]);
  assert.equal(events.length, 1);
  const n = noticesFor(events, PLACES, ['a', 'b', 'c', 'd', 'e', 'f', 'g'], at('08:20'));
  assert.equal(n.length, 1);
  assert.equal(n[0].body, 'a, b, c, d, e and 2 more. Passing a shop?');
});

test('rules are data: a place with no rules sends nothing', () => {
  const quiet = PLACES.map((p) => ({ ...p, rules: [] }));
  const { events } = run({ ...start(), places: quiet }, [fix('08:05', 300), fix('08:10', 300)]);
  assert.equal(events.length, 1);
  assert.deepEqual(noticesFor(events, quiet, ['Milk'], at('08:10')), []);
});

const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, kind: 'buy', createdAt: '', done: false, spaceId: 'shopping', ...extra });
const state = (tasks: Task[] = [], extra: Partial<State> = {}): State => ({ tasks, notes: [], spaces: DEFAULT_SPACES, checkins: [], settings: DEFAULT_SETTINGS, ...extra });

test('the shopping list: what is still to buy, topped up from the tablet', () => {
  const s = state([task('a', { title: 'Batteries' }), task('b', { title: 'Bread', done: true }), task('c', { title: 'Gym', kind: 'task', spaceId: 'home' })]);
  const local = shoppingItems(s);
  assert.deepEqual(local.map((i) => i.title), ['Batteries']);
  assert.deepEqual(mergeShopping(local, null), ['Batteries']); // offline
  assert.deepEqual(
    mergeShopping(local, [
      { id: 'a', title: 'Batteries', done: true }, // ticked on the tablet
      { id: 'n', title: 'Bin bags', done: false }, // added on the tablet
    ]),
    ['Bin bags'],
  );
});

test('the shopping list syncs: shopping items are in what the phone shares', () => {
  const s = state([task('a', { title: 'Batteries' })]);
  assert.ok(localRows(s).has('t:a'));
});

test('places, where she is and the log can never reach what syncs', () => {
  const geo: GeoData = {
    places: PLACES,
    presence: { placeId: 'home', since: at('08:55').toISOString(), pending: null },
    log: [{ at: at('08:55').toISOString(), placeId: 'home', placeName: 'Home', event: 'arrive', source: 'background' }],
  };
  // Even if geo data were put on the State or its settings by mistake, none of it is shared.
  const s = state([task('a')], { ...({ geo } as object), settings: { ...DEFAULT_SETTINGS, ...({ geoPlaces: PLACES, presence: geo.presence } as object) } } as Partial<State>);
  const shared = JSON.stringify([...localRows(s).values(), ...toPush(s, {})]);
  for (const leak of ['51.43', 'radiusM', 'The food shop', 'placeName', 'presence', 'geoPlaces']) assert.ok(!shared.includes(leak), leak);
  assert.ok(!(SHARED_SETTINGS as readonly string[]).some((k) => /geo|presence|log$/i.test(k) && k !== 'roundLog' && k !== 'punctualityLog'));
  // And a reload of the State drops anything geo, so it can't creep in later.
  const back = migrate(JSON.parse(JSON.stringify(s))) as any;
  assert.equal(back.geo, undefined);
});

test('the sync layer never touches the places store', () => {
  const root = join(__dirname, '..');
  for (const f of ['src/lib/sync.ts', 'src/lib/syncClient.ts', 'src/lib/store.tsx']) {
    const src = readFileSync(join(root, f), 'utf8');
    assert.ok(!/from '\.\/(geo|geoStore|location)'/.test(src), f);
    assert.ok(!src.includes('focus.places'), f);
  }
  const store = readFileSync(join(root, 'src/lib/geoStore.ts'), 'utf8');
  assert.ok(store.includes("GEO_KEY = 'focus.places.v1'"));
});

test('saved places survive a reload, and bad data is made safe', () => {
  const geo = parseGeo(JSON.parse(JSON.stringify({ places: [...PLACES, { id: 'x', name: 'Broken' }], presence: { placeId: 'gone', since: 'x' }, log: [{ nope: 1 }] })));
  assert.deepEqual(geo.places.map((p) => p.id), ['home', 'shop']);
  assert.equal(geo.presence.placeId, null);
  assert.deepEqual(geo.log, []);
  assert.deepEqual(parseGeo(null), EMPTY_GEO);
});

test('the map: the pin is in the middle and the circle is the right size', () => {
  const z = 16;
  const c = worldPx(HOME.lat, HOME.lon, z);
  const tiles = tilesFor(HOME.lat, HOME.lon, z, 300, 200);
  assert.ok(tiles.length >= 2 && tiles.length <= 6);
  for (const t of tiles) assert.match(t.url, /^https:\/\/tile\.openstreetmap\.org\/16\/\d+\/\d+\.png$/);
  // The tile holding the centre is placed so the centre lands at (150, 100).
  const tx = Math.floor(c.x / 256);
  const ty = Math.floor(c.y / 256);
  const t = tiles.find((x) => x.key === `16/${tx}/${ty}`)!;
  assert.ok(Math.abs(t.x + (c.x - tx * 256) - 150) < 0.001 && Math.abs(t.y + (c.y - ty * 256) - 100) < 0.001);
  assert.ok(Math.abs(metresPerPx(0, 0) - 156543.03392) < 0.01);
});
