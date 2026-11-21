import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { openStopFlow } from './Session';
import { showSheet } from './Sheet';
import { useNow, useStore } from '../lib/store';
import { space, useColors } from '../lib/theme';
import { dayKey, elapsedSec, estimateRatio, fmtElapsed, fmtTime, isDoneOn, parseLocal, realisticMin, slug } from '../lib/time';
import type { Room, Space, Task } from '../lib/types';
import { Check, Chip, Flash, IconButton, T } from './ui';

export function roomName(rooms: Room[], slugValue?: string) {
  if (!slugValue) return undefined;
  return rooms.find((r) => slug(r.name) === slugValue)?.name ?? slugValue;
}

export function roomFloor(rooms: Room[], slugValue?: string) {
  return rooms.find((r) => slug(r.name) === slugValue)?.floor ?? '';
}

export function spaceOf(spaces: Space[], id?: string) {
  return id ? spaces.find((s) => s.id === id) : undefined;
}

/** "Grab a bin bag from the kitchen on your way up" */
export function grabLine(rooms: Room[], task: Task) {
  if (!task.grab) return undefined;
  const from = roomName(rooms, task.grab.fromRoom);
  const fromFloor = roomFloor(rooms, task.grab.fromRoom);
  const toFloor = roomFloor(rooms, task.room);
  const way = fromFloor && toFloor && fromFloor !== toFloor ? (toFloor === 'up' ? ' on your way up' : ' on your way down') : ' first';
  return `Grab ${task.grab.item} from the ${from?.toLowerCase()}${way}`;
}

export function TaskRow({ task, showRoom = true, showSpace = false, last = false }: { task: Task; showRoom?: boolean; showSpace?: boolean; last?: boolean }) {
  const { state, toggleDone, remove, startTimer, moveToSpace } = useStore();
  const c = useColors();
  const running = !!task.timer?.startedAt;
  const paused = !!task.timer && !running;
  const now = useNow(running ? 1000 : 60000);
  const ratio = estimateRatio(state.tasks);
  const real = task.estimateMin ? realisticMin(task.estimateMin, ratio) : undefined;
  const room = roomName(state.settings.rooms, task.room);
  const sp = showSpace ? spaceOf(state.spaces, task.spaceId) : undefined;
  const grab = grabLine(state.settings.rooms, task);
  // Repeating jobs are done per day; one-offs are done once.
  const doneHere = isDoneOn(task, dayKey(now));
  const due = task.dueAt ? parseLocal(task.dueAt) : null;
  const dueLabel = due
    ? `${dayKey(due) === dayKey(now) ? 'Due' : `Due ${due.toLocaleDateString('en-GB', { weekday: 'short' })}`} ${fmtTime(due)}`
    : null;

  const openMenu = () =>
    showSheet({
      title: task.title,
      options: [
        ...(!doneHere && !task.timer ? [{ label: 'Start', icon: 'play', onPress: () => startTimer(task.id) }] : []),
        ...(!doneHere && task.timer ? [{ label: 'Stop and say what is left', icon: 'square', onPress: () => openStopFlow(task.id, dayKey(new Date())) }] : []),
        {
          label: 'Move to another space',
          icon: 'folder',
          onPress: () =>
            showSheet({
              title: 'Move to',
              options: state.spaces
                .filter((sp) => sp.kind !== 'shopping' && sp.kind !== 'private' && sp.id !== task.spaceId)
                .map((sp) => ({ label: sp.name, icon: sp.icon, onPress: () => moveToSpace(task.id, sp.id) })),
            }),
        },
        { label: 'Delete', icon: 'trash-2', destructive: true, onPress: () => remove(task.id) },
      ],
    });

  return (
    <Flash id={task.id}>
    <View style={{ paddingVertical: space[3], flexDirection: 'row', gap: space[3], borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: c.line }}>
      <View style={{ paddingTop: 2 }}>
        <Check
          on={doneHere}
          onPress={() => toggleDone(task.id, dayKey(new Date()))}
          label={task.title}
        />
      </View>
      <Pressable onPress={openMenu} onLongPress={openMenu} style={{ flex: 1, gap: space[2] }}>
        <T v="body" style={doneHere ? { textDecorationLine: 'line-through', opacity: 0.6 } : undefined}>
          {task.title}
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[1] }}>
          {dueLabel && !doneHere ? <Chip tone="nudge" label={dueLabel} /> : null}
          {task.after && !doneHere ? <Chip tone="plain" label={task.after >= '19:30' ? "After Sav's in bed" : `After ${task.after}`} /> : null}
          {sp ? <Chip label={sp.name} /> : null}
          {showRoom && room ? <Chip label={room} /> : null}
          {task.estimateMin && !doneHere ? (
            <Chip tone="plain" label={real && real !== task.estimateMin ? `~${task.estimateMin} min, really ~${real}` : `~${task.estimateMin} min`} />
          ) : null}
          {doneHere && task.partial ? <Chip tone="nudge" label="Started, some left" /> : null}
          {doneHere && task.actualMin ? <Chip tone="plain" label={`took ${task.actualMin} min`} /> : null}
        </View>
        {grab && !doneHere ? (
          <T v="label" color={c.nudgeInk} style={{ backgroundColor: c.nudgeSoft, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
            {grab}
          </T>
        ) : null}
        {task.timer && !doneHere ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <T v="bodyStrong" color={running ? c.primary : c.inkMuted}>{fmtElapsed(elapsedSec(task.timer, now))}</T>
            <Pressable onPress={() => openStopFlow(task.id, dayKey(now))} hitSlop={8} style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: space[2] }}>
              <T v="label" color={c.primary}>Stop</T>
            </Pressable>
          </View>
        ) : null}
      </Pressable>
      <IconButton name="more-horizontal" label={`More for ${task.title}`} tone="quiet" onPress={openMenu} />
      {!doneHere && (
        running ? (
          <IconButton name="square" label={`Stop ${task.title}`} tone="nudge" onPress={() => openStopFlow(task.id, dayKey(now))} />
        ) : (
          <IconButton name="play" label={paused ? `Carry on with ${task.title}` : `Start ${task.title}`} onPress={() => startTimer(task.id)} />
        )
      )}
    </View>
    </Flash>
  );
}
