// The tablet's room screen: what's to do in the room it's sitting in (room view), and while a round
// or a job is running there, task mode. Dark Dash palette, readable from across the room.
import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useNow, useStore } from '../lib/store';
import { avoidFirst, firstStep, grabLines, lastTimeLine, nextFixed, roomJobs, roundEstimateMin, roundJobs, startLabel, type RoomJob } from '../lib/roomMode';
import { dayKey, elapsedSec, fmtElapsed, fmtTime, roomNameOf, slug as toSlug } from '../lib/time';
import { openAvoidSheet } from './Avoid';
import { Icon } from './Icon';
import { openRoundStop, openStopFlow } from './Session';
import { showSheet } from './Sheet';
import { BigButton, L, useDash } from './TabletDash';
import { withAlpha } from '../theme';

const LABEL = { letterSpacing: 1 };

function Card({ children, bg: bgIn, border: borderIn, radius = 24, style }: { children: React.ReactNode; bg?: string; border?: string; radius?: number; style?: object }) {
  const D = useDash();
  const bg = bgIn ?? D.tile;
  const border = borderIn ?? D.line;
  return <View style={[{ backgroundColor: bg, borderWidth: border === 'none' ? 0 : 1, borderColor: border, borderRadius: radius, padding: 24, gap: 12 }, style]}>{children}</View>;
}

function Chip({ label, tone }: { label: string; tone: 'nudge' | 'plain' | 'primary' }) {
  const D = useDash();
  const bg = tone === 'nudge' ? D.nudgeSoft : tone === 'primary' ? D.primarySoft : 'transparent';
  const ink = tone === 'nudge' ? D.nudgeInk : tone === 'primary' ? D.primaryStrong : D.muted;
  return (
    <View style={{ backgroundColor: bg, borderWidth: tone === 'plain' ? 1 : 0, borderColor: D.ghost, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 12 }}>
      <L size={16} weight="strong" color={ink}>{label}</L>
    </View>
  );
}

/** A big solid button in the amber card. */
function NudgeButton({ label, onPress, ghost }: { label: string; onPress: () => void; ghost?: boolean }) {
  const D = useDash();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        minHeight: 76,
        flex: ghost ? undefined : 1,
        paddingHorizontal: 28,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: ghost ? 'transparent' : D.nudgeInk,
        borderWidth: ghost ? 1 : 0,
        borderColor: D.nudgeInk,
      }}
    >
      <L size={24} weight="strong" color={ghost ? D.nudgeInk : D.nudgeSoft}>{label}</L>
    </Pressable>
  );
}

function GhostButton({ label, onPress, icon }: { label: string; onPress: () => void; icon?: string }) {
  const D = useDash();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{ minHeight: 56, paddingHorizontal: 22, borderRadius: 16, borderWidth: 1, borderColor: D.ghost, flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start' }}
    >
      {icon ? <Icon name={icon} size={20} color={D.ink} /> : null}
      <L size={19} weight="strong">{label}</L>
    </Pressable>
  );
}

/** A ring of ticks that fills as time passes (no native drawing library needed). */
function Ring({ size, progress, children }: { size: number; progress: number; children: React.ReactNode }) {
  const D = useDash();
  const n = 60;
  const on = Math.round(Math.max(0, Math.min(1, progress)) * n);
  const r = size / 2 - 12;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}>
      {Array.from({ length: n }, (_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            width: 6,
            height: 20,
            borderRadius: 3,
            backgroundColor: i < on ? D.nudgeInk : withAlpha(D.nudgeInk, 0.18),
            transform: [{ rotate: `${(i * 360) / n}deg` }, { translateY: -r }],
          }}
        />
      ))}
      {children}
    </View>
  );
}

function JobRow({ job, onToggle, first }: { job: RoomJob; onToggle: () => void; first: boolean }) {
  const D = useDash();
  const struck = job.done && !job.started;
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: job.done }}
      accessibilityLabel={job.task.title}
      style={{ minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 20, borderTopWidth: first ? 0 : 1, borderTopColor: D.line, paddingVertical: 12 }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          borderWidth: 2,
          borderColor: job.done ? D.primary : D.ghost,
          backgroundColor: job.done ? D.primary : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {job.done ? <Icon name="check" size={24} color={D.onPrimary} /> : null}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <L size={28} color={job.done ? D.muted : D.ink} style={struck ? { textDecorationLine: 'line-through' } : undefined}>
          {job.task.title}
        </L>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {job.done && job.doneAt ? <L size={19} weight="strong" color={D.primary}>{`Done ${job.doneAt}`}</L> : job.done ? <L size={19} weight="strong" color={D.primary}>Done</L> : null}
          {!job.done && job.sub ? <L size={19} color={D.muted}>{job.sub}</L> : null}
          {job.started ? <Chip tone="nudge" label="Started, some left" /> : null}
          {job.niceToHave && !job.done ? <Chip tone="plain" label="Nice to have" /> : null}
        </View>
      </View>
    </Pressable>
  );
}

