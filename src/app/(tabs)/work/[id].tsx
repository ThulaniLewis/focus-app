// "At work": opens when she arrives at a work place. Today's meetings from her calendar, her work list,
// and when to leave for the next fixed thing. Nothing else for now.
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Check, Header, Screen, Section, T } from '../../../components/ui';
import { type DiaryEvent, loadDiary } from '../../../lib/calendar';
import { useGeo } from '../../../lib/geoStore';
import { useNow, useStore } from '../../../lib/store';
import { dayKey, fmtTime } from '../../../lib/time';
import { nextLeave, workList } from '../../../lib/workRoutine';
import { space, useColors } from '../../../theme';

const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

export default function Work() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const geo = useGeo();
  const { state, toggleDone } = useStore();
  const c = useColors();
  const now = useNow(60000);
  const place = geo.places.find((p) => p.id === id);
  const [meetings, setMeetings] = useState<DiaryEvent[] | null>(null);
  const today = dayKey(now);

  useEffect(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 86400000);
    loadDiary(start, end)
      .then((e) => setMeetings(e.filter((x) => !x.allDay && x.end.getTime() > Date.now())))
      .catch(() => setMeetings([]));
  }, [today]);

  if (!place) {
    return (
      <Screen>
        <Header title="At work" fallback="/" />
        <T v="body" muted>This place has gone. You can add it again in Settings, Places.</T>
      </Screen>
    );
  }

  const list = workList(state, place, now);
  const leave = nextLeave(state, now);
  const here = geo.presence.placeId === place.id && geo.presence.since ? new Date(geo.presence.since) : null;
  const row = (i: number) => ({ minHeight: 44, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: c.line });

  return (
    <Screen>
      <Header title={`At ${place.name.toLowerCase() === 'work' ? 'work' : place.name}`} kicker={`${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}`} fallback="/" />
      {here && dayKey(here) === today ? <T v="body" muted>{`You got in at ${fmtTime(here)}.`}</T> : null}

      <Section title="Today's meetings">
        <Card>
          {meetings === null ? <T v="body" muted>Looking at your calendar…</T> : null}
          {meetings?.length === 0 ? <T v="body" muted>No more meetings today.</T> : null}
          {meetings?.map((m, i) => (
            <View key={m.id} style={[{ flexDirection: 'row', alignItems: 'center', gap: space[3] }, row(i)]}>
              <T v="body" style={{ flex: 1 }} numberOfLines={2}>{m.title}</T>
              <T v="caption" muted>{fmtTime(m.start)}</T>
            </View>
          ))}
        </Card>
      </Section>

      <Section title="Work to do">
        <Card>
          {!place.workSpaceId ? (
            <>
              <T v="body" muted>Choose which space is your work list, on this place.</T>
              <Button kind="soft" small label="Choose it" onPress={() => router.navigate(`/place/${place.id}`)} />
            </>
          ) : list.length === 0 ? (
            <T v="body" muted>Nothing on your work list.</T>
          ) : (
            list.map((t, i) => (
              <View key={t.id} style={[{ flexDirection: 'row', alignItems: 'center', gap: space[3] }, row(i)]}>
                <Check on={false} onPress={() => toggleDone(t.id, t.repeatDays?.length ? today : undefined)} label={t.title} />
                <T v="body" style={{ flex: 1 }}>{t.title}</T>
              </View>
            ))
          )}
        </Card>
      </Section>

      {leave ? (
        <Card tone="nudge">
          <T v="bodyStrong" color={c.nudgeInk}>{`Leave by ${fmtTime(leave.leaveAt)} for ${leave.title.charAt(0).toLowerCase()}${leave.title.slice(1)}`}</T>
          <T v="caption" color={c.nudgeInk}>{`${leave.title} at ${fmtTime(leave.at)}.${leave.travelMin ? ` ${leave.travelMin} min to get there.` : ''}`}</T>
        </Card>
      ) : (
        <T v="caption" muted>Nothing else fixed today.</T>
      )}
    </Screen>
  );
}
