import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { DictationBox } from '../../components/Dictation';
import { useDictation } from '../../lib/useDictation';
import { showSheet } from '../../components/Sheet';
import { Icon } from '../../components/Icon';
import { roomName } from '../../components/TaskRow';
import { Button, Card, Check, Chip, Screen, Section, T } from '../../components/ui';
import { ClaudeError, type DumpResult, type ParsedItem, parseDump } from '../../lib/claude';
import { type JobRef, openJobs } from '../../lib/leftovers';
import { isTabletDevice, useDeviceRole } from '../../lib/device';
import { isPrivateSpace } from '../../lib/sync';
import { useStore } from '../../lib/store';
import { space, useColors } from '../../theme';
import { dayKey, fmtTime, parseLocal } from '../../lib/time';
import { DAY_SHORT } from '../../lib/views';
import { PlaceReminderCheck, type ReminderAnswer } from '../../components/PlaceReminderCheck';
import { featureOn } from '../../lib/features';
import { addGrabList, addReminder, linkTask, setAway, useGeo } from '../../lib/geoStore';
import { useDiary } from '../../lib/calendar';
import { dumpContext } from '../../lib/dumpContext';
import type { SuggestedAway, SuggestedGrabList } from '../../lib/dumpShapes';
import { LinkCheck, type LinkAnswer } from '../../components/LinkedTasks';
import { suggestLink } from '../../lib/placeLinks';
import type { SuggestedReminder } from '../../lib/placeTalk';

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

