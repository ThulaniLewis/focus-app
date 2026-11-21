// A space on the tablet, in the Dash style (big type, tiles, readable across the room), modelled on
// the v0.6 tablet "Shopping list". Shared screen: private spaces never show here.
import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useNow, useStore } from '../lib/store';
import { spaceView } from '../lib/spaceView';
import { isPrivateSpace } from '../lib/sync';
import { dayKey, fmtTime, isDoneOn, slug } from '../lib/time';
import { FOOD_GROUPS, type Space, type Task } from '../lib/types';
import { openInRoom, roomsByFloor } from '../lib/views';
import { Icon } from './Icon';
import { DashShell, type DashTab, L, useDash } from './TabletDash';

function Tile({ title, children, style }: { title?: string; children: React.ReactNode; style?: object }) {
  const D = useDash();
  return (
    <View style={[{ flex: 1, backgroundColor: D.tile, borderWidth: 1, borderColor: D.line, borderRadius: 24, paddingVertical: 22, paddingHorizontal: 28 }, style]}>
      {title ? <L size={26} display style={{ marginBottom: 6 }}>{title}</L> : null}
      <ScrollView contentContainerStyle={{ gap: 4 }}>{children}</ScrollView>
    </View>
  );
}

function GroupLabel({ children }: { children: string }) {
  const D = useDash();
  return <L size={16} weight="strong" color={D.muted} style={{ letterSpacing: 1, marginTop: 8 }}>{children.toUpperCase()}</L>;
}

function CheckRow({ task, day, last }: { task: Task; day: string; last?: boolean }) {
  const D = useDash();
  const { toggleDone } = useStore();
  const done = task.repeatDays?.length ? isDoneOn(task, day) : task.done;
  return (
    <Pressable
      onPress={() => toggleDone(task.id, day)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={task.title}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 18, minHeight: 64, borderBottomWidth: last ? 0 : 1, borderBottomColor: D.line }}
    >
      <View style={{ width: 34, height: 34, borderRadius: 8, borderWidth: 2, borderColor: done ? D.primary : D.ghost, backgroundColor: done ? D.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {done ? <Icon name="check" size={24} color={D.onPrimary} /> : null}
      </View>
      <L size={28} color={done ? D.muted : D.ink} style={done ? { textDecorationLine: 'line-through', flex: 1 } : { flex: 1 }} lines={2}>{task.title}</L>
    </Pressable>
  );
}

function Shopping({ sp, day }: { sp: Space; day: string }) {
  const { state } = useStore();
  const items = state.tasks.filter((t) => t.spaceId === sp.id && t.kind === 'buy');
  const food = items.filter((t) => (t.list ?? 'food') === 'food');
  const other = items.filter((t) => t.list === 'other');
  return (
    <View style={{ flex: 1, flexDirection: 'row', gap: 24 }}>
      <Tile title="Food" style={{ flex: 1.3 }}>
        {food.length ? (
          FOOD_GROUPS.map((g) => {
            const inGroup = food.filter((t) => (t.group ?? 'Household') === g);
            return inGroup.length ? (
              <View key={g}>
                <GroupLabel>{g}</GroupLabel>
                {inGroup.map((t, i) => <CheckRow key={t.id} task={t} day={day} last={i === inGroup.length - 1} />)}
              </View>
            ) : null;
          })
        ) : (
          <L size={22}>Nothing on the food list.</L>
        )}
      </Tile>
      <Tile title="Other">
        {other.length ? other.map((t, i) => <CheckRow key={t.id} task={t} day={day} last={i === other.length - 1} />) : <L size={22}>Nothing else to get.</L>}
      </Tile>
    </View>
  );
}

function Home({ sp, day }: { sp: Space; day: string }) {
  const D = useDash();
  const { state } = useStore();
  const floors = roomsByFloor(state.settings.rooms);
  const loose = state.tasks.filter((t) => t.spaceId === sp.id && !t.done && !t.at && !t.room && !t.someday && !t.seed?.startsWith('safety'));
  const floor = (label: string, rooms: typeof floors.up) =>
    rooms.length ? (
      <View key={label}>
        <GroupLabel>{label}</GroupLabel>
        {rooms.map((r, i) => {
          const n = openInRoom(state, r).length;
          return (
            <Pressable
              key={r.name}
              onPress={() => router.navigate(`/room/${slug(r.name)}`)}
              accessibilityRole="button"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 18, minHeight: 64, borderBottomWidth: i === rooms.length - 1 ? 0 : 1, borderBottomColor: D.line }}
            >
              <L size={28} style={{ flex: 1 }}>{r.name}</L>
              <L size={20} color={n ? D.primaryStrong : D.muted}>{n ? `${n} to do` : 'clear'}</L>
              <Icon name="chevron-right" size={28} color={D.muted} />
            </Pressable>
          );
        })}
      </View>
    ) : null;
  return (
    <View style={{ flex: 1, flexDirection: 'row', gap: 24 }}>
      <Tile title="Rooms" style={{ flex: 1.3 }}>
        {floor('Upstairs', floors.up)}
        {floor('Downstairs', floors.down)}
        {floor('Other rooms', floors.other)}
      </Tile>
      <Tile title="Around the house">
        {loose.length ? loose.map((t, i) => <CheckRow key={t.id} task={t} day={day} last={i === loose.length - 1} />) : <L size={22}>{"Nothing that isn't tied to a room."}</L>}
      </Tile>
    </View>
  );
}

