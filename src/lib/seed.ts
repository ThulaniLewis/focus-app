// Thulani's starter week, from the setup chat on 18 Nov 2026.
// Added once (by `seed` id), then it's all hers to change or delete.
import type { State, Task } from './types';

export const SETUP_VERSION = 9;

const WEEKDAYS = [1, 2, 3, 4, 5];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

type Starter = Omit<Task, 'id' | 'createdAt' | 'done' | 'kind' | 'at'> & { time: string; repeatDays: number[] };

export const STARTERS: Starter[] = [
  // Sav
  { seed: 'nursery-drop', title: 'Drop Sav at nursery', time: '08:00', repeatDays: WEEKDAYS, place: 'Nursery', spaceId: 'sav' },
  { seed: 'nursery-pickup', title: 'Pick Sav up (latest 5:45)', time: '17:45', repeatDays: WEEKDAYS, place: 'Nursery', spaceId: 'sav' },
  { seed: 'sav-dinner', title: "Sav's dinner", time: '18:00', repeatDays: EVERY_DAY, spaceId: 'sav', onlyWhen: 'sav-home', room: 'kitchen' },
  { seed: 'sav-bed', title: "Sav's bedtime", time: '19:30', repeatDays: EVERY_DAY, spaceId: 'sav', onlyWhen: 'sav-home', room: 'savannah-bedroom' },
  // Job search
  { seed: 'jobs-replies-am', title: 'Check job replies and emails', time: '09:30', repeatDays: WEEKDAYS, spaceId: 'jobs', nag: true, estimateMin: 15 },
  { seed: 'jobs-apply', title: 'Job search: one tailored application', time: '10:00', repeatDays: WEEKDAYS, spaceId: 'jobs', nag: true, estimateMin: 90 },
  { seed: 'jobs-replies-pm', title: 'Check job replies again', time: '16:00', repeatDays: WEEKDAYS, spaceId: 'jobs', nag: true, estimateMin: 15 },
  // Body
  { seed: 'gym-weekday', title: 'Gym', time: '14:00', repeatDays: WEEKDAYS, nag: true, estimateMin: 75 },
  { seed: 'gym-saturday', title: "Gym (Sav's with her dad)", time: '11:00', repeatDays: [6], nag: true, estimateMin: 75, onlyWhen: 'sav-away' },
  // Home
  { seed: 'tidy-room', title: 'Tidy one room, 15 minutes', time: '12:30', repeatDays: WEEKDAYS, spaceId: 'home', nag: true, estimateMin: 15 },
  { seed: 'laundry', title: 'Laundry: one load on', time: '13:15', repeatDays: [1, 3, 5], spaceId: 'home', nag: true, estimateMin: 10 },
  { seed: 'kitchen', title: 'Kitchen reset and washing up', time: '18:45', repeatDays: EVERY_DAY, spaceId: 'home', room: 'kitchen', nag: true, estimateMin: 20 },
  {
    seed: 'rubbish',
    title: 'Rubbish round: empty the bins upstairs',
    time: '19:45',
    repeatDays: EVERY_DAY,
    spaceId: 'home',
    room: 'toilet',
    grab: { item: 'a bin bag', fromRoom: 'kitchen' },
    nag: true,
    estimateMin: 10,
  },
  { seed: 'bins-out', title: 'Bins out for collection', time: '20:00', repeatDays: [0], spaceId: 'home', nag: true, estimateMin: 5 },
  // Evening
  { seed: 'wind-down', title: 'Wind down: open Focus, check tomorrow', time: '22:00', repeatDays: EVERY_DAY, nag: true, estimateMin: 10 },
];

// ---- v4: the house reset, from the room photos on 18 Nov 2026 ----
// One-off timed chunks, most important first. Job search is paused on Thu 19 Nov so the house comes first.

type Chunk = { seed: string; title: string; when: string; room?: string; estimateMin: number; priority?: 1 | 2 | 3 };

