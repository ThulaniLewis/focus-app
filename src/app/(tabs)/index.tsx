import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AccountCard } from '../../components/Account';
import { FocusCard } from '../../components/Focus';
import { WaitingCard } from '../../components/Waiting';
import { SleepCard } from '../../components/SleepCard';
import { PlacesCard, WhereLine } from '../../components/PlacesCard';
import { featureOn } from '../../lib/features';
import { PunctualityCards } from '../../components/Punctuality';
import { savHomeOn } from '../../lib/comeUp';
import { Icon } from '../../components/Icon';
import { PermissionCard, PlanList } from '../../components/Plan';
import { TaskRow } from '../../components/TaskRow';
import { Button, Card, Chip, IconButton, Screen, Section, T } from '../../components/ui';
import { clearLastCrash, readLastCrash } from '../../lib/crash';
import { calendarAllowed, checkDiary, type DiaryCheck, useDiary } from '../../lib/calendar';
import { allDayEvents } from '../../lib/dumpContext';
import { GrabListCards } from '../../components/GrabListCard';
import { AwayLine } from '../../components/AwayLine';
import { LiveTripCards } from '../../components/LiveTripCard';
import { useAwayPaused } from '../../lib/useAway';
import { useNow, useStore } from '../../lib/store';
import { radius, space, useColors } from '../../theme';
import { agendaFor, dayKey, fmtTime, slug, tasksFor, wakeFor, isDoneOn } from '../../lib/time';
import { useWeather } from '../../components/WeatherCard';
import { nextLeaveAt, phoneWeatherLine } from '../../lib/weather';
import { useDashMode } from '../../lib/device';
import { TabletDash } from '../../components/TabletDash';
import { DAY_NAMES, greeting, openInRoom, roomsByFloor, savSaturday } from '../../lib/views';

/** On the tablet's wall mount (landscape), Today is the Dash. Everywhere else, the usual Today. */
export default function Today() {
  return useDashMode() ? <TabletDash /> : <TodayList />;
}

