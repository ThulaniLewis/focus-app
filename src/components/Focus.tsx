// "Today's focus": what comes first, what's paused, and the top three things to do.
import React from 'react';
import { Pressable, View } from 'react-native';
import { useNow, useStore } from '../lib/store';
import { space, useColors } from '../lib/theme';
import { dayPlanFor, fmtTime } from '../lib/time';
import type { State } from '../lib/types';
import { topPicks } from '../lib/picks';
import { Icon } from './Icon';
import { showSheet } from './Sheet';
import { Card, Chip, T } from './ui';

// The ranking lives in a plain file so it can be tested.
export { topPicks, type Pick } from '../lib/picks';

export function openPlanSheet(state: State, day: string, setDayPlan: (day: string, plan: { focus?: string; paused?: string[] }) => void, label: string) {
  const plan = state.settings.dayPlans?.[day] ?? {};
  const paused = new Set(plan.paused ?? []);
  const spaces = state.spaces.filter((s) => s.kind !== 'private' && s.kind !== 'shopping');
  showSheet({
    title: `Plan for ${label}`,
    message: 'Pick what comes first. Pausing a space hides its things and nudges for the day.',
    options: [
      ...spaces.map((s) => ({
        label: plan.focus === s.id ? `${s.name} comes first (tap to clear)` : `Make ${s.name} come first`,
        icon: plan.focus === s.id ? 'star' : 'arrow-up',
        onPress: () => setDayPlan(day, { ...plan, focus: plan.focus === s.id ? undefined : s.id }),
      })),
      ...spaces
        .filter((s) => s.kind === 'general')
        .map((s) => ({
          label: paused.has(s.id) ? `Bring back ${s.name}` : `Pause ${s.name}`,
          icon: paused.has(s.id) ? 'play' : 'pause',
          onPress: () => {
            const next = new Set(paused);
            if (next.has(s.id)) next.delete(s.id);
            else next.add(s.id);
            setDayPlan(day, { ...plan, paused: [...next] });
          },
        })),
    ],
  });
}

export function FocusCard({ day, label = 'today' }: { day: string; label?: string }) {
  const { state, setDayPlan, toggleDone } = useStore();
  const c = useColors();
  const now = useNow(60000);
  const { focus, paused } = dayPlanFor(state.settings, day);
  const focusName = state.spaces.find((s) => s.id === focus)?.name;
  const pausedNames = state.spaces.filter((s) => paused.has(s.id)).map((s) => s.name);
  const picks = topPicks(state, day, now);

  return (
    <Card tone="soft">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <T v="label" color={c.primaryStrong} style={{ flex: 1 }}>
          {focusName ? `FOCUS: ${focusName.toUpperCase()}${focusName === 'Home' ? ' RESET' : ''}` : `TOP THINGS ${label.toUpperCase()}`}
        </T>
        <Pressable
          onPress={() => openPlanSheet(state, day, setDayPlan, label)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Change the plan for ${label}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36 }}
        >
          <Icon name="sliders" size={16} color={c.primary} />
          <T v="label" color={c.primary}>Change</T>
        </Pressable>
      </View>
      {pausedNames.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[1] }}>
          {pausedNames.map((n) => <Chip key={n} tone="plain" label={`${n} paused`} />)}
        </View>
      )}
      {picks.length ? (
        picks.map((p, i) => (
          <Pressable
            key={p.task.id}
            onPress={() => toggleDone(p.task.id, p.task.repeatDays?.length ? day : undefined)}
            style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-start', paddingVertical: 4 }}
            accessibilityRole="checkbox"
            accessibilityLabel={p.task.title}
          >
            <T v="title" color={c.primary} style={{ width: 22 }}>{i + 1}</T>
            <View style={{ flex: 1, gap: 2 }}>
              <T v="bodyStrong">{p.task.title}</T>
              <T v="caption" muted>
                {[p.at ? fmtTime(p.at) : 'Any time', p.task.estimateMin ? `${p.task.estimateMin} min` : '', p.task.priority === 1 ? 'Must do' : '']
                  .filter(Boolean)
                  .join(' · ')}
              </T>
            </View>
          </Pressable>
        ))
      ) : (
        <T v="body">Nothing urgent. That's a good day.</T>
      )}
      <T v="caption" muted>Tap one to tick it off.</T>
    </Card>
  );
}
