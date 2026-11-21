// "I'm avoiding this": a kind way into a room that's hard to start. Opened from the room screens
// (phone and tablet) and offered first when a room has been skipped or avoided three days running.
import type { ParsedItem } from '../lib/claude';
import { isTabletDevice } from '../lib/device';
import { AVOID_OPTIONS, logAvoid, nextDadSaturday } from '../lib/roomMode';
import { roomNameOf } from '../lib/time';
import type { Settings, State } from '../lib/types';
import { showSheet, type SheetOption } from './Sheet';

type Store = {
  state: State;
  updateSettings: (patch: Partial<Settings>) => void;
  startRound: (room: string, opts?: { checkInMin?: number }) => void;
  addItems: (items: ParsedItem[]) => void;
};

const shortDay = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
};

export function openAvoidSheet(store: Store, room: string, opts: { intro?: string } = {}) {
  const label = roomNameOf(store.state.settings.rooms, room) ?? room.replace(/-/g, ' ');
  showSheet({
    title: "What's making it hard?",
    message: opts.intro ?? `No wrong answer. The ${label.toLowerCase()} will still be there.`,
    options: AVOID_OPTIONS.map((o) => ({
      label: o.label,
      onPress: () => {
        // Phone-only (momentumLog never syncs): the reason, to spot patterns later.
        store.updateSettings({ momentumLog: logAvoid(store.state.settings.momentumLog, room, new Date(), o.reason) });
        const extra: SheetOption[] = [];
        if (o.reason === 'no-homes') {
          const sat = nextDadSaturday(store.state.settings, new Date());
          if (sat)
            extra.push({
              label: `Add "Sort the no home box" to ${shortDay(sat)}`,
              icon: 'calendar',
              onPress: () => store.addItems([{ title: 'Sort the no home box', kind: 'task', spaceId: 'home', room, day: sat, estimateMin: 20 }]),
            });
        }
        // A private note only ever saves on the phone (the tablet is a shared screen).
        if (o.reason === 'dont-want' && !isTabletDevice())
          extra.push({
            label: 'Keep a private note about it (Just for me)',
            icon: 'lock',
            onPress: () =>
              store.addItems([{ title: `Something in the ${label.toLowerCase()} I'm not ready to deal with yet. Boxed up, to plan separately.`, kind: 'note', spaceId: 'me' }]),
          });
        showSheet({
          title: o.advice,
          message: 'Ten minutes, then you can stop. It still counts.',
          options: [{ label: 'Start 10 minutes', icon: 'play', onPress: () => store.startRound(room, { checkInMin: 10 }) }, ...extra],
        });
      },
    })),
  });
}
