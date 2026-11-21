// "Something's come up": say or type what's happened, see how the day changes, then confirm.
// Nothing is saved until she taps Save, and nothing is ever dropped (only added or moved).
import { router } from 'expo-router';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import React, { useState } from 'react';
import { ActivityIndicator, Share, StyleSheet, TextInput, View } from 'react-native';
import { DashShell } from '../../components/TabletDash';
import { roomName } from '../../components/TaskRow';
import { Button, Card, Check, Chip, IconButton, Screen, Section, T } from '../../components/ui';
import { ClaudeError, reworkDay } from '../../lib/claude';
import { type ComeUpPlan, type Move, nurseryMessage, sickDayMoves } from '../../lib/comeUp';
import { useDashMode } from '../../lib/device';
import { claimMic, micOwner, releaseMic } from '../../lib/mic';
import { useStore } from '../../lib/store';
import { font, radius, space, useColors } from '../../lib/theme';
import { fmtTime, parseLocal } from '../../lib/time';

const MIC = 'comeup';
type Ticked<T> = T & { keep: boolean };

/** Sav's off sick on top of whatever Claude said: Focus's own sick-day moves win for the same job. */
function withSickDay(plan: ComeUpPlan, sick: Move[]): ComeUpPlan {
  const ids = new Set(sick.map((m) => m.taskId));
  return { ...plan, savSick: true, moves: [...sick, ...plan.moves.filter((m) => !ids.has(m.taskId))] };
}

export default function ComeUp() {
  const dash = useDashMode();
  return dash ? (
    <DashShell active="today">
      <ComeUpBody />
    </DashShell>
  ) : (
    <ComeUpBody />
  );
}

