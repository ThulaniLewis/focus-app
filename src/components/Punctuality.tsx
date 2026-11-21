// On time or late. The host asks "how did it go?" after a fixed time with a place is ticked (here, or
// from a notification's Done button, next time Focus is open). The card shows the pattern kindly and,
// for drop off, offers a time that fits.
import React, { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { isTracked, keyOf, LATE_CHOICES, lastFor, patternLine, suggestDropTime } from '../lib/punctuality';
import { useNow, useStore } from '../lib/store';
import { space, useColors } from '../theme';
import { dayKey } from '../lib/time';
import { showSheet } from './Sheet';
import { isTabletDevice } from '../lib/device';
import { Button, Card, T } from './ui';

export function PunctualityHost() {
  const { state, answerPunctuality } = useStore();
  const pending = state.settings.punctualityAsk ?? [];
  const asked = useRef(new Set<string>());
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);

  const first = pending.find((p) => !asked.current.has(`${p.taskId}|${p.day}`));
  useEffect(() => {
    if (!first || !active) return;
    const task = state.tasks.find((t) => t.id === first.taskId);
    asked.current.add(`${first.taskId}|${first.day}`);
    if (!task) return answerPunctuality(first.taskId, first.day, null);
    const today = first.day === dayKey(new Date());
    const tone = isTabletDevice() ? ('dash' as const) : undefined;
    // A moment's pause, so this comes after the sheet or row that ticked it.
    const timer = setTimeout(
      () =>
        showSheet({
          tone, // the tablet's dark Dash style
          title: today ? `${task.title}: how did it go?` : `${task.title} on ${first.day}: on time?`,
          message: 'Just so Focus can plan better. Skip any time.',
          options: [
            { label: 'On time', icon: 'check', onPress: () => answerPunctuality(task.id, first.day, 0) },
            {
              label: 'Late',
              icon: 'clock',
              onPress: () =>
                showSheet({
                  tone,
                  title: 'Roughly how late?',
                  message: "That's just information, not a telling off.",
                  options: [
                    ...LATE_CHOICES.map((m) => ({ label: m === 30 ? '30 minutes or more' : `About ${m} minutes`, onPress: () => answerPunctuality(task.id, first.day, m) })),
                    { label: 'Skip', onPress: () => answerPunctuality(task.id, first.day, null) },
                  ],
                }),
            },
            { label: 'Skip', icon: 'skip-forward', onPress: () => answerPunctuality(task.id, first.day, null) },
          ],
        }),
      600,
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first?.taskId, first?.day, active]);
  return null;
}

/** The small line under a fixed time with a place, once there are three answers. */
export function PatternLine({ task }: { task: Parameters<typeof keyOf>[0] }) {
  const { state } = useStore();
  if (!isTracked(task)) return null;
  const line = patternLine(state.settings.punctualityLog, keyOf(task));
  return line ? <T v="caption" muted>{line}</T> : null;
}

/** Today: a better-fitting drop-off time, and (in the morning) the pattern after a late one. */
export function PunctualityCards() {
  const { state, acceptDropTime, dropTimeNotYet } = useStore();
  const c = useColors();
  const now = useNow(60000);
  const today = dayKey(now);
  const tracked = state.tasks.filter((t) => isTracked(t) && !t.done);
  const suggestion = tracked.map((t) => ({ t, s: suggestDropTime(state, t, now) })).find((x) => x.s);
  const afterLate =
    now.getHours() < 12
      ? tracked
          .map((t) => ({ t, last: lastFor(state.settings.punctualityLog, keyOf(t), 1)[0] }))
          .find((x) => x.last && x.last.day < today && x.last.lateMin > 0 && patternLine(state.settings.punctualityLog, keyOf(x.t)))
      : undefined;
  if (!suggestion && !afterLate) return null;
  return (
    <>
      {suggestion && (
        <Card tone="soft" style={{ gap: space[2] }}>
          <T v="label" color={c.primaryStrong}>A TIME THAT FITS</T>
          <T v="bodyStrong">{suggestion.t.title}</T>
          <T v="body" muted>{patternLine(state.settings.punctualityLog, keyOf(suggestion.t))}</T>
          <T v="body">{suggestion.s!.line}</T>
          <Button label={`Plan for ${suggestion.s!.time}`} onPress={() => acceptDropTime(suggestion.t.id, suggestion.s!.time)} />
          <Button kind="quiet" label="Not yet" onPress={() => dropTimeNotYet(keyOf(suggestion.t))} />
        </Card>
      )}
      {!suggestion && afterLate && (
        <Card tone="sunken" style={{ gap: space[1] }}>
          <T v="bodyStrong">{afterLate.t.title}</T>
          <T v="body" muted>{patternLine(state.settings.punctualityLog, keyOf(afterLate.t))}</T>
        </Card>
      )}
    </>
  );
}
