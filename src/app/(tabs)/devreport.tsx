// Dev report: built to "Dev report and note for Claude" (docs/design/improvements/project/DevReport.dc.html).
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Share, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { Button, Card, Header, Screen, T } from '../../components/ui';
import { buildReport, weekSummary } from '../../lib/devlog';
import { isTabletDevice } from '../../lib/device';
import { previousScreen } from '../../lib/screens';
import { useStore } from '../../lib/store';
import { isPrivateTask } from '../../lib/sync';
import type { Task } from '../../lib/types';
import { radius, space, type, useColors } from '../../theme';

function Stat({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: c.surfaceSunken, borderRadius: radius.sm, paddingVertical: space[2], paddingHorizontal: space[3] }}>
      <T v="label" muted>{label}</T>
      <T v="title" style={{ fontSize: type.wallBody.fontSize, lineHeight: type.wallBody.lineHeight + space[1] }}>{value}</T>
    </View>
  );
}

export default function DevReport() {
  const { state } = useStore();
  const c = useColors();
  const [includePrivate, setIncludePrivate] = useState(false);
  const now = new Date();
  const week = weekSummary(state.devLog, now);
  const last = [...(state.devLog ?? [])].reverse().find((e) => e.kind === 'dictation');
  const hide = (t: { title: string; spaceId?: string }) => (!includePrivate && isPrivateTask(t as Task, state.spaces) ? 'private item' : t.title);
  const lastPrivate = last?.kind === 'dictation' && [...last.made, ...last.ticked, ...last.started].some((t) => isPrivateTask(t as Task, state.spaces));

  const download = () => {
    const report = buildReport(state, { includePrivate, now: new Date(), device: isTabletDevice() ? 'tablet' : 'phone' });
    Share.share({ title: 'Focus dev report', message: report }).catch(() => {});
  };

  return (
    <Screen>
      <Header title="Dev report" fallback="/settings" />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Note for Claude"
        onPress={() => router.navigate(`/dump?mode=note&from=${encodeURIComponent(previousScreen())}`)}
        style={({ pressed }) => ({ minHeight: 56, borderRadius: radius.sm, backgroundColor: c.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[3], opacity: pressed ? 0.8 : 1 })}
      >
        <Icon name="mic" size={20} color={c.onPrimary} />
        <T v="bodyStrong" color={c.onPrimary}>Note for Claude</T>
      </Pressable>
      <T v="label" muted style={{ marginTop: -space[2] }}>{"Saves what you say, plus the screen you're on"}</T>

      <Card>
        <T v="bodyStrong">This week</T>
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <Stat label="Dictations" value={String(week.dictations)} />
          <Stat label="Tasks made" value={String(week.tasksMade)} />
        </View>
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <Stat label="Skipped or moved" value={String(week.skippedOrMoved)} />
          <Stat label="Claude cost" value={`$${week.costUsd.toFixed(2)}`} />
        </View>
        <T v="caption" muted>{`${week.calls} Claude call${week.calls === 1 ? '' : 's'} at list prices`}</T>
      </Card>

      <Card>
        <T v="bodyStrong">You said, Focus made</T>
        {last && last.kind === 'dictation' ? (
          <>
            <T v="body" muted style={{ backgroundColor: c.surfaceSunken, borderRadius: radius.sm, paddingVertical: space[2], paddingHorizontal: space[3] }}>
              {!includePrivate && lastPrivate ? 'private item' : `"${last.said}"`}
            </T>
            {last.ticked.length ? <T v="body">{`Ticked: ${last.ticked.map(hide).join(', ')}`}</T> : null}
            {last.started.length ? <T v="body">{`Started: ${last.started.map(hide).join(', ')}`}</T> : null}
            <T v="body">{last.made.length ? `Made: ${last.made.map(hide).join(', ')}` : 'Made: nothing new'}</T>
          </>
        ) : (
          <T v="body" muted>Nothing yet. Talk it through once and it shows here.</T>
        )}
      </Card>

      <Pressable
        onPress={() => setIncludePrivate(!includePrivate)}
        accessibilityRole="switch"
        accessibilityState={{ checked: includePrivate }}
        accessibilityLabel="Include private items"
        style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: radius.md, paddingHorizontal: space[4] }}
      >
        <T v="body">Include private items</T>
        <View style={{ width: 24, height: 24, borderRadius: space[1] + 2, borderWidth: 2, borderColor: includePrivate ? c.primary : c.outline, backgroundColor: includePrivate ? c.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {includePrivate ? <Icon name="check" size={16} color={c.onPrimary} /> : null}
        </View>
      </Pressable>

      <Button kind="outline" label="Download report" onPress={download} />
    </Screen>
  );
}
