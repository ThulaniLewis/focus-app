// Opened by tapping a room's NFC sticker (focus://room/kitchen) or from Home.
// On the tablet in Dash mode it's the room view (and task mode while a round runs); on the phone, a list.
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { openAvoidSheet } from '../../../components/Avoid';
import { showSheet } from '../../../components/Sheet';
import { DashShell } from '../../../components/TabletDash';
import { TabletRoom } from '../../../components/TabletRoom';
import { roomName, TaskRow } from '../../../components/TaskRow';
import { Button, Card, Header, Section, Screen, T } from '../../../components/ui';
import { isTabletDevice, useDashMode } from '../../../lib/device';
import { useStore } from '../../../lib/store';
import { openRoundStop } from '../../../components/Session';
import { space, useColors } from '../../../lib/theme';
import { agendaFor, dayKey, isDoneOn, slug as toSlug, tasksFor } from '../../../lib/time';

export default function Room() {
  const { slug: raw, from } = useLocalSearchParams<{ slug: string; from?: string }>();
  const slug = toSlug(String(raw ?? ''));
  const dash = useDashMode();
  const { state } = useStore();

  // Lifted off the wall mount (the tablet leaves landscape): ask which room it's in now.
  const wasDash = useRef(dash);
  useEffect(() => {
    if (isTabletDevice() && wasDash.current && !dash)
      showSheet({
        title: 'Which room is the tablet in now?',
        options: state.settings.rooms.map((r) => ({ label: r.name, icon: 'map-pin', onPress: () => router.navigate(`/room/${toSlug(r.name)}`) })),
      });
    wasDash.current = dash;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dash]);

  if (dash)
    return (
      <DashShell active="room">
        <TabletRoom room={slug} fromTag={from === 'tag'} />
      </DashShell>
    );
  return <PhoneRoom slug={slug} />;
}

function PhoneRoom({ slug }: { slug: string }) {
  const store = useStore();
  const { state, setRooms, startRound } = store;
  const c = useColors();
  const room = state.settings.rooms.find((r) => toSlug(r.name) === slug);
  const name = room?.name ?? slug.replace(/-/g, ' ');
  const home = state.spaces.find((s) => s.kind === 'home');

  // Untimed jobs for this room, plus today's timed ones that aren't ticked yet.
  const timedToday = agendaFor(state, dayKey(new Date())).filter((a) => !a.done && a.task.room === slug).map((a) => a.task);
  // Plus today's list for this room (flexible jobs and undated ones), in Focus's suggested order.
  const todayKey = dayKey(new Date());
  const listed = tasksFor(state, todayKey).filter((t) => t.room === slug && !isDoneOn(t, todayKey));
  const here = [...timedToday, ...listed, ...state.tasks.filter((t) => !t.done && !t.at && !t.someday && t.room === slug && !listed.includes(t))];
  const grabHere = state.tasks.filter((t) => !t.done && t.grab?.fromRoom === slug);
  const kicker = room?.floor === 'up' ? 'UPSTAIRS' : room?.floor === 'down' ? 'DOWNSTAIRS' : undefined;

  return (
    <Screen>
      <Header title={name} kicker={kicker} fallback={home ? `/space/${home.id}` : '/'} />

      {!room && (
        <Card tone="nudge">
          <T v="body" color={c.nudgeInk}>This sticker says "{slug}", which isn't one of your rooms yet.</T>
          <Button
            kind="soft"
            label={`Add "${name}" as a room`}
            onPress={() => setRooms([...state.settings.rooms, { name: name.charAt(0).toUpperCase() + name.slice(1), floor: '' }])}
          />
        </Card>
      )}

      {room && (
        state.settings.round?.room === slug ? (
          <Card tone="nudge" style={{ gap: space[2] }}>
            <T v="bodyStrong" color={c.nudgeInk}>You're doing the {name.toLowerCase()}</T>
            <T v="body" color={c.nudgeInk}>Work through it in any order. When you stop, Focus asks which ones you did.</T>
            <Button label="Stop" onPress={() => openRoundStop(dayKey(new Date()))} />
          </Card>
        ) : (
          <Button
            label={`Start the ${name.toLowerCase()}`}
            onPress={() => startRound(slug)}
          />
        )
      )}
      {room && <Button kind="quiet" label="I'm avoiding this" onPress={() => openAvoidSheet(store, slug)} />}

      {grabHere.length > 0 && (
        <Section title="Grab while you're here">
          <Card tone="nudge">
            {grabHere.map((t) => (
              <View key={t.id} style={{ gap: 2, paddingVertical: space[1] }}>
                <T v="bodyStrong" color={c.nudgeInk}>{t.grab!.item}</T>
                <T v="caption" color={c.nudgeInk}>
                  for {t.title}
                  {t.room ? ` (${roomName(state.settings.rooms, t.room)})` : ''}
                </T>
              </View>
            ))}
          </Card>
        </Section>
      )}

      <Section title="In here" hint={here.length ? `${here.length} to do` : undefined}>
        {here.length ? (
          <Card style={{ paddingVertical: 0 }}>
            {here.map((t, i) => <TaskRow key={t.id} task={t} showRoom={false} last={i === here.length - 1} />)}
          </Card>
        ) : (
          <T v="body" muted>Nothing for this room. Enjoy it.</T>
        )}
      </Section>
    </Screen>
  );
}
