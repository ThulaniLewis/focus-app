// The tablet's home screen on the kitchen wall: "Dash", like Android Auto. Dark, a big clock, four
// big tiles (Now, Leave by, Next, Shopping) and a rail of big buttons, readable from across the room.
// It's a shared screen: nothing from Just for me, Money or sleep ever appears here.
import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useNow, useStore } from '../lib/store';
import { isPrivateSpace } from '../lib/sync';
import { font, withAlpha } from '../theme';
import { addMin, agendaFor, dayKey, elapsedSec, fmtDuration, fmtElapsed, fmtTime, roomNameOf } from '../lib/time';
import type { State } from '../lib/types';
import { topPicks } from './Focus';
import { Icon } from './Icon';
import { openRoundStop, openStopFlow } from './Session';
import { showSheet } from './Sheet';
import { timerLeft, useTimers } from '../lib/timers';
import { avoidFirst } from '../lib/roomMode';
import { savHomeOn, waitingFor, waitPicks } from '../lib/comeUp';
import { openAvoidSheet } from './Avoid';

import { useDash } from './dashPalette';
export { useDash };

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Night: from 22:00 to 06:30 the Dash dims right down to the clock and tomorrow's first thing. */
const isNight = (d: Date) => d.getHours() >= 22 || d.getHours() * 60 + d.getMinutes() < 6 * 60 + 30;

export function L({ children, size, color: colorIn, display, weight, style, lines }: { children: React.ReactNode; size: number; color?: string; display?: boolean; weight?: 'strong'; style?: object; lines?: number }) {
  const D = useDash();
  const color = colorIn ?? D.ink;
  return (
    <Text
      numberOfLines={lines}
      style={[
        { color, fontSize: size, lineHeight: Math.round(size * 1.18), fontFamily: display ? font.display : weight ? font.bodyStrong : font.body },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Tile({ children, tone = 'plain', onPress, label }: { children: React.ReactNode; tone?: 'plain' | 'primary'; onPress?: () => void; label?: string }) {
  const D = useDash();
  const body = (
    <View
      style={{
        flex: 1,
        backgroundColor: tone === 'primary' ? D.primary : D.tile,
        borderWidth: tone === 'primary' ? 0 : 1,
        borderColor: D.line,
        borderRadius: 24,
        paddingVertical: 24,
        paddingHorizontal: 28,
        gap: 10,
      }}
    >
      {children}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ flex: 1 }}>
      {body}
    </Pressable>
  ) : (
    <View style={{ flex: 1 }}>{body}</View>
  );
}

export function BigButton({ label, onPress, ghost, onPrimary }: { label: string; onPress: () => void; ghost?: boolean; onPrimary?: boolean }) {
  const D = useDash();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        minHeight: 64,
        paddingHorizontal: 30,
        borderRadius: 18,
        justifyContent: 'center',
        backgroundColor: onPrimary ? (ghost ? 'transparent' : D.onPrimary) : ghost ? 'transparent' : D.primary,
        borderWidth: ghost ? 1 : 0,
        borderColor: onPrimary ? D.onPrimary : D.ghost,
      }}
    >
      <L size={22} weight="strong" color={onPrimary ? (ghost ? D.onPrimary : D.primary) : ghost ? D.ink : D.onPrimary}>{label}</L>
    </Pressable>
  );
}

function RailButton({ icon, label, active, onPress }: { icon: string; label: string; active?: boolean; onPress: () => void }) {
  const D = useDash();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      style={{ width: 96, height: 84, borderRadius: 22, backgroundColor: active ? D.primarySoft : 'transparent', alignItems: 'center', justifyContent: 'center', gap: 4 }}
    >
      <Icon name={icon} size={30} color={active ? D.primaryStrong : D.muted} />
      <L size={16} weight="strong" color={active ? D.primaryStrong : D.muted}>{label}</L>
    </Pressable>
  );
}

