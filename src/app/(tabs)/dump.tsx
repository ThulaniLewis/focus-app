import { router } from 'expo-router';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { showSheet } from '../../components/Sheet';
import { claimMic, micOwner, releaseMic } from '../../lib/mic';
import { Icon } from '../../components/Icon';
import { roomName } from '../../components/TaskRow';
import { Button, Card, Check, Chip, IconButton, Screen, Section, T } from '../../components/ui';
import { ClaudeError, type DumpResult, type ParsedItem, parseDump } from '../../lib/claude';
import { type JobRef, openJobs } from '../../lib/leftovers';
import { isTabletDevice } from '../../lib/device';
import { isPrivateSpace } from '../../lib/sync';
import { useStore } from '../../lib/store';
import { font, radius, space, useColors } from '../../lib/theme';
import { dayKey, fmtTime, parseLocal } from '../../lib/time';
import { DAY_SHORT } from '../../lib/views';

function describeWhen(at?: string, repeatDays?: number[]) {
  if (!at) return undefined;
  const d = parseLocal(at);
  if (!d) return undefined;
  if (repeatDays?.length) {
    const days = repeatDays.join() === '1,2,3,4,5' ? 'Weekdays' : repeatDays.map((n) => DAY_SHORT[n]).join(' ');
    return `${days} ${fmtTime(d)}`;
  }
  return `${DAY_SHORT[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1} ${fmtTime(d)}`;
}

const BARS = 24;

