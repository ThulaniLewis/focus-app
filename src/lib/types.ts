export type Kind = 'task' | 'event' | 'buy' | 'note';

export type Grab = { item: string; fromRoom: string };

export type Task = {
  id: string;
  title: string;
  kind: Kind;
  /** Which space it belongs to. */
  spaceId?: string;
  /** Room slug where this happens, e.g. "kitchen". */
  room?: string;
  /** Something to pick up in another room first (the bin bag rule). */
  grab?: Grab;
  /** Fixed time, local "YYYY-MM-DDTHH:MM". With `flex`, only a suggested order, not a real time. */
  at?: string;
  /**
   * No real time: a job that just needs doing, in roughly this order. It sits in the day's "next"
   * list, never shows a time, and is never late. Only real fixed times and deadlines keep a time.
   */
  flex?: boolean;
  /** Not before this time of day, "HH:MM" (house jobs wait until Sav's asleep). */
  after?: string;
  /** A real deadline, local "YYYY-MM-DDTHH:MM". Focus counts back from it with loud alerts. */
  dueAt?: string;
  /** A real deadline with a date but no time ("Due 23 Nov"), "YYYY-MM-DD". Counts down at 3 days, 1 day and the morning of. */
  dueDay?: string;
  /** Weekdays it repeats on, 0 = Sunday. Uses the time part of `at`. */
  repeatDays?: number[];
  /** Where it happens, matched against Places for travel time. */
  place?: string;
  /** Claude's estimate in minutes. */
  estimateMin?: number;
  /** A diary event that lasts the day, with no time (her child is with someone): kind "event", `day` set, no `at`. Never a tick box. */
  allDay?: boolean;
  /** Day the task belongs to, "YYYY-MM-DD". Undated tasks show until done. */
  day?: string;
  /** Shopping: which list and which group within it. */
  list?: 'food' | 'other';
  group?: string;
  createdAt: string;
  done: boolean;
  doneAt?: string;
  /** For repeating events: days already ticked, "YYYY-MM-DD". */
  doneDays?: string[];
  timer?: { startedAt?: string; accumulatedSec: number };
  actualMin?: number;
  /** Id of the copy in the phone's calendar, if one was made. */
  calendarEventId?: string;
  /** Keep nudging every 15 minutes until it's ticked. */
  nag?: boolean;
  /** Nudges paused until this time (ISO). */
  snoozeUntil?: string;
  /** Only on days Sav is away with her dad, or only when she's home. */
  onlyWhen?: 'sav-away' | 'sav-home';
  /** Set on things Focus added from the setup, so they're added once. */
  seed?: string;
  /** 1 must, 2 should, 3 could. Drives "Today's focus" and the order of To do. */
  priority?: 1 | 2 | 3;
  /** A project with no day yet (mount the TV). Lives in its space, not on Today. */
  someday?: boolean;
  /** Stopped with some left: started, not finished. The leftovers are their own to-dos. */
  partial?: boolean;
  /** Real time spent each time it was done with Start and Stop. */
  history?: { day: string; min: number }[];
  /** Days a repeating item was stopped with some left. */
  partialDays?: string[];
  /** Days a repeating item is skipped, "YYYY-MM-DD". */
  skipDays?: string[];
  /** Put at the top of this day's list ("Something's come up": clear the path for the engineer). */
  topDay?: string;
  /** Someone's coming (gas engineer): waiting mode before their time, and the rooms they'll need. */
  visitor?: boolean;
  visitorRooms?: string[];
};

/** "I'm avoiding this": what's making a room hard. */
export type AvoidReason = 'too-much' | 'no-homes' | 'perfect' | 'dont-want';

export type DayPlan = {
  focus?: string;
  paused?: string[];
  /** Sav's home (off sick): house jobs only during her nap or after 19:30, nothing that means going out. */
  savHome?: boolean;
  /** Waiting mode closed with "Not now" for these triggers ("<taskId>|<day>"). */
  waitingOff?: string[];
};

export type SpaceKind = 'general' | 'home' | 'shopping' | 'private';
export type Privacy = 'everywhere' | 'phone';

export type Space = {
  id: string;
  name: string;
  kind: SpaceKind;
  privacy: Privacy;
  /** Icon name from the Feather set. */
  icon: string;
};

export type Floor = 'up' | 'down' | '';
export type Room = { name: string; floor: Floor };

export type Place = { id: string; name: string; travelMin: number };