export function TabletRoom({ room, fromTag }: { room: string; fromTag: boolean }) {
  const D = useDash();
  const store = useStore();
  const { state, startRound, pauseRound, pauseTimer, startTimer, toggleDone, markJobs, setRooms } = store;
  const now = useNow(1000);
  const day = dayKey(now);
  const known = state.settings.rooms.find((r) => toSlug(r.name) === room);
  const label = known?.name ?? room.replace(/-/g, ' ');
  const jobs = roomJobs(state, room, now);
  const open = roundJobs(jobs);
  const toggle = (j: RoomJob) => toggleDone(j.task.id, day);
  const avoid = () => openAvoidSheet(store, room);

  const changeRoom = () =>
    showSheet({
      title: 'Which room is the tablet in?',
      options: state.settings.rooms.map((r) => ({ label: r.name, icon: toSlug(r.name) === room ? 'check' : 'map-pin', onPress: () => router.navigate(`/room/${toSlug(r.name)}`) })),
    });

  if (!known)
    return (
      <View style={{ flex: 1, padding: 36, gap: 20 }}>
        <L size={18} weight="strong" color={D.muted} style={LABEL}>THIS STICKER SAYS</L>
        <L size={64} display>{label}</L>
        <L size={22} color={D.muted}>That isn't one of your rooms yet.</L>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <BigButton label={`Add ${label} as a room`} onPress={() => setRooms([...state.settings.rooms, { name: label.charAt(0).toUpperCase() + label.slice(1), floor: '' }])} />
          <BigButton ghost label="Change room" onPress={changeRoom} />
        </View>
      </View>
    );

  // Task mode: a round in this room, or a job here with its timer on.
  const round = state.settings.round?.room === room ? state.settings.round : null;
  const timedJob = !round ? state.tasks.find((t) => t.room === room && t.timer && !t.done) : undefined;

  if (round || timedJob) {
    const timer = round ?? timedJob!.timer!;
    const running = !!timer.startedAt;
    const sec = elapsedSec(timer, now);
    const est = round ? roundEstimateMin(state, room, now) : timedJob!.estimateMin ?? null;
    const startedClock = new Date(now.getTime() - sec * 1000);
    const checkIn = round?.checkInAt && running && new Date(round.checkInAt).getTime() > now.getTime() ? fmtTime(new Date(round.checkInAt)) : null;
    const onIt = timedJob ? jobs.find((j) => j.task.id === timedJob.id) ?? open[0] : open[0];
    const rest = jobs.filter((j) => j !== onIt);
    const next = nextFixed(state, now);
    const step = onIt ? firstStep(onIt.task) : null;
    return (
      <View style={{ flex: 1, flexDirection: 'row', gap: 28, paddingVertical: 32, paddingHorizontal: 36 }}>
        <View style={{ width: 430 }}>
          <Card bg={D.nudgeSoft} border="none" radius={28} style={{ flex: 1, gap: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <L size={18} weight="strong" color={D.nudgeInk} style={LABEL}>{round ? `${label.toUpperCase()} ROUND` : label.toUpperCase()}</L>
              <View style={{ borderWidth: 1, borderColor: D.nudgeInk, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 12 }}>
                <L size={15} weight="strong" color={D.nudgeInk}>{fromTag ? `${label} tag` : 'Started here'}</L>
              </View>
            </View>
            {!round ? <L size={24} display color={D.nudgeInk} lines={2}>{timedJob!.title}</L> : null}
            <Ring size={300} progress={est ? sec / (est * 60) : 0}>
              <L size={84} display color={D.nudgeInk} style={{ lineHeight: 90 }}>{fmtElapsed(sec)}</L>
              {est ? <L size={20} color={D.nudgeInk}>{`of about ${est} min`}</L> : null}
            </Ring>
            <L size={20} color={D.nudgeInk}>
              {!running
                ? "Paused. Carry on when you're ready."
                : `Started ${fmtTime(startedClock)}.${checkIn ? ` I'll check in at ${checkIn}: still on the ${label.toLowerCase()}?` : ''}`}
            </L>
            <View style={{ flex: 1 }} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <NudgeButton
                ghost
                label={running ? 'Pause' : 'Carry on'}
                onPress={() => (running ? (round ? pauseRound() : pauseTimer(timedJob!.id)) : round ? startRound(room) : startTimer(timedJob!.id))}
              />
              <NudgeButton label="Stop and tell me" onPress={() => (round ? openRoundStop(day) : openStopFlow(timedJob!.id, day))} />
            </View>
          </Card>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 20, paddingBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <L size={40} display style={{ flex: 1 }}>{`${label} jobs`}</L>
            <View style={{ alignItems: 'flex-end' }}>
              <L size={32} display>{fmtTime(now)}</L>
              {next ? <L size={18} color={D.muted}>{`Next: ${next.title} ${fmtTime(next.at)}`}</L> : null}
            </View>
          </View>
          {onIt ? (
            <Card bg={D.primarySoft} border="none">
              <L size={16} weight="strong" color={D.primaryStrong} style={LABEL}>ON IT NOW</L>
              <L size={32} display color={D.primaryStrong}>{onIt.task.title}</L>
              {step ? <L size={20} color={D.primaryStrong}>{`First step: ${step}`}</L> : null}
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
                <BigButton label="Done" onPress={() => toggle(onIt)} />
                <BigButton ghost label="Some left" onPress={() => markJobs(day, [], [onIt.task.id])} />
              </View>
            </Card>
          ) : (
            <Card>
              <L size={28} display>All done in here</L>
              <L size={20} color={D.muted}>Tap "Stop and tell me" to save the time.</L>
            </Card>
          )}
          {rest.length ? (
            <Card style={{ paddingVertical: 4 }}>
              {rest.map((j, i) => <JobRow key={j.task.id} job={j} first={i === 0} onToggle={() => toggle(j)} />)}
            </Card>
          ) : null}
          <GhostButton label="I'm avoiding this" icon="cloud" onPress={avoid} />
        </ScrollView>
      </View>
    );
  }

  // Room view.
  const last = lastTimeLine(state.settings, room);
  const grab = grabLines(state, room);
  const hard = avoidFirst(state.settings, room, now);
  return (
    <View style={{ flex: 1, flexDirection: 'row', gap: 28, paddingVertical: 32, paddingHorizontal: 36 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 18, paddingBottom: 24 }}>
        <L size={18} weight="strong" color={D.muted} style={LABEL}>THIS TABLET IS IN THE</L>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <L size={64} display style={{ flex: 1, lineHeight: 70 }} lines={2}>{roomNameOf(state.settings.rooms, room) ?? label}</L>
          <GhostButton label="Change room" icon="repeat" onPress={changeRoom} />
        </View>
        <Card style={{ paddingVertical: 4 }}>
          {jobs.length ? (
            jobs.map((j, i) => <JobRow key={j.task.id} job={j} first={i === 0} onToggle={() => toggle(j)} />)
          ) : (
            <View style={{ minHeight: 92, justifyContent: 'center' }}>
              <L size={26} color={D.muted}>Nothing for this room today. Enjoy it.</L>
            </View>
          )}
        </Card>
      </ScrollView>

      <ScrollView style={{ width: 400, flexGrow: 0 }} contentContainerStyle={{ gap: 20, paddingBottom: 24 }}>
        <Card bg={D.nudgeSoft} border="none" radius={28}>
          <L size={18} weight="strong" color={D.nudgeInk} style={LABEL}>ROOM ROUND</L>
          <L size={40} display color={D.nudgeInk}>{open.length === 1 ? '1 job left' : `${open.length} jobs left`}</L>
          {hard ? (
            <L size={20} color={D.nudgeInk}>This room's been hard to start lately. That's fine. Want a smaller way in?</L>
          ) : last ? (
            <L size={20} color={D.nudgeInk}>{last}</L>
          ) : null}
          <View style={{ flexDirection: 'row', marginTop: 6 }}>
            {hard ? <NudgeButton label="A smaller way in" onPress={avoid} /> : <NudgeButton label={startLabel(state.settings, room)} onPress={() => startRound(room)} />}
          </View>
          {hard ? (
            <Pressable onPress={() => startRound(room)} accessibilityRole="button" style={{ minHeight: 48, justifyContent: 'center' }}>
              <L size={18} weight="strong" color={D.nudgeInk}>{startLabel(state.settings, room)} anyway</L>
            </Pressable>
          ) : null}
        </Card>
        {grab ? (
          <Card bg={D.primarySoft} border="none">
            <L size={16} weight="strong" color={D.primaryStrong} style={LABEL}>{grab.title}</L>
            {grab.lines.map((g, i) => (
              <View key={i} style={{ gap: 2 }}>
                <L size={24} weight="strong" color={D.primaryStrong}>{g.item}</L>
                <L size={17} color={D.primaryStrong}>{`for ${g.forTitle}${g.toRoom ? ` (${g.toRoom})` : ''}`}</L>
              </View>
            ))}
          </Card>
        ) : null}
        {!hard ? <GhostButton label="I'm avoiding this" icon="cloud" onPress={avoid} /> : null}
        <L size={17} color={D.muted}>Lift the tablet off the mount and it asks which room it's in now, or tap a room sticker.</L>
      </ScrollView>
    </View>
  );
}