export const HOUSE_RESET: Chunk[] = [
  // Thursday 19: house first in the morning; job deadlines fit around it.
  { seed: 'hr-kitchen-wash', when: '2026-11-19T08:45', room: 'kitchen', estimateMin: 25, priority: 1, title: 'Kitchen: empty the dish rack, wash up, clear and wipe the worktop' },
  { seed: 'hr-kitchen-floor', when: '2026-11-19T09:15', room: 'kitchen', estimateMin: 15, priority: 1, title: 'Kitchen: empty the shopping bags on the floor, seal the cat food in a cupboard' },
  { seed: 'hr-living-rubbish', when: '2026-11-19T09:45', room: 'living-room', estimateMin: 10, priority: 1, title: 'Living room: floor rubbish, playset box out to recycling' },
  { seed: 'hr-living-toys', when: '2026-11-19T10:00', room: 'living-room', estimateMin: 10, priority: 1, title: 'Living room: every toy back in the toy box, cat tunnel in one corner' },
  { seed: 'hr-living-clothes', when: '2026-11-19T10:15', room: 'living-room', estimateMin: 10, priority: 1, title: 'Living room and hallway: clothes and socks upstairs to the wash' },
  { seed: 'hr-living-sofa', when: '2026-11-19T10:30', room: 'living-room', estimateMin: 10, priority: 1, title: 'Living room: clear the sofa, coat hung up, broom away' },
  { seed: 'hr-entrance-post', when: '2026-11-19T11:00', room: 'hallway', estimateMin: 15, priority: 1, title: 'Entrance: open the post (bills in one pile), bin the can and cup, trainers under the hooks' },
  { seed: 'hr-entrance-diy', when: '2026-11-19T11:20', room: 'hallway', estimateMin: 10, priority: 2, title: 'Entrance: all DIY bits in one box under the stairs, boards flat behind the door' },
  { seed: 'hr-bathroom-floor', when: '2026-11-19T11:35', room: 'bathroom', estimateMin: 15, priority: 1, title: 'Bathroom: clothes and towels to the wash, potty wiped, curtain back on the rail' },
  { seed: 'hr-laundry-thu', when: '2026-11-19T11:50', room: 'kitchen', estimateMin: 10, priority: 2, title: "Laundry: yesterday's load out to dry, next load on" },
  { seed: 'hr-toilet', when: '2026-11-19T15:45', room: 'toilet', estimateMin: 10, priority: 2, title: 'Toilet: empty the Primark bag, paint tin away, quick wipe of sink and seat' },
  { seed: 'hr-mine-rubbish', when: '2026-11-19T16:00', room: 'thulani-bedroom', estimateMin: 20, priority: 1, title: 'My bedroom: rubbish off desk and bedside, dishes down, ball pit balls back in the bag' },
  { seed: 'hr-sav-teddies', when: '2026-11-19T19:15', room: 'savannah-bedroom', estimateMin: 5, priority: 2, title: 'Teddy tidy with Sav: every teddy into the teddy corner' },
  // Friday 20
  { seed: 'hr-sav-clothes', when: '2026-11-20T12:05', room: 'savannah-bedroom', estimateMin: 15, priority: 1, title: "Sav's room: clothes off the floor and bed, nappies and wipes in one place" },
  { seed: 'hr-sav-toys', when: '2026-11-20T12:30', room: 'savannah-bedroom', estimateMin: 10, priority: 2, title: "Sav's room: toys into the cube boxes, walker against the wall" },
  { seed: 'hr-mine-bed', when: '2026-11-20T15:30', room: 'thulani-bedroom', estimateMin: 15, priority: 1, title: "My bedroom: Sav's things back to her room, make the bed with clean covers" },
  { seed: 'hr-sav-books', when: '2026-11-20T16:20', room: 'savannah-bedroom', estimateMin: 10, priority: 3, title: "Sav's room: books on the shelf, empty the M&S bag" },
  // Saturday 21: Sav's with her dad
  { seed: 'hr-hall-bags', when: '2026-11-21T09:30', room: 'hallway', estimateMin: 15, priority: 1, title: 'Hallway: empty the bags by the door, drying rack up or away' },
  { seed: 'hr-bathroom-sill', when: '2026-11-21T10:00', room: 'bathroom', estimateMin: 15, priority: 2, title: 'Bathroom: windowsill and bath edge cleared, bag and boards out from under the sink' },
  { seed: 'hr-clothes-1', when: '2026-11-21T13:00', room: 'thulani-bedroom', estimateMin: 15, priority: 1, title: 'Clothes pile, bag 1 of 4: wash, put away or charity' },
  { seed: 'hr-living-alcove', when: '2026-11-21T13:30', room: 'living-room', estimateMin: 10, priority: 3, title: 'Living room: clear the alcove shelf' },
  // The rest of the clothes pile, one bag a day
  { seed: 'hr-clothes-2', when: '2026-11-22T12:00', room: 'thulani-bedroom', estimateMin: 15, priority: 2, title: 'Clothes pile, bag 2 of 4: wash, put away or charity' },
  { seed: 'hr-clothes-3', when: '2026-11-23T12:30', room: 'thulani-bedroom', estimateMin: 15, priority: 2, title: 'Clothes pile, bag 3 of 4: wash, put away or charity' },
  { seed: 'hr-clothes-4', when: '2026-11-24T12:30', room: 'thulani-bedroom', estimateMin: 15, priority: 2, title: 'Clothes pile, bag 4 of 4: wash, put away or charity' },
];

