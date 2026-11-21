// Phone only. Asks once to read sleep from Health Connect, reads last night when Focus opens, and
// after a short night offers an easier day. Never on the tablet, never spoken, never synced.
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { isTabletDevice } from '../lib/device';
import { askForSleep, readRecentNights, sleepAvailable } from '../lib/healthSleep';
import { lastTwo, shortNightLine } from '../lib/sleep';
import { useNow, useStore } from '../lib/store';
import { space } from '../lib/theme';
import { dayKey } from '../lib/time';
import { Button, Card, T } from './ui';

const READ_EVERY_MS = 30 * 60000;

export function SleepCard() {
  if (isTabletDevice()) return null; // sleep never shows on the shared screen
  return <SleepCardInner />;
}

function SleepCardInner() {
  const { state, setSleepReading, addSleepNights, sleepNotToday } = useStore();
  const now = useNow(60000);
  const today = dayKey(now);
  const [available, setAvailable] = useState(false);
  const lastRead = useRef(0);

  useEffect(() => {
    sleepAvailable().then(setAvailable);
  }, []);

  // Read when Focus opens or comes back, at most every half hour.
  useEffect(() => {
    if (state.sleepReading !== 'yes') return;
    const read = () => {
      if (Date.now() - lastRead.current < READ_EVERY_MS) return;
      lastRead.current = Date.now();
      readRecentNights().then(addSleepNights);
    };
    read();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && read());
    return () => sub.remove();
  }, [state.sleepReading, addSleepNights]);

  if (!state.sleepReading && available)
    return (
      <Card tone="soft" style={{ gap: space[2] }}>
        <T v="bodyStrong">See how you slept?</T>
        <T v="body" muted>
          Focus can read last night's sleep from Health Connect (Samsung Health writes there). Only sleep, nothing else. It stays on this phone and never shows on the tablet.
        </T>
        <Button
          label="Allow"
          onPress={async () => {
            const ok = await askForSleep();
            setSleepReading(ok ? 'yes' : 'no');
          }}
        />
        <Button kind="quiet" label="Not now" onPress={() => setSleepReading('no')} />
      </Card>
    );

  const { last, before } = lastTwo(state.sleep, today);
  const line = shortNightLine(last, before);
  if (!line || state.sleep?.notToday === today) return null;
  return (
    <Card tone="soft" style={{ gap: space[2] }}>
      <T v="body">{line}</T>
      <T v="bodyStrong">Want an easier day?</T>
      <Button label="Show me" onPress={() => router.navigate('/easier')} />
      <Button kind="quiet" label="Not today" onPress={sleepNotToday} />
    </Card>
  );
}
