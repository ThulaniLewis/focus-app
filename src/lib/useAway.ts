// Away mode on this phone, for screens. Never on the tablet: away mode lives with her places.
import { useCallback } from 'react';
import { homeLinkedIds, pausedByAway } from './awayMode';
import { useDeviceRole } from './device';
import { useGeo } from './geoStore';
import { type Away, awayNow } from './grabLists';
import { useStore } from './store';
import type { Task } from './types';

export function useAway(): Away | null {
  const role = useDeviceRole();
  const geo = useGeo();
  return role === 'phone' ? awayNow(geo.away) : null;
}

/** Is this job paused tonight? Always false when she isn't away. */
export function useAwayPaused(): (t: Task) => boolean {
  const away = useAway();
  const geo = useGeo();
  const { state } = useStore();
  const linked = homeLinkedIds(geo.places, geo.links);
  return useCallback((t: Task) => !!away && pausedByAway(t, state, linked), [away, state, linked]);
}
