// On the phone's Today: the small "Home since 17:42" line, and a card if location has stopped (or isn't
// set up yet). Phone only, and only with Home or out switched on.
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { useDeviceRole } from '../lib/device';
import { featureOn } from '../lib/features';
import { whereLine } from '../lib/geo';
import { useGeo } from '../lib/geoStore';
import { locationStatus, type LocationStatus } from '../lib/location';
import { useNow, useStore } from '../lib/store';
import { useColors } from '../theme';
import { Icon } from './Icon';
import { Button, Card, T } from './ui';

function usePlacesOn() {
  const { state } = useStore();
  return useDeviceRole() === 'phone' && featureOn(state.settings, 'places');
}

export function WhereLine() {
  const geo = useGeo();
  const now = useNow(60000);
  const c = useColors();
  const line = whereLine(geo, now);
  if (!usePlacesOn() || !line) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} accessible accessibilityLabel={line}>
      <Icon name="map-pin" size={14} color={c.inkMuted} />
      <T v="caption" muted>{line}</T>
    </View>
  );
}

export function PlacesCard() {
  const on = usePlacesOn();
  const geo = useGeo();
  const c = useColors();
  const [status, setStatus] = useState<LocationStatus | null>(null);
  const refresh = useCallback(() => {
    locationStatus().then(setStatus).catch(() => {});
  }, []);
  useFocusEffect(refresh);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  if (!on) return null;
  if (!geo.places.length)
    return (
      <Card tone="soft">
        <T v="bodyStrong">Tell Focus where home is</T>
        <T v="body" muted>{"Then it knows when you're out, and can bring your shopping list when you leave or reach the shop."}</T>
        <Button kind="soft" label="Add home" onPress={() => router.navigate('/place/new')} />
      </Card>
    );
  if (!status || status.running) return null;
  return (
    <Card tone="nudge">
      <T v="bodyStrong" color={c.nudgeInk}>Location has stopped</T>
      <T v="body" color={c.nudgeInk}>
        {status.background ? "Focus isn't noticing home and out right now." : 'Focus needs location all the time to notice home and out.'}
      </T>
      <Button kind="soft" label="Fix it" onPress={() => router.navigate('/permissions')} />
    </Card>
  );
}
