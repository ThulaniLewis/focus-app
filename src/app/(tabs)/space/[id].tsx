// One space. What it shows depends on its kind: to-dos, rooms, a shopping list, or private notes.
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Icon } from '../../../components/Icon';
import { useLinkOffer } from '../../../components/LinkedTasks';
import { TaskRow } from '../../../components/TaskRow';
import { Card, Check, Chip, Header, IconButton, Screen, Section, T } from '../../../components/ui';
import { useNow, useStore } from '../../../lib/store';
import { spaceView } from '../../../lib/spaceView';
import { useDashMode } from '../../../lib/device';
import { DashSpace } from '../../../components/DashSpace';
import { font, radius, space, type, useColors } from '../../../theme';
import { dayKey, fmtTime, slug } from '../../../lib/time';
import { FOOD_GROUPS, type Space, type Task } from '../../../lib/types';
import { openInRoom, roomsByFloor } from '../../../lib/views';

export default function SpaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useStore();
  const sp = state.spaces.find((s) => s.id === id);
  const dash = useDashMode();
  if (sp && dash) return <DashSpace sp={sp} />;
  if (!sp) {
    return (
      <Screen>
        <Header title="Not found" fallback="/spaces" />
        <T v="body" muted>That space has been removed.</T>
      </Screen>
    );
  }
  return (
    <Screen>
      <Header title={sp.name} kicker={sp.privacy === 'phone' ? 'PHONE ONLY' : undefined} fallback="/spaces" />
      {sp.kind === 'home' && <HomeSpace sp={sp} />}
      {sp.kind === 'shopping' && <ShoppingSpace sp={sp} />}
      {sp.kind === 'private' && <PrivateSpace sp={sp} />}
      {sp.kind === 'general' && <GeneralSpace sp={sp} />}
    </Screen>
  );
}

function QuickAdd({ placeholder, onAdd }: { placeholder: string; onAdd: (text: string) => void }) {
  const c = useColors();
  const [text, setText] = useState('');
  const add = () => {
    if (!text.trim()) return;
    onAdd(text.trim());
    setText('');
  };
  return (
    <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'center' }}>
      <TextInput
        value={text}
        onChangeText={setText}
        onSubmitEditing={add}
        returnKeyType="done"
        placeholder={placeholder}
        placeholderTextColor={c.inkMuted}
        style={{ flex: 1, fontFamily: font.body, fontSize: type.body.fontSize, color: c.ink, backgroundColor: c.surface, borderRadius: radius.sm, paddingHorizontal: space[3], minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line }}
      />
      <IconButton name="plus" label="Add" tone="primary" onPress={add} size={48} />
    </View>
  );
}

function TaskList({ tasks, empty, showRoom = true }: { tasks: Task[]; empty: string; showRoom?: boolean }) {
  if (!tasks.length) return <T v="body" muted>{empty}</T>;
  return (
    <Card style={{ paddingVertical: 0 }}>
      {tasks.map((t, i) => <TaskRow key={t.id} task={t} showRoom={showRoom} last={i === tasks.length - 1} />)}
    </Card>
  );
}