/** Today's safety round: a checklist, not timed. Carries over until done. */
export const SAFETY_ROUND = [
  'Kitchen: shopping into the fridge (bin raw meat if it was out over 2 hours), check the yellow bag in the hall',
  'Kitchen: pan off the hob, oil, cable and lighter off the floor',
  "Sav's room: iron unplugged and put away up high",
  'Bathroom: cable unplugged and out, cleaners and scissors up high',
  'Living room: cleaning spray up high, TV off the floor',
  'My bedroom: small bits and bottles off the floor',
  'Laundry: the kitchen floor pile straight into the machine',
  'Litter tray scooped',
];

/** Projects for her dad's Saturdays. No day yet; they live in the Home space. */
export const PROJECTS = [
  'Mount the living room TV',
  'Fill and paint the living room alcove',
  'Open the pink parcel',
  'Cut the tags off the new stool',
  'Bathroom cabinet clear out',
  'Charity drop for the clothes bags',
];

// ---- v5: job search deadlines from the tracker, 18 Nov 2026 ----
// The house still comes first on Thursday morning; the deadlines fit around it.

type JobItem = { seed: string; title: string; when?: string; day?: string; estimateMin?: number; priority: 1 | 2 | 3; place?: string };

export const JOB_DEADLINES: JobItem[] = [
  { seed: 'job-hmpps', when: '2026-11-19T12:00', estimateMin: 105, priority: 1, title: 'HMPPS Business Manager to the CEO: write the four 250 word statements (lead on Managing a Quality Service). Closes Fri' },
  { seed: 'job-southwark', when: '2026-11-19T15:15', estimateMin: 15, priority: 1, title: 'Southwark Delivery Lead: statement is ready, submit it' },
  { seed: 'job-bbfc', when: '2026-11-19T15:30', estimateMin: 15, priority: 1, title: 'BBFC Head of Operations: cover letter is ready, submit it' },
  { seed: 'job-hmpps-submit', when: '2026-11-20T08:45', estimateMin: 20, priority: 1, title: 'HMPPS: final read of the statements and submit (closes today)' },
  { seed: 'job-whittington', when: '2026-11-20T09:15', estimateMin: 150, priority: 1, title: 'Whittington written exercise: the three 8am requests, how you assess, advise the CEO and prioritise in 24 hours. Use real GCU examples' },
  { seed: 'job-whittington-send', when: '2026-11-20T11:45', estimateMin: 10, priority: 1, title: 'Whittington: send the written exercise before 12 noon' },
  { seed: 'job-capital', when: '2026-11-20T13:00', estimateMin: 15, priority: 2, title: 'Capital Group Business Manager: quick apply' },
  { seed: 'job-zak', when: '2026-11-20T13:25', estimateMin: 5, priority: 2, title: 'Chase Zak Harvey (Lawrence Harvey) for a call if he has not replied' },
  { seed: 'job-nhsbt', when: '2026-11-20T13:30', estimateMin: 10, priority: 2, title: 'NHSBT Head of CDIO Office: decide yes or no (£49k to £57k is below your £75k)' },
  { seed: 'job-garfield', day: '2026-11-19', estimateMin: 30, priority: 2, title: 'Garfield Weston: read the candidate pack when it arrives, then plan the application' },
  { seed: 'job-nhse', when: '2026-11-22T10:00', estimateMin: 90, priority: 2, title: 'NHS England Cyber Ops statement: lead on GCU governance, reporting and moving work into BAU. Closes 23 Nov' },
  { seed: 'job-culture-mile', when: '2026-11-24T09:00', estimateMin: 60, priority: 1, title: 'Culture Mile BID first round interview (time to confirm)' },
  { seed: 'job-stg-prep', day: '2026-11-27', estimateMin: 45, priority: 1, title: "St George's interview prep: check referee emails, reread your application form" },
  { seed: 'job-stg-childcare', day: '2026-11-23', estimateMin: 10, priority: 1, title: "Sort childcare for Mon 30 Nov morning (St George's interview 9:30)" },
  { seed: 'job-stg', when: '2026-11-30T09:30', estimateMin: 60, priority: 1, place: "St George's Hospital", title: "St George's interview, Grosvenor Wing reception. Bring photo ID" },
];

