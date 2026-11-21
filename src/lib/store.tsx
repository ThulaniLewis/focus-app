import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { AUTH_REDIRECT, configured, signInFromLink, supabase } from './supabase';
import * as Linking from 'expo-linking';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { cancelRoundCheckIn, clearJob, scheduleRoundCheckIn, syncNotifications, tidyPresented } from './notify';
import { CHECK_IN_MIN, checkInAt, checkInText } from './roomMode';
import { applyComeUp as applyComeUpTo, type ComeUpPlan } from './comeUp';
import { isTracked, logAnswer, notYetUntil, unlogAnswer, withTime } from './punctuality';
import { addNights, applyEasierDay as applyEasierDayTo, type EasierDay, type SleepNight } from './sleep';
import { noteProblem } from './crash';
import { createSync, type SyncStatus } from './syncClient';
import { AppState } from 'react-native';
import { dayKey, elapsedSec, roomNameOf, slug } from './time';
import { addToCalendar } from './calendar';
import { migrate } from './migrate';
import { applySetup } from './seed';
import { markWith } from './marks';
import { appendLog, type DevEvent, touched } from './devlog';
import { onClaudeUsage, type ParsedItem } from './claude';
import * as Notifications from 'expo-notifications';
import { type DayPlan, DEFAULT_SETTINGS, DEFAULT_SPACES, type Room, type Settings, type Space, type State, type Task } from './types';

const KEY = 'focus.state.v1';
const API_KEY = 'anthropic_api_key';

const id = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const nowISO = () => new Date().toISOString();

