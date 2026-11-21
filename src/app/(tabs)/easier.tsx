// After a short night: what Focus can offer to make the day easier. She ticks what she wants;
// nothing changes until Save, and nothing is dropped. Phone only.
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button, Card, Check, Screen, Section, T } from '../../components/ui';
import { isTabletDevice } from '../../lib/device';
import { easierDay, NAP_MIN } from '../../lib/sleep';
import { useStore } from '../../lib/store';
import { space, useColors } from '../../theme';
import { whenLabel } from '../../lib/comeUp';
import { dayKey } from '../../lib/time';

export default function Easier() {
  const { state, applyEasierDay } = useStore();
  const c = useColors();
  const [offer] = useState(() => easierDay(state, new Date()));
  const [nap, setNap] = useState(!!offer.nap);
  const [biggest, setBiggest] = useState<'first' | 'saturday' | null>(offer.biggest ? 'first' : null);
  const [windDown, setWindDown] = useState(!!offer.windDown);

  // Sleep is phone only: the shared screen never shows it.
  if (isTabletDevice())
    return (
      <Screen>
        <T v="body" muted>This one lives on your phone.</T>
        <Button label="Back" onPress={() => router.navigate('/')} />
      </Screen>
    );
  const today = dayKey(new Date());
  const nothing = !offer.nap && !offer.biggest && !offer.windDown;
  const choice = (value: 'first' | 'saturday' | null, label: string) => (
    <Pressable
      key={String(value)}
      onPress={() => setBiggest(value)}
      accessibilityRole="radio"
      accessibilityState={{ checked: biggest === value }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44 }}
    >
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: biggest === value ? c.primary : c.line, alignItems: 'center', justifyContent: 'center' }}>
        {biggest === value ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.primary }} /> : null}
      </View>
      <T v="body" style={{ flex: 1 }}>{label}</T>
    </Pressable>
  );

  return (
    <Screen>
      <T v="title">An easier day</T>
      <T v="body" muted>Just offers. Tick what would help; nothing changes until you tap Save.</T>
      {offer.nap && (
        <Section title="A rest">
          <Card style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-start' }}>
            <Check on={nap} onPress={() => setNap(!nap)} label="Rest" />
            <View style={{ flex: 1, gap: 2 }}>
              <T v="body">{`${NAP_MIN} minutes at ${offer.nap}, while Sav's at nursery`}</T>
              <T v="caption" muted>Lie down, eyes closed. Even without sleeping, it helps.</T>
            </View>
          </Card>
        </Section>
      )}
      {offer.biggest && (
        <Section title="Your biggest job">
          <Card style={{ gap: space[1] }}>
            <T v="bodyStrong">{offer.biggest.task.title}</T>
            {offer.biggest.task.estimateMin ? <T v="caption" muted>{`About ${offer.biggest.task.estimateMin} min`}</T> : null}
            {choice('first', "Do it first, while there's the most in the tank")}
            {offer.biggest.saturday ? choice('saturday', `Move it to ${whenLabel(offer.biggest.saturday, undefined, today)} (Sav's with her dad)`) : null}
            {choice(null, 'Leave it as it is')}
          </Card>
        </Section>
      )}
      {offer.windDown && (
        <Section title="Tonight">
          <Card style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-start' }}>
            <Check on={windDown} onPress={() => setWindDown(!windDown)} label="Earlier wind down" />
            <View style={{ flex: 1, gap: 2 }}>
              <T v="body">{`Wind down at ${offer.windDown.to!.time} instead of ${offer.windDown.fromLabel}`}</T>
              <T v="caption" muted>Tonight only. Back to normal tomorrow.</T>
            </View>
          </Card>
        </Section>
      )}
      {nothing ? <T v="body" muted>Nothing to move today. Go gently, and keep it small.</T> : null}
      <Button
        label={nothing ? 'Done' : 'Save'}
        onPress={() => {
          if (!nothing) applyEasierDay(offer, { nap, biggest, windDown });
          router.navigate('/');
        }}
      />
      {!nothing ? <Button kind="quiet" label="Not today" onPress={() => router.navigate('/')} /> : null}
    </Screen>
  );
}