const pad = (n: number) => String(n).padStart(2, '0');
const today = (now: Date) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

function applyV3(state: State, now: Date, makeId: () => string): State {
  const have = new Set(state.tasks.map((t) => t.seed).filter(Boolean));
  const day = today(now);
  const added: Task[] = STARTERS.filter((s) => !have.has(s.seed)).map(({ time, ...s }) => ({
    ...s,
    id: makeId(),
    kind: 'event',
    at: `${day}T${time}`,
    createdAt: now.toISOString(),
    done: false,
  }));
  const places = state.settings.places.some((p) => p.name.toLowerCase() === 'nursery')
    ? state.settings.places
    : [...state.settings.places, { id: 'nursery', name: 'Nursery', travelMin: 20 }];
  return {
    ...state,
    tasks: [...state.tasks, ...added],
    settings: {
      ...state.settings,
      places,
      dayEnd: '22:30',
      bufferMin: 5,
      readyMin: 60,
      savPattern: state.settings.savPattern ?? { anchor: '2026-11-21', weeks: 2 },
      setupSeen: false,
    },
  };
}

function applyV4(state: State, now: Date, makeId: () => string): State {
  const have = new Set(state.tasks.map((t) => t.seed).filter(Boolean));
  const created = now.toISOString();
  const base = { createdAt: created, done: false, spaceId: 'home' };
  const reset: Task[] = HOUSE_RESET.filter((c) => !have.has(c.seed)).map((c) => ({
    ...base,
    id: makeId(),
    seed: c.seed,
    kind: 'event',
    title: c.title,
    at: c.when,
    room: c.room,
    estimateMin: c.estimateMin,
    priority: c.priority,
    nag: true,
  }));
  const safety: Task[] = SAFETY_ROUND.map((title, i) => ({ seed: `safety-${i}`, title }))
    .filter((x) => !have.has(x.seed))
    .map((x) => ({ ...base, id: makeId(), seed: x.seed, kind: 'task', title: x.title, day: '2026-11-18', priority: 1 as const, estimateMin: 3 }));
  const projects: Task[] = PROJECTS.map((title, i) => ({ seed: `project-${i}`, title }))
    .filter((x) => !have.has(x.seed))
    .map((x) => ({ ...base, id: makeId(), seed: x.seed, kind: 'task', title: x.title, someday: true, priority: 3 as const }));
  // The everyday 15-minute tidy slot starts once the reset is through.
  const tasks = state.tasks.map((t) => (t.seed === 'tidy-room' ? { ...t, at: '2026-11-25T12:30' } : t));
  const rooms = state.settings.rooms.some((r) => r.name.toLowerCase() === 'hallway')
    ? state.settings.rooms
    : [...state.settings.rooms, { name: 'Hallway', floor: 'down' as const }];
  return {
    ...state,
    tasks: [...tasks, ...safety, ...reset, ...projects],
    settings: {
      ...state.settings,
      rooms,
      dayPlans: { ...state.settings.dayPlans, '2026-11-19': { focus: 'home', paused: ['jobs'] } },
      setupSeen: false,
    },
  };
}

