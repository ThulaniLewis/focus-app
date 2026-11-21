// A day's plan: Focus's fixed times merged with the phone diary, in time order.
import * as Notifications from 'expo-notifications';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { openStopFlow } from './Session';
import { PatternLine } from './Punctuality';
import { showSheet } from './Sheet';
import type { DiaryEvent } from '../lib/calendar';
import { askExactAlarms, askPermission, exactAlarmsAllowed } from '../lib/notify';
import { useStore } from '../lib/store';
import { space, useColors } from '../theme';
import { type AgendaItem, agendaFor, elapsedSec, fmtElapsed, fmtTime } from '../lib/time';
import { useNow } from '../lib/store';
import { diaryOn } from '../lib/views';
import { Button, Card, Check, Chip, Flash, IconButton, T } from './ui';

type Row = { kind: 'focus'; at: Date; item: AgendaItem } | { kind: 'diary'; at: Date; event: DiaryEvent };

export function planRows(state: ReturnType<typeof useStore>['state'], events: DiaryEvent[], day: string): Row[] {
  const rows: Row[] = [
    ...agendaFor(state, day).map((item) => ({ kind: 'focus' as const, at: item.at, item })),
    ...diaryOn(events, day).map((event) => ({ kind: 'diary' as const, at: event.allDay ? new Date(`${day}T00:00:00`) : event.start, event })),
  ];
  return rows.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export function PlanList({ day, events, empty, compact = false }: { day: string; events: DiaryEvent[]; empty?: string; compact?: boolean }) {
  const { state } = useStore();
  const all = planRows(state, events, day);
  // In the week view, the daily routine (things that nudge) folds into one line.
  const routine = compact ? all.filter((r) => r.kind === 'focus' && r.item.task.nag) : [];
  const rows = compact ? all.filter((r) => !(r.kind === 'focus' && r.item.task.nag)) : all;
  if (!rows.length && !routine.length) return <T v="body" muted>{empty ?? 'Nothing fixed.'}</T>;
  return (
    <Card style={{ paddingVertical: space[1] }}>
      {routine.length > 0 && (
        <T v="caption" muted style={{ paddingVertical: space[2] }}>
          Plus {routine.length} routine thing{routine.length === 1 ? '' : 's'}: {[...new Set(routine.map((r) => (r.kind === 'focus' ? r.item.task.title.split(':')[0].replace(/,.*$/, '') : '')))].slice(0, 4).join(', ')}
          {new Set(routine.map((r) => (r.kind === 'focus' ? r.item.task.title.split(':')[0] : ''))).size > 4 ? '…' : ''}
        </T>
      )}
      {rows.map((r, i) =>
        r.kind === 'focus' ? (
          <AgendaRow key={r.item.task.id} item={r.item} day={day} last={i === rows.length - 1} />
        ) : (
          <DiaryRow key={r.event.id} event={r.event} last={i === rows.length - 1} />
        ),
      )}
    </Card>
  );
}

function DiaryRow({ event, last }: { event: DiaryEvent; last: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', gap: space[3], paddingVertical: space[2], borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: c.line }}>
      <View style={{ width: 28 }} />
      <View style={{ width: 52 }}>
        <T v="bodyStrong" muted>{event.allDay ? 'All day' : fmtTime(event.start)}</T>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="body">{event.title}</T>
        <T v="caption" muted>{event.calendar ? `Diary · ${event.calendar}` : 'Diary'}</T>
      </View>
    </View>
  );
}

export function AgendaRow({ item, day, last }: { item: AgendaItem; day: string; last?: boolean }) {
  const { toggleDone, setTravel, remove, snooze, startTimer } = useStore();
  const c = useColors();
  const repeats = !!item.task.repeatDays?.length;
  const timer = item.task.timer;
  const running = !!timer?.startedAt;
  const now = useNow(running ? 1000 : 60000);
  // Jobs you do (not appointments you travel to) get Start and Stop.
  const doable = !item.task.place && !item.done;
  const partly = (item.task.partialDays ?? []).includes(day) || (!repeats && item.task.partial);
  const gone = !item.done && item.at.getTime() < Date.now() - 30 * 60000;
  const ask = () =>
    showSheet({
      title: `How long to get to ${item.task.place}?`,
      message: 'Door to door, on a normal day.',
      options: [10, 15, 20, 25, 30, 45, 60].map((m) => ({ label: `${m} minutes`, onPress: () => setTravel(item.task.place!, m) })),
    });
  const menu = () =>
    showSheet({
      title: item.task.title,
      message: repeats ? 'This one repeats.' : undefined,
      options: [
        ...(doable && !timer ? [{ label: 'Start', icon: 'play', onPress: () => startTimer(item.task.id) }] : []),
        ...(doable && timer ? [{ label: 'Stop and say what is left', icon: 'square', onPress: () => openStopFlow(item.task.id, day) }] : []),
        ...(doable ? [{ label: 'Stopped, some left', icon: 'list', onPress: () => openStopFlow(item.task.id, day) }] : []),
        { label: item.done ? 'Not done after all' : repeats ? 'Done for today' : 'Done', icon: 'check', onPress: () => toggleDone(item.task.id, day) },
        ...(item.task.nag && !item.done ? [{ label: 'Snooze nudges for 30 min', icon: 'bell-off', onPress: () => snooze(item.task.id, 30) }] : []),
        ...(item.task.place ? [{ label: 'Change travel time', icon: 'navigation', onPress: ask }] : []),
        { label: repeats ? 'Delete (every day it repeats)' : 'Delete', icon: 'trash-2', destructive: true, onPress: () => remove(item.task.id) },
      ],
    });
  return (
    <Flash id={item.task.id}>
    <Pressable
      onPress={menu}
      onLongPress={menu}
      style={{ flexDirection: 'row', gap: space[3], paddingVertical: space[2], borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: c.line }}
    >
      <Check on={item.done} onPress={() => toggleDone(item.task.id, day)} label={item.task.title} />
      <View style={{ width: 52 }}>
        <T v="bodyStrong">{fmtTime(item.at)}</T>
      </View>
      <View style={{ flex: 1, gap: space[1] }}>
        <T v="body" style={item.done ? { textDecorationLine: 'line-through', opacity: 0.6 } : gone ? { opacity: 0.55 } : undefined}>{item.task.title}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[1] }}>
          {item.leaveAt ? <Chip label={`Leave ${fmtTime(item.leaveAt)}`} /> : null}
          {item.travelMin ? <Chip tone="plain" label={`${item.travelMin} min away`} /> : null}
          {running || (timer && !item.done) ? <Chip tone="nudge" label={`${running ? 'Going' : 'Paused'} ${fmtElapsed(elapsedSec(timer, now))}`} /> : null}
          {item.done && partly ? <Chip tone="nudge" label="Started, some left" /> : null}
          {item.task.priority === 1 && !item.done ? <Chip tone="nudge" label="Must" /> : null}
          {item.task.nag && !item.done ? <Chip tone="plain" label="Nudges" /> : null}
        </View>
        <PatternLine task={item.task} />
        {item.placeUnknown && !item.done ? (
          <Pressable onPress={ask}>
            <T v="label" color={c.nudgeInk} style={{ backgroundColor: c.nudgeSoft, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
              How long to get to {item.task.place}? Tap to set
            </T>
          </Pressable>
        ) : null}
      </View>
      {doable ? (
        timer ? (
          <IconButton name="square" label={`Stop ${item.task.title}`} tone="nudge" onPress={() => openStopFlow(item.task.id, day)} />
        ) : (
          <IconButton name="play" label={`Start ${item.task.title}`} tone="quiet" onPress={() => startTimer(item.task.id)} />
        )
      ) : null}
    </Pressable>
    </Flash>
  );
}

export function PermissionCard() {
  const [needsNotif, setNeedsNotif] = useState(false);
  const [needsExact, setNeedsExact] = useState(false);
  const c = useColors();
  useEffect(() => {
    (async () => {
      setNeedsNotif(!(await Notifications.getPermissionsAsync()).granted);
      setNeedsExact(!(await exactAlarmsAllowed()));
    })().catch(() => {});
  }, []);
  if (!needsNotif && !needsExact) return null;
  return (
    <Card tone="nudge">
      <T v="bodyStrong" color={c.nudgeInk}>Let Focus nudge you on time</T>
      <T v="body" color={c.nudgeInk}>
        {needsNotif ? 'Leave-by and timer reminders need notifications switched on.' : 'Allow exact alarms so leave-by reminders land on the minute.'}
      </T>
      <Button
        kind="soft"
        label={needsNotif ? 'Turn on notifications' : 'Allow exact alarms'}
        onPress={async () => {
          if (needsNotif) setNeedsNotif(!(await askPermission()));
          else {
            await askExactAlarms();
            setNeedsExact(!(await exactAlarmsAllowed()));
          }
        }}
      />
    </Card>
  );
}
