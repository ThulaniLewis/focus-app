// "Tasks linked here" on a place's screen, and the "Link this to …?" check when a task is added.
// Links are phone only (the places store). Focus asks about a linked task when she arrives; it never
// ticks one by itself.
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Field } from './Account';
import { Icon } from './Icon';
import { Button, Card, T } from './ui';
import { Folded } from './PlaceReminderCheck';
import type { GeoPlace } from '../lib/geo';
import { useDeviceRole } from '../lib/device';
import { featureOn } from '../lib/features';
import { linkTask, unlinkTask, useGeo } from '../lib/geoStore';
import { linkablePlaces, suggestLink, type TaskLink } from '../lib/placeLinks';
import type { State, Task } from '../lib/types';
import { space, useColors } from '../theme';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Weekdays, 08:30", "Mon, Wed, 17:30", "Fri 28 Nov", or "Any day until done". */
export function whenLine(t: Task): string {
  const time = t.at && !t.flex ? t.at.slice(11, 16) : '';
  if (t.repeatDays?.length) {
    const d = [...t.repeatDays].sort();
    const days = d.join() === '1,2,3,4,5' ? 'Weekdays' : d.length === 7 ? 'Every day' : d.join() === '0,6' ? 'Weekends' : d.map((x) => DAYS[x]).join(', ');
    return time ? `${days}, ${time}` : days;
  }
  const day = t.at?.slice(0, 10) ?? t.day;
  if (!day) return 'Any day until done';
  const [y, m, dd] = day.split('-').map(Number);
  const date = new Date(y, m - 1, dd).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return time ? `${date}, ${time}` : date;
}

const linkable = (t: Task) => t.kind !== 'buy' && t.kind !== 'note' && !t.someday && (!!t.repeatDays?.length || !t.done);

