// Waiting mode on the phone's Today: "While you wait", three small jobs before a visitor, an
// appointment somewhere or a leave-by time. "Not now" closes it for that one.
import React from 'react';
import { View } from 'react-native';
import { waitingFor, waitPicks } from '../lib/comeUp';
import { useNow, useStore } from '../lib/store';
import { space, useColors } from '../lib/theme';
import { fmtTime } from '../lib/time';
import { Button, Card, T } from './ui';

export function WaitingCard() {
  const { state, startTimer, waitingNotNow } = useStore();
  const c = useColors();
  const now = useNow(30000);
  const w = waitingFor(state, now);
  if (!w) return null;
  const picks = waitPicks(state, now, w);
  return (
    <Card tone="soft" style={{ gap: space[2] }}>
      <T v="label" color={c.primaryStrong}>WHILE YOU WAIT</T>
      <T v="bodyStrong">{`${w.title} at ${fmtTime(w.until)}`}</T>
      {picks.length ? (
        <>
          <T v="body" muted>A few small things that fit before then:</T>
          {picks.map((t) => (
            <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
              <View style={{ flex: 1 }}>
                <T v="body">{t.title}</T>
                {t.estimateMin ? <T v="caption" muted>About {t.estimateMin} min</T> : null}
              </View>
              <Button small kind="soft" label="Start" onPress={() => startTimer(t.id)} />
            </View>
          ))}
        </>
      ) : (
        <T v="body" muted>Nothing small left. Sit down for a minute, you've earned it.</T>
      )}
      <Button kind="quiet" small label="Not now" onPress={() => waitingNotNow(w.key)} />
    </Card>
  );
}
