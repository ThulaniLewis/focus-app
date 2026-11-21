import { Lexend_600SemiBold } from '@expo-google-fonts/lexend';
import { schemeFor, windDownAt } from '../lib/look';
import { dayKey } from '../lib/time';
import {
  AtkinsonHyperlegibleNext_400Regular,
  AtkinsonHyperlegibleNext_500Medium,
  AtkinsonHyperlegibleNext_600SemiBold,
} from '@expo-google-fonts/atkinson-hyperlegible-next';
import { useFonts } from 'expo-font';
import { router, Stack, usePathname } from 'expo-router';
import { recordScreen } from '../lib/screens';
import * as Linking from 'expo-linking';
import { roomFromLink } from '../lib/roomLink';
import * as Notifications from 'expo-notifications';
import { requestHighlight } from '../lib/highlight';
import { showSheet } from '../components/Sheet';
import { openStopFlow } from '../components/Session';
import { useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SessionHost } from '../components/Session';
import { PunctualityHost } from '../components/Punctuality';
import { featureOn } from '../lib/features';
import { SheetHost } from '../components/Sheet';
import * as SystemUI from 'expo-system-ui';
import React, { useEffect } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { ErrorBoundaryProps } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { installCrashLog } from '../lib/crash';
import { setupNotifications } from '../lib/notify';

installCrashLog();
import { StoreProvider, useNow, useStore } from '../lib/store';
import { TimersProvider } from '../lib/timers';
import { colors, radius, SchemeProvider, space, type, useColors, useScheme } from '../theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

/** Light or dark for the whole app, from Settings > Look. Match phone: light by day, dark from wind down. */
function LookRoot({ children }: { children: React.ReactNode }) {
  const { state } = useStore();
  const now = useNow(60000);
  const day = dayKey(now);
  const windDown = React.useMemo(() => windDownAt(state, day), [state, day]);
  return <SchemeProvider value={schemeFor(state.settings.look, now, windDown)}>{children}</SchemeProvider>;
}

function Gate() {
  const scheme = useScheme();
  const { ready, state } = useStore();
  const c = useColors();
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(c.bg).catch(() => {});
  }, [c.bg]);
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  if (!ready) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth" />
      </Stack>
      <SheetHost />
      <SessionHost />
      {featureOn(state.settings, 'punctuality') && <PunctualityHost />}
      <ScreenTracker />
      <RoomLinks />
      <NotificationLinks />
    </>
  );
}

/** Remembers the last few screens, so a Note for Claude can say where it was made. */
function ScreenTracker() {
  const path = usePathname();
  useEffect(() => recordScreen(path), [path]);
  return null;
}

/**
 * Opens the right room when a sticker is tapped. On a cold start the link arrives while
 * Focus is still loading (blank screen), so the router drops it and lands on Today.
 * This waits until Focus is ready, then opens the room. Also covers taps while Focus is open.
 */
function RoomLinks() {
  useEffect(() => {
    const go = (url: string | null) => {
      const room = roomFromLink(url);
      if (!room) return;
      // Let the tabs mount first, then open the room.
      setTimeout(() => router.navigate(`/room/${room}?from=tag`), 50);
    };
    Linking.getInitialURL().then(go).catch(() => {});
    const sub = Linking.addEventListener('url', (e) => go(e.url));
    return () => sub.remove();
  }, []);
  return null;
}

export default function RootLayout() {
  const [loaded] = useFonts({
    Lexend_600SemiBold,
    AtkinsonHyperlegibleNext_400Regular,
    AtkinsonHyperlegibleNext_500Medium,
    AtkinsonHyperlegibleNext_600SemiBold,
  });
  useEffect(() => {
    setupNotifications().catch(() => {});
  }, []);
  if (!loaded) return null;
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <TimersProvider>
          <LookRoot>
            <Gate />
          </LookRoot>
        </TimersProvider>
      </StoreProvider>
    </SafeAreaProvider>
  );
}

