// Away mode's questions and its short wind down (brief 4 Part 5). Phone only, never read aloud.
//   /away/<placeId>  "Looks like you're staying at Gran's tonight. I'll pause the home stuff…" Yes / No
//   /away/still      "Still away tonight?" Yes / No, I'll be home tonight
//   /away/card       "You're at Gran's tonight. Tomorrow: … Anything to add?" Mic / Done
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { Button, Screen, T } from '../../../components/ui';
import { awayAskLine, awayCard } from '../../../lib/awayMode';
import { awayTonight, setAway, useGeo } from '../../../lib/geoStore';
import { awayNow } from '../../../lib/grabLists';
import { useNow, useStore } from '../../../lib/store';
import { dayKey } from '../../../lib/time';
import { space } from '../../../theme';

export default function AwayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const geo = useGeo();
  const { state } = useStore();
  const now = useNow(60000);
  const away = awayNow(geo.away);
  const leave = () => (router.canGoBack() ? router.back() : router.navigate('/'));
  const place = geo.places.find((p) => p.id === id);

  let title: string;
  let body: string;
  let buttons: React.ReactNode;
  if (id === 'card' && away) {
    const card = awayCard(state, away, now);
    title = card.title;
    body = card.body;
    buttons = (
      <>
        <Button label="Say something to add" onPress={() => router.navigate('/dump')} />
        <Button kind="soft" label="Done" onPress={leave} />
      </>
    );
  } else if (id === 'still' && away) {
    title = 'Still away tonight?';
    body = `At ${away.placeName}. Home jobs stay paused if you are.`;
    buttons = (
      <>
        <Button label="Yes, still away" onPress={() => { awayTonight(dayKey(now)).catch(() => {}); leave(); }} />
        <Button kind="soft" label="No, I'll be home tonight" onPress={() => { setAway(null).catch(() => {}); leave(); }} />
      </>
    );
  } else if (place && !away) {
    const line = awayAskLine(place.name);
    title = line.title;
    body = line.body;
    buttons = (
      <>
        <Button label="Yes" onPress={() => { setAway({ placeId: place.id, placeName: place.name }).catch(() => {}); leave(); }} />
        <Button kind="soft" label="No, I'll be home later" onPress={leave} />
      </>
    );
  } else {
    title = away ? `Away tonight at ${away.placeName}.` : "You're not away.";
    body = away ? 'Home jobs are paused till you get back.' : 'Everything is running as normal.';
    buttons = <Button kind="soft" label="Back to Today" onPress={() => router.navigate('/')} />;
  }

  return (
    <Screen clock={false}>
      <View style={{ minHeight: 420, justifyContent: 'center', gap: space[4], paddingVertical: space[6] }}>
        <T v="label" muted>AWAY · ON THIS PHONE ONLY</T>
        <T v="title">{title}</T>
        <T v="body" muted>{body}</T>
        <View style={{ gap: space[2] }}>{buttons}</View>
      </View>
    </Screen>
  );
}
