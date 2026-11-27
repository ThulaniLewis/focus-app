// What each kind of place is for. Data, not rules she builds: the type decides what Focus does there,
// and each thing it does is one plain sentence with its own switch. A new type or behaviour is a new
// row here. Nothing in this file knows anyone's places; names come from the place itself.

export type PlaceType = 'home' | 'food-shop' | 'school' | 'work' | 'family' | 'gym' | 'other';

/** Something Focus does at a place, switchable per place. */
export type Behaviour = 'offer-shopping-list' | 'leave-by' | 'linked-tasks' | 'reminders' | 'work-routine' | 'gym-tick';

export type PlaceTypeInfo = {
  id: PlaceType;
  label: string;
  icon: string;
  radiusM: number;
  /** What Focus does at this kind of place. Only these get a switch. */
  behaviours: Behaviour[];
  /** Asked for by type in setup and on the Places list, until she has one or skips it. */
  ask?: { question: string; about: string };
};

/** In the order they're asked for. */
export const PLACE_TYPES: PlaceTypeInfo[] = [
  { id: 'home', label: 'Home', icon: 'home', radiusM: 175, behaviours: [], ask: { question: "Where's home?", about: 'Focus notes when you get in and head out.' } },
  {
    id: 'food-shop',
    label: 'Food shop',
    icon: 'shopping-cart',
    radiusM: 120,
    behaviours: ['offer-shopping-list'],
    ask: { question: 'Where do you do your food shop?', about: 'Your shopping list pops up when you get there.' },
  },
  {
    id: 'work',
    label: 'Work',
    icon: 'briefcase',
    radiusM: 150,
    behaviours: ['work-routine', 'reminders'],
    ask: { question: 'Do you work from an office? Where?', about: 'Focus shows your meetings and work list when you arrive.' },
  },
  {
    id: 'school',
    label: 'Nursery or school',
    icon: 'smile',
    radiusM: 120,
    behaviours: ['leave-by', 'linked-tasks', 'reminders'],
    ask: { question: 'Is there a nursery or school you do drop off at?', about: 'Focus works out when to leave, and shows anything you need to tell them.' },
  },
  { id: 'family', label: 'Family', icon: 'users', radiusM: 120, behaviours: ['linked-tasks', 'reminders'] },
  { id: 'gym', label: 'Gym', icon: 'activity', radiusM: 120, behaviours: ['gym-tick', 'reminders'] },
  { id: 'other', label: 'Other', icon: 'map-pin', radiusM: 120, behaviours: ['linked-tasks', 'reminders'] },
];

export const typeInfo = (t: PlaceType): PlaceTypeInfo => PLACE_TYPES.find((x) => x.id === t) ?? PLACE_TYPES[PLACE_TYPES.length - 1];

/** Old saved types from before Fix 2. */
export function cleanType(t: unknown): PlaceType {
  if (t === 'nursery') return 'school';
  return PLACE_TYPES.some((x) => x.id === t) ? (t as PlaceType) : 'other';
}

/** What a place needs to say its sentences. */
export type SentenceCtx = {
  name: string;
  type: PlaceType;
  /** "Drop off 08:00 and pick up 17:15, weekdays", from the trips that go here. */
  trips?: string | null;
  /** The task the gym ticks off. */
  gymTask?: string | null;
};

/** The plain sentence for one behaviour at one place. */
export function sentence(b: Behaviour, p: SentenceCtx): string {
  switch (b) {
    case 'offer-shopping-list':
      return `When you arrive at ${p.name}, Focus asks if you want your shopping list, if there's anything on it.`;
    case 'leave-by':
      return p.trips ? `${p.trips}. Focus works out when to leave.` : 'Trips here get a leave-by time. Choose which ones below.';
    case 'linked-tasks':
      return 'Any tasks linked here, Focus asks about when you arrive.';
    case 'reminders':
      return p.type === 'school'
        ? `When you arrive at ${p.name}, Focus will show you anything you need to tell them.`
        : `When you arrive at ${p.name}, Focus shows you any reminders for here.`;
    case 'work-routine':
      return `When you arrive at ${p.name}, Focus shows today's meetings, your work list and when to leave for the next fixed thing.`;
    case 'gym-tick':
      return `When you're at ${p.name}, Focus ticks off ${p.gymTask ? `"${p.gymTask}"` : 'your gym task'}.`;
  }
}

/** The line every place has, with no switch: the log is how home or out works. */
export const LOG_LINE = 'Arrivals and departures always go in the Places log.';

/** Is this behaviour on at this place? Only the type's own behaviours can ever be on. */
export function does(place: { type: PlaceType; off?: Behaviour[] }, b: Behaviour): boolean {
  return typeInfo(place.type).behaviours.includes(b) && !(place.off ?? []).includes(b);
}

/** The short line under a place on the Places list. */
export function summaryLine(place: { type: PlaceType; off?: Behaviour[] }, reminders: number, linked = 0): string {
  const info = typeInfo(place.type);
  const bits: string[] = [];
  if (place.type === 'home') bits.push('Notes when you get in and head out');
  else bits.push(info.label);
  if (does(place, 'offer-shopping-list')) bits.push('offers your shopping list');
  if (does(place, 'leave-by')) bits.push('drop off and pick up');
  if (does(place, 'work-routine')) bits.push('work routine');
  if (does(place, 'gym-tick')) bits.push('ticks off the gym');
  if (does(place, 'linked-tasks') && linked) bits.push(`${linked} linked ${linked === 1 ? 'task' : 'tasks'}`);
  if (does(place, 'reminders')) bits.push(reminders ? `${reminders} ${reminders === 1 ? 'reminder' : 'reminders'}` : 'reminders');
  return bits.join(' · ');
}