export type Settings = {
  dayEnd: string; // "HH:MM"
  bufferMin: number;
  readyMin: number; // how long the morning takes, wake to out the door
  rooms: Room[];
  /** A room round in progress: one timer for the whole room ("I'm in the living room"). */
  round?: { room: string; day: string; startedAt?: string; accumulatedSec: number; checkInAt?: string } | null;
  /** A gentle "come back" nudge Focus has promised (after a break, or after 5 more minutes). */
  comeBack?: { at: string; title: string; body: string; taskId?: string; kind?: 'break' | 'five' } | null;
  /** Each time she lost momentum, to spot patterns later (time of day, room). */
  momentumLog?: { at: string; room?: string; job?: string; choice: 'five' | 'tiny' | 'break' | 'stop' | 'avoid' | 'skip'; reason?: AvoidReason }[];
  /** How long past room rounds took, to learn real times later. */
  roundLog?: { room: string; day: string; min: number; done: number }[];
  places: Place[];
  model: string;
  /** Copy dated things into the phone's calendar. */
  writeCalendar: boolean;
  /** Show the phone's calendar events in Focus. */
  readCalendar: boolean;
  /** Words in a diary entry that mean Sav is with her dad. */
  awayWords: string[];
  firstName: string;
  /** Sav's Saturdays with her dad: every `weeks` weeks counting from `anchor` (a Saturday). */
  savPattern: { anchor: string; weeks: number } | null;
  /** Which version of the starter setup has been applied. */
  setupVersion: number;
  /** The "I've set up your week" card has been dismissed. */
  setupSeen: boolean;
  /** Per-day choices: which space comes first, which are paused. Keyed "YYYY-MM-DD". */
  dayPlans: Record<string, DayPlan>;
  /** Sav's usual nap, "HH:MM". On a day she's home, house jobs fit in here or after 19:30. */
  savNap: { start: string; end: string };
  /** When nursery is happy for Sav to arrive, "HH:MM". Focus's drop-off suggestions stay inside it. */
  nurseryWindow: { start: string; end: string };
  /** On time or late, for fixed times with a place. Shared between phone and tablet (not private). */
  punctualityLog?: PunctualityEntry[];
  /** On this device: "how did it go?" still to ask (ticked from a notification, say). */
  punctualityAsk?: { taskId: string; day: string }[];
  /** On this device: "Not yet" to a suggested new time, until when (ISO), by job key. */
  punctualityNotYet?: Record<string, string>;
  /** On this device: features switched off in Focus settings (missing means on). See lib/features.ts. */
  features?: Partial<Record<import('./features').FeatureId, boolean>>;
  /** On this device: Light, Dark, or Match phone (light by day, dark from wind down). Missing means Match phone. */
  look?: import('./look').Look;
  /** The town the Dash shows weather for (rounded to about 10 km). Shared, so the tablet gets it. */
  weatherPlace?: import('./weather').WeatherPlace | null;
  /** How she gets around, for live travel times. Missing means by car. */
  travelMode?: import('./liveTraffic').TravelMode;
};

/** One answer to "how did it go?". lateMin 0 is on time; otherwise roughly 5, 10, 20 or 30 (30 or more). */
export type PunctualityEntry = { key: string; title: string; day: string; planned: string; lateMin: number; at: string };

export type Note = { id: string; text: string; createdAt: string };
export type Checkin = { day: string; feeling: string; at: string };

export type State = {
  tasks: Task[];
  notes: Note[];
  spaces: Space[];
  checkins: Checkin[];
  settings: Settings;
  /** Last nights' sleep from Health Connect. Phone only: never synced, never on the tablet. */
  sleep?: { nights: { day: string; asleepMin: number; start: string; end: string }[]; notToday?: string };
  /** On this phone: whether to read sleep from Health Connect ("yes" after Allow, "no" after Not now). */
  sleepReading?: 'yes' | 'no';
  /** The dev report's log: on this device only, never synced. See lib/devlog.ts. */
  devLog?: import('./devlog').DevEvent[];
};

export const DEFAULT_SPACES: Space[] = [
  { id: 'home', name: 'Home', kind: 'home', privacy: 'everywhere', icon: 'home' },
  { id: 'sav', name: 'Sav', kind: 'general', privacy: 'everywhere', icon: 'smile' },
  { id: 'jobs', name: 'Job search', kind: 'general', privacy: 'everywhere', icon: 'briefcase' },
  { id: 'shopping', name: 'Shopping', kind: 'shopping', privacy: 'everywhere', icon: 'shopping-cart' },
  { id: 'money', name: 'Money', kind: 'general', privacy: 'phone', icon: 'credit-card' },
  { id: 'me', name: 'Just for me', kind: 'private', privacy: 'phone', icon: 'lock' },
];

export const FOOD_GROUPS = [
  'Fruit and veg',
  'Meat',
  'Cheese and dairy',
  'Pasta, rice and pulses',
  'Bread',
  'Cereals',
  'Snacks',
  'Seasonings',
  'Household',
];

export const DEFAULT_ROOMS: Room[] = [
  { name: 'Thulani Bedroom', floor: 'up' },
  { name: 'Savannah Bedroom', floor: 'up' },
  { name: 'Toilet', floor: 'up' },
  { name: 'Living room', floor: '' },
  { name: 'Kitchen', floor: 'down' },
  { name: 'Bathroom', floor: 'down' },
];

export const DEFAULT_SETTINGS: Settings = {
  dayEnd: '22:30',
  bufferMin: 5,
  readyMin: 60,
  rooms: DEFAULT_ROOMS,
  places: [{ id: 'nursery', name: 'Nursery', travelMin: 20 }],
  model: 'claude-sonnet-5-5',
  writeCalendar: true,
  readCalendar: true,
  awayWords: ['dad'],
  firstName: 'Thulani',
  savPattern: { anchor: '2026-11-21', weeks: 2 },
  setupVersion: 0,
  setupSeen: false,
  dayPlans: {},
  savNap: { start: '13:00', end: '14:30' },
  nurseryWindow: { start: '08:00', end: '08:30' },
};

export const OLD_DEFAULT_ROOMS = ['Kitchen', 'Living room', 'Bedroom', "Sav's room", 'Bathroom', 'Hallway'];
