// Places: the places she goes all the time. Each one's type decides what Focus does there. Phone only.
// Key places are asked for one type at a time ("Where's home?", "Where do you do your food shop?"); she
// can skip any. Names and addresses all come from her; nothing here knows any of them.
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { Button, Card, Header, Screen, Section, T, Toggle } from '../../components/ui';
import { featureOn } from '../../lib/features';
import { type GeoPlace, whereLine } from '../../lib/geo';
import { setAnySupermarket, skipType, useGeo } from '../../lib/geoStore';
import { locationStatus, type LocationStatus } from '../../lib/location';
import { PLACE_TYPES, summaryLine, typeInfo } from '../../lib/placeTypes';
import { useNow, useStore } from '../../lib/store';
import { liveStatusLine, type TravelMode } from '../../lib/liveTraffic';
import { space, useColors } from '../../theme';

function Row({ icon, title, line, onPress, ask, last, label }: { icon: string; title: string; line: string; onPress: () => void; ask?: boolean; last?: boolean; label: string }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 64, paddingVertical: space[2], borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: c.line }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: ask ? 'transparent' : c.primarySoft,
          borderWidth: ask ? 1.5 : 0,
          borderStyle: 'dashed',
          borderColor: c.outline,
        }}
      >
        <Icon name={icon} size={18} color={ask ? c.inkMuted : c.primaryStrong} />
      </View>
      <View style={{ flex: 1 }}>
        <T v={ask ? 'body' : 'bodyStrong'} color={ask ? c.primary : undefined}>{title}</T>
        <T v="caption" muted numberOfLines={2}>{line}</T>
      </View>
      <Icon name="chevron-right" size={20} color={c.inkMuted} />
    </Pressable>
  );
}

const TRAVEL_MODES: { id: TravelMode; label: string }[] = [
  { id: 'drive', label: 'Car' },
  { id: 'walk', label: 'Walk' },
  { id: 'transit', label: 'Bus or train' },
  { id: 'bike', label: 'Bike' },
];

export default function Places() {
  const { state, updateSettings } = useStore();
  const geo = useGeo();
  const c = useColors();
  const now = useNow(60000);
  const [status, setStatus] = useState<LocationStatus | null>(null);
  useFocusEffect(
    useCallback(() => {
      locationStatus().then(setStatus).catch(() => {});
    }, []),
  );
  const on = featureOn(state.settings, 'places');
  const where = whereLine(geo, now);
  const open = (p: GeoPlace) => geo.reminders.filter((r) => r.placeId === p.id && !r.doneAt).length;
  const linkedHere = (p: GeoPlace) => geo.links.filter((l) => l.placeId === p.id && state.tasks.some((t) => t.id === l.taskId)).length;
  const placeRow = (p: GeoPlace, last: boolean) => (
    <Row key={p.id} icon={typeInfo(p.type).icon} title={p.name} line={summaryLine(p, open(p), linkedHere(p))} onPress={() => router.navigate(`/place/${p.id}`)} last={last} label={`${p.name}, ${typeInfo(p.type).label}. Tap to open`} />
  );

  // Key places, in the order they're asked for: what she has, or the question for what she hasn't.
  const keyTypes = PLACE_TYPES.filter((t) => t.ask);
  const keyRows: React.ReactNode[] = [];
  const skippedAsks: string[] = [];
  for (const t of keyTypes) {
    const mine = geo.places.filter((p) => p.type === t.id);
    if (mine.length) mine.forEach((p) => keyRows.push(placeRow(p, false)));
    else if ((geo.skipped ?? []).includes(t.id)) skippedAsks.push(t.id);
    else
      keyRows.push(
        <View key={`ask-${t.id}`}>
          <Row ask icon={t.icon} title={t.ask!.question} line={t.ask!.about} onPress={() => router.navigate(`/place/new?type=${t.id}`)} label={`${t.ask!.question} Tap to add`} />
          <View style={{ alignItems: 'flex-end', marginTop: -space[2] }}>
            <Button kind="quiet" small label="Not for me" onPress={() => skipType(t.id, true)} />
          </View>
        </View>,
      );
  }
  const others = geo.places.filter((p) => !typeInfo(p.type).ask);

  return (
    <Screen>
      <Header title="Places" kicker="SETTINGS" fallback="/settings" />
      <T v="body" muted>{"The places you go all the time. Each one's type decides what Focus does there."}</T>

      {!on && (
        <Card tone="soft">
          <T v="body">Home or out is switched off in Settings, under Features. Your places are kept.</T>
        </Card>
      )}

      {on && geo.places.length > 0 && status && !status.background && (
        <Card tone="nudge">
          <T v="bodyStrong" color={c.nudgeInk}>Location needs Allow all the time</T>
          <T v="body" color={c.nudgeInk}>{"Without it, Focus can only tell where you are while it's open."}</T>
          <Button kind="soft" label="Open the setup checklist" onPress={() => router.navigate('/permissions')} />
        </Card>
      )}

      {on && where && (
        <Card>
          <T v="bodyStrong">{where}</T>
          <T v="caption" muted>{status?.running ? 'Noticing home and out, with Focus closed too.' : 'Checked when Focus opens.'}</T>
        </Card>
      )}

      <Section title="Your key places">
        <Card>{keyRows}</Card>
        {skippedAsks.length > 0 && (
          <Button
            kind="quiet"
            small
            label={`Ask me again about ${skippedAsks.map((id) => typeInfo(id as GeoPlace['type']).label.toLowerCase()).join(', ')}`}
            onPress={() => skippedAsks.forEach((id) => skipType(id as GeoPlace['type'], false))}
          />
        )}
      </Section>

      <Section title="Other places">
        <Card>
          {others.map((p) => placeRow(p, false))}
          <Row ask icon="plus" title="Anywhere else you go a lot?" line="Family, the gym, anywhere." onPress={() => router.navigate('/place/new?type=other')} last label="Add another place" />
        </Card>
      </Section>

      <Card>
        <Toggle label="Any supermarket, not just mine" value={geo.anySupermarket} onChange={(v) => setAnySupermarket(v).catch(() => {})} />
        <T v="caption" muted>
          {"If you stop in another supermarket with things on your list, Focus asks once. To check, it sends Google where you're standing, only then, at most a few times a day."}
        </T>
      </Card>

      <Card style={{ gap: space[2] }}>
        <T v="bodyStrong">How you get around</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {TRAVEL_MODES.map((m) => (
            <Button key={m.id} small kind={(state.settings.travelMode ?? 'drive') === m.id ? 'primary' : 'soft'} label={m.label} onPress={() => updateSettings({ travelMode: m.id })} />
          ))}
        </View>
        <T v="caption" muted>{liveStatusLine(geo.liveStatus, now)}</T>
        <T v="caption" muted>For trips to your nursery or school, Focus asks Google how long it takes right now, and only sends the two places.</T>
      </Card>

      <Section title="More">
        <Card>
          <Button kind="outline" label="Places log" onPress={() => router.navigate('/places-log')} />
          <Button kind="outline" label="Setup checklist" onPress={() => router.navigate('/permissions')} />
        </Card>
      </Section>

      <T v="caption" muted>{"Places and their reminders stay on your phone. They're never synced to the tablet or read aloud."}</T>
    </Screen>
  );
}