/** If a screen crashes, show what went wrong instead of closing the app. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  // Dark, like before. System font on purpose: this has to show even if the fonts failed.
  const k = colors.dark;
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: k.bg }} contentContainerStyle={{ padding: space[6], paddingTop: space[8] * 2, gap: space[4] }}>
      <Text style={{ color: k.ink, fontSize: type.title.fontSize, lineHeight: type.title.lineHeight, fontWeight: '600' }}>Something in Focus tripped up</Text>
      <Text style={{ color: k.inkMuted, fontSize: type.body.fontSize, lineHeight: type.body.lineHeight }}>Screenshot this and send it to Claude. Your tasks are safe.</Text>
      <Text selectable style={{ color: k.nudgeInk, fontSize: type.label.fontSize, lineHeight: type.label.lineHeight, backgroundColor: k.nudgeSoft, padding: space[3], borderRadius: radius.sm }}>
        {String(error?.message ?? error)}
        {'\n\n'}
        {String(error?.stack ?? '').split('\n').slice(0, 8).join('\n')}
      </Text>
      <Pressable onPress={retry} style={{ backgroundColor: k.primary, borderRadius: radius.sm, minHeight: 52, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: k.onPrimary, fontSize: type.bodyStrong.fontSize, fontWeight: '600' }}>Try again</Text>
      </Pressable>
    </ScrollView>
  );
}

/**
 * Tapping a notification (not its Done or Snooze buttons) takes you to that job: Today, scrolled to
 * the row, flashing. If the job isn't on Today (say laundry left from yesterday), its options open
 * instead, so you can tick it straight away.
 */
const TAP_KEY = 'focus.lastNotificationTap';

function NotificationLinks() {
  const store = useStore();
  const latest = useRef(store);
  latest.current = store;
  const seen = useRef(new Set<string>());
  useEffect(() => {
    const onTap = (r: Notifications.NotificationResponse | null) => {
      if (!r || r.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const key = r.notification.request.identifier + String(r.notification.date);
      if (seen.current.has(key)) return;
      seen.current.add(key);
      // Android hands back the last tap every time Focus opens: only act on a tap once.
      AsyncStorage.getItem(TAP_KEY).then((last) => {
        if (last === key) return;
        AsyncStorage.setItem(TAP_KEY, key).catch(() => {});
        go(r);
      }).catch(() => go(r));
    };
    const go = (r: Notifications.NotificationResponse) => {
      const data = r.notification.request.content.data as { taskId?: string; day?: string; roundRoom?: string } | undefined;
      // The room round check-in: open the room, where the round can be stopped or carried on.
      if (data?.roundRoom) {
        const room = data.roundRoom;
        setTimeout(() => router.navigate(`/room/${room}`), 300);
        return;
      }
      if (!data?.taskId) return;
      const taskId = data.taskId;
      const day = data.day ?? '';
      setTimeout(() => {
        router.navigate('/');
        requestHighlight(taskId, () => {
          const { state, toggleDone, startTimer, snooze } = latest.current;
          const t = state.tasks.find((x) => x.id === taskId);
          if (!t) return;
          const repeats = !!t.repeatDays?.length;
          const done = repeats ? (t.doneDays ?? []).includes(day) : t.done;
          showSheet({
            title: t.title,
            message: done ? 'Already ticked.' : undefined,
            options: [
              ...(!done ? [{ label: repeats ? 'Done for that day' : 'Done', icon: 'check', onPress: () => toggleDone(t.id, day || undefined) }] : []),
              ...(!done && !t.place ? [{ label: t.timer ? 'Stop and say what is left' : 'Start', icon: t.timer ? 'square' : 'play', onPress: () => (t.timer ? openStopFlow(t.id, day) : startTimer(t.id)) }] : []),
              ...(!done && t.nag ? [{ label: 'Snooze nudges for 30 min', icon: 'bell-off', onPress: () => snooze(t.id, 30) }] : []),
            ],
          });
        });
      }, 300);
    };
    Notifications.getLastNotificationResponseAsync().then(onTap).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(onTap);
    return () => sub.remove();
  }, []);
  return null;
}
