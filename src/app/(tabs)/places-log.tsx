// Places log: every arrival and departure, a day at a time, like clocking in and out. Phone only.
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Header, IconButton, Screen, T } from '../../components/ui';
import { logForDay, logLine } from '../../lib/geo';
import { useGeo } from '../../lib/geoStore';
import { useNow } from '../../lib/store';
import { dayKey } from '../../lib/time';
import { space, useColors } from '../../theme';

const HOW = { geofence: 'geofence', background: 'background check', 'app-open': 'as Focus opened' } as const;

export default function PlacesLog() {
  const geo = useGeo();
  const c = useColors();
  const now = useNow(60000);
  const [back, setBack] = useState(0);
  const d = new Date(now);
  d.setDate(now.getDate() - back);
  const day = dayKey(d);
  const entries = logForDay(geo.log, day);
  const title = back === 0 ? 'Today' : back === 1 ? 'Yesterday' : d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });

  return (
    <Screen>
      <Header title="Places log" fallback="/places" />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <IconButton name="chevron-left" label="Day before" tone="quiet" onPress={() => setBack((b) => b + 1)} />
        <T v="heading" style={{ flex: 1, textAlign: 'center' }}>{title}</T>
        {back > 0 ? <IconButton name="chevron-right" label="Day after" tone="quiet" onPress={() => setBack((b) => b - 1)} /> : <View style={{ width: 44 }} />}
      </View>
      <Card>
        {entries.length === 0 && <T v="body" muted>Nothing logged this day.</T>}
        {entries.map((e, i) => (
          <View
            key={`${e.at}-${e.event}-${e.placeId}`}
            style={{ paddingVertical: space[2], borderBottomWidth: i === entries.length - 1 ? 0 : StyleSheet.hairlineWidth, borderBottomColor: c.line }}
          >
            <T v="body">{logLine(e, geo.places)}</T>
            <T v="caption" muted>{`Noticed by ${HOW[e.source]}`}</T>
          </View>
        ))}
      </Card>
      <T v="caption" muted>{`Kept for 60 days, on this phone only. Times are when Focus first saw the change.`}</T>
    </Screen>
  );
}
