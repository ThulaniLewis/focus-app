// The sync engine: sends this device's shared changes to Supabase and brings the other device's in.
// The rules for what's shared and how changes merge live in sync.ts (tested).
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { configured, supabase } from './supabase';
import { afterPush, applyRemote, type Row, type Shadow, toPush } from './sync';
import type { State } from './types';

const META_KEY = 'focus.sync.v1';
const DEVICE_KEY = 'focus.deviceId';
const TABLE = 'focus_items';
const PUSH_DELAY_MS = 1200;

type Meta = { shadow: Shadow; lastPulled?: string; joined: boolean; userId?: string };

export type SyncStatus =
  | { state: 'off' }
  | { state: 'syncing' }
  | { state: 'ok'; at: string }
  | { state: 'error'; message: string };

async function deviceId(): Promise<string> {
  const have = await AsyncStorage.getItem(DEVICE_KEY);
  if (have) return have;
  const made = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await AsyncStorage.setItem(DEVICE_KEY, made);
  return made;
}

function friendly(e: unknown): string {
  const msg = String((e as any)?.message ?? e ?? '');
  if (/relation .*focus_items.* does not exist|Could not find the table/i.test(msg))
    return "Sync isn't set up in Supabase yet. Paste the setup from Claude into the SQL Editor.";
  if (/JWT|401|not authorized|permission/i.test(msg)) return 'Sign in again in Settings to keep syncing.';
  if (/network|fetch|Failed to fetch|timeout/i.test(msg)) return "Can't reach the internet. Your changes are saved here and will sync later.";
  return msg || 'Sync hit a problem. Your changes are saved here.';
}

/**
 * One sync session for a signed-in user. `get` returns the latest state; `apply` puts a state
 * that came from the other device into the app (not undoable, not re-sent).
 */
export function createSync(opts: { get: () => State; apply: (s: State) => void; onStatus: (s: SyncStatus) => void }) {
  let meta: Meta = { shadow: {}, joined: false };
  let device = '';
  let userId = '';
  let channel: RealtimeChannel | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let busy = false;
  let again = false;
  let stopped = false;

  const save = () => AsyncStorage.setItem(META_KEY, JSON.stringify(meta)).catch(() => {});

  const take = (rows: Row[], firstSync = false) => {
    const mine = rows.filter((r) => r.updated_by !== device);
    for (const r of rows) if (r.updated_at && (!meta.lastPulled || r.updated_at > meta.lastPulled)) meta.lastPulled = r.updated_at;
    if (!mine.length) return;
    const before = opts.get();
    const { state, shadow } = applyRemote(before, meta.shadow, mine, { firstSync });
    meta.shadow = shadow;
    if (state !== before) opts.apply(state);
  };

  async function pull(firstSync = false) {
    const all: Row[] = [];
    for (let from = 0; ; from += 1000) {
      let q = supabase.from(TABLE).select('id, kind, data, deleted, updated_at, updated_by').order('updated_at').range(from, from + 999);
      if (meta.lastPulled && !firstSync) q = q.gt('updated_at', meta.lastPulled);
      const { data, error } = await q;
      if (error) throw error;
      all.push(...((data ?? []) as Row[]));
      if (!data || data.length < 1000) break;
    }
    take(all, firstSync);
  }

  async function push() {
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    try {
      do {
        again = false;
        const rows = toPush(opts.get(), meta.shadow);
        if (!rows.length) break;
        opts.onStatus({ state: 'syncing' });
        for (let i = 0; i < rows.length; i += 200) {
          const chunk = rows.slice(i, i + 200);
          const { error } = await supabase.from(TABLE).upsert(
            chunk.map((r) => ({ user_id: userId, id: r.id, kind: r.kind, data: r.data, deleted: !!r.deleted, updated_by: device })),
          );
          if (error) throw error;
          meta.shadow = afterPush(meta.shadow, chunk);
        }
        await save();
      } while (again && !stopped);
      opts.onStatus({ state: 'ok', at: new Date().toISOString() });
    } catch (e) {
      opts.onStatus({ state: 'error', message: friendly(e) });
    } finally {
      busy = false;
    }
  }

  return {
    async start() {
      if (!configured) return opts.onStatus({ state: 'off' });
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) return opts.onStatus({ state: 'off' });
        userId = data.user.id;
        device = await deviceId();
        const raw = await AsyncStorage.getItem(META_KEY);
        meta = raw ? JSON.parse(raw) : { shadow: {}, joined: false };
        // A different account on this device: start afresh.
        if (meta.userId && meta.userId !== userId) meta = { shadow: {}, joined: false };
        meta.userId = userId;
        opts.onStatus({ state: 'syncing' });
        const first = !meta.joined;
        await pull(first);
        meta.joined = true;
        await save();
        await push();
        if (stopped) return;
        channel = supabase
          .channel(`focus-${userId}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: TABLE, filter: `user_id=eq.${userId}` }, (payload) => {
            const row = payload.new as Row | undefined;
            if (row && row.id) {
              take([row]);
              save();
            }
          })
          .subscribe();
      } catch (e) {
        opts.onStatus({ state: 'error', message: friendly(e) });
      }
    },
    /** Something changed on this device: send it shortly (changes close together go as one). */
    local() {
      if (!userId || stopped) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => push(), PUSH_DELAY_MS);
    },
    /** Back in the app: catch up on anything missed while it was closed. */
    async resume() {
      if (!userId || stopped) return;
      try {
        await pull();
        await save();
        await push();
      } catch (e) {
        opts.onStatus({ state: 'error', message: friendly(e) });
      }
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (channel) supabase.removeChannel(channel);
    },
  };
}
