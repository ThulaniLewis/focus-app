// Stopping a job: how did it go, what's left, and which of that is needed now.
// Opened from any Stop button with openStopFlow(taskId, day).
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { claimMic, micOwner, releaseMic } from '../lib/mic';
import { useNow, useStore } from '../lib/store';
import { font, radius, space, useColors } from '../lib/theme';
import { elapsedSec, fmtElapsed } from '../lib/time';
import { Icon } from './Icon';
import { howItWent, whyNow } from '../lib/support';
import { splitLeftovers } from './Session.split';
import { checkIn, type CheckIn } from '../lib/claude';
import { openJobs } from '../lib/leftovers';
import { dayKey, fmtTime, roomNameOf as roomName } from '../lib/time';
import { topPicks } from './Focus';
import { avoidFirst, logAvoid } from '../lib/roomMode';
import { openAvoidSheet } from './Avoid';
import { Button, Card, Chip, IconButton, T } from './ui';
export { splitLeftovers };

type Open = { taskId?: string; day: string; round?: boolean };
let open: ((o: Open) => void) | null = null;

/** Open the stop flow for a task from anywhere. */
export function openStopFlow(taskId: string, day: string) {
  open?.({ taskId, day });
}

/** Open the stop flow for the room round in progress. */
export function openRoundStop(day: string) {
  open?.({ day, round: true });
}

const ROUND_ID = '__round';
type Mark = 'none' | 'done' | 'started';

const MIC = 'session';

