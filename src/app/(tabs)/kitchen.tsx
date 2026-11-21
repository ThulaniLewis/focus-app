// Kitchen mode on the tablet: cooking timers you can set from across the room, several at once.
// They keep counting on the Dash and ring loudly when they end, even with YouTube open.
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { BigButton, D, DashShell, L } from '../../components/TabletDash';
import { useDashMode } from '../../lib/device';
import { useNow, useStore } from '../../lib/store';
import { font } from '../../theme';
import { agendaFor, dayKey, fmtTime } from '../../lib/time';
import { timerLeft, useTimers } from '../../lib/timers';

const QUICK = [1, 3, 5, 10, 15, 20, 30, 45, 60];

export default function Kitchen() {
  const dash = useDashMode();
  const body = <KitchenBody />;
  return dash ? (
    <DashShell active="kitchen">{body}</DashShell>
  ) : (
    <View style={{ flex: 1, backgroundColor: D.bg, paddingTop: 24 }}>
      <Pressable onPress={() => router.back()} accessibilityRole="button" style={{ padding: 16, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Icon name="arrow-left" size={24} color={D.ink} />
        <L size={18} weight="strong">Back</L>
      </Pressable>
      {body}
    </View>
  );
}

function KitchenBody() {
  const { timers, add, addMinute, remove } = useTimers();
  const { state } = useStore();
  const now = useNow(1000);
  const [label, setLabel] = useState('');
  const day = dayKey(now);
  // Tonight's cooking, if it's on the plan.
  const cook = agendaFor(state, day).find((a) => !a.done && /cook|dinner/i.test(a.task.title) && a.task.room === 'kitchen');

  const start = (min: number) => {
    add(min, label);
    setLabel('');
  };

  return (
    <View style={{ flex: 1, flexDirection: 'row', gap: 24, paddingVertical: 28, paddingHorizontal: 32 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 18 }}>
        <L size={44} display>Kitchen</L>
        {cook ? (
          <View style={{ backgroundColor: D.tile, borderWidth: 1, borderColor: D.line, borderRadius: 24, padding: 22, gap: 6 }}>
            <L size={16} weight="strong" color={D.muted} style={{ letterSpacing: 1 }}>ON THE PLAN</L>
            <L size={28} display>{`${fmtTime(cook.at)} ${cook.task.title}`}</L>
            {cook.task.estimateMin ? <L size={18} color={D.muted}>{`About ${cook.task.estimateMin} min`}</L> : null}
          </View>
        ) : null}
        <View style={{ backgroundColor: D.tile, borderWidth: 1, borderColor: D.line, borderRadius: 24, padding: 22, gap: 14 }}>
          <L size={16} weight="strong" color={D.muted} style={{ letterSpacing: 1 }}>NEW TIMER</L>
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="What's it for? (optional, like Pasta)"
            placeholderTextColor={D.muted}
            accessibilityLabel="Timer name"
            style={{ minHeight: 56, borderRadius: 16, backgroundColor: D.sunken, color: D.ink, paddingHorizontal: 18, fontSize: 20, fontFamily: font.body }}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {QUICK.map((m) => (
              <Pressable
                key={m}
                onPress={() => start(m)}
                accessibilityRole="button"
                accessibilityLabel={`Start a ${m} minute timer`}
                style={{ width: 112, minHeight: 72, borderRadius: 18, backgroundColor: D.primarySoft, alignItems: 'center', justifyContent: 'center' }}
              >
                <L size={24} weight="strong" color={D.primaryStrong}>{m === 60 ? '1 hour' : `${m} min`}</L>
              </Pressable>
            ))}
          </View>
          <L size={17} color={D.muted}>Timers ring out loud, even with the sound off or YouTube playing.</L>
        </View>
      </ScrollView>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 14 }}>
        <L size={16} weight="strong" color={D.muted} style={{ letterSpacing: 1, marginTop: 14 }}>{timers.length ? 'RUNNING' : 'NO TIMERS'}</L>
        {!timers.length ? <L size={22} color={D.muted}>Tap a time to start one. You can have a few going at once.</L> : null}
        {timers.map((t) => {
          const up = t.endsAt <= now.getTime();
          return (
            <View
              key={t.id}
              style={{ backgroundColor: up ? D.primary : D.tile, borderWidth: up ? 0 : 1, borderColor: D.line, borderRadius: 24, padding: 22, gap: 10 }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <L size={24} weight="strong" color={up ? D.onPrimary : D.ink}>{t.label}</L>
                <Pressable onPress={() => remove(t.id)} accessibilityRole="button" accessibilityLabel={`Stop ${t.label}`} hitSlop={12} style={{ padding: 8 }}>
                  <Icon name="x" size={28} color={up ? D.onPrimary : D.muted} />
                </Pressable>
              </View>
              <L size={72} display color={up ? D.onPrimary : D.ink} style={{ lineHeight: 76 }}>{timerLeft(t, now.getTime())}</L>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {up ? <BigButton onPrimary label="Done" onPress={() => remove(t.id)} /> : null}
                <BigButton ghost onPrimary={up} label="+1 min" onPress={() => addMinute(t.id)} />
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