type Ctx = {
  ready: boolean;
  state: State;
  /** Signed-in email, or null. */
  user: string | null;
  /** Problem finishing sign-in from an email link, if any. */
  linkError: string | null;
  sendCode: (email: string) => Promise<string | null>;
  verifyCode: (email: string, code: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  canUndo: string | null;
  undoRev: number;
  undo: () => void;
  /** Adds to the dev report's log. Not undoable, never synced. */
  logEvent: (ev: DevEvent) => void;
  addItems: (items: ParsedItem[]) => void;
  addNotes: (notes: string[]) => void;
  toggleDone: (taskId: string, day?: string) => void;
  /** Pause a task's nudges for a while. */
  snooze: (taskId: string, minutes: number) => void;
  /** Set what comes first on a day, and what's paused. */
  setDayPlan: (day: string, plan: DayPlan) => void;
  remove: (taskId: string) => void;
  startTimer: (taskId: string) => void;
  pauseTimer: (taskId: string) => void;
  finishTimer: (taskId: string) => void;
  /** Stop a job: keep the time, mark it done or started, and add what's left as its own to-dos. */
  finishSession: (taskId: string, day: string, allDone: boolean, leftovers: { title: string; need: boolean; room?: string; day?: string }[], alsoDone?: string[], alsoStarted?: string[]) => void;
  /** Start (or carry on) a round of a whole room. Pauses any single job's timer. */
  startRound: (room: string, opts?: { checkInMin?: number }) => void;
  pauseRound: () => void;
  cancelRound: () => void;
  /** Stop a room round: tick and mark jobs, add what's left, keep the time. */
  finishRound: (day: string, done: string[], started: string[], leftovers: { title: string; need: boolean; room?: string; day?: string }[]) => void;
  /** On time (0), late by roughly lateMin, or skipped (null), for a fixed time with a place. */
  answerPunctuality: (taskId: string, day: string, lateMin: number | null) => void;
  /** Accept a better-fitting drop-off time: leave-by and get-up move with it. */
  acceptDropTime: (taskId: string, hm: string) => void;
  /** "Not yet" to a suggested drop-off time: ask again in a week. */
  dropTimeNotYet: (key: string) => void;
  /** Phone only: read sleep from Health Connect ("yes") or not ("no"). */
  setSleepReading: (v: 'yes' | 'no') => void;
  /** Phone only: nights read from Health Connect. Not undoable (it's a reading, not a change she made). */
  addSleepNights: (nights: SleepNight[]) => void;
  /** "Not today" on the short night card. */
  sleepNotToday: () => void;
  /** After a short night: put the offers she ticked into effect. */
  applyEasierDay: (offer: EasierDay, picked: { nap: boolean; biggest: 'first' | 'saturday' | null; windDown: boolean }) => void;
  /** "Something's come up": put what she confirmed into effect. Only adds and moves, never drops. */
  applyComeUp: (plan: Pick<ComeUpPlan, 'add' | 'events' | 'moves' | 'savSick'>) => void;
  /** Waiting mode: "Not now" for this trigger, today. */
  waitingNotNow: (key: string) => void;
  /** Several changes that undo together as one (say a dump's Save). */
  batch: (label: string, fn: () => void) => void;
  /** From a dump: tick finished jobs, and mark ones with bits left as started. */
  markJobs: (day: string, done: string[], started: string[]) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  setTravel: (placeName: string, travelMin: number) => void;
  setRooms: (rooms: Room[]) => void;
  addSpace: (name: string) => void;
  updateSpace: (spaceId: string, patch: Partial<Pick<Space, 'name' | 'privacy'>>) => void;
  deleteSpace: (spaceId: string) => void;
  moveToSpace: (taskId: string, spaceId: string | undefined) => void;
  addCheckin: (feeling: string) => void;
  removeNote: (noteId: string) => void;
};

const ACTION_KEY = 'focus.lastNotificationAction';

const StoreContext = createContext<(Ctx & { sync: SyncStatus }) | null>(null);


const empty: State = { tasks: [], notes: [], spaces: DEFAULT_SPACES, checkins: [], settings: DEFAULT_SETTINGS };

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>(empty);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<string | null>(null);
  const history = useRef<{ state: State; label: string }[]>([]);
  const [canUndo, setCanUndo] = useState<string | null>(null);
  const [undoRev, setUndoRev] = useState(0);
  /** Saved data couldn't be read: don't save anything over it. */
  const loadFailed = useRef(false);

  useEffect(() => {
    let loadedOk = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        let loaded: State = empty;
        if (raw) {
          try {
            loaded = migrate(JSON.parse(raw));
          } catch (e) {
            // Never save over data we couldn't read: keep a copy and stop saving until it's sorted.
            await AsyncStorage.setItem(`${KEY}.unreadable`, raw).catch(() => {});
            loadFailed.current = true;
            noteProblem(
              `Focus couldn't read your saved tasks, so it isn't saving anything over them. A copy is kept safely. Send Claude a screenshot of this. (${String((e as any)?.message ?? e)})`,
            );
          }
        }
        let withSetup = loaded;
        try {
          withSetup = applySetup(loaded, new Date(), id);
        } catch (e) {
          // Starter jobs are a bonus: keep her real data as it is rather than lose it.
          noteProblem(`Focus couldn't add its starter jobs, but your own tasks are safe. (${String((e as any)?.message ?? e)})`);
        }
        setState(withSetup);
        loadedOk = true;
        // Earlier builds kept an Anthropic key on the phone. Remove it.
        SecureStore.deleteItemAsync(API_KEY).catch(() => {});
        if (configured) {
          const { data } = await supabase.auth.getSession();
          setUser(data.session?.user.email ?? null);
        }
      } catch (e) {
        if (!loadedOk) noteProblem(`Focus couldn't open your saved tasks, so it isn't saving anything over them. (${String((e as any)?.message ?? e)})`);
      } finally {
        // Anything went wrong before the saved data was in place: never save over it.
        if (!loadedOk) loadFailed.current = true;
        setReady(true);
      }
    })();
  }, []);

  // Sign-in links from the email open the app at focus://auth#access_token=…
  const [linkError, setLinkError] = useState<string | null>(null);
  useEffect(() => {
    if (!configured) return;
    const handle = (url: string | null) => {
      if (!url) return;
      signInFromLink(url).then((r) => {
        if (r && r !== 'ignore') setLinkError(r);
        else if (r === null) setLinkError(null);
      });
    };
    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!configured) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user.email ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!ready || loadFailed.current) return;
    AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
    syncNotifications(state);
  }, [state, ready]);

  /** Every change goes through here so it can be undone. */
  const latest = useRef(state);
  latest.current = state;
  /** While a batch runs, its changes share one undo step: the state from before the first one. */
  const batching = useRef<{ label: string; pushed: boolean } | null>(null);
  const change = useCallback((label: string, fn: (s: State) => State) => {
    const prev = latest.current;
    const changed = fn(prev);
    if (changed === prev) return;
    // The dev report's activity log rides along, but undo never takes entries away (see undo).
    const next = { ...changed, devLog: appendLog(changed.devLog, { at: nowISO(), kind: 'change', label, tasks: touched(prev.tasks, changed.tasks) }) };
    latest.current = next;
    const b = batching.current;
    if (!b || !b.pushed) {
      history.current = [...history.current.slice(-9), { state: prev, label: b ? b.label : label }];
      if (b) b.pushed = true;
      setUndoRev((r) => r + 1);
    }
    setCanUndo(b ? b.label : label);
    setState(next);
  }, []);

  /** A change from the other device: it can't be undone here, so earlier undo steps (from before it) go. */
  const applyRemoteState = useCallback((remote: State) => {
    const next = { ...remote, devLog: latest.current.devLog };
    latest.current = next;
    history.current = [];
    setCanUndo(null);
    setState(next);
  }, []);

  const mapTask = (taskId: string, fn: (t: Task) => Task) => (s: State) => ({
    ...s,
    tasks: s.tasks.map((t) => (t.id === taskId ? fn(t) : t)),
  });

  const undo = useCallback(() => {
    const last = history.current.pop();
    if (!last) return;
    // Calendar links are added after the change (not undoable): keep them, so undo doesn't orphan
    // the copy in the phone's calendar.
    const cal = new Map(latest.current.tasks.filter((t) => t.calendarEventId).map((t) => [t.id, t.calendarEventId]));
    const restored = cal.size
      ? { ...last.state, tasks: last.state.tasks.map((t) => (cal.has(t.id) && !t.calendarEventId ? { ...t, calendarEventId: cal.get(t.id) } : t)) }
      : last.state;
    const kept = { ...restored, devLog: appendLog(latest.current.devLog, { at: nowISO(), kind: 'change', label: `Undid: ${last.label}` }) };
    latest.current = kept;
    setState(kept);
    setCanUndo(history.current.at(-1)?.label ?? null);
  }, []);

  const logEvent = useCallback((ev: DevEvent) => {
    const next = { ...latest.current, devLog: appendLog(latest.current.devLog, ev) };
    latest.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    onClaudeUsage((u) => logEvent({ at: nowISO(), kind: 'claude', ...u }));
    return () => onClaudeUsage(null);
  }, [logEvent]);

  const value = useMemo<Ctx>(
    () => ({
      ready,
      state,
      user,
      linkError,
      canUndo,
      undoRev,
      undo,
      logEvent,
      async sendCode(email) {
        if (!configured) return 'Add your Supabase details in src/config.ts first.';
        const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { emailRedirectTo: AUTH_REDIRECT, shouldCreateUser: false } });
        return error ? error.message : null;
      },
      async verifyCode(email, code) {
        const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
        return error ? error.message : null;
      },
      async signOut() {
        await supabase.auth.signOut();
        setUser(null);
      },
      addItems(items) {
        const today = dayKey(new Date());
        const added = items.map<Task>((p) => ({
              id: id(),
              title: p.title,
              kind: p.kind,
              spaceId: p.spaceId,
              list: p.list,
              group: p.group,
              room: p.room,
              grab: p.grab,
              at: p.at,
              repeatDays: p.repeatDays?.length ? p.repeatDays : undefined,
              place: p.place,
              estimateMin: p.estimateMin,
              day: p.at ? undefined : (p.day ?? today), // a deadline shows from today until it's done
              dueAt: p.dueAt,
              dueDay: p.dueDay,
              createdAt: nowISO(),
              done: false,
            }));
        change(`Added ${items.length}`, (s) => ({ ...s, tasks: [...s.tasks, ...added] }));
        // Copy one-off fixed times into the phone's calendar (not undoable, so done after).
        if (latest.current.settings.writeCalendar) {
          for (const t of added) {
            if (t.kind !== 'event' || !t.at || t.repeatDays?.length) continue;
            addToCalendar(t.title, t.at, t.place).then((calId) => {
              if (!calId) return;
              const next = { ...latest.current, tasks: latest.current.tasks.map((x) => (x.id === t.id ? { ...x, calendarEventId: calId } : x)) };
              latest.current = next;
              setState(next);
            });
          }
        }
      },
      addNotes(notes) {
        if (!notes.length) return;
        change('Saved note', (s) => ({
          ...s,
          notes: [...notes.map((text) => ({ id: id(), text, createdAt: nowISO() })), ...s.notes],
        }));
      },
      toggleDone(taskId, day) {
        change('Ticked', (s) => {
          const ticked = mapTask(taskId, (t) => {
            if (t.repeatDays?.length && day) {
              const has = (t.doneDays ?? []).includes(day);
              return { ...t, doneDays: has ? t.doneDays!.filter((d) => d !== day) : [...(t.doneDays ?? []), day] };
            }
            const done = !t.done;
            // Ticking a running timer stops it and keeps the time.
            if (done && t.timer) {
              const sec = elapsedSec(t.timer, new Date());
              return { ...t, done, doneAt: nowISO(), timer: undefined, actualMin: Math.max(1, Math.round(sec / 60)) };
            }
            return { ...t, done, doneAt: done ? nowISO() : undefined };
          })(s);
          // On time or late: a fixed time with a place asks "how did it go?" on this device.
          const t = ticked.tasks.find((x) => x.id === taskId);
          if (!t || !isTracked(t)) return ticked;
          const d = t.repeatDays?.length && day ? day : dayKey(new Date());
          const nowDone = t.repeatDays?.length && day ? (t.doneDays ?? []).includes(day) : t.done;
          const ask = (ticked.settings.punctualityAsk ?? []).filter((a) => !(a.taskId === taskId && a.day === d));
          return {
            ...ticked,
            settings: {
              ...ticked.settings,
              punctualityAsk: nowDone ? [...ask, { taskId, day: d }].slice(-10) : ask,
              punctualityLog: nowDone ? ticked.settings.punctualityLog : unlogAnswer(ticked.settings.punctualityLog, t, d),
            },
          };
        });
      },
      answerPunctuality(taskId, day, lateMin) {
        change(lateMin === null ? 'Skipped' : lateMin ? 'Saved: late' : 'Saved: on time', (s) => {
          const t = s.tasks.find((x) => x.id === taskId);
          const ask = (s.settings.punctualityAsk ?? []).filter((a) => !(a.taskId === taskId && a.day === day));
          const log = t && lateMin !== null ? logAnswer(s.settings.punctualityLog, t, day, lateMin, new Date()) : s.settings.punctualityLog;
          return { ...s, settings: { ...s.settings, punctualityAsk: ask, punctualityLog: log } };
        });
      },
      acceptDropTime(taskId, hm) {
        change(`Planned for ${hm}`, mapTask(taskId, (t) => withTime(t, hm)));
      },
      dropTimeNotYet(key) {
        change('Not yet', (s) => ({ ...s, settings: { ...s.settings, punctualityNotYet: { ...(s.settings.punctualityNotYet ?? {}), [key]: notYetUntil(new Date()) } } }));
      },
      setDayPlan(day, plan) {
        change('Changed the plan', (s) => {
          const dayPlans = { ...s.settings.dayPlans };
          if (!plan.focus && !plan.paused?.length && !plan.savHome && !plan.waitingOff?.length) delete dayPlans[day];
          else dayPlans[day] = plan;
          return { ...s, settings: { ...s.settings, dayPlans } };
        });
      },
      snooze(taskId, minutes) {
        change('Snoozed', mapTask(taskId, (t) => ({ ...t, snoozeUntil: new Date(Date.now() + minutes * 60000).toISOString() })));
      },
      remove(taskId) {
        change('Deleted', (s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== taskId) }));
      },
      startTimer(taskId) {
        // Starting a single job pauses any room round, so its check-in goes too.
        if (latest.current.settings.round?.startedAt) cancelRoundCheckIn();
        change('Started timer', (s) => ({
          ...s,
          settings: {
            ...s.settings,
            // Back at it before the break nudge: drop it.
            comeBack: s.settings.comeBack?.kind === 'break' ? null : s.settings.comeBack,
            round: s.settings.round?.startedAt
              ? { ...s.settings.round, startedAt: undefined, accumulatedSec: elapsedSec(s.settings.round, new Date()) }
              : s.settings.round,
          },
          tasks: s.tasks.map((t) => {
            // One timer at a time: pause any other running timer.
            if (t.id !== taskId && t.timer?.startedAt) {
              return { ...t, timer: { accumulatedSec: elapsedSec(t.timer, new Date()) } };
            }
            if (t.id === taskId) return { ...t, timer: { startedAt: nowISO(), accumulatedSec: t.timer?.accumulatedSec ?? 0 } };
            return t;
          }),
        }));
      },
      pauseTimer(taskId) {
        change('Paused timer', mapTask(taskId, (t) =>
          t.timer ? { ...t, timer: { accumulatedSec: elapsedSec(t.timer, new Date()) } } : t,
        ));
      },
      finishTimer(taskId) {
        change('Finished', mapTask(taskId, (t) => {
          const sec = elapsedSec(t.timer, new Date());
          return { ...t, done: true, doneAt: nowISO(), timer: undefined, actualMin: Math.max(1, Math.round(sec / 60)) };
        }));
      },
      finishSession(taskId, day, allDone, leftovers, alsoDone = [], alsoStarted = []) {
        change(allDone ? 'Done' : 'Saved what\'s left', (s) => {
          const t = s.tasks.find((x) => x.id === taskId);
          if (!t) return s;
          const sec = t.timer ? elapsedSec(t.timer, new Date()) : 0;
          const actualMin = sec ? Math.max(1, Math.round(sec / 60)) : t.actualMin;
          const repeats = !!t.repeatDays?.length;
          const history = sec ? [...(t.history ?? []), { day, min: actualMin! }].slice(-12) : t.history;
          // Learn the real time for jobs that repeat: plan the average of the last three done in full.
          const full = (history ?? []).slice(-3);
          const learned = repeats && allDone && full.length ? Math.round(full.reduce((a, h) => a + h.min, 0) / full.length) : t.estimateMin;
          const base0: Task = { ...t, history, estimateMin: learned };
          const updated: Task = repeats
            ? {
                ...base0,
                timer: undefined,
                actualMin,
                doneDays: [...new Set([...(t.doneDays ?? []), day])],
                partialDays: allDone ? (t.partialDays ?? []).filter((d) => d !== day) : [...new Set([...(t.partialDays ?? []), day])],
              }
            : { ...base0, timer: undefined, actualMin, done: true, doneAt: nowISO(), partial: !allDone };
          const added: Task[] = leftovers
            .filter((l) => l.title.trim())
            .map((l) => ({
              id: id(),
              title: l.title.trim(),
              kind: 'task',
              spaceId: t.spaceId ?? 'home',
              room: l.room ?? t.room,
              priority: l.need ? 1 : 3,
              someday: !l.need,
              day: l.need ? (l.day ?? day) : undefined,
              createdAt: nowISO(),
              done: false,
            }));
          // Other jobs she finished along the way (cleaned the bathroom while doing the kitchen).
          const tick = markWith(alsoDone.filter((x) => x !== taskId), alsoStarted.filter((x) => x !== taskId), day);
          return { ...s, tasks: [...s.tasks.map((x) => (x.id === taskId ? updated : tick(x))), ...added] };
        });
      },
      startRound(room, opts) {
        // The check-in goes off on this device (the one running the round), 20 minutes in by default.
        const label = roomNameOf(latest.current.settings.rooms, room) ?? room.replace(/-/g, ' ');
        const minutes = opts?.checkInMin ?? CHECK_IN_MIN;
        const text =
          minutes === CHECK_IN_MIN
            ? checkInText(label)
            : { title: `That's your ${minutes} minutes`, body: `Stop here or keep going in the ${label.toLowerCase()}, both are fine.` };
        const checkAt = checkInAt(new Date(), minutes);
        scheduleRoundCheckIn(room, checkAt, text.title, text.body);
        change('Started the room', (s) => {
          const now = new Date();
          const same = s.settings.round?.room === room ? s.settings.round : null;
          return {
            ...s,
            // One timer at a time: pause any job that's running.
            tasks: s.tasks.map((t) => (t.timer?.startedAt ? { ...t, timer: { accumulatedSec: elapsedSec(t.timer, now) } } : t)),
            settings: {
              ...s.settings,
              comeBack: s.settings.comeBack?.kind === 'break' ? null : s.settings.comeBack,
              round: { room, day: dayKey(now), startedAt: now.toISOString(), accumulatedSec: same?.accumulatedSec ?? 0, checkInAt: checkAt.toISOString() },
            },
          };
        });
      },
      pauseRound() {
        cancelRoundCheckIn();
        change('Paused the room', (s) => {
          const r = s.settings.round;
          if (!r?.startedAt) return s;
          return { ...s, settings: { ...s.settings, round: { ...r, startedAt: undefined, accumulatedSec: elapsedSec(r, new Date()) } } };
        });
      },
      cancelRound() {
        cancelRoundCheckIn();
        change('Stopped the room', (s) => ({ ...s, settings: { ...s.settings, round: null } }));
      },
      finishRound(day, done, started, leftovers) {
        cancelRoundCheckIn();
        change('Saved the room', (s) => {
          const r = s.settings.round;
          const min = r ? Math.max(1, Math.round(elapsedSec(r, new Date()) / 60)) : 0;
          const tick = markWith(done, started, day);
          const added: Task[] = leftovers
            .filter((l) => l.title.trim())
            .map((l) => ({
              id: id(),
              title: l.title.trim(),
              kind: 'task',
              spaceId: 'home',
              room: l.room ?? r?.room,
              priority: l.need ? 1 : 3,
              someday: !l.need,
              day: l.need ? (l.day ?? day) : undefined,
              createdAt: nowISO(),
              done: false,
            }));
          const roundLog = r ? [...(s.settings.roundLog ?? []), { room: r.room, day, min, done: done.length }].slice(-30) : s.settings.roundLog;
          return { ...s, tasks: [...s.tasks.map(tick), ...added], settings: { ...s.settings, round: null, roundLog } };
        });
      },
      setSleepReading(v) {
        change(v === 'yes' ? 'Reading sleep' : 'Not reading sleep', (s) => ({ ...s, sleepReading: v }));
      },
      addSleepNights(nights) {
        if (!nights.length) return;
        const prev = latest.current;
        const sleep = addNights(prev.sleep, nights);
        if (JSON.stringify(sleep) === JSON.stringify(prev.sleep)) return;
        const next = { ...prev, sleep };
        latest.current = next;
        setState(next);
      },
      sleepNotToday() {
        const day = dayKey(new Date());
        change('Not today', (s) => ({ ...s, sleep: { ...(s.sleep ?? { nights: [] }), notToday: day } }));
      },
      applyEasierDay(offer, picked) {
        change('An easier day', (s) => applyEasierDayTo(s, offer, picked, new Date(), id));
      },
      applyComeUp(plan) {
        change('Reworked the day', (s) => applyComeUpTo(s, plan, new Date(), id));
      },
      waitingNotNow(key) {
        const day = dayKey(new Date());
        change('Not now', (s) => {
          const plan = s.settings.dayPlans?.[day] ?? {};
          return { ...s, settings: { ...s.settings, dayPlans: { ...s.settings.dayPlans, [day]: { ...plan, waitingOff: [...new Set([...(plan.waitingOff ?? []), key])] } } } };
        });
      },
      batch(label, fn) {
        // Nested batches join the outer one.
        if (batching.current) return fn();
        batching.current = { label, pushed: false };
        try {
          fn();
        } finally {
          batching.current = null;
        }
      },
      markJobs(day, done, started) {
        if (!done.length && !started.length) return;
        const tick = markWith(done, started, day);
        change(done.length ? 'Ticked off' : 'Marked as started', (s) => ({ ...s, tasks: s.tasks.map(tick) }));
      },
      updateSettings(patch) {
        change('Changed settings', (s) => ({ ...s, settings: { ...s.settings, ...patch } }));
      },
      setTravel(placeName, travelMin) {
        change('Set travel time', (s) => {
          const places = s.settings.places.filter((p) => p.name.toLowerCase() !== placeName.trim().toLowerCase());
          places.push({ id: slug(placeName) || id(), name: placeName.trim(), travelMin });
          return { ...s, settings: { ...s.settings, places } };
        });
      },
      setRooms(rooms) {
        change('Changed rooms', (s) => ({ ...s, settings: { ...s.settings, rooms } }));
      },
      addSpace(name) {
        const clean = name.trim();
        if (!clean) return;
        change(`Added ${clean}`, (s) => ({
          ...s,
          spaces: [...s.spaces, { id: (slug(clean) || 'space') + '-' + id().slice(0, 4), name: clean, kind: 'general', privacy: 'everywhere', icon: 'folder' }],
        }));
      },
      updateSpace(spaceId, patch) {
        change('Changed space', (s) => ({
          ...s,
          spaces: s.spaces.map((sp) => {
            if (sp.id !== spaceId) return sp;
            const next = { ...sp, ...patch, name: (patch.name ?? sp.name).trim() || sp.name };
            if (sp.kind === 'private') next.privacy = 'phone'; // private notes never leave the phone
            return next;
          }),
        }));
      },
      deleteSpace(spaceId) {
        change('Removed space', (s) => {
          const sp = s.spaces.find((x) => x.id === spaceId);
          if (!sp || sp.kind !== 'general') return s;
          return {
            ...s,
            spaces: s.spaces.filter((x) => x.id !== spaceId),
            tasks: s.tasks.map((t) => (t.spaceId === spaceId ? { ...t, spaceId: undefined } : t)),
          };
        });
      },
      moveToSpace(taskId, spaceId) {
        change('Moved', mapTask(taskId, (t) => ({ ...t, spaceId })));
      },
      addCheckin(feeling) {
        const day = dayKey(new Date());
        change('Saved', (s) => ({
          ...s,
          checkins: [...s.checkins.filter((c) => c.day !== day), { day, feeling, at: nowISO() }].slice(-120),
        }));
      },
      removeNote(noteId) {
        change('Deleted note', (s) => ({ ...s, notes: s.notes.filter((n) => n.id !== noteId) }));
      },
    }),
    [ready, state, user, linkError, canUndo, undoRev, undo, change, logEvent],
  );

  // "Done" and "Snooze" buttons on nudges.
  // Sync with the other device (phone and tablet) through Supabase, once signed in.
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ state: 'off' });
  const syncRef = useRef<ReturnType<typeof createSync> | null>(null);
  useEffect(() => {
    // Never sync from a device whose saved data couldn't be read: it would look like everything was deleted.
    if (!ready || !user || !configured || loadFailed.current) return;
    const s = createSync({
      get: () => latest.current,
      apply: applyRemoteState,
      onStatus: setSyncStatus,
    });
    syncRef.current = s;
    s.start();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') s.resume();
    });
    return () => {
      sub.remove();
      s.stop();
      syncRef.current = null;
    };
  }, [ready, user, applyRemoteState]);
  useEffect(() => {
    if (ready) syncRef.current?.local();
  }, [state, ready]);

  const handled = useRef(new Set<string>());
  useEffect(() => {
    if (!ready) return;
    const onResponse = (r: Notifications.NotificationResponse | null) => {
      if (!r) return;
      // Only the Done and Snooze buttons are handled here (a tap on the notification itself opens the job).
      if (r.actionIdentifier !== 'done' && r.actionIdentifier !== 'snooze') return;
      const key = r.notification.request.identifier + String(r.notification.date) + r.actionIdentifier;
      if (handled.current.has(key)) return;
      handled.current.add(key);
      // Android hands back the last button press every time Focus opens: act on each press once only.
      AsyncStorage.getItem(ACTION_KEY)
        .then((last) => {
          if (last === key) return;
          AsyncStorage.setItem(ACTION_KEY, key).catch(() => {});
          act(r);
        })
        .catch(() => act(r));
    };
    const act = (r: Notifications.NotificationResponse) => {
      const data = r.notification.request.content.data as { taskId?: string; day?: string } | undefined;
      if (!data?.taskId) return;
      const task = latest.current.tasks.find((t) => t.id === data.taskId);
      if (!task) return;
      if (r.actionIdentifier === 'done') {
        const isDone = task.repeatDays?.length ? (task.doneDays ?? []).includes(data.day ?? '') : task.done;
        if (!isDone) value.toggleDone(task.id, data.day);
        clearJob(task.id);
      } else if (r.actionIdentifier === 'snooze') {
        value.snooze(task.id, 30);
        clearJob(task.id);
      }
    };
    Notifications.getLastNotificationResponseAsync().then(onResponse).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(onResponse);
    return () => sub.remove();
  }, [ready, value]);

  // Opening Focus tidies the tray: nudges about jobs that are done or snoozed are cleared.
  useEffect(() => {
    if (!ready) return;
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') tidyPresented(latest.current);
    });
    return () => sub.remove();
  }, [ready]);

  const withSync = useMemo(() => ({ ...value, sync: syncStatus }), [value, syncStatus]);
  return <StoreContext.Provider value={withSync}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore outside StoreProvider');
  return ctx;
}

/** Ticks once a second so clocks and timers stay live. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
