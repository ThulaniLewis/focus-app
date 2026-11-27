// One place: what Focus does here (plain sentences, each with a switch, only the ones that fit its type),
// its reminders, and where it is (find by address, drag the map to nudge the pin). Phone only.
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { Field } from '../../../components/Account';
import { Icon } from '../../../components/Icon';
import { LinkedTasksHere } from '../../../components/LinkedTasks';
import { MapPreview } from '../../../components/MapPreview';
import { Button, Card, Check, Header, Screen, Section, T, Toggle } from '../../../components/ui';
import { type GeoPlace, type PlaceReminder } from '../../../lib/geo';
import { addReminder, deleteReminder, setPlaces, setReminderDone, useGeo } from '../../../lib/geoStore';
import { hereNow, roughlyHere } from '../../../lib/location';
import { newSession, NOT_FOUND, placeFor, type SearchProblem, type Suggestion, suggestAddress } from '../../../lib/placeSearch';
import { type Behaviour, cleanType, does, LOG_LINE, PLACE_TYPES, type PlaceType, sentence, typeInfo } from '../../../lib/placeTypes';
import { useStore } from '../../../lib/store';
import { tripsLine, tripsTo } from '../../../lib/placeTrips';
import type { State } from '../../../lib/types';
import { radius, space, useColors } from '../../../theme';