export default function Dump() {
  const { user, state, addItems, addNotes, markJobs, batch } = useStore();
  const c = useColors();
  const [text, setText] = useState('');
  const [interim, setInterim] = useState('');
  const [listening, setListening] = useState(false);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));
  const before = useRef('');
  const pending = useRef(''); // words heard but not yet confirmed final when you tapped the tick
  const ignoring = useRef(false); // after cancel, drop anything still on its way
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DumpResult | null>(null);
  const [items, setItems] = useState<(ParsedItem & { keep: boolean })[]>([]);
  // The feedback loop: Focus can ask a question before showing the list.
  const [turns, setTurns] = useState<{ q?: string; said: string }[]>([]);
  const [question, setQuestion] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<DumpResult | null>(null);
  const jobsRef = useRef<JobRef[]>([]);
  const [jobMarks, setJobMarks] = useState<{ id: string; title: string; mark: 'done' | 'started' | 'leave' }[]>([]);

  const join = (a: string, b: string) => (a.trim() ? `${a.trim()} ${b.trim()}` : b.trim());

  useSpeechRecognitionEvent('start', () => micOwner() === 'dump' && setListening(true));
  useSpeechRecognitionEvent('end', () => {
    if (micOwner() !== 'dump') return;
    releaseMic('dump');
    if (pending.current && !ignoring.current) {
      const left = pending.current;
      setText((t) => join(t, left));
    }
    pending.current = '';
    setListening(false);
    setInterim('');
    setLevels(Array(BARS).fill(0));
  });
  useSpeechRecognitionEvent('result', (e) => {
    if (micOwner() !== 'dump') return;
    if (ignoring.current) return;
    const said = e.results[0]?.transcript ?? '';
    if (e.isFinal) {
      pending.current = '';
      setText((t) => join(t, said));
      setInterim('');
    } else setInterim(said);
  });
  useSpeechRecognitionEvent('volumechange', (e) => {
    if (micOwner() !== 'dump') return;
    const v = Math.max(0, Math.min(1, (e.value + 2) / 12));
    setLevels((l) => [...l.slice(1), v]);
  });
  useSpeechRecognitionEvent('error', (e) => {
    if (micOwner() !== 'dump') return;
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    setError(e.error === 'not-allowed' ? 'Focus needs the microphone. Allow it in your phone settings, or type instead.' : `The mic stopped (${e.message || e.error}). Your words so far are kept.`);
  });

  const startMic = async () => {
    setError(null);
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) return setError('Focus needs the microphone. Allow it in your phone settings, or type instead.');
      before.current = text;
      claimMic('dump');
      ignoring.current = false;
      pending.current = '';
      ExpoSpeechRecognitionModule.start({
        lang: 'en-GB',
        interimResults: true,
        continuous: true,
        addsPunctuation: true,
        volumeChangeEventOptions: { enabled: true, intervalMillis: 90 },
      });
    } catch {
      setError("The mic isn't available here. Type instead, or use the mic on your keyboard.");
    }
  };
  const keepMic = () => {
    pending.current = interim;
    ExpoSpeechRecognitionModule.stop();
  };
  const cancelMic = () => {
    ignoring.current = true;
    pending.current = '';
    ExpoSpeechRecognitionModule.abort();
    setText(before.current);
    setInterim('');
  };

  const show = (r: DumpResult) => {
    setResult(r);
    setItems(r.items.map((it) => ({ ...it, keep: true })));
    const titleOf = (id: string) => state.tasks.find((t) => t.id === id)?.title ?? 'A job';
    setJobMarks([
      ...r.doneIds.map((id) => ({ id, title: titleOf(id), mark: 'done' as const })),
      ...r.startedIds.map((id) => ({ id, title: titleOf(id), mark: 'started' as const })),
    ]);
    setQuestion(null);
    setWaiting(null);
  };

  const sort = async () => {
    if (!user) return setError('Sign in once first. Tap the gear on Today.');
    setBusy(true);
    setError(null);
    try {
      const now = new Date();
      if (!turns.length) jobsRef.current = openJobs(state, undefined, now);
      const next = [...turns, { q: question ?? undefined, said: text.trim() }];
      const r = await parseDump(text, state.settings, state.spaces, now, { jobs: jobsRef.current, turns: next });
      if (r.question && next.length < 3) {
        setTurns(next);
        setQuestion(r.question);
        setWaiting(r);
        setText('');
      } else {
        setTurns(next);
        show(r);
      }
    } catch (e) {
      setError(e instanceof ClaudeError ? e.message : 'Something went wrong sorting that. Your words are still here, try again.');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setText('');
    setResult(null);
    setTurns([]);
    setQuestion(null);
    setWaiting(null);
    setJobMarks([]);
  };

  const save = () => {
    if (!result) return;
    batch('Saved', () => {
      markJobs(dayKey(new Date()), jobMarks.filter((j) => j.mark === 'done').map((j) => j.id), jobMarks.filter((j) => j.mark === 'started').map((j) => j.id));
      const kept = items.filter((i) => i.keep).map(({ keep, ...rest }) => rest);
      if (isTabletDevice()) {
        // A shared screen never keeps private things: those only save on the phone.
        const shared = kept.filter((i) => i.kind !== 'note' && !isPrivateSpace(i.spaceId, state.spaces));
        addItems(shared);
        if (shared.length < kept.length || result.notes.length) setError('Private notes and Money only save on your phone, so I left those out here.');
      } else {
        addItems(kept);
        addNotes(result.notes);
      }
    });
    reset();
    router.navigate('/');
  };

  const moveItem = (i: number) => {
    const choices = state.spaces.filter((s) => s.kind !== 'shopping' || items[i].kind === 'buy');
    showSheet({
      title: 'Put this in',
      message: items[i].title,
      options: choices.map((s) => ({
        label: s.name,
        icon: s.icon,
        onPress: () =>
          setItems((cur) => cur.map((it, j) => (j === i ? { ...it, spaceId: s.id, kind: s.kind === 'private' ? 'note' : it.kind === 'note' ? 'task' : it.kind } : it))),
      })),
    });
  };

  if (result) {
    const privateIds = new Set(state.spaces.filter((s) => s.privacy === 'phone').map((s) => s.id));
    const indexed = items.map((it, i) => ({ it, i }));
    const groups = [...state.spaces, { id: '', name: 'No space yet', kind: 'general' as const, privacy: 'everywhere' as const, icon: 'inbox' }]
      .map((sp) => ({ sp, rows: indexed.filter(({ it }) => (it.spaceId ?? '') === sp.id) }))
      .filter((g) => g.rows.length);
    const count = items.filter((i) => i.keep).length;
    return (
      <Screen>
        <T v="title">{result.reply || 'Here is how that sorts out'}</T>
        <T v="body" muted>Untick anything wrong. Tap a space name to move something.</T>
        {jobMarks.length > 0 && (
          <Section title="Your jobs" hint="tap to change">
            <Card style={{ paddingVertical: space[1] }}>
              {jobMarks.map((j, i) => (
                <Pressable
                  key={j.id}
                  onPress={() => setJobMarks(jobMarks.map((x, k) => (k === i ? { ...x, mark: x.mark === 'done' ? 'started' : x.mark === 'started' ? 'leave' : 'done' } : x)))}
                  accessibilityRole="button"
                  accessibilityLabel={`${j.title}: ${j.mark === 'done' ? 'done' : j.mark === 'started' ? 'started, some left' : 'leave as it is'}. Tap to change`}
                  style={{ flexDirection: 'row', gap: space[3], alignItems: 'center', minHeight: 48, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: c.line }}
                >
                  <Icon name={j.mark === 'leave' ? 'x' : 'check'} size={18} color={j.mark === 'leave' ? c.inkMuted : c.primary} />
                  <T v="body" muted={j.mark === 'leave'} style={{ flex: 1 }}>{j.title}</T>
                  <Chip tone={j.mark === 'started' ? 'nudge' : j.mark === 'done' ? 'soft' : 'plain'} label={j.mark === 'done' ? 'Done' : j.mark === 'started' ? 'Started, some left' : 'Leave as it is'} />
                </Pressable>
              ))}
            </Card>
          </Section>
        )}
        {groups.map(({ sp, rows }) => {
          const isPrivate = sp.kind === 'private';
          return (
            <Section key={sp.id || 'none'} title={sp.name} hint={isPrivate || privateIds.has(sp.id) ? 'stays on this phone' : undefined}>
              <Card tone={isPrivate ? 'sunken' : 'surface'} style={{ paddingVertical: space[1] }}>
                {isPrivate && (
                  <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'center', paddingVertical: space[1] }}>
                    <Icon name="lock" size={16} color={c.inkMuted} />
                    <T v="caption" muted>Kept as notes, not to-dos. Never shown on a tablet or read aloud.</T>
                  </View>
                )}
                {rows.map(({ it, i }, n) => {
                  const when = describeWhen(it.at, it.repeatDays);
                  const room = roomName(state.settings.rooms, it.room);
                  return (
                    <View key={i} style={{ flexDirection: 'row', gap: space[3], paddingVertical: space[2], borderTopWidth: n || isPrivate ? StyleSheet.hairlineWidth : 0, borderTopColor: c.line }}>
                      <Check on={it.keep} onPress={() => setItems(items.map((x, j) => (j === i ? { ...x, keep: !x.keep } : x)))} label={it.title} />
                      <View style={{ flex: 1, gap: space[1] }}>
                        <T v="body" style={!it.keep ? { opacity: 0.45 } : undefined}>{it.title}</T>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[1] }}>
                          <Pressable onPress={() => moveItem(i)} hitSlop={6}>
                            <Chip tone={isPrivate ? 'private' : 'soft'} label={`${sp.name} ▾`} />
                          </Pressable>
                          {when ? <Chip label={when} /> : null}
                          {it.kind === 'event' && when ? <Chip tone="plain" label="Goes in diary" /> : null}
                          {room ? <Chip tone="plain" label={room} /> : null}
                          {it.group ? <Chip tone="plain" label={it.group} /> : null}
                          {it.place ? <Chip tone="plain" label={it.place} /> : null}
                          {it.estimateMin ? <Chip tone="plain" label={`~${it.estimateMin} min`} /> : null}
                          {it.grab ? <Chip tone="nudge" label={`Grab ${it.grab.item} from ${roomName(state.settings.rooms, it.grab.fromRoom)}`} /> : null}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </Card>
            </Section>
          );
        })}
        {!items.length && !result.notes.length && !jobMarks.length && <T v="body" muted>Nothing to add from that one.</T>}
        {result.notes.length > 0 && (
          <Section title="Notes about Focus">
            <Card tone="sunken">{result.notes.map((n, i) => <T key={i} v="body">{n}</T>)}</Card>
          </Section>
        )}
        <Button label={count ? `Add ${count}` : result.notes.length || jobMarks.length ? 'Save' : 'Done'} onPress={save} />
        <Button kind="quiet" label="Keep talking" onPress={() => { setResult(null); setTurns([]); setText(turns.map((t) => t.said).join(' ')); }} />
      </Screen>
    );
  }

  const shown = interim ? join(text, interim) : text;

  return (
    <Screen>
      {question ? (
        <>
          <T v="label" muted>QUICK QUESTION</T>
          <T v="title">{question}</T>
          <T v="body" muted>Tap the mic and answer, or skip and see what Focus has so far.</T>
        </>
      ) : (
        <>
          <T v="title">What's on your mind?</T>
          <T v="body" muted>Tap the mic and just talk. New things, or what you've done and what's left. Tap the tick when you're done.</T>
        </>
      )}
      <TextInput
        value={shown}
        onChangeText={(t) => !listening && setText(t)}
        editable={!listening}
        multiline
        placeholder="Toilet roll and bananas, nursery drop 8:15 tomorrow, chase the Barclays application, dentist Thursday 2pm…"
        placeholderTextColor={c.inkMuted}
        textAlignVertical="top"
        style={{
          minHeight: 180,
          backgroundColor: c.surface,
          borderRadius: radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: listening ? c.primary : c.line,
          padding: space[4],
          color: c.ink,
          fontFamily: font.body,
          fontSize: 18,
          lineHeight: 26,
        }}
      />

      {listening ? (
        <View style={{ backgroundColor: c.surface, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', padding: space[2], gap: space[2], borderWidth: StyleSheet.hairlineWidth, borderColor: c.line }}>
          <IconButton name="x" label="Cancel, throw away what I just said" tone="quiet" onPress={cancelMic} size={48} />
          <View style={{ flex: 1, height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
            {levels.map((l, i) => (
              <View key={i} style={{ width: 4, borderRadius: 2, height: 4 + l * 36, backgroundColor: c.primary, opacity: 0.4 + l * 0.6 }} />
            ))}
          </View>
          <IconButton name="check" label="Done talking, keep it" tone="primary" onPress={keepMic} size={48} />
        </View>
      ) : (
        <View style={{ alignItems: 'center', gap: space[2] }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start talking"
            onPress={startMic}
            style={({ pressed }) => ({ width: 84, height: 84, borderRadius: 42, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
          >
            <Icon name="mic" size={34} color={c.onPrimary} />
          </Pressable>
          <T v="caption" muted>{text ? 'Tap to add more' : 'Tap to talk'}</T>
        </View>
      )}

      {error ? (
        <Card tone="nudge">
          <T v="body" color={c.nudgeInk}>{error}</T>
        </Card>
      ) : null}

      {busy ? (
        <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center', justifyContent: 'center', minHeight: 52 }}>
          <ActivityIndicator color={c.primary} />
          <T v="body" muted>Sorting it out…</T>
        </View>
      ) : (
        !listening && (
          <View style={{ gap: space[2] }}>
            <Button label={question ? 'Answer' : 'Sort it'} onPress={sort} disabled={!text.trim()} />
            {question && waiting ? <Button kind="quiet" label="Skip the question" onPress={() => show(waiting)} /> : null}
            {question ? <Button kind="quiet" label="Start again" onPress={reset} /> : null}
            {text && !question ? <Button kind="quiet" label="Clear" onPress={() => setText('')} /> : null}
          </View>
        )
      )}
    </Screen>
  );
}
