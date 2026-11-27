import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { PlanList } from '../../components/Plan';
import { TaskRow } from '../../components/TaskRow';
import { Card, Screen, Section, T } from '../../components/ui';
import { useDiary } from '../../lib/calendar';
import { allDayEvents } from '../../lib/dumpContext';
import { useNow, useStore } from '../../lib/store';
import { radius, space, useColors } from '../../theme';
import { agendaFor, dayKey, fmtTime, isDoneOn, tasksFor, wakeFor } from '../../lib/time';

const FEELINGS = [
  { label: 'Good', icon: 'sun' },
  { label: 'Okay', icon: 'cloud' },
  { label: 'Tired', icon: 'battery' },
  { label: 'Wired', icon: 'zap' },
  { label: 'Low', icon: 'cloud-drizzle' },
];

export default function WindDown() {
  const { state, addCheckin } = useStore();
  const c = useColors();
  const now = useNow(60000);
  const today = dayKey(now);
  const t = new Date(now);
  t.setDate(now.getDate() + 1);
  const tomorrow = dayKey(t);
  const [refresh, setRefresh] = useState(0);
  useFocusEffect(useCallback(() => setRefresh((r) => r + 1), []));
  const { events: phoneEvents } = useDiary(state.settings.readCalendar, 2, refresh);
  // Her phone diary plus Focus's own whole-day entries (her child with someone for the day).
  const events = [...phoneEvents, ...allDayEvents(state.tasks)];

  const tasks = tasksFor(state, today);
  const wins = [
    ...tasks.filter((x) => isDoneOn(x, today)),
    ...agendaFor(state, today).filter((a) => a.done).map((a) => a.task),
  ];
  const open = tasks.filter((x) => !isDoneOn(x, today));
  const wake = wakeFor(state, tomorrow);
  const todaysFeeling = state.checkins.find((x) => x.day === today)?.feeling;

  return (
    <Screen>
      <T v="title">Wind down</T>

      <Section title="Today's wins" hint={wins.length ? `${wins.length}` : undefined}>
        {wins.length ? (
          <Card>
            {wins.map((w) => (
              <View key={w.id} style={{ flexDirection: 'row', gap: space[2], alignItems: 'center' }}>
                <Icon name="check" size={18} color={c.primary} />
                <T v="body" style={{ flex: 1 }}>{w.title}</T>
              </View>
            ))}
          </Card>
        ) : (
          <T v="body" muted>Nothing ticked today, and that's allowed. Getting through it counts.</T>
        )}
      </Section>

      {open.length > 0 && (
        <Section title="Still open" hint="these roll to tomorrow">
          <Card style={{ paddingVertical: 0 }}>
            {open.map((x, i) => <TaskRow key={x.id} task={x} showSpace last={i === open.length - 1} />)}
          </Card>
        </Section>
      )}

      <Section title="Tomorrow">
        {wake && (
          <Card tone="soft">
            <T v="title">Up by {fmtTime(wake.wake)}</T>
            <T v="body">
              {wake.because.leaveAt ? `Leave at ${fmtTime(wake.because.leaveAt)} for ${wake.because.task.title}.` : `${wake.because.task.title} at ${fmtTime(wake.because.at)}.`}
            </T>
          </Card>
        )}
        <PlanList day={tomorrow} events={events} empty="Nothing fixed tomorrow." />
      </Section>

      <Section title="How was today?" hint="stays on this phone">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {FEELINGS.map((f) => {
            const on = todaysFeeling === f.label;
            return (
              <Pressable
                key={f.label}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => addCheckin(f.label)}
                style={{ flexDirection: 'row', gap: space[2], alignItems: 'center', minHeight: 44, paddingHorizontal: space[4], borderRadius: radius.pill, backgroundColor: on ? c.primary : c.surfaceSunken }}
              >
                <Icon name={f.icon} size={18} color={on ? c.onPrimary : c.inkMuted} />
                <T v="label" color={on ? c.onPrimary : c.ink}>{f.label}</T>
              </Pressable>
            );
          })}
        </View>
        {todaysFeeling ? <T v="caption" muted>Saved. Sleep well.</T> : null}
      </Section>
    </Screen>
  );
}