function General({ sp, now }: { sp: Space; now: Date }) {
  const D = useDash();
  const { state } = useStore();
  const day = dayKey(now);
  const v = spaceView(state.tasks.filter((t) => t.spaceId === sp.id), now);
  const hasDates = v.deadlines.length + v.dated.length + v.weekly.length > 0;
  return (
    <View style={{ flex: 1, flexDirection: 'row', gap: 24 }}>
      {hasDates ? (
        <View style={{ flex: 1, gap: 16 }}>
          <L size={16} weight="strong" color={D.muted} style={{ letterSpacing: 1 }}>REAL DATES ONLY</L>
          {v.deadlines.map(({ task, label, reminders }) => (
            <View key={task.id} style={{ backgroundColor: D.primary, borderRadius: 24, paddingVertical: 20, paddingHorizontal: 24, gap: 4 }}>
              <L size={18} weight="strong" color={D.onPrimary}>{label}</L>
              <L size={28} display color={D.onPrimary} lines={2}>{task.title}</L>
              <L size={18} color={D.onPrimary}>{reminders}</L>
            </View>
          ))}
          <Tile>
            {v.dated.map(({ task, label }) => (
              <View key={task.id} style={{ minHeight: 64, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: D.line }}>
                <L size={18} weight="strong" color={D.muted}>{label}</L>
                <L size={24} lines={2}>{task.title}</L>
              </View>
            ))}
            {v.weekly.map(({ task, label }) => (
              <View key={task.id} style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 16, borderBottomWidth: 1, borderBottomColor: D.line }}>
                <L size={24} style={{ flex: 1 }} lines={1}>{task.title}</L>
                <L size={20} color={D.muted}>{label}</L>
              </View>
            ))}
          </Tile>
        </View>
      ) : null}
      <Tile title="Next, in order. Never late">
        {v.next.length ? v.next.map((t, i) => <CheckRow key={t.id} task={t} day={day} last={i === v.next.length - 1} />) : <L size={22}>Nothing open here.</L>}
      </Tile>
    </View>
  );
}

const SUBTITLE: Record<Space['kind'], string> = {
  shopping: 'Same list as your phone. Food is in aisle order.',
  home: 'Tap a room to see what needs doing there.',
  general: 'Real dates first, then the next list in order.',
  private: '',
};

export function DashSpace({ sp }: { sp: Space }) {
  const D = useDash();
  const { state } = useStore();
  const now = useNow(30000);
  const day = dayKey(now);
  const active: DashTab = sp.kind === 'shopping' ? 'shop' : sp.kind === 'home' ? 'home' : 'spaces';
  const hidden = isPrivateSpace(sp.id, state.spaces);
  return (
    <DashShell active={active}>
      <View style={{ flex: 1, paddingTop: 32, paddingHorizontal: 36, paddingBottom: 24, gap: 22 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 20 }}>
          <View style={{ flex: 1 }}>
            <L size={44} display lines={1}>{hidden ? 'On your phone' : sp.name}</L>
            {!hidden && SUBTITLE[sp.kind] ? <L size={22} color={D.muted}>{SUBTITLE[sp.kind]}</L> : null}
          </View>
          <L size={40} display color={D.muted}>{fmtTime(now)}</L>
        </View>
        {hidden ? (
          <L size={24} color={D.muted}>{"That's on your phone. Private spaces never show on the shared screen."}</L>
        ) : sp.kind === 'shopping' ? (
          <Shopping sp={sp} day={day} />
        ) : sp.kind === 'home' ? (
          <Home sp={sp} day={day} />
        ) : (
          <General sp={sp} now={now} />
        )}
      </View>
    </DashShell>
  );
}

/** Spaces on the tablet: the shared ones as big tiles. */
export function DashSpaces() {
  const D = useDash();
  const { state } = useStore();
  const shared = state.spaces.filter((sp) => sp.privacy === 'everywhere');
  return (
    <DashShell active="spaces">
      <View style={{ flex: 1, paddingTop: 32, paddingHorizontal: 36, paddingBottom: 24, gap: 22 }}>
        <L size={44} display>Spaces</L>
        <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24 }}>
          {shared.map((sp) => {
            const open = state.tasks.filter((t) => t.spaceId === sp.id && !t.done).length;
            return (
              <Pressable
                key={sp.id}
                onPress={() => router.navigate(`/space/${sp.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`${sp.name}, ${open} open`}
                style={{ width: '31%', minHeight: 140, backgroundColor: D.tile, borderWidth: 1, borderColor: D.line, borderRadius: 24, paddingVertical: 22, paddingHorizontal: 26, gap: 8 }}
              >
                <Icon name={sp.icon ?? 'folder'} size={30} color={D.primary} />
                <L size={28} display lines={1}>{sp.name}</L>
                <L size={20} color={D.muted}>{open ? `${open} open` : 'All clear'}</L>
              </Pressable>
            );
          })}
        </ScrollView>
        <L size={18} color={D.muted}>Money and Just for me stay on your phone.</L>
      </View>
    </DashShell>
  );
}
