// "Take me to it": tapping a notification opens the screen with that job, scrolls to it and
// flashes it, like Samsung Settings search does. If no row on screen shows the job, a fallback runs
// (Focus opens the job's options instead), so a tap always lands on something you can act on.
import { useEffect, useState } from 'react';

type Req = { id: string; at: number; claimed: boolean };
let current: Req | null = null;
const listeners = new Set<() => void>();
const FLASH_MS = 2600;

export function requestHighlight(id: string, fallback?: () => void, waitMs = 1500) {
  const req: Req = { id, at: Date.now(), claimed: false };
  current = req;
  listeners.forEach((l) => l());
  if (fallback)
    setTimeout(() => {
      if (current === req && !req.claimed) fallback();
    }, waitMs);
}

/** A row calls this when it shows the job, so the fallback isn't needed. */
export function claimHighlight(id: string) {
  if (current?.id === id) current.claimed = true;
}

/** True while this job should flash. */
export function useHighlighted(id: string) {
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  const on = !!current && current.id === id && Date.now() - current.at < FLASH_MS;
  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => tick((n) => n + 1), FLASH_MS);
    return () => clearTimeout(t);
  }, [on]);
  return on;
}
