// Sav's bedtime pictures: big cards she can tap herself, in order. Each one gets a big tick and a
// star. Starts fresh every evening. Kept on this tablet only.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { DashShell, L, useDash } from '../../components/TabletDash';
import { useDashMode } from '../../lib/device';
import { useNow } from '../../lib/store';
import { dayKey } from '../../lib/time';

const STEPS = [
  { id: 'bath', label: 'Bath', pic: '🛁' },
  { id: 'pyjamas', label: 'Pyjamas', pic: '👕' },
  { id: 'teeth', label: 'Teeth', pic: '🪥' },
  { id: 'story', label: 'Story', pic: '📚' },
  { id: 'bed', label: 'Bed', pic: '🛏️' },
];
const KEY = 'focus.bedtime.v1';

export default function Bedtime() {
  const D = useDash();
  const dash = useDashMode();
  const body = <BedtimeBody />;
  return dash ? (
    <DashShell active="sav">{body}</DashShell>
  ) : (
    <View style={{ flex: 1, backgroundColor: D.bg, paddingTop: 24 }}>
      <Pressable onPress={() => router.back()} accessibilityRole="button" style={{ padding: 16, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Icon name="arrow-left" size={24} color={D.ink} />
        <L size={18} weight="strong">Back</L>
      </Pressable>
      {body}
    </View>
  );
}

/** A bedtime "day" runs until 6am, so a late night doesn't wipe the stars at midnight. */
function bedtimeDay(now: Date) {
  const d = new Date(now);
  if (d.getHours() < 6) d.setDate(d.getDate() - 1);
  return dayKey(d);
}

function BedtimeBody() {
  const D = useDash();
  const now = useNow(60000);
  const day = bedtimeDay(now);
  const [done, setDone] = useState<string[]>([]);
  const [loadedDay, setLoadedDay] = useState<string | null>(null);

  // A new bedtime day starts with no stars; then any saved ones for it are added to taps made meanwhile.
  useEffect(() => {
    let live = true;
    setLoadedDay(null);
    setDone([]);
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!live) return;
        const saved = raw ? (JSON.parse(raw) as { day: string; done: string[] }) : null;
        const kept = saved?.day === day && Array.isArray(saved.done) ? saved.done : [];
        setDone((cur) => [...new Set([...kept, ...cur])]);
        setLoadedDay(day);
      })
      .catch(() => live && setLoadedDay(day));
    return () => {
      live = false;
    };
  }, [day]);

  const toggle = (id: string) => setDone((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  // Save after each change once the saved stars are in (so a tap during loading can't be wiped).
  useEffect(() => {
    if (loadedDay === day) AsyncStorage.setItem(KEY, JSON.stringify({ day, done })).catch(() => {});
  }, [done, day, loadedDay]);

  const nextUp = STEPS.find((s) => !done.includes(s.id));
  const all = !nextUp;

  return (
    <View style={{ flex: 1, paddingVertical: 32, paddingHorizontal: 36, gap: 28 }}>
      <View style={{ gap: 6 }}>
        <L size={48} display>{all ? 'All done, Sav! Sleep tight' : "Sav's bedtime"}</L>
        <L size={24} color={D.muted}>{all ? 'Every star collected.' : `Next: ${nextUp!.label}`}</L>
      </View>
      <View style={{ flex: 1, flexDirection: 'row', gap: 20 }}>
        {STEPS.map((s) => {
          const on = done.includes(s.id);
          const isNext = nextUp?.id === s.id;
          return (
            <Pressable
              key={s.id}
              onPress={() => toggle(s.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={s.label}
              style={{
                flex: 1,
                borderRadius: 32,
                backgroundColor: on ? D.primarySoft : D.tile,
                borderWidth: isNext ? 4 : 1,
                borderColor: isNext ? D.primary : D.line,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 18,
              }}
            >
              <Text style={{ fontSize: 96, opacity: on ? 0.5 : 1 }}>{s.pic}</Text>
              <L size={30} display color={on ? D.primaryStrong : D.ink}>{s.label}</L>
              <View style={{ height: 56, justifyContent: 'center' }}>
                {on ? <Text style={{ fontSize: 48 }}>⭐</Text> : <Icon name="circle" size={44} color={D.line} />}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
