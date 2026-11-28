// A grab list, full screen (brief 4 Part 2). Opens on arriving at the list's place ("You're home.
// Here's what you came for."), from the leaving nudge ("You left without …": Done, Forgot, Didn't
// need), or straight after a dump made while she's already there. Big ticks; "if you find it" items
// never block Done. Phone only, like all her places.
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Check, Screen, T } from '../../../components/ui';
import { closeGrabList, finishGrabList, tickGrab, useGeo } from '../../../lib/geoStore';
import { arriveLine, grabComplete, leftLine, unticked } from '../../../lib/grabLists';
import { space, useColors } from '../../../theme';

export default function GrabScreen() {
  const { id, left } = useLocalSearchParams<{ id: string; left?: string }>();
  const geo = useGeo();
  const c = useColors();
  const g = geo.grabLists.find((x) => x.id === id);
  const place = g?.placeId ? geo.places.find((p) => p.id === g.placeId) : undefined;
  const here = !!place && geo.presence.placeId === place.id;
  const leave = () => (router.canGoBack() ? router.back() : router.navigate('/'));
  const finish = (how: 'got' | 'forgot' | 'not-needed') => {
    if (g) finishGrabList(g.id, how).catch(() => {});
    leave();
  };

  if (!g || g.closedAt) {
    return (
      <Screen clock={false}>
        <View style={{ minHeight: 400, justifyContent: 'center', gap: space[4] }}>
          <T v="title">{g ? 'All done with that list.' : 'That list has gone.'}</T>
          <Button kind="soft" label="Back to Today" onPress={() => router.navigate('/')} />
        </View>
      </Screen>
    );
  }

  const leaving = left === '1' && unticked(g).length > 0;
  const heading = leaving ? leftLine(g) : here && place ? arriveLine(place) : g.title;
  const kicker = place ? `${g.title.toUpperCase()} · FOR ${place.type === 'home' ? 'HOME' : place.name.toUpperCase()}` : 'GRAB LIST';
  const notTicked = unticked(g).length;

  return (
    <Screen clock={false}>
      <View style={{ gap: space[4], paddingVertical: space[5] }}>
        <T v="label" muted>{kicker}</T>
        <T v="title">{heading}</T>
        <View>
          {g.items.map((it) => (
            <View key={it.id} style={[styles.row, { borderTopColor: c.line }]}>
              <Check on={!!it.done} onPress={() => tickGrab(g.id, it.id).catch(() => {})} label={it.text} />
              <View style={{ flex: 1 }}>
                <T v="heading" muted={!!it.done} style={it.done ? { textDecorationLine: 'line-through' } : undefined}>{it.text}</T>
                {it.ifFound ? <T v="caption" muted>if you find it</T> : null}
              </View>
            </View>
          ))}
        </View>
        {leaving ? (
          <View style={{ gap: space[2] }}>
            <Button label="Done, I got them" onPress={() => finish('got')} />
            <Button kind="soft" label="Forgot, keep the list" onPress={() => finish('forgot')} />
            <Button kind="outline" label="Didn't need them" onPress={() => finish('not-needed')} />
          </View>
        ) : (
          <View style={{ gap: space[2] }}>
            <Button
              kind={grabComplete(g) ? 'primary' : 'soft'}
              label={grabComplete(g) ? 'Done, got everything' : `Done (${notTicked} not ticked)`}
              onPress={() => {
                closeGrabList(g.id).catch(() => {});
                leave();
              }}
            />
            <Button kind="quiet" label="Not now" onPress={leave} />
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space[3], alignItems: 'center', minHeight: 60, borderTopWidth: StyleSheet.hairlineWidth },
});
