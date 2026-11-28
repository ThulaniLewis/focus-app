// "Away tonight. Home jobs paused." with Undo, at the top of Today (brief 4 Part 5). Phone only.
import React from 'react';
import { Pressable, View } from 'react-native';
import { T } from './ui';
import { AWAY_LINE } from '../lib/awayMode';
import { useDeviceRole } from '../lib/device';
import { setAway, useGeo } from '../lib/geoStore';
import { awayNow } from '../lib/grabLists';
import { space, useColors } from '../theme';

export function AwayLine() {
  const role = useDeviceRole();
  const geo = useGeo();
  const c = useColors();
  const away = awayNow(geo.away);
  if (role !== 'phone' || !away) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44, paddingHorizontal: space[3], borderRadius: 12, backgroundColor: c.surfaceSunken }}>
      <T v="body" style={{ flex: 1 }}>{AWAY_LINE}</T>
      <Pressable onPress={() => setAway(null).catch(() => {})} accessibilityRole="button" accessibilityLabel="Undo away mode, I'm home" hitSlop={10} style={{ paddingVertical: space[1], paddingHorizontal: space[2] }}>
        <T v="bodyStrong" color={c.primary}>Undo</T>
      </Pressable>
    </View>
  );
}