function ComeUpBody() {
  const { state, user, applyComeUp } = useStore();
  const c = useColors();
  const [text, setText] = useState('');
  const [interim, setInterim] = useState('');
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [savSick, setSavSick] = useState(false);
  const [add, setAdd] = useState<Ticked<ComeUpPlan['add'][number]>[]>([]);
  const [events, setEvents] = useState<Ticked<ComeUpPlan['events'][number]>[]>([]);
  const [moves, setMoves] = useState<Ticked<Move>[]>([]);

  useSpeechRecognitionEvent('start', () => micOwner() === MIC && setListening(true));
  useSpeechRecognitionEvent('end', () => {
    if (micOwner() !== MIC) return;
    releaseMic(MIC);
    setListening(false);
    setInterim('');
  });
  useSpeechRecognitionEvent('result', (e) => {
    if (micOwner() !== MIC) return;
    const said = e.results[0]?.transcript ?? '';
    if (e.isFinal) {
      setText((t) => (t.trim() ? `${t.trim()} ${said}` : said));
      setInterim('');
    } else setInterim(said);
  });
  const talk = async () => {
    setError(null);
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) return setError('Focus needs the microphone. Allow it in settings, or type instead.');
      claimMic(MIC);
      ExpoSpeechRecognitionModule.start({ lang: 'en-GB', interimResults: true, continuous: true, addsPunctuation: true });
    } catch {
      releaseMic(MIC);
      setError("The mic isn't available here. Type instead.");
    }
  };

  const show = (plan: ComeUpPlan) => {
    setReply(plan.reply);
    setSavSick(plan.savSick);
    setAdd(plan.add.map((a) => ({ ...a, keep: true })));
    setEvents(plan.events.map((e) => ({ ...e, keep: true })));
    setMoves(plan.moves.map((m) => ({ ...m, keep: !m.optional })));
  };

  /** Sav's off sick: Focus's own rules, no Claude needed (works offline too). */
  const sickDay = () => {
    setError(null);
    const now = new Date();
    show({ reply: "Sav's home today. Here's a gentler day around her.", savSick: true, add: [], events: [], moves: sickDayMoves(state, now) });
  };

  const sort = async () => {
    if (!user) return setError('Sign in once first, in Settings, so Focus can reach Claude.');
    setBusy(true);
    setError(null);
    try {
      const now = new Date();
      const plan = await reworkDay(text.trim(), state, now);
      show(plan.savSick ? withSickDay(plan, sickDayMoves(state, now)) : plan);
    } catch (e) {
      setError(e instanceof ClaudeError ? e.message : "Couldn't sort that just now. Your words are still here, try again.");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setReply(null);
    setText('');
    setAdd([]);
    setEvents([]);
    setMoves([]);
    setSavSick(false);
  };

  const save = () => {
    applyComeUp({ savSick, add: add.filter((a) => a.keep), events: events.filter((e) => e.keep), moves: moves.filter((m) => m.keep) });
    reset();
    router.navigate('/');
  };

  const field = {
    minHeight: 130,
    backgroundColor: c.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: listening ? c.primary : c.line,
    padding: space[4],
    color: c.ink,
    fontFamily: font.body,
    fontSize: 18,
    lineHeight: 26,
  } as const;

  if (reply !== null) {
    const notNeeded = moves.filter((m) => !m.to);
    const moved = moves.filter((m) => m.to);
    const count = add.filter((a) => a.keep).length + events.filter((e) => e.keep).length + moves.filter((m) => m.keep).length + (savSick ? 1 : 0);
    const row = (key: string, on: boolean, toggle: () => void, title: string, sub?: string) => (
      <View key={key} style={{ flexDirection: 'row', gap: space[3], paddingVertical: space[2], alignItems: 'flex-start' }}>
        <Check on={on} onPress={toggle} label={title} />
        <View style={{ flex: 1, gap: 2 }}>
          <T v="body" style={!on ? { opacity: 0.45 } : undefined}>{title}</T>
          {sub ? <T v="caption" muted>{sub}</T> : null}
        </View>
      </View>
    );
    return (
      <Screen>
        <T v="title">{reply}</T>
        <T v="body" muted>Untick anything that's not right. Nothing changes until you tap Save.</T>
        {savSick && (
          <Card tone="soft" style={{ gap: space[2] }}>
            <T v="bodyStrong">Sav's home today</T>
            <T v="body" muted>House jobs only while she naps ({state.settings.savNap.start} to {state.settings.savNap.end}) or after 19:30. Nothing that means going out.</T>
            <T v="label" muted>A MESSAGE FOR NURSERY</T>
            <Card tone="sunken">
              <T v="body" selectable>{nurseryMessage(state.settings.firstName)}</T>
            </Card>
            <Button kind="soft" label="Copy or send it yourself" onPress={() => Share.share({ message: nurseryMessage(state.settings.firstName) }).catch(() => {})} />
          </Card>
        )}
        {add.length > 0 && (
          <Section title="Added to the top">
            <Card style={{ paddingVertical: space[1] }}>
              {add.map((a, i) =>
                row(`a${i}`, a.keep, () => setAdd(add.map((x, j) => (j === i ? { ...x, keep: !x.keep } : x))), a.title, [roomName(state.settings.rooms, a.room), a.estimateMin ? `About ${a.estimateMin} min` : ''].filter(Boolean).join(' · ')),
              )}
            </Card>
          </Section>
        )}
        {events.length > 0 && (
          <Section title="Fixed times">
            <Card style={{ paddingVertical: space[1] }}>
              {events.map((e, i) => {
                const at = parseLocal(e.at);
                return row(
                  `e${i}`,
                  e.keep,
                  () => setEvents(events.map((x, j) => (j === i ? { ...x, keep: !x.keep } : x))),
                  `${at ? fmtTime(at) : ''} ${e.title}`.trim(),
                  e.visitor && e.rooms.length ? `Coming round. Needs: ${e.rooms.map((r) => roomName(state.settings.rooms, r)).join(', ')}` : e.visitor ? 'Coming round' : e.place,
                );
              })}
            </Card>
          </Section>
        )}
        {moved.length > 0 && (
          <Section title="Moved">
            <Card style={{ paddingVertical: space[1] }}>
              {moved.map((m) => {
                const i = moves.indexOf(m);
                return row(`m${i}`, m.keep, () => setMoves(moves.map((x, j) => (j === i ? { ...x, keep: !x.keep } : x))), `${m.title}: ${m.fromLabel} → ${m.toLabel}`, m.why);
              })}
            </Card>
          </Section>
        )}
        {notNeeded.length > 0 && (
          <Section title="Skipped today">
            <Card style={{ paddingVertical: space[1] }}>
              {notNeeded.map((m) => {
                const i = moves.indexOf(m);
                return row(`n${i}`, m.keep, () => setMoves(moves.map((x, j) => (j === i ? { ...x, keep: !x.keep } : x))), `${m.title} (${m.fromLabel})`, m.why);
              })}
            </Card>
          </Section>
        )}
        {!count && <T v="body" muted>Nothing needs to change. Your day can stay as it is.</T>}
        <Button label={count ? 'Save' : 'Done'} onPress={count ? save : () => { reset(); router.navigate('/'); }} />
        <Button kind="quiet" label="Back" onPress={() => setReply(null)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <T v="title">Something's come up?</T>
      <T v="body" muted>Say what's happened, the way you'd tell a friend. Focus reworks the day and shows you before anything changes.</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        <Button small kind="soft" label="Sav's off sick" onPress={sickDay} />
        <Button small kind="soft" label="Running late" onPress={() => setText((t) => (t ? t : "I'm running late, about 20 minutes behind"))} />
        <Button small kind="soft" label="Someone's coming round" onPress={() => setText((t) => (t ? t : 'Someone is coming round at '))} />
      </View>
      <TextInput
        value={interim ? `${text}${text ? ' ' : ''}${interim}` : text}
        onChangeText={(t) => !listening && setText(t)}
        editable={!listening}
        multiline
        placeholder="Gas engineer coming at 11 to look at the boiler"
        placeholderTextColor={c.inkMuted}
        textAlignVertical="top"
        style={field}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <IconButton name={listening ? 'check' : 'mic'} label={listening ? 'Done talking' : 'Talk instead'} tone="primary" size={52} onPress={listening ? () => ExpoSpeechRecognitionModule.stop() : talk} />
        <T v="label" muted style={{ flex: 1 }}>{listening ? 'Listening… tap the tick when you are done' : 'Tap to talk'}</T>
      </View>
      {error ? (
        <Card tone="nudge">
          <T v="body" color={c.nudgeInk}>{error}</T>
        </Card>
      ) : null}
      {busy ? (
        <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center', justifyContent: 'center', minHeight: 52 }}>
          <ActivityIndicator color={c.primary} />
          <T v="body" muted>Reworking the day…</T>
        </View>
      ) : (
        <Button label="Rework my day" disabled={!text.trim() || listening} onPress={sort} />
      )}
      <Chip tone="plain" label="Pick up, drop off and appointments always stay where they are" />
    </Screen>
  );
}
