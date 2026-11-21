// "Note for Claude" (from the dev report): saves what she says, plus the screen she came from and
// what was going on. No Claude call. This is its own screen, so it can never turn a normal dump into
// a note (or the other way round).
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { DictationBox } from '../../components/Dictation';
import { Button, Card, Screen, T } from '../../components/ui';
import { isTabletDevice } from '../../lib/device';
import { noteContext } from '../../lib/screens';
import { useStore } from '../../lib/store';
import { useDictation } from '../../lib/useDictation';
import { space, useColors } from '../../theme';

export default function NoteForClaude() {
  const { state, logEvent } = useStore();
  const params = useLocalSearchParams<{ from?: string }>();
  const c = useColors();
  const from = params.from || 'Dev report';
  const d = useDictation('note', () => {});
  const save = () => {
    logEvent({ at: new Date().toISOString(), kind: 'note', text: d.text.trim(), screen: from, context: noteContext(state, new Date(), isTabletDevice() ? 'tablet' : 'phone') });
    d.setText('');
    router.back();
  };
  return (
    <Screen>
      <T v="title">Note for Claude</T>
      <T v="body" muted>{`Saves what you say, plus the screen you're on (${from}). It goes in the dev report, not your lists.`}</T>
      <DictationBox d={d} placeholder="What happened, or what would help?" />
      {d.error ? (
        <Card tone="nudge">
          <T v="body" color={c.nudgeInk}>{d.error}</T>
        </Card>
      ) : null}
      {!d.listening ? (
        <View style={{ gap: space[2] }}>
          <Button label="Save note" onPress={save} disabled={!d.text.trim()} />
        </View>
      ) : null}
    </Screen>
  );
}