/** Other apps from the Dash, for when Focus is the tablet's home screen. */
export function openAppsSheet() {
  const go = (url: string) => () => Linking.openURL(url).catch(() => {});
  showSheet({
    title: 'Open another app',
    message: "The taskbar at the bottom of the screen has all your apps too. Drag one up beside Focus for split screen.",
    options: [
      { label: 'YouTube', icon: 'youtube', onPress: go('https://www.youtube.com') },
      { label: 'Spotify', icon: 'music', onPress: go('spotify:') },
      { label: 'Browser', icon: 'globe', onPress: go('https://www.google.com') },
      { label: 'Tablet settings', icon: 'settings', onPress: () => Linking.sendIntent('android.settings.SETTINGS').catch(() => {}) },
      { label: 'Change the home screen', icon: 'home', onPress: () => Linking.sendIntent('android.settings.HOME_SETTINGS').catch(() => {}) },
    ],
  });
}

export type DashTab = 'today' | 'kitchen' | 'sav' | 'room';

/** The tablet's frame: a rail of big buttons down the left, the screen on the right. */
export function DashShell({ active, children }: { active: DashTab; children: React.ReactNode }) {
  const D = useDash();
  const { state } = useStore();
  const shopping = state.spaces.find((s) => s.kind === 'shopping');
  return (
    <View style={{ flex: 1, backgroundColor: D.bg, flexDirection: 'row' }}>
      <View style={{ width: 124, backgroundColor: D.rail, borderRightWidth: 1, borderRightColor: D.line, alignItems: 'center', gap: 8, paddingVertical: 20 }}>
        <RailButton icon="sun" label="Today" active={active === 'today'} onPress={() => router.navigate('/')} />
        <RailButton icon="home" label="Home" onPress={() => router.navigate('/space/home')} />
        <RailButton icon="shopping-cart" label="Shop" onPress={() => shopping && router.navigate(`/space/${shopping.id}`)} />
        <RailButton icon="clock" label="Kitchen" active={active === 'kitchen'} onPress={() => router.navigate('/kitchen')} />
        <RailButton icon="star" label="Sav" active={active === 'sav'} onPress={() => router.navigate('/bedtime')} />
        <RailButton icon="grid" label="Apps" onPress={openAppsSheet} />
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => router.navigate('/dump')}
          accessibilityRole="button"
          accessibilityLabel="Talk to Focus"
          style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: D.primary, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="mic" size={40} color={D.onPrimary} />
        </Pressable>
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

/** What the Dash shows, worked out from the state. Private spaces are left out everywhere. */
export function dashModel(state: State, now: Date) {
  const day = dayKey(now);
  const shared = (spaceId?: string) => !isPrivateSpace(spaceId, state.spaces);
  const agenda = agendaFor(state, day).filter((a) => !a.done && shared(a.task.spaceId));

  const round = state.settings.round;
  const running = state.tasks.find((t) => t.timer?.startedAt && !t.done && shared(t.spaceId));
  const pick = topPicks(state, day, now, 8).find((p) => p.task.kind !== 'event' && shared(p.task.spaceId));

  const leave = agenda.find((a) => a.leaveAt && a.leaveAt.getTime() >= now.getTime() - 60000);
  const upcoming = agenda.filter((a) => a.at.getTime() >= now.getTime());
  const next = upcoming[0];
  const then = upcoming[1];

  const shopping = state.spaces.find((s) => s.kind === 'shopping');
  const toBuy = shopping ? state.tasks.filter((t) => t.spaceId === shopping.id && !t.done) : [];

  const tomorrow = dayKey(addMin(now, 24 * 60));
  const firstTomorrow = agendaFor(state, tomorrow).filter((a) => !a.done && shared(a.task.spaceId))[0];
  // The morning that's coming next: after midnight (before 06:30) that's today's, not tomorrow's.
  const beforeMorning = now.getHours() * 60 + now.getMinutes() < 6 * 60 + 30;
  const firstMorning = beforeMorning
    ? agendaFor(state, day).find((a) => !a.done && shared(a.task.spaceId) && a.at.getTime() >= now.getTime())
    : firstTomorrow;

  return { round, running, pick, leave, next, then, shopping, toBuy, firstTomorrow, firstMorning, morningIsToday: beforeMorning };
}

export function TabletDash() {
  const D = useDash();
  useKeepAwake(); // stays on while the Dash is showing (it lives on the charger)
  const store = useStore();
  const { state, startTimer, toggleDone, waitingNotNow } = store;
  const { timers } = useTimers();
  const now = useNow(1000);
  const [wokeAt, setWokeAt] = useState<number | null>(null);
  const [showPick, setShowPick] = useState(false);
  const day = dayKey(now);
  const m = dashModel(state, now);
  const roomName = (s?: string) => roomNameOf(state.settings.rooms, s);

  // Night mode wakes for two minutes when tapped.
  const awake = wokeAt !== null && now.getTime() - wokeAt < 2 * 60000;
  useEffect(() => {
    if (!isNight(now)) setWokeAt(null);
  }, [now.getHours()]);

  if (isNight(now) && !awake) {
    const f = m.firstMorning;
    return (
      <Pressable onPress={() => setWokeAt(Date.now())} accessibilityLabel="Wake Focus" style={{ flex: 1, backgroundColor: D.nightBg, alignItems: 'center', justifyContent: 'center', gap: 40 }}>
        <L size={160} display color={D.nightClock}>{fmtTime(now)}</L>
        {f ? (
          <View style={{ flexDirection: 'row', gap: 24 }}>
            <View style={{ borderWidth: 1, borderColor: D.tile, borderRadius: 24, paddingVertical: 20, paddingHorizontal: 28, gap: 4, minWidth: 300 }}>
              <L size={16} weight="strong" color={D.nightText}>{m.morningIsToday ? 'THIS MORNING, FIRST THING' : 'TOMORROW, FIRST THING'}</L>
              <L size={28} display color={D.nightText}>{`${fmtTime(f.at)} ${f.task.title}`}</L>
            </View>
            {f.leaveAt ? (
              <View style={{ borderWidth: 1, borderColor: D.tile, borderRadius: 24, paddingVertical: 20, paddingHorizontal: 28, gap: 4, minWidth: 300 }}>
                <L size={16} weight="strong" color={D.nightText}>LEAVE BY</L>
                <L size={28} display color={D.nightText}>{fmtTime(f.leaveAt)}</L>
              </View>
            ) : null}
          </View>
        ) : null}
        <L size={18} color={D.nightText}>Tap anywhere to wake Focus</L>
      </Pressable>
    );
  }

  const waiting = waitingFor(state, now);
  const waitList = waiting ? waitPicks(state, now, waiting) : [];
  const minsToLeave = m.leave?.leaveAt ? Math.round((m.leave.leaveAt.getTime() - now.getTime()) / 60000) : null;
  const bar = minsToLeave !== null ? Math.max(0, Math.min(1, minsToLeave / 60)) : 0;

  return (
    <DashShell active="today">
      <View style={{ flex: 1, paddingVertical: 32, paddingHorizontal: 36, gap: 24 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <L size={112} display style={{ lineHeight: 112, letterSpacing: -1 }}>{fmtTime(now)}</L>
            <L size={24} color={D.muted}>{`${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}`}</L>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Pressable
                onPress={() => router.navigate('/comeup')}
                accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: D.ghost, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 16 }}
              >
                <Icon name="alert-circle" size={18} color={D.ink} />
                <L size={17} weight="strong">Something's come up</L>
              </Pressable>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: D.ink, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 }}>
                <Icon name="users" size={16} color={D.bg} />
                <L size={15} weight="strong" color={D.bg}>Shared screen</L>
              </View>
            </View>
            {savHomeOn(state.settings, day) ? (
              <View style={{ backgroundColor: D.primarySoft, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 16 }}>
                <L size={17} weight="strong" color={D.primaryStrong}>{`Sav's home today · house jobs in her nap or after 19:30`}</L>
              </View>
            ) : null}
            {timers.slice(0, 3).map((t) => {
              const up = t.endsAt <= now.getTime();
              return (
                <Pressable
                  key={t.id}
                  onPress={() => router.navigate('/kitchen')}
                  accessibilityLabel={`${t.label}, ${timerLeft(t, now.getTime())}. Open timers`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: up ? D.primary : D.primarySoft, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 16 }}
                >
                  <Icon name="clock" size={18} color={up ? D.onPrimary : D.primaryStrong} />
                  <L size={20} weight="strong" color={up ? D.onPrimary : D.primaryStrong}>{`${t.label}  ${timerLeft(t, now.getTime())}`}</L>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ flex: 1, gap: 24 }}>
          <View style={{ flex: 1, flexDirection: 'row', gap: 24 }}>
            {/* NOW */}
            <Tile>
              <L size={18} weight="strong" color={D.muted} style={{ letterSpacing: 1 }}>NOW</L>
              {m.round ? (
                <>
                  <L size={38} display lines={2}>{`In the ${(roomName(m.round.room) ?? m.round.room).toLowerCase()}`}</L>
                  <L size={22} color={D.muted}>{fmtElapsed(elapsedSec(m.round, now))}</L>
                  <View style={{ flex: 1 }} />
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <BigButton label="Stop" onPress={() => openRoundStop(day)} />
                  </View>
                </>
              ) : m.running ? (
                <>
                  <L size={38} display lines={2}>{m.running.title}</L>
                  <L size={22} color={D.muted}>{`${fmtElapsed(elapsedSec(m.running.timer, now))}${m.running.estimateMin ? ` of about ${m.running.estimateMin} min` : ''}`}</L>
                  <View style={{ flex: 1 }} />
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <BigButton label="Stop" onPress={() => openStopFlow(m.running!.id, day)} />
                  </View>
                </>
              ) : waiting ? (
                // Waiting mode: before a visitor, an appointment somewhere or a leave-by time.
                <>
                  <L size={18} weight="strong" color={D.primary} style={{ letterSpacing: 1 }}>{`WHILE YOU WAIT · ${waiting.title.toUpperCase()} ${fmtTime(waiting.until)}`}</L>
                  {waitList.length ? (
                    waitList.map((t) => (
                      <Pressable key={t.id} onPress={() => startTimer(t.id)} accessibilityRole="button" accessibilityLabel={`Start ${t.title}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 }}>
                        <Icon name="play-circle" size={28} color={D.primary} />
                        <L size={24} lines={1} style={{ flex: 1 }}>{t.title}</L>
                        {t.estimateMin ? <L size={18} color={D.muted}>{`${t.estimateMin} min`}</L> : null}
                      </Pressable>
                    ))
                  ) : (
                    <L size={24} color={D.muted}>Nothing small left. Sit down for a minute.</L>
                  )}
                  <View style={{ flex: 1 }} />
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <BigButton ghost label="Not now" onPress={() => waitingNotNow(waiting.key)} />
                  </View>
                </>
              ) : m.pick && m.pick.task.room && avoidFirst(state.settings, m.pick.task.room, now) && !showPick ? (
                // Skipped or avoided three days running: a smaller way in first.
                <>
                  <L size={34} display lines={2}>{`The ${(roomName(m.pick.task.room) ?? m.pick.task.room).toLowerCase()} has been hard to start lately`}</L>
                  <L size={22} color={D.muted}>That's fine. Want a smaller way in?</L>
                  <View style={{ flex: 1 }} />
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <BigButton label="A smaller way in" onPress={() => openAvoidSheet(store, m.pick!.task.room!)} />
                    <BigButton ghost label="Show the job" onPress={() => setShowPick(true)} />
                  </View>
                </>
              ) : m.pick ? (
                <>
                  <L size={38} display lines={2}>{m.pick.task.title}</L>
                  <L size={22} color={D.muted}>
                    {[roomName(m.pick.task.room), m.pick.task.estimateMin ? `about ${m.pick.task.estimateMin} min` : null].filter(Boolean).join(' · ')}
                  </L>
                  <View style={{ flex: 1 }} />
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <BigButton label="Start" onPress={() => startTimer(m.pick!.task.id)} />
                    <BigButton ghost label="Done" onPress={() => toggleDone(m.pick!.task.id, day)} />
                  </View>
                </>
              ) : (
                <>
                  <L size={38} display>All clear</L>
                  <L size={22} color={D.muted}>Nothing waiting. Tap the mic if something comes up.</L>
                </>
              )}
            </Tile>

            {/* LEAVE BY */}
            {m.leave?.leaveAt ? (
              <Tile tone="primary">
                <L size={18} weight="strong" color={D.onPrimary} style={{ letterSpacing: 1 }}>LEAVE BY</L>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <L size={88} display color={D.onPrimary} style={{ lineHeight: 88 }}>{fmtTime(m.leave.leaveAt)}</L>
                  <L size={32} display color={D.onPrimary}>{minsToLeave === null || minsToLeave < 1 ? 'Now' : minsToLeave < 90 ? `${minsToLeave} min` : fmtDuration(minsToLeave)}</L>
                </View>
                <View style={{ flex: 1 }} />
                <View style={{ height: 14, borderRadius: 7, backgroundColor: withAlpha(D.onPrimary, 0.2), overflow: 'hidden' }}>
                  <View style={{ width: `${Math.round(bar * 100)}%`, height: '100%', backgroundColor: D.onPrimary, borderRadius: 7 }} />
                </View>
                <L size={20} color={D.onPrimary}>{`${m.leave.task.title} at ${fmtTime(m.leave.at)}.`}</L>
              </Tile>
            ) : (
              <Tile>
                <L size={18} weight="strong" color={D.muted} style={{ letterSpacing: 1 }}>LEAVE BY</L>
                <L size={38} display>No more leaving today</L>
                {m.firstTomorrow?.leaveAt ? <L size={22} color={D.muted}>{`Tomorrow: leave at ${fmtTime(m.firstTomorrow.leaveAt)} for ${m.firstTomorrow.task.title}`}</L> : null}
              </Tile>
            )}
          </View>

          <View style={{ flex: 1, flexDirection: 'row', gap: 24 }}>
            {/* NEXT */}
            <Tile>
              <L size={18} weight="strong" color={D.muted} style={{ letterSpacing: 1 }}>NEXT</L>
              {m.next ? (
                <>
                  <View style={{ flexDirection: 'row', gap: 20, alignItems: 'baseline' }}>
                    <L size={38} display color={D.primary}>{fmtTime(m.next.at)}</L>
                    <L size={38} display lines={1} style={{ flex: 1 }}>{m.next.task.title}</L>
                  </View>
                  {m.then ? <L size={22} color={D.muted} lines={2}>{`Then ${m.then.task.title} at ${fmtTime(m.then.at)}`}</L> : null}
                  {m.next.task.grab ? (
                    <L size={20} weight="strong" color={D.primaryStrong}>{`Grab ${m.next.task.grab.item} from the ${m.next.task.grab.fromRoom.replace(/-/g, ' ')}`}</L>
                  ) : null}
                </>
              ) : (
                <L size={30} display color={D.muted}>Nothing else fixed today</L>
              )}
            </Tile>

            {/* SHOPPING */}
            <Tile onPress={m.shopping ? () => router.navigate(`/space/${m.shopping!.id}`) : undefined} label="Open the shopping list">
              <L size={18} weight="strong" color={D.muted} style={{ letterSpacing: 1 }}>SHOPPING</L>
              <View style={{ flexDirection: 'row', gap: 14, alignItems: 'baseline' }}>
                <L size={64} display style={{ lineHeight: 64 }}>{String(m.toBuy.length)}</L>
                <L size={22} color={D.muted}>on the list</L>
              </View>
              <L size={22} lines={2}>
                {m.toBuy.length
                  ? `${m.toBuy.slice(0, 3).map((t) => t.title).join(', ')}${m.toBuy.length > 3 ? ` and ${m.toBuy.length - 3} more` : ''}`
                  : 'Nothing to buy yet'}
              </L>
              <View style={{ flex: 1 }} />
              <L size={18} color={D.muted}>Tap the mic and say "add milk to the list"</L>
            </Tile>
          </View>
        </View>
      </View>
    </DashShell>
  );
}