export default function Dump() {
  const { user, state, addItems, addNotes, markJobs, batch, logEvent } = useStore();
  const c = useColors();
  // The mic. The tick stops listening and sends what was said straight to Claude.
  const [sortError, setSortError] = useState<string | null>(null);
  const sortRef = useRef<(said: string) => void>(() => {});
  const d = useDictation('dump', (final) => sortRef.current(final), () => setSortError(null));
  const { text, setText } = d;
  const [busy, setBusy] = useState(false);
  const error = sortError ?? d.error;
  const setError = (m: string | null) => { setSortError(m); if (!m) d.setError(null); };
  const [result, setResult] = useState<DumpResult | null>(null);
  const [items, setItems] = useState<(ParsedItem & { keep: boolean })[]>([]);
  // The feedback loop: Focus can ask a question before showing the list.
  const [turns, setTurns] = useState<{ q?: string; said: string }[]>([]);
  const [question, setQuestion] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<DumpResult | null>(null);
  const jobsRef = useRef<JobRef[]>([]);
  const [jobMarks, setJobMarks] = useState<{ id: string; title: string; mark: 'done' | 'started' | 'leave' }[]>([]);
  // Place reminders, phone only: each one waits for her yes, change or no.
  const role = useDeviceRole();
  const geo = useGeo();
  const places = role === 'phone' && featureOn(state.settings, 'places') ? geo.places : [];
  const [placeRems, setPlaceRems] = useState<(SuggestedReminder & { answer: ReminderAnswer })[]>([]);
  // Tasks that name one of her places: "Link this to …?" Yes, change or no. By item index.
  const [links, setLinks] = useState<Record<number, { placeId: string; answer: LinkAnswer }>>({});
  // Brief 4: one list for one trip, and away from home. Phone only, like places.
  const [grabs, setGrabs] = useState<(Omit<SuggestedGrabList, 'items'> & { keep: boolean; items: { text: string; ifFound?: boolean; keep: boolean }[] })[]>([]);
  const [away, setAwayPick] = useState<(SuggestedAway & { keep: boolean }) | null>(null);
  const { events: phoneEvents } = useDiary(state.settings.readCalendar, 2);

  const show = (r: DumpResult) => {
    setResult(r);
    setItems(r.items.map((it) => ({ ...it, keep: true })));
    setPlaceRems(r.placeReminders.map((x) => ({ ...x, answer: null })));
    const sug: Record<number, { placeId: string; answer: LinkAnswer }> = {};
    r.items.forEach((it, i) => {
      const hit = it.kind === 'task' || it.kind === 'event' ? suggestLink(it.title, places) : null;
      if (hit) sug[i] = { placeId: hit.id, answer: null };
    });
    setLinks(sug);
    setGrabs(r.grabLists.map((g) => ({ ...g, keep: true, items: g.items.map((i) => ({ ...i, keep: true })) })));
    setAwayPick(r.away ? { ...r.away, keep: true } : null);
    const titleOf = (id: string) => state.tasks.find((t) => t.id === id)?.title ?? 'A job';
    setJobMarks([
      ...r.doneIds.map((id) => ({ id, title: titleOf(id), mark: 'done' as const })),
      ...r.startedIds.map((id) => ({ id, title: titleOf(id), mark: 'started' as const })),
    ]);
    setQuestion(null);
    setWaiting(null);
  };

  const sort = async (said: string = text) => {
    if (busy) return;
    const sentText = said.trim();
    if (!sentText) return setError('There is nothing to send yet. Tap the mic and talk, or type.');
    if (!user) return setError('Not signed in. Sign in with your email in Settings (the gear on Today), then tap Sort it.');
    setBusy(true);
    setError(null);
    try {
      const now = new Date();
      if (!turns.length) jobsRef.current = openJobs(state, undefined, now);
      const next = [...turns, { q: question ?? undefined, said: sentText }];
      const phone = role === 'phone';
      // The whole picture, every time (big build section 0): where she is, her places, her diary, her rhythms.
      const context = dumpContext({ state, now, events: phoneEvents, ...(phone ? { places: geo.places, presence: geo.presence, grabLists: geo.grabLists, away: geo.away && !geo.away.endedAt ? geo.away : null } : {}) });
      const r = await parseDump(sentText, state.settings, state.spaces, now, { jobs: jobsRef.current, turns: next, places, context, phone });
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
      setError(e instanceof ClaudeError ? e.message : `Something went wrong sorting that: ${String((e as any)?.message ?? e)}. Your words are still here, try again.`);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    sortRef.current = sort;
  });

  const reset = () => {
    setText('');
    setResult(null);
    setTurns([]);
    setQuestion(null);
    setWaiting(null);
    setJobMarks([]);
    setPlaceRems([]);
    setLinks({});
    setGrabs([]);
    setAwayPick(null);
  };

  const save = () => {
    if (!result) return;
    const kept0 = items.filter((i) => i.keep);
    const titleOf = (id: string) => state.tasks.find((t) => t.id === id);
    const asLogged = (ids: string[]) => ids.map(titleOf).filter((t): t is NonNullable<typeof t> => !!t).map((t) => ({ id: t.id, title: t.title, spaceId: t.spaceId }));
    logEvent({
      at: new Date().toISOString(),
      kind: 'dictation',
      said: turns.map((t) => t.said).join(' / '),
      made: [
        ...kept0.map((i) => ({ id: '', title: i.title, spaceId: i.kind === 'note' ? 'me' : i.spaceId })),
        // Only that a place reminder was made: the place itself stays on the phone.
        ...placeRems.filter((r) => r.answer === 'yes').map((r) => ({ id: '', title: `Place reminder: ${r.text}`, spaceId: 'me' })),
        // Grab lists and away stay on the phone, so they log as private.
        ...grabs.filter((g) => g.keep).map((g) => ({ id: '', title: `Grab list: ${g.title} (${g.items.filter((i) => i.keep).length})`, spaceId: 'me' })),
        ...(away?.keep ? [{ id: '', title: `Away: ${away.placeName}`, spaceId: 'me' }] : []),
      ],
      ...(result.understood ? { understood: result.understood } : {}),
      ticked: asLogged(jobMarks.filter((j) => j.mark === 'done').map((j) => j.id)),
      started: asLogged(jobMarks.filter((j) => j.mark === 'started').map((j) => j.id)),
      ...(turns.find((t) => t.q) ? { question: turns.filter((t) => t.q).map((t) => t.q).join(' / ') } : {}),
    });
    batch('Saved', () => {
      markJobs(dayKey(new Date()), jobMarks.filter((j) => j.mark === 'done').map((j) => j.id), jobMarks.filter((j) => j.mark === 'started').map((j) => j.id));
      const kept = items.filter((i) => i.keep).map(({ keep, ...rest }) => rest);
      if (isTabletDevice()) {
        // A shared screen never keeps private things: those only save on the phone.
        const shared = kept.filter((i) => i.kind !== 'note' && !isPrivateSpace(i.spaceId, state.spaces));
        addItems(shared);
        if (shared.length < kept.length || result.notes.length) setError('Private notes and Money only save on your phone, so I left those out here.');
      } else {
        const ids = addItems(kept);
        addNotes(result.notes);
        // Link the ones she said yes to (phone only: the links live in the places store).
        const keptIdx = items.map((it, i) => (it.keep ? i : -1)).filter((i) => i >= 0);
        keptIdx.forEach((i, j) => {
          const l = links[i];
          if (l?.answer === 'yes' && ids[j]) linkTask(ids[j], l.placeId).catch(() => {});
        });
      }
    });
    for (const g of grabs.filter((x) => x.keep)) {
      const items = g.items.filter((i) => i.keep).map(({ keep, ...i }) => i);
      if (items.length) addGrabList({ title: g.title, placeId: g.placeId, items }).catch(() => {});
    }
    if (away?.keep) {
      const { keep, ...a } = away;
      setAway(a).catch(() => {});
    }
    for (const r of placeRems.filter((x) => x.answer === 'yes')) {
      const { answer, ...rem } = r;
      addReminder(rem).catch(() => {});
    }
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
    const count = items.filter((i) => i.keep).length + placeRems.filter((r) => r.answer === 'yes').length + grabs.filter((g) => g.keep).length + (away?.keep ? 1 : 0);
    const unanswered = placeRems.some((r) => r.answer === null);
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
        {away ? (
          <Card style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-start' }}>
            <Check on={away.keep} onPress={() => setAwayPick({ ...away, keep: !away.keep })} label={`Away tonight at ${away.placeName}`} />
            <View style={{ flex: 1, gap: space[1] }}>
              <T v="bodyStrong" style={!away.keep ? { opacity: 0.45 } : undefined}>{`Away tonight at ${away.placeName}`}</T>
              <T v="caption" muted>{away.reason ? `${away.reason.charAt(0).toUpperCase()}${away.reason.slice(1)}. ` : ''}Stays on this phone.</T>
            </View>
          </Card>
        ) : null}
        {grabs.map((g, gi) => (
          <Card key={`grab-${gi}`} style={{ gap: space[1], opacity: g.keep ? 1 : 0.5 }}>
            <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
              <Check on={g.keep} onPress={() => setGrabs((cur) => cur.map((x, j) => (j === gi ? { ...x, keep: !x.keep } : x)))} label={g.title} />
              <View style={{ flex: 1 }}>
                <T v="label" muted>GRAB LIST</T>
                <T v="heading">{g.title}</T>
                {g.placeId ? <T v="caption" muted>{`For ${places.find((p) => p.id === g.placeId)?.name ?? 'a place'}. Stays on this phone.`}</T> : <T v="caption" muted>Stays on this phone.</T>}
              </View>
            </View>
            {g.items.map((it, ii) => (
              <View key={ii} style={{ flexDirection: 'row', gap: space[3], alignItems: 'center', minHeight: 44, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }}>
                <Check on={it.keep} onPress={() => setGrabs((cur) => cur.map((x, j) => (j === gi ? { ...x, items: x.items.map((y, k) => (k === ii ? { ...y, keep: !y.keep } : y)) } : x)))} label={it.text} />
                <View style={{ flex: 1 }}>
                  <T v="body" style={!it.keep ? { opacity: 0.45 } : undefined}>{it.text}</T>
                  {it.ifFound ? <T v="caption" muted>if you find it</T> : null}
                </View>
              </View>
            ))}
          </Card>
        ))}
        {placeRems.map((r, i) => (
          <PlaceReminderCheck
            key={`${r.placeId}-${i}`}
            r={r}
            placeName={places.find((p) => p.id === r.placeId)?.name ?? 'that place'}
            answer={r.answer}
            onAnswer={(a) => setPlaceRems((cur) => cur.map((x, j) => (j === i ? { ...x, answer: a } : x)))}
            onChange={(text) => setPlaceRems((cur) => cur.map((x, j) => (j === i ? { ...x, text } : x)))}
          />
        ))}
        {Object.entries(links)
          .filter(([i]) => items[Number(i)]?.keep)
          .map(([i, l]) => (
            <LinkCheck
              key={`link-${i}`}
              title={items[Number(i)].title}
              placeId={l.placeId}
              places={places}
              answer={l.answer}
              onAnswer={(a) => setLinks((cur) => ({ ...cur, [i]: { ...cur[Number(i)], answer: a } }))}
              onPlace={(pid) => setLinks((cur) => ({ ...cur, [i]: { placeId: pid, answer: 'yes' } }))}
            />
          ))}
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
                  const allDay = it.allDay && it.day ? new Date(`${it.day}T00:00:00`) : null;
                  const when = describeWhen(it.at, it.repeatDays) ?? (allDay ? `${DAY_SHORT[allDay.getDay()]} ${allDay.getDate()}/${allDay.getMonth() + 1}, all day` : undefined);
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
        {!items.length && !placeRems.length && !grabs.length && !away && !result.notes.length && !jobMarks.length && <T v="body" muted>Nothing to add from that one.</T>}
        {result.notes.length > 0 && (
          <Section title="Notes about Focus">
            <Card tone="sunken">{result.notes.map((n, i) => <T key={i} v="body">{n}</T>)}</Card>
          </Section>
        )}
        {unanswered ? <T v="caption" muted>Say yes or no to the place reminder first.</T> : null}
        <Button label={count ? `Add ${count}` : result.notes.length || jobMarks.length ? 'Save' : 'Done'} onPress={save} disabled={unanswered} />
        <Button kind="quiet" label="Keep talking" onPress={() => { setResult(null); setTurns([]); setText(turns.map((t) => t.said).join(' ')); }} />
      </Screen>
    );
  }

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
          <T v="body" muted>Tap the mic and just talk. New things, or what you've done and what's left. Tap the tick when you're done and Focus sorts it.</T>
        </>
      )}
      <DictationBox
        d={d}
        placeholder="Toilet roll and bananas, nursery drop 08:15 tomorrow, chase the Barclays application, dentist Thursday 14:00…"
        doneLabel="Done talking, sort it"
      />

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
        !d.listening && (
          <View style={{ gap: space[2] }}>
            <Button label={question ? 'Answer' : 'Sort it'} onPress={() => sort()} disabled={!text.trim()} />
            {question && waiting ? <Button kind="quiet" label="Skip the question" onPress={() => show(waiting)} /> : null}
            {question ? <Button kind="quiet" label="Start again" onPress={reset} /> : null}
            {text && !question ? <Button kind="quiet" label="Clear" onPress={() => setText('')} /> : null}
          </View>
        )
      )}
    </Screen>
  );
}