export function LinkedTasksHere({ place, state, links }: { place: GeoPlace; state: State; links: TaskLink[] }) {
  const c = useColors();
  const [picking, setPicking] = useState(false);
  const [filter, setFilter] = useState('');
  const here = links.filter((l) => l.placeId === place.id);
  const linked = here.map((l) => state.tasks.find((t) => t.id === l.taskId)).filter((t): t is Task => !!t);
  const q = filter.trim().toLowerCase();
  const choices = state.tasks.filter((t) => linkable(t) && !here.some((l) => l.taskId === t.id) && (!q || t.title.toLowerCase().includes(q))).slice(0, 15);
  const elsewhere = (taskId: string) => links.some((x) => x.taskId === taskId && x.placeId !== place.id);

  return (
    <Card>
      {linked.map((t) => (
        <View key={t.id} style={[styles.row, { borderBottomColor: c.line }]}>
          <View style={{ flex: 1 }}>
            <T v="bodyStrong">{t.title}</T>
            <T v="caption" muted>{whenLine(t)}</T>
          </View>
          <Pressable onPress={() => unlinkTask(t.id).catch(() => {})} accessibilityRole="button" accessibilityLabel={`Unlink ${t.title}`} hitSlop={8} style={{ padding: space[1] }}>
            <Icon name="x" size={18} color={c.inkMuted} />
          </Pressable>
        </View>
      ))}
      {picking ? (
        <View style={{ gap: space[2], paddingTop: space[2] }}>
          <Field value={filter} onChangeText={setFilter} placeholder="Find a task" accessibilityLabel="Find a task to link" autoFocus />
          {choices.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => {
                linkTask(t.id, place.id).catch(() => {});
                setFilter('');
                setPicking(false);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Link ${t.title} to ${place.name}`}
              style={[styles.row, { borderBottomColor: c.line }]}
            >
              <View style={{ flex: 1 }}>
                <T v="body">{t.title}</T>
                <T v="caption" muted>{elsewhere(t.id) ? `${whenLine(t)} · linked to another place, this moves it` : whenLine(t)}</T>
              </View>
              <Icon name="plus" size={18} color={c.primary} />
            </Pressable>
          ))}
          {!choices.length ? <T v="caption" muted>No tasks match.</T> : null}
          <Button kind="quiet" small label="Done" onPress={() => setPicking(false)} />
        </View>
      ) : (
        <Pressable onPress={() => setPicking(true)} accessibilityRole="button" style={{ paddingVertical: space[2], gap: 2 }}>
          <T v="bodyStrong" color={c.primary}>Link a task to here</T>
          <T v="caption" muted>Focus asks about it when you arrive. It never ticks it off by itself.</T>
        </Pressable>
      )}
    </Card>
  );
}

export type LinkAnswer = 'yes' | 'no' | null;

/** "Link this to Ada's nursery? Focus will ask when you arrive." Yes, Change (pick another place) or No. */
export function LinkCheck({
  title,
  placeId,
  places,
  answer,
  onAnswer,
  onPlace,
}: {
  title: string;
  placeId: string;
  places: GeoPlace[];
  answer: LinkAnswer;
  onAnswer: (a: LinkAnswer) => void;
  onPlace: (placeId: string) => void;
}) {
  const [changing, setChanging] = useState(false);
  const options = linkablePlaces(places);
  const place = options.find((p) => p.id === placeId);
  if (!place) return null;
  if (answer && !changing) return <Folded text={answer === 'yes' ? `${title}: linked to ${place.name}.` : `${title}: not linked.`} onUndo={() => onAnswer(null)} />;
  return (
    <Card tone={answer === 'yes' ? 'soft' : 'surface'} style={{ gap: space[2], opacity: answer === 'no' ? 0.5 : 1 }}>
      <T v="label" muted>{title.toUpperCase()}</T>
      <T v="heading">{`Link this to ${place.name}?`}</T>
      <T v="caption" muted>{answer === 'yes' ? 'Linked. Focus asks about it when you arrive.' : answer === 'no' ? 'Not linked.' : 'Focus will ask when you arrive.'}</T>
      {changing ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {options.map((p) => (
            <Button
              key={p.id}
              small
              kind={p.id === placeId ? 'primary' : 'soft'}
              label={p.name}
              onPress={() => {
                onPlace(p.id);
                setChanging(false);
              }}
            />
          ))}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <View style={{ flex: 1 }}>
            <Button small kind={answer === 'yes' ? 'primary' : 'soft'} label="Yes" onPress={() => onAnswer('yes')} />
          </View>
          {options.length > 1 && (
            <View style={{ flex: 1 }}>
              <Button small kind="soft" label="Change" onPress={() => setChanging(true)} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Button small kind="quiet" label="No" onPress={() => onAnswer('no')} />
          </View>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space[3], alignItems: 'center', paddingVertical: space[2], borderBottomWidth: StyleSheet.hairlineWidth },
});

/** After adding a task by hand: if it names one of her places, offer the link once. Phone only. */
export function useLinkOffer(state: State) {
  const role = useDeviceRole();
  const geo = useGeo();
  const places = role === 'phone' && featureOn(state.settings, 'places') ? geo.places : [];
  const [offer, setOffer] = useState<{ taskId: string; title: string; placeId: string; answer: LinkAnswer } | null>(null);
  const check = (taskId: string | undefined, title: string) => {
    const hit = taskId ? suggestLink(title, places) : null;
    setOffer(hit && taskId ? { taskId, title, placeId: hit.id, answer: null } : null);
  };
  const node = offer ? (
    <LinkCheck
      title={offer.title}
      placeId={offer.placeId}
      places={places}
      answer={offer.answer}
      onAnswer={(a) => {
        if (a === 'yes') linkTask(offer.taskId, offer.placeId).catch(() => {});
        if (a !== 'yes' && offer.answer === 'yes') unlinkTask(offer.taskId).catch(() => {});
        setOffer({ ...offer, answer: a });
      }}
      onPlace={(pid) => {
        linkTask(offer.taskId, pid).catch(() => {});
        setOffer({ ...offer, placeId: pid, answer: 'yes' });
      }}
    />
  ) : null;
  return { check, node };
}