const newId = () => `place-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function Chips<T extends string>({ options, value, onPick, label }: { options: { id: T; label: string; icon?: string }[]; value: T | undefined; onPick: (v: T) => void; label: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <Pressable
            key={o.id}
            onPress={() => onPick(o.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space[1], minHeight: 40, paddingHorizontal: space[3], borderRadius: radius.pill, backgroundColor: on ? c.primary : 'transparent', borderWidth: on ? 0 : 1, borderColor: c.outline }}
          >
            {o.icon ? <Icon name={o.icon} size={16} color={on ? c.onPrimary : c.ink} /> : null}
            <T v="label" color={on ? c.onPrimary : c.ink}>{o.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The "what Focus does" settings each behaviour needs, under its sentence. */
function BehaviourSetup({ b, place, state, onPatch }: { b: Behaviour; place: GeoPlace; state: State; onPatch: (p: Partial<GeoPlace>) => void }) {
  if (b === 'leave-by') {
    const names = state.settings.places.map((p) => p.name);
    if (!names.length) return <T v="caption" muted>Add this place under Travel times in Settings, so Focus knows how long it takes.</T>;
    return (
      <View style={{ gap: space[1] }}>
        <T v="caption" muted>Which trips go here?</T>
        <Chips label="Trips" options={names.map((n) => ({ id: n, label: n }))} value={place.trips} onPick={(v) => onPatch({ trips: v })} />
      </View>
    );
  }
  if (b === 'work-routine') {
    const spaces = state.spaces.filter((s) => s.kind !== 'shopping' && s.kind !== 'private');
    return (
      <View style={{ gap: space[1] }}>
        <T v="caption" muted>Which space is your work list?</T>
        <Chips label="Work list" options={spaces.map((s) => ({ id: s.id, label: s.name, icon: s.icon }))} value={place.workSpaceId} onPick={(v) => onPatch({ workSpaceId: v })} />
      </View>
    );
  }
  if (b === 'gym-tick') {
    const tasks = state.tasks.filter((t) => t.kind !== 'buy' && t.kind !== 'note' && (!!t.repeatDays?.length || !t.done)).slice(0, 12);
    if (!tasks.length) return <T v="caption" muted>Add your gym task first, then choose it here.</T>;
    return (
      <View style={{ gap: space[1] }}>
        <T v="caption" muted>Which task does the gym tick off?</T>
        <Chips label="Gym task" options={tasks.map((t) => ({ id: t.id, label: t.title }))} value={place.gymTaskId} onPick={(v) => onPatch({ gymTaskId: v })} />
      </View>
    );
  }
  return null;
}

function reminderLine(r: PlaceReminder): string {
  const when = r.every ? 'Every time you ' + (r.when === 'leave' ? 'leave' : 'arrive') : 'Next time you ' + (r.when === 'leave' ? 'leave' : 'arrive');
  if (!r.byDay) return when;
  const [y, m, d] = r.byDay.split('-').map(Number);
  const day = new Date(y, m - 1, d);
  return `${when}, before ${DAYS[day.getDay()]} ${d} ${day.toLocaleString('en-GB', { month: 'short' })}`;
}

export default function PlaceEditor() {
  const { id, type: typeParam } = useLocalSearchParams<{ id: string; type?: string }>();
  const geo = useGeo();
  const { state } = useStore();
  const c = useColors();
  const existing = geo.places.find((p) => p.id === id);
  const startType: PlaceType = existing?.type ?? (typeParam ? cleanType(typeParam) : geo.places.length === 0 ? 'home' : 'other');

  const [changing, setChanging] = useState(!existing);
  const [name, setName] = useState(existing?.name ?? (startType === 'home' ? 'Home' : ''));
  const [type, setType] = useState<PlaceType>(startType);
  const [pin, setPin] = useState<{ lat: number; lon: number; address?: string } | null>(existing ? { lat: existing.lat, lon: existing.lon, address: existing.address } : null);
  const [radiusM, setRadius] = useState(existing?.radiusM ?? typeInfo(startType).radiusM);
  const [extra, setExtra] = useState<Pick<GeoPlace, 'off' | 'trips' | 'workSpaceId' | 'gymTaskId'>>({ off: existing?.off, trips: existing?.trips, workSpaceId: existing?.workSpaceId, gymTaskId: existing?.gymTaskId });
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [problem, setProblem] = useState<{ text: string; offerHere: boolean } | null>(null);
  const [mapWidth, setMapWidth] = useState(0);
  const [newRem, setNewRem] = useState('');
  const [remWhen, setRemWhen] = useState<'arrive' | 'leave'>('arrive');
  const [remEvery, setRemEvery] = useState<'once' | 'every'>('once');
  const touchedRadius = useRef(!!existing);
  const session = useRef(newSession());
  const near = useRef<{ lat: number; lon: number } | null>(null);

  // Where she is, roughly, to put nearby places first. Falls back to her weather town.
  useEffect(() => {
    roughlyHere().then((h) => (near.current = h)).catch(() => {});
  }, []);

  const showProblem = (r: SearchProblem) => setProblem({ text: r.error, offerHere: r.kind !== 'signin' });

  // Suggestions as you type, once there are 3 letters, after a short pause.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return; // typeQuery clears the suggestions
    let live = true;
    const t = setTimeout(async () => {
      setSearching(true);
      const r = await suggestAddress(q, session.current, near.current ?? state.settings.weatherPlace);
      if (!live) return;
      setSearching(false);
      if ('error' in r) {
        showProblem(r);
        setHits([]);
      } else {
        setHits(r.results);
        setProblem(r.results.length ? null : { text: NOT_FOUND, offerHere: false });
      }
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query, state.settings.weatherPlace]);

  const typeQuery = (v: string) => {
    setQuery(v);
    if (v.trim().length < 3) {
      setHits([]);
      setSearching(false);
      setProblem(null);
    }
  };

  const chooseType = (t: PlaceType) => {
    setType(t);
    if (!touchedRadius.current) setRadius(typeInfo(t).radiusM);
  };

  const pick = async (s: Suggestion) => {
    setSearching(true);
    const r = await placeFor(s, session.current);
    // The pick ends Google's session: the next search starts a new one.
    session.current = newSession();
    setSearching(false);
    if ('error' in r) return showProblem(r);
    if ('notFound' in r) return setProblem({ text: NOT_FOUND, offerHere: false });
    setPin({ lat: r.hit.lat, lon: r.hit.lon, address: r.hit.address });
    if (!name.trim()) setName(r.hit.name);
    setProblem(null);
    setQuery('');
    setHits([]);
  };

  const useHere = async () => {
    setProblem(null);
    const here = await hereNow();
    if (!here) setProblem({ text: "Couldn't find where you are. Check location is allowed for Focus.", offerHere: false });
    else setPin({ lat: here.lat, lon: here.lon, address: 'Where you were standing' });
  };

  /** The place as it would be saved now. */
  const built = (): GeoPlace | null =>
    pin && name.trim()
      ? {
          id: existing?.id ?? newId(),
          name: name.trim(),
          type,
          lat: pin.lat,
          lon: pin.lon,
          radiusM,
          address: pin.address,
          // Only keep settings that fit the type.
          ...(extra.off?.length ? { off: extra.off.filter((b) => typeInfo(type).behaviours.includes(b)) } : {}),
          ...(type === 'school' && extra.trips ? { trips: extra.trips } : {}),
          ...(type === 'work' && extra.workSpaceId ? { workSpaceId: extra.workSpaceId } : {}),
          ...(type === 'gym' && extra.gymTaskId ? { gymTaskId: extra.gymTaskId } : {}),
        }
      : null;

  const save = async () => {
    const place = built();
    if (!place) return;
    await setPlaces(existing ? geo.places.map((p) => (p.id === place.id ? place : p)) : [...geo.places, place]);
    if (existing) setChanging(false);
    else router.replace(`/place/${place.id}`);
  };

  /** A switch or a choice under it: saved straight away on a place that already exists. */
  const patch = (p: Partial<GeoPlace>) => {
    const next = { ...extra, ...p };
    setExtra(next);
    if (existing && !changing) setPlaces(geo.places.map((x) => (x.id === existing.id ? { ...x, ...p } : x))).catch(() => {});
  };
  const toggle = (b: Behaviour, on: boolean) => {
    const off = new Set(extra.off ?? []);
    if (on) off.delete(b);
    else off.add(b);
    patch({ off: [...off] });
  };

  const remove = () =>
    Alert.alert(`Delete ${existing?.name}?`, 'Focus stops noticing this place, and its reminders go too. Past entries stay in the log.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await setPlaces(geo.places.filter((p) => p.id !== existing?.id));
          router.navigate('/places');
        },
      },
    ]);

  const nudgeRadius = (by: number) => {
    touchedRadius.current = true;
    setRadius((r) => Math.min(1000, Math.max(50, r + by)));
  };

  const addRem = () => {
    const text = newRem.trim();
    if (!existing || !text) return;
    addReminder({ placeId: existing.id, text: text.charAt(0).toUpperCase() + text.slice(1), when: remWhen, ...(remEvery === 'every' ? { every: true } : {}) }).catch(() => {});
    setNewRem('');
  };

  const info = typeInfo(type);
  const view = { name: name.trim() || 'this place', type, ...extra };
  const trips = tripsLine(tripsTo(state.tasks, extra.trips));
  const gymTask = state.tasks.find((t) => t.id === extra.gymTaskId)?.title;
  const reminders = existing ? geo.reminders.filter((r) => r.placeId === existing.id).sort((a, b) => Number(!!a.doneAt) - Number(!!b.doneAt) || a.createdAt.localeCompare(b.createdAt)) : [];

  return (
    <Screen>
      <Header title={existing ? existing.name : info.ask?.question ?? 'Add a place'} kicker="PLACES" fallback="/places" />
      {existing && !changing && (
        <T v="body" muted>{`${existing.address ? `${existing.address.split(',').slice(-2).join(',').trim()} · ` : ''}${info.label}`}</T>
      )}

      {changing && (
        <Section title="Find it">
          <Card>
            <Field value={query} onChangeText={typeQuery} placeholder="Type an address, a postcode or a shop" autoCorrect={false} accessibilityLabel="Search for an address" />
            {searching && <ActivityIndicator color={c.primary} />}
            {problem && (
              <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', gap: space[2], alignItems: 'flex-start', backgroundColor: c.cautionSoft, borderRadius: radius.sm, padding: space[3] }}>
                <Icon name="info" size={18} color={c.cautionInk} />
                <T v="body" color={c.cautionInk} style={{ flex: 1 }}>{problem.text}</T>
              </View>
            )}
            {hits.map((h) => (
              <Pressable
                key={h.placeId}
                onPress={() => pick(h)}
                accessibilityRole="button"
                accessibilityLabel={`Choose ${h.address}`}
                style={{ flexDirection: 'row', gap: space[3], alignItems: 'center', minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }}
              >
                <Icon name="map-pin" size={18} color={c.inkMuted} />
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong" numberOfLines={1}>{h.name}</T>
                  <T v="caption" muted numberOfLines={2}>{h.address}</T>
                </View>
              </Pressable>
            ))}
            <Button kind={problem?.offerHere ? 'soft' : 'quiet'} small label="Use where I am now" onPress={useHere} />
          </Card>
        </Section>
      )}

      {pin && (
        <Card>
          <View onLayout={(e) => setMapWidth(e.nativeEvent.layout.width)}>
            <MapPreview lat={pin.lat} lon={pin.lon} radiusM={radiusM} width={mapWidth} height={changing ? 200 : 150} onMove={changing ? (p) => setPin({ ...p, address: pin.address }) : undefined} />
          </View>
          {changing && (
            <>
              {pin.address ? <T v="caption" muted>{pin.address}</T> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                <T v="body" style={{ flex: 1 }}>{`Circle: ${radiusM} m`}</T>
                <Button kind="soft" small label="Smaller" onPress={() => nudgeRadius(-25)} />
                <Button kind="soft" small label="Bigger" onPress={() => nudgeRadius(25)} />
              </View>
              <T v="caption" muted>Pin slightly off? Drag the map until the pin sits in the right spot.</T>
            </>
          )}
        </Card>
      )}

      {changing && (
        <Section title="Name and kind">
          <Card>
            <Field value={name} onChangeText={setName} placeholder="Name, like Home or the gym" accessibilityLabel="Place name" />
            <Chips label="Kind of place" options={PLACE_TYPES.map((t) => ({ id: t.id, label: t.label, icon: t.icon }))} value={type} onPick={chooseType} />
          </Card>
        </Section>
      )}

      <Section title="What Focus does here">
        <Card>
          {info.behaviours.map((b) => {
            const on = does({ type, off: extra.off }, b);
            return (
              <View key={b} style={{ gap: space[2], paddingVertical: space[2], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }}>
                <Toggle label={sentence(b, { ...view, trips, gymTask })} value={on} onChange={(v) => toggle(b, v)} />
                {on ? <BehaviourSetup b={b} place={{ ...(existing ?? ({} as GeoPlace)), ...extra, type }} state={state} onPatch={patch} /> : null}
              </View>
            );
          })}
          {type === 'home' && <T v="body">Focus notes when you get in and head out. Nothing pops up at home.</T>}
          <T v="caption" muted>{LOG_LINE}</T>
        </Card>
      </Section>

      {existing && !changing && does({ type, off: extra.off }, 'linked-tasks') && (
        <Section title="Tasks linked here">
          <LinkedTasksHere place={existing} state={state} links={geo.links} />
        </Section>
      )}

      {existing && !changing && does({ type, off: extra.off }, 'reminders') && (
        <Section title="Reminders for here">
          <Card>
            {reminders.map((r) => (
              <View key={r.id} style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-start', paddingVertical: space[2], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }}>
                <Check on={!!r.doneAt} onPress={() => setReminderDone(r.id, !r.doneAt).catch(() => {})} label={r.text} />
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong" style={r.doneAt ? { opacity: 0.5 } : undefined}>{r.text}</T>
                  <T v="caption" muted>{r.doneAt ? 'Done' : `${reminderLine(r)}${r.every ? '' : ' · once'}`}</T>
                </View>
                <Pressable onPress={() => deleteReminder(r.id).catch(() => {})} accessibilityRole="button" accessibilityLabel={`Delete ${r.text}`} hitSlop={8} style={{ padding: space[1] }}>
                  <Icon name="x" size={18} color={c.inkMuted} />
                </Pressable>
              </View>
            ))}
            <Field value={newRem} onChangeText={setNewRem} placeholder="Add a reminder for here" accessibilityLabel="New reminder for this place" onSubmitEditing={addRem} returnKeyType="done" />
            {newRem.trim() ? (
              <>
                <Chips label="When" options={[{ id: 'arrive' as const, label: 'When I arrive' }, { id: 'leave' as const, label: 'When I leave' }]} value={remWhen} onPick={setRemWhen} />
                <Chips label="How often" options={[{ id: 'once' as const, label: 'Once' }, { id: 'every' as const, label: 'Every time' }]} value={remEvery} onPick={setRemEvery} />
                <Button kind="soft" label="Add it" onPress={addRem} />
              </>
            ) : (
              <T v="caption" muted>{`Or just say it anywhere: "I need to … at ${existing.name}".`}</T>
            )}
          </Card>
        </Section>
      )}

      {changing ? (
        <>
          <Button label="Save" onPress={save} disabled={!pin || !name.trim()} />
          {existing && (
            <Button
              kind="quiet"
              label="Cancel"
              onPress={() => {
                setName(existing.name);
                setType(existing.type);
                setPin({ lat: existing.lat, lon: existing.lon, address: existing.address });
                setRadius(existing.radiusM);
                setChanging(false);
              }}
            />
          )}
        </>
      ) : (
        <Button kind="quiet" label="Change the address, type or circle" onPress={() => setChanging(true)} />
      )}
      {existing && <Button kind="caution" label="Delete this place" onPress={remove} />}
    </Screen>
  );
}
