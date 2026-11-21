// The email sign-in link lands here (focus://auth#…). The store finishes the sign-in;
// this screen just waits for it, then goes to Today.
import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button, Card, Screen, T } from '../components/ui';
import { useStore } from '../lib/store';
import { space, useColors } from '../theme';
import { router } from 'expo-router';

export default function Auth() {
  const { user, linkError } = useStore();
  const c = useColors();
  if (user) return <Redirect href="/" />;
  return (
    <Screen clock={false}>
      {linkError ? (
        <Card tone="nudge">
          <T v="bodyStrong" color={c.nudgeInk}>That sign-in link didn't work</T>
          <T v="body" color={c.nudgeInk}>{linkError}. Links only work once and run out after an hour. Ask for a new one on Today.</T>
          <Button kind="soft" label="Back to Today" onPress={() => router.replace('/')} />
        </Card>
      ) : (
        <View style={{ alignItems: 'center', gap: space[3], paddingTop: space[8] }}>
          <ActivityIndicator color={c.primary} />
          <T v="body" muted>Signing you in…</T>
        </View>
      )}
    </Screen>
  );
}
