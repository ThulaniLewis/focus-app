// Places: where Focus notices you arrive and leave. Set by address, phone only.
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { Button, Card, Header, Screen, Section, T } from '../../components/ui';
import { featureOn } from '../../lib/features';
import { PLACE_TYPES, whereLine } from '../../lib/geo';
import { useGeo } from '../../lib/geoStore';
import { locationStatus, type LocationStatus } from '../../lib/location';
import { useNow, useStore } from '../../lib/store';
import { space, useColors } from '../../theme';

export default function Places() {
  const { state } = useStore();
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

  return (
    <Screen>
      <Header title="Places" fallback="/settings" />
      <T v="body" muted>Focus notices when you arrive and leave, so it can bring your shopping list at the right moment. No buttons to press.</T>

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

      <Section title="Your places">
        <Card>
          {geo.places.length === 0 && <T v="body" muted>Start with home. Add your food shop next, so your list pops up when you get there.</T>}
          {geo.places.map((p, i) => {
            const type = PLACE_TYPES.find((t) => t.id === p.type);
            return (
              <Pressable
                key={p.id}
                onPress={() => router.navigate(`/place/${p.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`${p.name}, ${type?.label}. Tap to change`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space[3],
                  minHeight: 56,
                  borderBottomWidth: i === geo.places.length - 1 ? 0 : StyleSheet.hairlineWidth,
                  borderBottomColor: c.line,
                }}
              >
                <Icon name={type?.icon ?? 'map-pin'} size={20} color={c.primary} />
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong">{p.name}</T>
                  <T v="caption" muted numberOfLines={1}>{`${type?.label} · ${p.radiusM} m circle${p.address ? ` · ${p.address}` : ''}`}</T>
                </View>
                <Icon name="chevron-right" size={20} color={c.inkMuted} />
              </Pressable>
            );
          })}
          <Button kind="soft" label={geo.places.length ? 'Add a place' : 'Add home'} onPress={() => router.navigate('/place/new')} />
        </Card>
      </Section>

      <Section title="More">
        <Card>
          <Button kind="outline" label="Places log" onPress={() => router.navigate('/places-log')} />
          <Button kind="outline" label="Setup checklist" onPress={() => router.navigate('/permissions')} />
        </Card>
      </Section>

      <T v="caption" muted>{"Places stay on your phone. They're never synced to the tablet or read aloud."}</T>
    </Screen>
  );
}