function applyV5(state: State, now: Date, makeId: () => string): State {
  const have = new Set(state.tasks.map((t) => t.seed).filter(Boolean));
  const created = now.toISOString();
  const jobs: Task[] = JOB_DEADLINES.filter((j) => !have.has(j.seed)).map((j) => ({
    id: makeId(),
    seed: j.seed,
    title: j.title,
    kind: j.when ? 'event' : 'task',
    at: j.when,
    day: j.day,
    place: j.place,
    estimateMin: j.estimateMin,
    priority: j.priority,
    nag: !!j.when && j.priority === 1,
    spaceId: 'jobs',
    createdAt: created,
    done: false,
  }));
  // The routine job blocks step aside on the two deadline days.
  const skip: Record<string, string[]> = {
    'jobs-replies-am': ['2026-11-19', '2026-11-20'],
    'jobs-apply': ['2026-11-19', '2026-11-20'],
    'jobs-replies-pm': ['2026-11-19'],
  };
  const tasks = state.tasks.map((t) =>
    t.seed && skip[t.seed] ? { ...t, skipDays: [...new Set([...(t.skipDays ?? []), ...skip[t.seed]])] } : t,
  );
  return {
    ...state,
    tasks: [...tasks, ...jobs],
    settings: {
      ...state.settings,
      dayPlans: { ...state.settings.dayPlans, '2026-11-19': { focus: 'home' }, '2026-11-20': { focus: 'jobs' } },
      setupSeen: false,
    },
  };
}

// ---- v6: after the first real evening, 18 Nov 2026 ----
// House jobs wait until Sav's in bed, Thursday is all house, the half done kitchen carries on.

type Patch = { at?: string; time?: string; title?: string; estimateMin?: number; day?: string; skip?: string[]; partialDays?: string[] };