/** Built to "Job search: ordered list and deadlines": real dates only at the top, then the next list. */
function GeneralSpace({ sp }: { sp: Space }) {
  const { state, addItems } = useStore();
  const link = useLinkOffer(state);
  const c = useColors();
  const now = useNow(60000);
  const v = spaceView(state.tasks.filter((t) => t.spaceId === sp.id), now);
  const hasDates = v.deadlines.length + v.dated.length + v.weekly.length > 0;
  return (
    <>
      {hasDates ? <T v="label" muted>Real dates only</T> : null}
      {v.deadlines.map(({ task, label, reminders }) => (
        <Card key={task.id} tone="primary" style={{ borderRadius: radius.lg }}>
          <T v="label" color={c.onPrimary}>{label}</T>
          <T v="heading" color={c.onPrimary}>{task.title}</T>
          <T v="body" color={c.onPrimary}>{reminders}</T>
        </Card>
      ))}
      {v.dated.map(({ task, label }) => (
        <Card key={task.id} style={{ gap: space[1] }}>
          <T v="label" muted>{label}</T>
          <T v="bodyStrong">{task.title}</T>
          {task.place ? <T v="body" muted>{task.place}</T> : null}
        </Card>
      ))}
      {v.weekly.length > 0 && (
        <Card style={{ paddingVertical: space[1] }}>
          {v.weekly.map(({ task, label }, i) => (
            <View key={task.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space[3], minHeight: 48, alignItems: 'center', borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: c.line }}>
              <T v="body" style={{ flex: 1 }}>{task.title}</T>
              <T v="body" muted>{label}</T>
            </View>
          ))}
        </Card>
      )}
      <T v="label" muted style={hasDates ? { marginTop: space[2] } : undefined}>Next, in order. Never late</T>
      <TaskList tasks={v.next} empty="Nothing open here. Dump something and Focus will put it in the right place." />
      <QuickAdd placeholder={`Add to ${sp.name}`} onAdd={(title) => link.check(addItems([{ title, kind: 'task', spaceId: sp.id }])[0], title)} />
      {link.node}
      {v.someday.length > 0 && (
        <Section title="Someday">
          <TaskList tasks={v.someday} empty="" />
        </Section>
      )}
      {v.doneLately.length > 0 && (
        <Section title="Done lately">
          <TaskList tasks={v.doneLately} empty="" />
        </Section>
      )}
    </>
  );
}

function HomeSpace({ sp }: { sp: Space }) {
  const { state, addItems } = useStore();
  const link = useLinkOffer(state);
  const c = useColors();
  const floors = roomsByFloor(state.settings.rooms);
  const loose = state.tasks.filter((t) => t.spaceId === sp.id && !t.done && !t.at && !t.room && !t.someday && !t.seed?.startsWith('safety'));
  const projects = state.tasks.filter((t) => t.spaceId === sp.id && !t.done && t.someday);
  const floor = (label: string, rooms: typeof floors.up) =>
    rooms.length ? (
      <Section key={label} title={label}>
        <Card style={{ paddingVertical: space[1] }}>
          {rooms.map((r, i) => {
            const n = openInRoom(state, r).length;
            return (
              <Pressable
                key={r.name}
                onPress={() => router.navigate(`/room/${slug(r.name)}`)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 52, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: c.line }}
              >
                <T v="bodyStrong" style={{ flex: 1 }}>{r.name}</T>
                {n ? <Chip label={`${n} to do`} /> : <T v="caption" muted>clear</T>}
                <Icon name="chevron-right" color={c.inkMuted} />
              </Pressable>
            );
          })}
        </Card>
      </Section>
    ) : null;
  return (
    <>
      {floor('Upstairs', floors.up)}
      {floor('Downstairs', floors.down)}
      {floor('Other rooms', floors.other)}
      <Section title="Around the house">
        <QuickAdd placeholder="Add a house job" onAdd={(title) => link.check(addItems([{ title, kind: 'task', spaceId: sp.id }])[0], title)} />
        {link.node}
        <TaskList tasks={loose} empty="Nothing that isn't tied to a room." />
      </Section>
      {projects.length > 0 && (
        <Section title="Projects" hint="for Saturdays Sav's with her dad">
          <TaskList tasks={projects} empty="" />
        </Section>
      )}
      <T v="caption" muted>Change rooms and which floor they're on in Settings.</T>
    </>
  );
}