export function SessionHost() {
  const store = useStore();
  const { state, finishSession, startTimer, startRound, finishRound, pauseTimer, pauseRound, updateSettings } = store;
  const c = useColors();
  const insets = useSafeAreaInsets();
  const now = useNow(1000);
  const [cur, setCur] = useState<Open | null>(null);
  const [step, setStep] = useState<'how' | 'rooms' | 'momentum' | 'tiny' | 'left' | 'assess' | 'done'>('how');
  const [tiny, setTiny] = useState<{ id: string; title: string } | null>(null);
  const [onBreak, setOnBreak] = useState(false);
  const [marks, setMarks] = useState<{ id: string; title: string; mark: Mark }[]>([]);
  const [said, setSaid] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [interim, setInterim] = useState('');
  const [listening, setListening] = useState(false);
  const [lines, setLines] = useState<{ title: string; need: boolean; room?: string; day?: string }[]>([]);
  const [turns, setTurns] = useState<{ q?: string; said: string }[]>([]);
  const [question, setQuestion] = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<CheckIn | null>(null);
  const [also, setAlso] = useState<{ id: string; title: string; on: boolean; started?: boolean }[]>([]);
  const [thisDone, setThisDone] = useState(false);
  const [tidying, setTidying] = useState(false);
  const [tidyNote, setTidyNote] = useState<string | null>(null);

  useEffect(() => {
    open = (o) => {
      setCur(o);
      setStep(o.round ? 'rooms' : 'how');
      setMarks([]);
      setTiny(null);
      setOnBreak(false);
      setText('');
      setTidyNote(null);
      setTidying(false);
      setTurns([]);
      setQuestion(null);
      setLastCheck(null);
      setAlso([]);
      setThisDone(false);
      setInterim('');
      setLines([]);
    };
    return () => {
      open = null;
    };
  }, []);

  // A room round: list today's open jobs in that room to tick through.
  useEffect(() => {
    if (!cur?.round || !state.settings.round) return;
    const r = state.settings.round.room;
    setMarks(openJobs(state, undefined, new Date()).filter((j) => j.room === r).map((j) => ({ id: j.id, title: j.title, mark: 'none' as Mark })));
    // Only when the flow opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur]);

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
      setText((t) => (t.trim() ? `${t.trim()}, ${said}` : said));
      setInterim('');
    } else setInterim(said);
  });

  const liveRound = state.settings.round;
  // Saving a round clears it, so keep the last one seen: the "well done" step still needs it.
  const lastRound = useRef(liveRound);
  if (liveRound) lastRound.current = liveRound;
  const round = liveRound ?? (cur?.round ? lastRound.current : null);
  const roundName = round ? roomName(state.settings.rooms, round.room) ?? round.room : '';
  // A room round is shown as one job: "Living room" with the round's timer.
  const roundTask = round
    ? { id: ROUND_ID, title: roundName, kind: 'task' as const, room: round.room, timer: { startedAt: round.startedAt, accumulatedSec: round.accumulatedSec }, createdAt: '', done: false }
    : undefined;
  const task = cur ? (cur.round ? roundTask : state.tasks.find((t) => t.id === cur.taskId)) : undefined;
  const close = () => {
    if (listening) ExpoSpeechRecognitionModule.abort();
    setCur(null);
  };
  // Nothing to show (say the job was deleted): close properly, so it can't pop up again later.
  useEffect(() => {
    if (cur && !task) setCur(null);
  }, [cur, task]);
  if (!cur || !task) return null;

  const spent = task.timer ? fmtElapsed(elapsedSec(task.timer, now)) : null;
  const spentMin = task.timer ? Math.round(elapsedSec(task.timer, now) / 60) : 0;
  const finish = (allDone: boolean, left: { title: string; need: boolean; room?: string; day?: string }[], alsoDone: string[] = [], alsoStarted: string[] = []) => {
    if (cur.round) {
      finishRound(cur.day, alsoDone, alsoStarted, left);
      const n = alsoDone.length;
      const lines = [
        n ? `${roundName}: ${n === 1 ? 'one job' : `${n} jobs`} done in ${spentMin} min. Well done.` : `${spentMin} min in the ${roundName.toLowerCase()}. Every bit counts.`,
      ];
      if (alsoStarted.length) lines.push(`${alsoStarted.length === 1 ? 'One is' : `${alsoStarted.length} are`} started, with the rest on your list.`);
      const why = alsoStarted.length || left.some((l) => l.need) ? whyNow(state, task, new Date()) : null;
      setSaid(why ? [...lines, why] : lines);
      setStep('done');
      return;
    }
    const lines = howItWent(task, spentMin, allDone);
    if (alsoDone.length) lines.push(`Ticked off ${alsoDone.length === 1 ? 'one more job' : `${alsoDone.length} more jobs`} along the way too.`);
    const why = !allDone && left.some((l) => l.need) ? whyNow(state, task, new Date()) : null;
    finishSession(task.id, cur.day, allDone, left, alsoDone, alsoStarted);
    setSaid(why ? [...lines, why] : lines);
    setStep('done');
  };
  const room = task.room ? roomName(state.settings.rooms, task.room) : undefined;

  // After saving: the next thing on today's list, so there's always a "what now".
  const next = step === 'done' && !onBreak ? topPicks(state, dayKey(now), now, 5).find((p) => p.task.id !== task.id) : undefined;

  const showCheck = (res: CheckIn) => {
    setLines(res.jobs);
    const titleOf = (id: string) => state.tasks.find((t) => t.id === id)?.title ?? 'A job';
    setAlso([
      ...res.doneIds.map((id) => ({ id, title: titleOf(id), on: true })),
      ...res.startedIds.map((id) => ({ id, title: titleOf(id), on: true, started: true })),
    ]);
    setThisDone(res.thisJobDone);
    setQuestion(null);
    setStep('assess');
  };
  const roomLabel = (slugValue?: string) => roomName(state.settings.rooms, slugValue);
  const today = dayKey(now);
  const whenLabel = (d?: string) => {
    if (!d || d === today) return undefined;
    const t = new Date(now);
    t.setDate(t.getDate() + 1);
    if (d === dayKey(t)) return 'Tomorrow';
    const [y, m, dd] = d.split('-').map(Number);
    return new Date(y, m - 1, dd).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  // Lost momentum: no shame, just a few ways out. Each choice is logged to spot patterns later.
  const logMomentum = (choice: 'five' | 'tiny' | 'break' | 'stop', comeBack?: { mins: number; title: string; body: string }) => {
    setOnBreak(choice === 'break');
    const at = new Date();
    updateSettings({
      momentumLog: [...(state.settings.momentumLog ?? []), { at: at.toISOString(), room: task.room, job: cur.round ? undefined : task.title, choice }].slice(-60),
      ...(comeBack
        ? { comeBack: { at: new Date(at.getTime() + comeBack.mins * 60000).toISOString(), title: comeBack.title, body: comeBack.body, taskId: cur.round ? undefined : task.id, kind: choice === 'break' ? 'break' : 'five' } }
        : {}),
    });
  };
  const where = cur.round ? `the ${roundName.toLowerCase()}` : task.title;
  const smallest = () => {
    const pool = openJobs(state, cur.round ? undefined : task, new Date())
      .map((j) => ({ ...j, est: state.tasks.find((t) => t.id === j.id)?.estimateMin ?? 99 }))
      .filter((j) => !task.room || j.room === task.room);
    return pool.sort((a, b) => a.est - b.est)[0] ?? null;
  };

  const talk = async () => {
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) return;
      claimMic(MIC);
      ExpoSpeechRecognitionModule.start({ lang: 'en-GB', interimResults: true, continuous: true, addsPunctuation: true });
    } catch {
      releaseMic(MIC);
    }
  };
  const stopTalk = () => ExpoSpeechRecognitionModule.stop();

  const field = {
    fontFamily: font.body,
    fontSize: 17,
    color: c.ink,
    backgroundColor: c.surface,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.line,
    padding: space[3],
  } as const;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={close} accessibilityLabel="Close" />
      <View
        style={{
          backgroundColor: c.surfaceRaised,
          borderTopLeftRadius: radius.lg,
          borderTopRightRadius: radius.lg,
          padding: space[4],
          paddingBottom: insets.bottom + space[4],
          maxHeight: '88%',
          gap: space[3],
        }}
      >
        <View style={{ gap: 4 }}>
          <T v="label" muted>{cur.round ? 'ROOM ROUND' : (room ?? 'STOPPING').toUpperCase()}</T>
          <T v="heading">{task.title}</T>
          {spent ? <T v="body" muted>You've been at it for {spent}.</T> : null}
        </View>

        {step === 'momentum' && (
          <View style={{ gap: space[2] }}>
            <T v="bodyStrong">That happens. What would help right now?</T>
            <T v="body" muted>No wrong answer. Stopping counts too.</T>
            <Button
              label="Just 5 more minutes"
              onPress={() => {
                logMomentum('five', { mins: 5, title: '5 minutes done', body: `That's your 5 on ${where}. Stop here or keep going, both are fine.` });
                if (task.timer && !task.timer.startedAt) (cur.round && round ? startRound(round.room) : startTimer(task.id));
                close();
              }}
            />
            <Button
              kind="soft"
              label="Give me one tiny thing"
              onPress={() => {
                logMomentum('tiny');
                setTiny(smallest());
                setStep('tiny');
              }}
            />
            <Button
              kind="soft"
              label="Break, then come back"
              onPress={() => {
                logMomentum('break', { mins: 15, title: 'Ready to go again?', body: `${cur.round ? `The ${roundName.toLowerCase()}` : task.title} is where you left it. Just one thing to start.` });
                if (cur.round) pauseRound();
                else pauseTimer(task.id);
                setSaid(['Break time. Get a drink, sit down, put a song on.', "I'll give you a nudge in 15 minutes. Everything stays where it is."]);
                setStep('done');
              }}
            />
            <Button
              kind="quiet"
              label="Stop for now"
              onPress={() => {
                logMomentum('stop');
                setStep(cur.round ? 'rooms' : 'left');
              }}
            />
          </View>
        )}

        {step === 'tiny' && (
          <View style={{ gap: space[2] }}>
            {tiny ? (
              <>
                <T v="bodyStrong">Just this one:</T>
                <Card tone="sunken">
                  <T v="heading">{tiny.title}</T>
                </Card>
                <T v="body" muted>Only this. When it's done you can stop, and it still counts.</T>
                <Button
                  label="Doing it"
                  onPress={() => {
                    if (!cur.round) startTimer(tiny.id);
                    else if (task.timer && !task.timer.startedAt && round) startRound(round.room);
                    close();
                  }}
                />
              </>
            ) : (
              <>
                <T v="bodyStrong">Pick up five things and put them where they live.</T>
                <T v="body" muted>That's it. Then you can stop, and it still counts.</T>
                <Button label="Doing it" onPress={close} />
              </>
            )}
            <Button kind="quiet" label="Back" onPress={() => setStep('momentum')} />
          </View>
        )}

        {step === 'rooms' && (
          <View style={{ gap: space[3] }}>
            <View style={{ gap: 4 }}>
              <T v="bodyStrong">Which ones did you do?</T>
              <T v="body" muted>Tap each job: Done, Some left, or leave it as not got to.</T>
            </View>
            {marks.length ? (
              <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ gap: space[1] }}>
                {marks.map((m, i) => (
                  <Pressable
                    key={m.id}
                    onPress={() => setMarks(marks.map((x, j) => (j === i ? { ...x, mark: x.mark === 'none' ? 'done' : x.mark === 'done' ? 'started' : 'none' } : x)))}
                    accessibilityRole="button"
                    accessibilityLabel={`${m.title}: ${m.mark === 'done' ? 'done' : m.mark === 'started' ? 'some left' : 'not got to'}. Tap to change`}
                    style={{ flexDirection: 'row', gap: space[2], alignItems: 'center', minHeight: 48 }}
                  >
                    <Icon name={m.mark === 'none' ? 'circle' : 'check'} size={18} color={m.mark === 'none' ? c.inkMuted : c.primary} />
                    <T v="body" style={{ flex: 1 }}>{m.title}</T>
                    <Chip tone={m.mark === 'done' ? 'soft' : m.mark === 'started' ? 'nudge' : 'plain'} label={m.mark === 'done' ? 'Done' : m.mark === 'started' ? 'Some left' : 'Not got to'} />
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <T v="body" muted>There's nothing on the list for this room today. Tell me what you did and I'll sort it.</T>
            )}
            {marks.length ? (
              <Button
                label="Save"
                onPress={() => finish(false, [], marks.filter((m) => m.mark === 'done').map((m) => m.id), marks.filter((m) => m.mark === 'started').map((m) => m.id))}
              />
            ) : null}
            <Button kind="soft" label="Talk it through instead" onPress={() => setStep('left')} />
            <Button kind="quiet" label="I've lost momentum" onPress={() => setStep('momentum')} />
            {task.timer && !task.timer.startedAt ? (
              <Button kind="quiet" label="Keep going" onPress={() => { if (round) startRound(round.room); close(); }} />
            ) : (
              <Button kind="quiet" label="Keep going" onPress={close} />
            )}
          </View>
        )}

        {step === 'how' && (
          <View style={{ gap: space[2] }}>
            <T v="bodyStrong">How did it go?</T>
            <Button
              label="All done"
              onPress={() => finish(true, [])}
            />
            <Button kind="soft" label="Some left, or talk it through" onPress={() => setStep('left')} />
            <Button kind="quiet" label="I've lost momentum" onPress={() => setStep('momentum')} />
            {task.timer && !task.timer.startedAt ? (
              <Button kind="quiet" label="Keep going" onPress={() => { startTimer(task.id); close(); }} />
            ) : (
              <Button kind="quiet" label="Keep going" onPress={close} />
            )}
          </View>
        )}

        {step === 'left' && (
          <View style={{ gap: space[3] }}>
            {question ? (
              <>
                <T v="bodyStrong">{question}</T>
                <T v="body" muted>Say it or type it.</T>
              </>
            ) : (
              <>
                <T v="bodyStrong">Tell me how it went</T>
                <T v="body" muted>Talk normally, the way you would to a friend. If you did other jobs along the way or there are bits left anywhere, say so. Focus picks out the jobs and ticks off what's done.</T>
              </>
            )}
            <TextInput
              value={interim ? `${text}${text ? ', ' : ''}${interim}` : text}
              onChangeText={(t) => !listening && setText(t)}
              editable={!listening}
              multiline
              placeholder="Put the clean dishes away, wash the second load, bin the old food"
              placeholderTextColor={c.inkMuted}
              textAlignVertical="top"
              style={[field, { minHeight: 110, borderColor: listening ? c.primary : c.line }]}
            />
            <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'center' }}>
              <IconButton
                name={listening ? 'check' : 'mic'}
                label={listening ? 'Done talking' : 'Talk instead'}
                tone="primary"
                size={52}
                onPress={listening ? stopTalk : talk}
              />
              <T v="label" muted style={{ flex: 1 }}>{listening ? 'Listening… tap the tick when you are done' : 'Tap to talk'}</T>
            </View>
            <Button
              label={tidying ? 'Tidying it up…' : 'Next'}
              disabled={!text.trim() || listening || tidying}
              onPress={async () => {
                setTidying(true);
                setTidyNote(null);
                const now = new Date();
                const jobs = openJobs(state, task, now);
                const tom = new Date(now);
                tom.setDate(tom.getDate() + 1);
                const nextTurns = [...turns, { q: question ?? undefined, said: text.trim() }];
                try {
                  const res = await checkIn({ turns: nextTurns, stopped: task, stoppedRoom: room, jobs, settings: state.settings, today: dayKey(now), tomorrow: dayKey(tom) });
                  setLastCheck(res);
                  if (res.question && nextTurns.length < 3) {
                    setTurns(nextTurns);
                    setQuestion(res.question);
                    setText('');
                    setTidying(false);
                    return;
                  }
                  showCheck(res);
                } catch {
                  // Offline or Claude unavailable: fall back to splitting on commas, and say so.
                  setLines(splitLeftovers(turns.map((t) => t.said).concat(text).join(', ')).map((title) => ({ title, need: true })));
                  setAlso([]);
                  setThisDone(false);
                  setTidyNote("Couldn't reach Claude, so this is split on commas. Fix any that look wrong.");
                  setStep('assess');
                }
                setTidying(false);
              }}
            />
            {question && lastCheck ? (
              <Button kind="quiet" label="Skip the question" disabled={tidying || listening} onPress={() => showCheck(lastCheck)} />
            ) : null}
          </View>
        )}

        {step === 'assess' && (
          <>
            <View style={{ gap: 4 }}>
              <T v="bodyStrong">{thisDone && !lines.length ? 'All sorted' : "Here's what I've got"}</T>
              <T v="body" muted>Tap a label to swap Need now and Nice to have, or tap a job to change the words.</T>
              {tidyNote ? <T v="caption" color={c.nudgeInk}>{tidyNote}</T> : null}
            </View>
            {also.length > 0 && (
              <View style={{ gap: space[1] }}>
                <T v="label" muted>ALONG THE WAY</T>
                {also.map((a, i) => (
                  <Pressable
                    key={a.id}
                    onPress={() => setAlso(also.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: a.on }}
                    style={{ flexDirection: 'row', gap: space[2], alignItems: 'center', minHeight: 40 }}
                  >
                    <Icon name={a.on ? 'check' : 'x'} size={18} color={a.on ? c.primary : c.inkMuted} />
                    <T v="body" muted={!a.on} style={{ flex: 1, textDecorationLine: a.on ? 'none' : 'line-through' }}>{a.title}</T>
                    <Chip tone={a.started ? 'nudge' : 'soft'} label={!a.on ? 'Leave as it is' : a.started ? 'Started, some left' : 'Done'} />
                  </Pressable>
                ))}
              </View>
            )}
            {lines.length > 0 && <T v="label" muted>STILL TO DO</T>}
            <ScrollView style={{ maxHeight: 340 }} contentContainerStyle={{ gap: space[2] }}>
              {lines.map((l, i) => (
                <View key={i} style={{ gap: 2 }}>
                <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'center' }}>
                  <TextInput
                    value={l.title}
                    onChangeText={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, title: v } : x)))}
                    style={[field, { flex: 1, paddingVertical: space[2] }]}
                    accessibilityLabel={`Job ${i + 1}`}
                  />
                  <Pressable
                    onPress={() => setLines(lines.map((x, j) => (j === i ? { ...x, need: !x.need } : x)))}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: l.need }}
                    accessibilityLabel={l.need ? 'Need now. Tap to make it nice to have' : 'Nice to have. Tap to make it needed now'}
                    hitSlop={6}
                  >
                    <Chip tone={l.need ? 'nudge' : 'plain'} label={l.need ? 'Need now' : 'Nice to have'} />
                  </Pressable>
                  <Pressable onPress={() => setLines(lines.filter((_, j) => j !== i))} hitSlop={8} accessibilityLabel="Remove">
                    <Icon name="x" size={18} color={c.inkMuted} />
                  </Pressable>
                </View>
                {(l.room && l.room !== task.room) || whenLabel(l.day) ? (
                  <T v="caption" muted style={{ paddingLeft: space[2] }}>
                    {[l.room && l.room !== task.room ? roomLabel(l.room) ?? l.room : null, whenLabel(l.day)].filter(Boolean).join(' · ')}
                  </T>
                ) : null}
                </View>
              ))}
              <Pressable onPress={() => setLines([...lines, { title: '', need: true }])} style={{ minHeight: 40, justifyContent: 'center' }}>
                <T v="label" color={c.primary}>+ Add another</T>
              </Pressable>
            </ScrollView>
            <T v="caption" muted>
              Need now goes on your To do{room ? `, in the right room` : ''}. Nice to have waits in Home under Projects.
            </T>
            <Button
              label="Save"
              onPress={() => finish(thisDone && !lines.some((l) => (l.room ?? task.room) === task.room), lines, also.filter((a) => a.on && !a.started).map((a) => a.id), also.filter((a) => a.on && a.started).map((a) => a.id))}
            />
            <Button kind="quiet" label="Back" onPress={() => { setTurns([]); setQuestion(null); setStep('left'); }} />
          </>
        )}

        {step === 'done' && (
          <View style={{ gap: space[2] }}>
            {said.map((l, i) => (
              <T key={i} v={i === said.length - 1 ? 'body' : 'bodyStrong'}>{l}</T>
            ))}
            {next && next.task.room && next.task.kind !== 'event' && avoidFirst(state.settings, next.task.room, now) ? (
              // Skipped or avoided three days running: a smaller way in first, not the job.
              <Card tone="sunken" style={{ gap: space[2] }}>
                <T v="label" muted>WHAT'S NEXT?</T>
                <T v="bodyStrong">The {(roomName(state.settings.rooms, next.task.room) ?? next.task.room).toLowerCase()} has been hard to start lately</T>
                <T v="body" muted>That's fine. Want a smaller way in?</T>
                <Button label="A smaller way in" onPress={() => { const room = next.task.room!; close(); openAvoidSheet(store, room); }} />
                <Button kind="quiet" label={`Just start: ${next.task.title}`} onPress={() => { startTimer(next.task.id); close(); }} />
                <Button kind="quiet" label="Not yet" onPress={close} />
              </Card>
            ) : next ? (
              <Card tone="sunken" style={{ gap: space[2] }}>
                <T v="label" muted>WHAT'S NEXT?</T>
                <T v="bodyStrong">{next.task.title}</T>
                {next.at ? <T v="caption" muted>At {fmtTime(next.at)}</T> : null}
                {next.task.kind !== 'event' ? (
                  <Button label="Start it" onPress={() => { startTimer(next.task.id); close(); }} />
                ) : null}
                <Button
                  kind="quiet"
                  label="Not yet"
                  onPress={() => {
                    // A room job put off: logged on this device only, to notice a room that's hard to start.
                    if (next.task.room && next.task.kind !== 'event')
                      updateSettings({ momentumLog: logAvoid(state.settings.momentumLog, next.task.room, new Date(), undefined, 'skip') });
                    close();
                  }}
                />
              </Card>
            ) : (
              <Button label="Thanks" onPress={close} />
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}