export const V6_PATCHES: Record<string, Patch> = {
  // Evenings: nothing in the house while Sav is up (bed 19:30).
  kitchen: { time: '19:45', estimateMin: 45, partialDays: ['2026-11-18'] },
  rubbish: { time: '20:30' },
  'bins-out': { time: '20:45' },
  // Thursday 19: all house. The kitchen is half done.
  'hr-kitchen-wash': { at: '2026-11-19T08:45', estimateMin: 45, title: 'Kitchen: put the clean dishes away, then wash the second load' },
  'hr-kitchen-floor': { at: '2026-11-19T09:35', estimateMin: 25, title: 'Kitchen: bin the rest of the old food, empty the shopping bags on the floor, seal the cat food' },
  'hr-living-rubbish': { at: '2026-11-19T10:05' },
  'hr-living-toys': { at: '2026-11-19T10:20' },
  'hr-living-clothes': { at: '2026-11-19T10:35' },
  'hr-living-sofa': { at: '2026-11-19T10:50' },
  'hr-entrance-post': { at: '2026-11-19T11:05' },
  'hr-entrance-diy': { at: '2026-11-19T11:25' },
  'hr-laundry-thu': { at: '2026-11-19T11:40' },
  'hr-mine-rubbish': { at: '2026-11-19T12:30', estimateMin: 30 },
  'hr-mine-bed': { at: '2026-11-19T13:05', estimateMin: 20 },
  'hr-clothes-1': { at: '2026-11-19T13:30', estimateMin: 25 },
  'hr-bathroom-floor': { at: '2026-11-19T15:25' },
  'hr-toilet': { at: '2026-11-19T15:45' },
  // The job deadlines move off Thursday.
  'job-hmpps': { at: '2026-11-20T13:00', title: 'HMPPS Business Manager to the CEO: write the four 250 word statements (lead on Managing a Quality Service). Closes today' },
  'job-hmpps-submit': { at: '2026-11-20T14:50', estimateMin: 10 },
  'job-garfield': { day: '2026-11-20' },
  'job-southwark': { at: '2026-11-23T11:35' },
  'job-bbfc': { at: '2026-11-23T11:50' },
  'job-capital': { at: '2026-11-23T12:05' },
  'job-zak': { at: '2026-11-23T12:20' },
  'job-nhsbt': { at: '2026-11-23T12:50' },
  // Friday afternoon goes to HMPPS, so the gym and laundry step aside that day.
  'gym-weekday': { skip: ['2026-11-20'] },
  laundry: { skip: ['2026-11-20'] },
  // Tuesday 24: Culture Mile interview at 9.
  'jobs-replies-am': { skip: ['2026-11-24'] },
};

function applyV6(state: State, now: Date, makeId: () => string): State {
  const tasks = state.tasks.map((t) => {
    const p = t.seed ? V6_PATCHES[t.seed] : undefined;
    if (!p) return t;
    let at = p.at ?? t.at;
    if (p.time && t.at) at = `${t.at.slice(0, 10)}T${p.time}`;
    return {
      ...t,
      at,
      title: p.title ?? t.title,
      estimateMin: p.estimateMin ?? t.estimateMin,
      day: p.day ?? t.day,
      skipDays: p.skip ? [...new Set([...(t.skipDays ?? []), ...p.skip])] : t.skipDays,
      partialDays: p.partialDays ? [...new Set([...(t.partialDays ?? []), ...p.partialDays])] : t.partialDays,
    };
  });
  const have = new Set(tasks.map((t) => t.seed).filter(Boolean));
  const extra: Task[] = have.has('kitchen-cupboard')
    ? []
    : [
        {
          id: makeId(),
          seed: 'kitchen-cupboard',
          title: 'Kitchen: clear out the old non-perishables cupboard',
          kind: 'task',
          spaceId: 'home',
          room: 'kitchen',
          someday: true,
          priority: 3,
          estimateMin: 30,
          createdAt: now.toISOString(),
          done: false,
        },
      ];
  return {
    ...state,
    tasks: [...tasks, ...extra],
    settings: {
      ...state.settings,
      dayPlans: { ...state.settings.dayPlans, '2026-11-19': { focus: 'home', paused: ['jobs'] }, '2026-11-20': { focus: 'jobs' } },
      setupSeen: false,
    },
  };
}

// ---- v7: dinner, 18 Nov 2026 ----
// Pick Sav up earlier so dinner gets cooked by 6. Weekends with Sav, cook from 5:20.