function TodayList() {
  const { state, user, updateSettings } = useStore();
  const c = useColors();
  const now = useNow(30000);
  const today = dayKey(now);
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(now.getDate() + 1);
  const tomorrow = dayKey(tomorrowDate);

  const [refresh, setRefresh] = useState(0);
  useFocusEffect(useCallback(() => setRefresh((r) => r + 1), []));
  const { events: phoneEvents, allowed } = useDiary(state.settings.readCalendar, 2, refresh);
  // Her phone diary plus Focus's own whole-day entries (her child with someone for the day).
  const events = [...phoneEvents, ...allDayEvents(state.tasks)];
  const [diary, setDiary] = useState<DiaryCheck | null>(null);
  const [crash, setCrash] = useState<{ at: string; text: string } | null>(null);
  useEffect(() => {
    readLastCrash().then(setCrash);
  }, []);
  useEffect(() => {
    if (state.settings.readCalendar) checkDiary().then(setDiary).catch(() => {});
  }, [refresh, state.settings.readCalendar]);

  // Away tonight: home jobs are paused, so they wait off the list and roll over quietly.
  const paused = useAwayPaused();
  const tasks = tasksFor(state, today).filter((t) => !paused(t));
  const roomed = tasks.filter((t) => t.room && !isDoneOn(t, today));
  const open = tasks.filter((t) => !t.room && !isDoneOn(t, today));
  const doneToday = tasks.filter((t) => isDoneOn(t, today));
  const wakeTomorrow = wakeFor(state, tomorrow);
  const evening = now.getHours() >= 16;
  const shopping = state.spaces.find((s) => s.kind === 'shopping');
  const toBuy = shopping ? state.tasks.filter((t) => t.spaceId === shopping.id && !t.done).length : 0;
  const savAway = savSaturday(events, today, state.settings)?.away;
  // The same forecast and words as the Dash, as one line under the date.
  const weatherView = useWeather(state.settings.weatherPlace, featureOn(state.settings, 'weather'));
  const weatherLine = weatherView ? phoneWeatherLine(weatherView, nextLeaveAt(agendaFor(state, today), now)) : null;
  const clockNote = weatherLine ? { text: weatherLine, onPress: weatherView?.kind === 'no-town' ? () => router.navigate('/settings') : undefined } : null;

  return (
    <Screen clockNote={clockNote}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <T v="label" muted>{DAY_NAMES[now.getDay()].toUpperCase()}</T>
          <T v="title">{greeting(now, state.settings.firstName)}</T>
          <WhereLine />
        </View>
        <IconButton name="settings" label="Settings" tone="quiet" onPress={() => router.navigate('/settings')} />
      </View>

      <AwayLine />

      <LiveTripCards />

      <GrabListCards />

      {!user && (
        <View style={{ gap: space[2] }}>
          <T v="heading">Sign in once so Focus can sort your dumps</T>
          <AccountCard />
        </View>
      )}

      {crash && (
        <Card tone="nudge">
          <T v="bodyStrong" color={c.nudgeInk}>Focus closed on you last time</T>
          <T v="caption" color={c.nudgeInk} selectable>{crash.text}</T>
          <T v="caption" color={c.nudgeInk}>Screenshot this for Claude, then tap Got it.</T>
          <Button kind="soft" label="Got it" onPress={() => { clearLastCrash(); setCrash(null); }} />
        </Card>
      )}

      {savHomeOn(state.settings, today) && (
        <Card tone="soft">
          <T v="bodyStrong">Sav's home today</T>
          <T v="body" muted>
            House jobs wait for her nap ({state.settings.savNap.start} to {state.settings.savNap.end}) or after 19:30. Nothing that means going out.
          </T>
        </Card>
      )}

      {featureOn(state.settings, 'sleep') && <SleepCard />}

      <WaitingCard />

      {featureOn(state.settings, 'punctuality') && <PunctualityCards />}

      <FocusCard day={today} />

      <Button kind="soft" label="Something's come up" onPress={() => router.navigate('/comeup')} />

      <PermissionCard />

      <PlacesCard />

      {!state.settings.setupSeen && (
        <Card tone="soft">
          <T v="label" color={c.primaryStrong}>WHAT'S NEW</T>
          <T v="body">
            Thursday is all house: the kitchen carries on from last night, then the living room, the entrance, and your bedroom after
            lunch. Job deadlines moved to Friday afternoon and Monday. On evenings you have Sav, house jobs wait until she's in bed.
          </T>
          <T v="body">
            Tap ▶ on a job to start it and ■ to stop. Say what's left, then pick what's needed now and what's nice to have. Focus keeps the
            real time so it plans better next time.
          </T>
          <Button kind="soft" label="Got it" onPress={() => updateSettings({ setupSeen: true })} />
        </Card>
      )}

      {state.settings.readCalendar && diary?.allowed && !diary.outlook && (
        <Card tone="nudge">
          <T v="bodyStrong" color={c.nudgeInk}>Your Outlook diary isn't on this phone yet</T>
          <T v="body" color={c.nudgeInk}>
            {diary.calendars.length
              ? `Focus can see ${diary.calendars.length} calendar${diary.calendars.length === 1 ? '' : 's'} (${diary.calendars
                  .slice(0, 3)
                  .map((x) => x.title)
                  .join(', ')}), but not your Hotmail one.`
              : 'Focus can see no calendars on this phone at all.'}{' '}
            In the Outlook app: tap your picture, then the gear, then your Hotmail account, and turn on Sync calendars. Then come back here.
          </T>
          <Button kind="soft" label="Check again" onPress={() => setRefresh((r) => r + 1)} />
        </Card>
      )}

      {state.settings.readCalendar && allowed === false && (
        <Card tone="soft">
          <T v="bodyStrong">See your diary here too</T>
          <T v="body">Let Focus read your phone calendar so your plan shows everything, not just what you've dumped.</T>
          <Button kind="primary" label="Allow calendar" onPress={async () => {
            await calendarAllowed(true);
            setRefresh((r) => r + 1);
          }} />
        </Card>
      )}

      {savAway && (
        <Card tone="soft">
          <T v="label" color={c.primaryStrong}>SAV'S WITH HER DAD TODAY</T>
          <T v="body">This one's yours. Have a look at Week for ideas.</T>
        </Card>
      )}

      {evening && wakeTomorrow && (
        <Card tone="soft">
          <T v="label" color={c.primaryStrong}>TOMORROW</T>
          <T v="title">Up by {fmtTime(wakeTomorrow.wake)}</T>
          <T v="body">
            {wakeTomorrow.because.leaveAt
              ? `To leave at ${fmtTime(wakeTomorrow.because.leaveAt)} for ${wakeTomorrow.because.task.title} at ${fmtTime(wakeTomorrow.because.at)}.`
              : `${wakeTomorrow.because.task.title} at ${fmtTime(wakeTomorrow.because.at)}.`}{' '}
            Allows {state.settings.readyMin} min to get ready.
          </T>
        </Card>
      )}

      <Section title="Plan">
        <PlanList day={today} events={events} empty={'Nothing fixed today. Say something like "nursery drop 8:15 every weekday" to get leave-by times.'} />
      </Section>

      <Section title="To do" hint={open.length ? `${open.length} left` : undefined}>
        {open.length === 0 ? (
          <T v="body" muted>Clear. Tap the mic and anything on your mind lands where it belongs.</T>
        ) : (
          <Card style={{ paddingVertical: 0 }}>
            {open.map((t, i) => <TaskRow key={t.id} task={t} showSpace last={i === open.length - 1} />)}
          </Card>
        )}
      </Section>

      {roomed.length > 0 && <AroundTheHouse />}

      {toBuy > 0 && shopping && (
        <Pressable onPress={() => router.navigate(`/space/${shopping.id}`)}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <Icon name="shopping-cart" color={c.primary} />
            <T v="bodyStrong" style={{ flex: 1 }}>{toBuy} on the shopping list</T>
            <Icon name="chevron-right" color={c.inkMuted} />
          </Card>
        </Pressable>
      )}

      {doneToday.length > 0 && (
        <Section title="Done today" hint={`${doneToday.length}`}>
          <Card style={{ paddingVertical: 0 }}>
            {doneToday.map((t, i) => <TaskRow key={t.id} task={t} last={i === doneToday.length - 1} />)}
          </Card>
        </Section>
      )}

      {!evening && wakeTomorrow && (
        <T v="caption" muted>Tomorrow: up by {fmtTime(wakeTomorrow.wake)} for {wakeTomorrow.because.task.title}.</T>
      )}
    </Screen>
  );
}

function AroundTheHouse() {
  const { state } = useStore();
  const c = useColors();
  const floors = roomsByFloor(state.settings.rooms);
  const groups = [
    { label: 'Upstairs', rooms: floors.up },
    { label: 'Downstairs', rooms: floors.down },
    { label: 'Other rooms', rooms: floors.other },
  ]
    .map((g) => ({ ...g, rooms: g.rooms.map((r) => ({ room: r, open: openInRoom(state, r) })).filter((x) => x.open.length) }))
    .filter((g) => g.rooms.length);
  return (
    <Section title="Around the house">
      {groups.map((g) => (
        <View key={g.label} style={{ gap: space[2] }}>
          <T v="label" muted>{g.label.toUpperCase()}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            {g.rooms.map(({ room, open }) => (
              <Pressable
                key={room.name}
                onPress={() => router.navigate(`/room/${slug(room.name)}`)}
                style={{ backgroundColor: c.surface, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, paddingHorizontal: space[3], paddingVertical: space[2], flexDirection: 'row', gap: space[2], alignItems: 'center' }}
              >
                <T v="bodyStrong">{room.name}</T>
                <Chip label={`${open.length}`} />
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </Section>
  );
}