function ShoppingSpace({ sp }: { sp: Space }) {
  const { state, addItems, toggleDone, remove } = useStore();
  const c = useColors();
  const [list, setList] = useState<'food' | 'other'>('food');
  const [group, setGroup] = useState<string>(FOOD_GROUPS[0]);
  const items = state.tasks.filter((t) => t.spaceId === sp.id && t.kind === 'buy');
  const food = items.filter((t) => (t.list ?? 'food') === 'food');
  const other = items.filter((t) => t.list === 'other');
  const otherGroups = [...new Set(other.map((t) => t.group || 'Other'))].sort();
  const ticked = items.filter((t) => t.done);

  const clearTicked = () =>
    Alert.alert('Clear ticked items?', `${ticked.length} item${ticked.length === 1 ? '' : 's'}.`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Clear', onPress: () => ticked.forEach((t) => remove(t.id)) },
    ]);

  const rows = (ts: Task[]) =>
    ts.map((t, i) => (
      <Pressable
        key={t.id}
        onLongPress={() => remove(t.id)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 48, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: c.line }}
      >
        <Check on={t.done} onPress={() => toggleDone(t.id)} label={t.title} />
        <T v="body" style={[{ flex: 1 }, t.done ? { textDecorationLine: 'line-through', opacity: 0.5 } : null]}>{t.title}</T>
      </Pressable>
    ));

  const groupsFor = list === 'food' ? FOOD_GROUPS : [...new Set(['Clothes', 'Books', 'Gifts', 'For Sav', ...otherGroups])];

  return (
    <>
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        {(['food', 'other'] as const).map((l) => (
          <Pressable
            key={l}
            onPress={() => {
              setList(l);
              setGroup(l === 'food' ? FOOD_GROUPS[0] : 'Clothes');
            }}
            style={{ flex: 1, minHeight: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: list === l ? c.primary : c.surfaceSunken }}
          >
            <T v="label" color={list === l ? c.onPrimary : c.inkMuted}>
              {l === 'food' ? `Food (${food.filter((t) => !t.done).length})` : `Other (${other.filter((t) => !t.done).length})`}
            </T>
          </Pressable>
        ))}
      </View>

      <QuickAdd
        placeholder={list === 'food' ? `Add to ${group}` : `Add to ${group}`}
        onAdd={(title) => addItems([{ title, kind: 'buy', spaceId: sp.id, list, group }])}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
        {groupsFor.map((g) => (
          <Pressable key={g} onPress={() => setGroup(g)} hitSlop={4}>
            <Chip tone={g === group ? 'soft' : 'plain'} label={g} />
          </Pressable>
        ))}
      </ScrollView>

      {list === 'food' ? (
        food.length ? (
          FOOD_GROUPS.map((g) => {
            const inGroup = food.filter((t) => (t.group ?? 'Household') === g);
            return inGroup.length ? (
              <Section key={g} title={g}>
                <Card style={{ paddingVertical: space[1] }}>{rows(inGroup)}</Card>
              </Section>
            ) : null;
          })
        ) : (
          <T v="body" muted>Food list is empty. Say "we need bananas and toilet roll" and it lands here in aisle order.</T>
        )
      ) : other.length ? (
        otherGroups.map((g) => (
          <Section key={g} title={g}>
            <Card style={{ paddingVertical: space[1] }}>{rows(other.filter((t) => (t.group || 'Other') === g))}</Card>
          </Section>
        ))
      ) : (
        <T v="body" muted>Nothing else to get. Clothes, books and gifts go here.</T>
      )}

      {ticked.length > 0 && (
        <Pressable onPress={clearTicked} style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center' }}>
          <T v="label" color={c.primary}>Clear {ticked.length} ticked</T>
        </Pressable>
      )}
      <T v="caption" muted>Hold an item to remove it.</T>
    </>
  );
}

function PrivateSpace({ sp }: { sp: Space }) {
  const { state, addItems, remove } = useStore();
  const c = useColors();
  const notes = state.tasks.filter((t) => t.spaceId === sp.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const del = (t: Task) =>
    Alert.alert('Delete this note?', t.title, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove(t.id) },
    ]);
  return (
    <>
      <Card tone="sunken" style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
        <Icon name="lock" color={c.inkMuted} />
        <T v="body" muted style={{ flex: 1 }}>Only on this phone. Never on a tablet, never read aloud, no reminders.</T>
      </Card>
      <QuickAdd placeholder="Jot something down" onAdd={(title) => addItems([{ title, kind: 'note', spaceId: sp.id }])} />
      {notes.length ? (
        notes.map((n) => (
          <Pressable key={n.id} onLongPress={() => del(n)}>
            <Card>
              <T v="body">{n.title}</T>
              <T v="caption" muted>{dayKey(new Date(n.createdAt)) === dayKey(new Date()) ? `Today ${fmtTime(new Date(n.createdAt))}` : new Date(n.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</T>
            </Card>
          </Pressable>
        ))
      ) : (
        <T v="body" muted>Nothing here yet. When you dump something personal that isn't a to-do, it comes here.</T>
      )}
      {notes.length > 0 && <T v="caption" muted>Hold a note to delete it.</T>}
    </>
  );
}

