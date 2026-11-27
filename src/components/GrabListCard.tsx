// A grab list on Today (brief 4): one card for one trip, at the top until it's done. Big ticks.
// "If you find it" items never block Done. Phone only: grab lists live with her places.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Check, T } from './ui';
import { useDeviceRole } from '../lib/device';
import { closeGrabList, tickGrab, useGeo } from '../lib/geoStore';
import { grabComplete, openGrabLists } from '../lib/grabLists';
import { space, useColors } from '../theme';

export function GrabListCards() {
  const role = useDeviceRole();
  const geo = useGeo();
  const c = useColors();
  if (role !== 'phone') return null;
  const lists = openGrabLists(geo.grabLists);
  if (!lists.length) return null;
  return (
    <>
      {lists.map((g) => {
        const place = g.placeId ? geo.places.find((p) => p.id === g.placeId) : undefined;
        const left = g.items.filter((i) => !i.done && !i.ifFound).length;
        return (
          <Card key={g.id} style={{ gap: space[1] }}>
            <T v="label" muted>{place ? `FOR ${place.name.toUpperCase()}` : 'GRAB LIST'}</T>
            <T v="heading">{g.title}</T>
            {g.items.map((it) => (
              <View key={it.id} style={[styles.row, { borderTopColor: c.line }]}>
                <Check on={!!it.done} onPress={() => tickGrab(g.id, it.id).catch(() => {})} label={it.text} />
                <View style={{ flex: 1 }}>
                  <T v="body" muted={!!it.done} style={it.done ? { textDecorationLine: 'line-through' } : undefined}>{it.text}</T>
                  {it.ifFound ? <T v="caption" muted>if you find it</T> : null}
                </View>
              </View>
            ))}
            <Button
              small
              kind={grabComplete(g) ? 'primary' : 'soft'}
              label={grabComplete(g) ? 'Done, got everything' : `Done (${left} not ticked)`}
              onPress={() => closeGrabList(g.id).catch(() => {})}
            />
          </Card>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space[3], alignItems: 'center', minHeight: 52, borderTopWidth: StyleSheet.hairlineWidth },
});
