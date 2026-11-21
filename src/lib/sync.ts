// Sync rules: which parts of Focus are shared between phone and tablet, and how changes merge.
// No phone code here, so it can be tested. The engine that talks to Supabase is syncClient.ts.
//
// Privacy: anything in a phone-only space (Just for me, Money), Just for me notes, check-ins,
// momentum notes and anything about sleep NEVER leaves the phone. They aren't uploaded at all,
// so they can't appear on the tablet, even by mistake.
import type { Settings, Space, State, Task } from './types';

export type RowKind = 'task' | 'settings' | 'spaces';
export type Row = { id: string; kind: RowKind; data: any; deleted?: boolean; updated_at?: string; updated_by?: string | null };
/** What was last agreed with the server for each row: a fingerprint of its data. */
export type Shadow = Record<string, string>;

/** Settings both devices share. Everything else stays on the device it was set on. */
export const SHARED_SETTINGS = [
  'dayEnd',
  'bufferMin',
  'readyMin',
  'rooms',
  'round',
  'roundLog',
  'places',
  'awayWords',
  'firstName',
  'savPattern',
  'setupVersion',
  'setupSeen',
  'dayPlans',
  'savNap',
  'nurseryWindow',
  'punctualityLog',
  'weatherPlace',
] as const satisfies readonly (keyof Settings)[];

/** The same data always gives the same fingerprint, whatever order its keys were written in. */
export function fingerprint(v: unknown): string {
  const norm = (x: any): any =>
    Array.isArray(x)
      ? x.map(norm)
      : x && typeof x === 'object'
        ? Object.keys(x)
            .sort()
            .reduce((o: any, k) => (x[k] === undefined ? o : ((o[k] = norm(x[k])), o)), {})
        : x;
  return JSON.stringify(norm(v));
}

export function isPrivateSpace(spaceId: string | undefined, spaces: Space[]) {
  if (!spaceId) return false;
  const sp = spaces.find((s) => s.id === spaceId);
  return sp ? sp.privacy !== 'everywhere' : spaceId === 'me' || spaceId === 'money';
}

export const isPrivateTask = (t: Task, spaces: Space[]) => isPrivateSpace(t.spaceId, spaces);

const taskRowId = (id: string) => `t:${id}`;

/**
 * Each shared setting is its own row ("s:rooms"), so a change to one setting on the tablet and to
 * another on the phone both survive. The row's data is { [key]: value }, the same shape the old single
 * "settings" row used, so older builds still read it. That old row is still accepted when it comes in.
 */
type SharedKey = (typeof SHARED_SETTINGS)[number];
const LEGACY_SETTINGS_ID = 'settings';
export const settingRowId = (key: SharedKey) => `s:${key}`;
const settingKeyOf = (rowId: string): SharedKey | null => {
  if (!rowId.startsWith('s:')) return null;
  const k = rowId.slice(2);
  return (SHARED_SETTINGS as readonly string[]).includes(k) ? (k as SharedKey) : null;
};
const settingData = (settings: Settings, key: SharedKey) => ({ [key]: settings[key] });

/** How much has been done on a job: ticks, partial days, timed sessions. */
const progress = (t: Task) =>
  (t.done ? 10 : 0) + (t.doneDays?.length ?? 0) * 3 + (t.partialDays?.length ?? 0) + (t.history?.length ?? 0) + (t.timer ? 1 : 0);

/** Everything this device would share right now, as rows keyed by row id. */
export function localRows(state: State): Map<string, Row> {
  const rows = new Map<string, Row>();
  for (const t of state.tasks) {
    if (isPrivateTask(t, state.spaces)) continue;
    rows.set(taskRowId(t.id), { id: taskRowId(t.id), kind: 'task', data: t });
  }
  for (const k of SHARED_SETTINGS) {
    const id = settingRowId(k);
    rows.set(id, { id, kind: 'settings', data: settingData(state.settings, k) });
  }
  rows.set('spaces', { id: 'spaces', kind: 'spaces', data: state.spaces.filter((s) => s.privacy === 'everywhere') });
  return rows;
}

/**
 * A shared setting this device has never had a value for, and never synced. It has nothing to send,
 * and it must not count as "changed here": otherwise a device that updated before a setting existed
 * (say the tablet, before weatherPlace) would push an empty value over the other device's real one.
 */
const neverSet = (row: Row | undefined, shadow: Shadow) =>
  !!row && row.kind === 'settings' && shadow[row.id] === undefined && Object.values(row.data ?? {}).every((v) => v === undefined);

