import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { FocusCard, openPlanSheet } from '../../components/Focus';
import { Icon } from '../../components/Icon';
import { PlanList } from '../../components/Plan';
import { Card, Chip, Screen, T } from '../../components/ui';
import { useDiary } from '../../lib/calendar';
import { useNow, useStore } from '../../lib/store';
import { space, useColors } from '../../theme';
import { dayKey } from '../../lib/time';
import { DAY_NAMES, MONTH_SHORT, savSaturday } from '../../lib/views';

export default function Week() {
  const { state, setDayPlan } = useStore();
  const c = useColors();
  const now = useNow(60000);
  const [refresh, setRefresh] = useState(0);
  useFocusEffect(useCallback(() => setRefresh((r) => r + 1), []));
  const { events, allowed } = useDiary(state.settings.readCalendar, 8, refresh);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    return d;
  });

  // Things that could fill a Saturday that's yours: projects first, then open to-dos outside Sav, shopping and private.
  const projects = state.tasks.filter((t) => t.someday && !t.done);
  const others = state.tasks
    .filter((t) => !t.done && !t.at && !t.someday && t.kind === 'task' && !t.seed?.startsWith('safety'))
    .filter((t) => {
      const sp = state.spaces.find((s) => s.id === t.spaceId);
      return !sp || (sp.kind === 'general' && sp.id !== 'sav') || sp.kind === 'home';
    });
  const yours = [...projects, ...others].slice(0, 4);

  return (
    <Screen>
      <T v="title">The week</T>
      <T v="heading">Tomorrow first</T>
      <FocusCard day={dayKey(days[1] ?? now)} label="tomorrow" />
      {state.settings.readCalendar && allowed === false && (
        <T v="body" muted>Your diary isn't showing yet. Allow calendar on Today to see it here.</T>
      )}
      {days.map((d, i) => {
        const key = dayKey(d);
        const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : DAY_NAMES[d.getDay()];
        const sat = d.getDay() === 6;
        const sav = sat ? savSaturday(events, key, state.settings) : null;
        const away = sav?.away;
        return (
          <View key={key} style={{ gap: space[2] }}>
            <Pressable
              onPress={() => openPlanSheet(state, key, setDayPlan, label)}
              accessibilityRole="button"
              accessibilityLabel={`Plan ${label}`}
              style={{ flexDirection: 'row', alignItems: 'baseline', gap: space[2] }}
            >
              <T v="heading">{label}</T>
              <T v="caption" muted>{d.getDate()} {MONTH_SHORT[d.getMonth()]}</T>
              <View style={{ flex: 1 }} />
              {state.settings.dayPlans?.[key]?.focus ? <Chip tone="soft" label={`${state.spaces.find((x) => x.id === state.settings.dayPlans[key].focus)?.name ?? ''} first`} /> : null}
              {sav ? <Chip tone={away ? 'nudge' : 'soft'} label={away ? 'Sav with her dad' : 'Sav with you'} /> : null}
              <Icon name="sliders" size={14} color={c.inkMuted} />
            </Pressable>
            {sat && away && (
              <Card tone="soft">
                <T v="bodyStrong">This Saturday is yours</T>
                {yours.length ? (
                  <>
                    <T v="body" muted>A few of your own things that could fit:</T>
                    {yours.map((t) => (
                      <View key={t.id} style={{ flexDirection: 'row', gap: space[2], alignItems: 'center' }}>
                        <Icon name="circle" size={8} color={c.primary} />
                        <T v="body" style={{ flex: 1 }}>{t.title}</T>
                      </View>
                    ))}
                  </>
                ) : (
                  <T v="body" muted>Nothing on your list. Rest counts too.</T>
                )}
              </Card>
            )}
            <PlanList day={key} events={events} empty="Nothing fixed." compact />
          </View>
        );
      })}
      <Pressable onPress={() => router.navigate('/settings')} style={{ minHeight: 44, justifyContent: 'center' }}>
        <T v="caption" muted>
          Saturdays follow the every-other-week pattern from 21 November. A diary entry with "{state.settings.awayWords.join('" or "')}" in it always wins.
        </T>
      </Pressable>
    </Screen>
  );
}