export const DINNER: (Omit<Task, 'id' | 'createdAt' | 'done' | 'kind' | 'at'> & { time: string })[] = [
  { seed: 'cook-weekday', title: 'Cook dinner', time: '17:40', repeatDays: [1, 2, 3, 4, 5], spaceId: 'sav', room: 'kitchen', onlyWhen: 'sav-home', estimateMin: 20, nag: true },
  { seed: 'cook-weekend', title: 'Cook dinner', time: '17:20', repeatDays: [0, 6], spaceId: 'sav', room: 'kitchen', onlyWhen: 'sav-home', estimateMin: 40, nag: true },
  { seed: 'dinner-me', title: 'Dinner for you', time: '18:30', repeatDays: [6], room: 'kitchen', onlyWhen: 'sav-away', estimateMin: 40 },
];

function applyV7(state: State, now: Date, makeId: () => string): State {
  const have = new Set(state.tasks.map((t) => t.seed).filter(Boolean));
  const day = today(now);
  const tasks = state.tasks.map((t) =>
    t.seed === 'nursery-pickup' && t.at ? { ...t, at: `${t.at.slice(0, 10)}T17:15`, title: 'Pick Sav up (latest 5:45)' } : t,
  );
  const added: Task[] = DINNER.filter((d) => !have.has(d.seed)).map(({ time, ...d }) => ({
    ...d,
    id: makeId(),
    kind: 'event',
    at: `${day}T${time}`,
    createdAt: now.toISOString(),
    done: false,
  }));
  return { ...state, tasks: [...tasks, ...added], settings: { ...state.settings, setupSeen: false } };
}

/** Starter items with a real time: these keep their slot. Everything else loses its made-up time. */
export const FIXED_SEEDS = new Set([
  'nursery-drop',
  'nursery-pickup',
  'sav-dinner',
  'sav-bed',
  'gym-weekday',
  'gym-saturday',
  'bins-out',
  'wind-down',
  'cook-weekday',
  'cook-weekend',
  'dinner-me',
  'job-stg',
  'job-culture-mile',
]);

/** Real deadlines from the job tracker. */
export const DEADLINES: Record<string, string> = {
  'job-whittington': '2026-11-20T12:00',
  'job-whittington-send': '2026-11-20T12:00',
};

/**
 * v8 (19 Nov): times only for things that really have one. House jobs and job search work become
 * a "next" list in the same order, never late. Evening house jobs wait until Sav's asleep. Real
 * deadlines count back with loud alerts. Dinner is cooked before pick up, not after.
 */
function applyV8(state: State): State {
  const tasks = state.tasks.map((t) => {
    if (t.seed === 'cook-weekday' && t.at) return { ...t, at: `${t.at.slice(0, 10)}T16:00`, estimateMin: 40 };
    if (!t.seed || !t.at || t.place || FIXED_SEEDS.has(t.seed)) return t;
    const time = t.at.slice(11, 16);
    return {
      ...t,
      kind: 'task' as const, // no real time, so not an appointment
      flex: true,
      ...(time >= '19:30' ? { after: '19:30' } : {}),
      ...(DEADLINES[t.seed] ? { dueAt: DEADLINES[t.seed] } : {}),
    };
  });
  return { ...state, tasks };
}

/** v9: jobs that lost their made-up time in v8 are jobs, not appointments. */
function applyV9(state: State): State {
  return { ...state, tasks: state.tasks.map((t) => (t.flex && t.kind === 'event' ? { ...t, kind: 'task' as const } : t)) };
}

/** Adds any setup not applied yet, in order. Pure. */
export function applySetup(state: State, now: Date, makeId: () => string): State {
  const v = state.settings.setupVersion ?? 0;
  if (v >= SETUP_VERSION) return state;
  let next = state;
  if (v < 3) next = applyV3(next, now, makeId);
  if (v < 4) next = applyV4(next, now, makeId);
  if (v < 5) next = applyV5(next, now, makeId);
  if (v < 6) next = applyV6(next, now, makeId);
  if (v < 7) next = applyV7(next, now, makeId);
  if (v < 8) next = applyV8(next);
  if (v < 9) next = applyV9(next);
  return { ...next, settings: { ...next.settings, setupVersion: SETUP_VERSION } };
}