/** Rows that changed since the last sync, plus deletions for shared things that have gone. */
export function toPush(state: State, shadow: Shadow): Row[] {
  const rows = localRows(state);
  const out: Row[] = [];
  for (const [id, r] of rows) if (shadow[id] !== fingerprint(r.data) && !neverSet(r, shadow)) out.push(r);
  // Only tasks are ever deleted. (The old single settings row is left alone for older builds.)
  for (const id of Object.keys(shadow))
    if (id.startsWith('t:') && !rows.has(id) && shadow[id] !== DELETED) out.push({ id, kind: 'task', data: null, deleted: true });
  return out;
}

export const DELETED = '__deleted__';

/** After a successful push, remember what the server now has. */
export function afterPush(shadow: Shadow, pushed: Row[]): Shadow {
  const next = { ...shadow };
  for (const r of pushed) {
    if (r.deleted) delete next[r.id];
    else next[r.id] = fingerprint(r.data);
  }
  return next;
}

/**
 * Bring rows from the server into this device's state.
 * - Never touches private things on this device.
 * - If this device has an unsent change to the same thing, this device's version wins (it's
 *   about to be sent).
 * - On a device's very first sync, if the server already has Focus data (say the tablet joining
 *   the phone), the server's shared tasks replace this device's, so starter jobs aren't doubled.
 */
export function applyRemote(
  state: State,
  shadow: Shadow,
  rows: Row[],
  opts: { firstSync?: boolean } = {},
): { state: State; shadow: Shadow } {
  if (!rows.length) return { state, shadow };
  const nextShadow: Shadow = { ...shadow };
  const local = localRows(state);
  const dirty = (id: string) => !opts.firstSync && local.has(id) && shadow[id] !== fingerprint(local.get(id)!.data) && !neverSet(local.get(id), shadow);

  let tasks = state.tasks;
  let settings = state.settings;
  let spaces = state.spaces;

  // Joining an account that already has Focus data: merge, never wipe. Your own jobs stay, and
  // when both devices have the same starter job, the copy with more done on it wins.

  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const r of rows) {
    if (r.kind === 'task') {
      const taskId = r.id.slice(2);
      if (dirty(r.id)) continue;
      const mine = byId.get(taskId);
      if (mine && isPrivateTask(mine, spaces)) continue;
      if (r.deleted || !r.data) {
        byId.delete(taskId);
        delete nextShadow[r.id];
        continue;
      }
      const t = r.data as Task;
      if (isPrivateTask(t, spaces)) continue;
      // The same starter job made separately on each device: keep one, the one with more done.
      if (t.seed) {
        let keepMine = false;
        for (const [otherId, other] of byId)
          if (otherId !== t.id && other.seed === t.seed && !isPrivateTask(other, spaces)) {
            if (progress(other) > progress(t)) keepMine = true;
            else {
              byId.delete(otherId);
              delete nextShadow[taskRowId(otherId)];
            }
          }
        if (keepMine) continue;
      }
      byId.set(t.id, t);
      nextShadow[r.id] = fingerprint(t);
    } else if (r.kind === 'settings') {
      if (r.deleted || !r.data || typeof r.data !== 'object') continue;
      const one = settingKeyOf(r.id);
      // One setting per row; the old single row carries several. Only shared keys are ever taken.
      const keys: SharedKey[] = one ? [one] : r.id === LEGACY_SETTINGS_ID ? SHARED_SETTINGS.filter((k) => k in r.data) : [];
      for (const k of keys) {
        const rowId = settingRowId(k);
        if (dirty(rowId)) continue; // changed here and not sent yet: this device's value wins
        settings = { ...settings, [k]: r.data[k] };
        nextShadow[rowId] = fingerprint(settingData(settings, k));
      }
    } else if (r.kind === 'spaces' && Array.isArray(r.data) && !dirty('spaces')) {
      const remote = r.data as Space[];
      // Shared spaces come from the server; this device's private spaces stay as they are.
      spaces = [...remote.filter((s) => s.privacy === 'everywhere'), ...spaces.filter((s) => s.privacy !== 'everywhere' && !remote.some((x) => x.id === s.id))];
      nextShadow.spaces = fingerprint(spaces.filter((s) => s.privacy === 'everywhere'));
    }
  }
  tasks = [...byId.values()];
  // Nothing actually different (say an echo of what's here already): hand back the same state, so the
  // app doesn't treat it as a change from the other device.
  const same =
    fingerprint(tasks) === fingerprint(state.tasks) &&
    fingerprint(settings) === fingerprint(state.settings) &&
    fingerprint(spaces) === fingerprint(state.spaces);
  return { state: same ? state : { ...state, tasks, settings, spaces }, shadow: nextShadow };
}
