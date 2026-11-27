// Arriving at a place: one card with its linked tasks ("Have you dropped Ada off?" Done, Not yet, Not
// today) and then its reminders. Also opened from the leaving nudge, and from the day-before warning,
// where Focus can draft a message for her to send herself. Focus never sends anything, and never ticks a
// linked task by itself: Done ticks it with the time she arrived, from the Places log.
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Share, View } from 'react-native';
import { Button, Card, Header, Screen, T } from '../../../components/ui';
import { draftFor, type PlaceReminder, remindersAt } from '../../../lib/geo';
import { answerLink, setReminderDone, useGeo } from '../../../lib/geoStore';
import { arrivedAt, askLine, type LinkedTask, linkedDue } from '../../../lib/placeLinks';
import { does } from '../../../lib/placeTypes';
import { useNow, useStore } from '../../../lib/store';
import { dayKey, fmtTime } from '../../../lib/time';
import { space, useColors } from '../../../theme';

const doneLabel = (r: PlaceReminder) => (/^(tell|let)\b/i.test(r.text) ? 'Done, I told them' : 'Done');

export default function PlaceReminders() {
  const { id, warn } = useLocalSearchParams<{ id: string; warn?: string }>();
  const geo = useGeo();
  const store = useStore();
  const c = useColors();
  const now = useNow(60000);
  const today = dayKey(now);
  // Answered on this screen: hidden straight away, whatever the store says.
  const [answered, setAnswered] = useState<Set<string>>(new Set());
  const place = geo.places.find((p) => p.id === id);
  const warned = warn ? geo.reminders.find((r) => r.id === warn && !r.doneAt) : undefined;
  const due = (warned ? [warned] : place ? remindersAt(geo.reminders, place.id, now) : []).filter((r) => !answered.has(r.id));
  const tasks: LinkedTask[] = !warned && place && does(place, 'linked-tasks') ? (linkedDue(store.state, geo.links, today)[place.id] ?? []).filter((t) => !answered.has(t.id)) : [];
  const here = geo.presence.placeId === id;
  const arrived = place ? arrivedAt(geo.log, place.id, now) : null;

  const leave = () => (router.canGoBack() ? router.back() : router.navigate('/'));
  const left = due.length + tasks.length;
  const answer = (key: string) => {
    setAnswered((s) => new Set([...s, key]));
    if (left <= 1) leave();
  };
  const done = (r: PlaceReminder) => {
    setReminderDone(r.id, true).catch(() => {});
    answer(r.id);
  };
  const taskDone = (t: LinkedTask) => {
    const task = store.state.tasks.find((x) => x.id === t.id);
    if (task) store.toggleDone(t.id, task.repeatDays?.length ? today : undefined, arrived ?? undefined);
    answer(t.id);
  };
  const notYet = (t: LinkedTask) => {
    answerLink(t.id, 'not-yet', today).catch(() => {});
    answer(t.id);
  };
  const notToday = (t: LinkedTask) => {
    store.skipDay(t.id, today);
    answerLink(t.id, 'not-today', today).catch(() => {});
    answer(t.id);
  };
  const draft = (r: PlaceReminder) => Share.share({ message: draftFor(r) }).catch(() => {});

  if (!place) {
    return (
      <Screen>
        <Header title="Reminders" fallback="/" />
        <T v="body" muted>This place has gone, and its reminders with it.</T>
      </Screen>
    );
  }

  const kicker = warned ? `STILL TO DO, FOR ${place.name.toUpperCase()}` : here ? `YOU'RE AT ${place.name.toUpperCase()}${arrived ? ` · ${fmtTime(new Date(arrived))}` : ''}` : place.name.toUpperCase();

  return (
    <Screen clock={false}>
      <View style={{ minHeight: 480, justifyContent: 'center', gap: space[4], paddingVertical: space[6] }}>
        <T v="label" muted>{kicker}</T>
        {left === 0 && (
          <>
            <T v="title">Nothing waiting here.</T>
            <Button kind="soft" label={`Open ${place.name}`} onPress={() => router.navigate(`/place/${place.id}`)} />
          </>
        )}
        {tasks.map((t) => (
          <Card key={t.id} style={{ gap: space[3] }}>
            <T v="title">{askLine(t.title)}</T>
            <T v="caption" muted>{t.title}</T>
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              <View style={{ flex: 1 }}>
                <Button small label="Done" onPress={() => taskDone(t)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button small kind="soft" label="Not yet" onPress={() => notYet(t)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button small kind="outline" label="Not today" onPress={() => notToday(t)} />
              </View>
            </View>
          </Card>
        ))}
        {due.map((r) => (
          <Card key={r.id} style={{ gap: space[3] }}>
            {tasks.length ? <T v="label" muted>ALSO FOR HERE</T> : null}
            <T v="title">{r.text}</T>
            {warned ? (
              <Card tone="nudge">
                <T v="body" color={c.nudgeInk}>{`If you won't be at ${place.name} before then, phone or message them instead.`}</T>
                <Button kind="primary" label="Draft a message" onPress={() => draft(r)} />
                <T v="caption" color={c.nudgeInk}>Focus writes it, you send it.</T>
              </Card>
            ) : null}
            <Button label={warned ? 'Already done' : doneLabel(r)} onPress={() => done(r)} />
          </Card>
        ))}
        {tasks.length > 0 && arrived ? <T v="caption" muted style={{ textAlign: 'center' }}>{`Done ticks it off at ${fmtTime(new Date(arrived))}, when you got here.`}</T> : null}
        {due.length > 0 && <Button kind="quiet" label="Not now" onPress={leave} />}
      </View>
    </Screen>
  );
}
