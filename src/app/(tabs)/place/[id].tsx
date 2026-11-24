// One place: find it by address (suggestions as you type), check the pin and circle, say what happens.
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { Field } from '../../../components/Account';
import { Icon } from '../../../components/Icon';
import { MapPreview } from '../../../components/MapPreview';
import { Button, Card, Check, Header, Screen, Section, T } from '../../../components/ui';
import { defaultRadius, defaultRules, type GeoPlace, PLACE_TYPES, type PlaceRule, type PlaceType } from '../../../lib/geo';
import { setPlaces, useGeo } from '../../../lib/geoStore';
import { hereNow } from '../../../lib/location';
import { type AddressHit, searchAddress } from '../../../lib/placeSearch';
import { useStore } from '../../../lib/store';
import { radius, space, useColors } from '../../../theme';

const newId = () => `place-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const RULES: { rule: PlaceRule; label: string }[] = [
  { rule: { when: 'leave', action: 'remind-shopping' }, label: "When I leave: tell me what's on the shopping list" },
  { rule: { when: 'arrive', action: 'offer-shopping-list' }, label: 'When I arrive: offer my shopping list' },
];
const same = (a: PlaceRule, b: PlaceRule) => a.when === b.when && a.action === b.action;

export default function PlaceEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const geo = useGeo();
  const { state } = useStore();
  const c = useColors();
  const existing = geo.places.find((p) => p.id === id);
  const firstPlace = !existing && geo.places.length === 0;

  const [name, setName] = useState(existing?.name ?? (firstPlace ? 'Home' : ''));
  const [type, setType] = useState<PlaceType>(existing?.type ?? (firstPlace ? 'home' : 'other'));
  const [pin, setPin] = useState<{ lat: number; lon: number; address?: string } | null>(existing ? { lat: existing.lat, lon: existing.lon, address: existing.address } : null);
  const [radiusM, setRadius] = useState(existing?.radiusM ?? defaultRadius(type));
  const [rules, setRules] = useState<PlaceRule[]>(existing?.rules ?? defaultRules(type));
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<AddressHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [mapWidth, setMapWidth] = useState(0);
  const touchedRules = useRef(!!existing);
  const touchedRadius = useRef(!!existing);

  // Suggestions as you type, once there are 3 letters, after a short pause.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return; // typeQuery clears the suggestions
    let live = true;
    const t = setTimeout(async () => {
      setSearching(true);
      const r = await searchAddress(q, state.settings.weatherPlace);
      if (!live) return;
      setSearching(false);
      if ('error' in r) {
        setProblem(r.error);
        setHits([]);
      } else {
        setProblem(null);
        setHits(r.results);
      }
    }, 450);
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
    }
  };

  const chooseType = (t: PlaceType) => {
    setType(t);
    if (!touchedRadius.current) setRadius(defaultRadius(t));
    if (!touchedRules.current) setRules(defaultRules(t));
  };

  const pick = (h: AddressHit) => {
    setPin({ lat: h.lat, lon: h.lon, address: h.address });
    if (!name.trim()) setName(h.name);
    setQuery('');
    setHits([]);
  };

  const useHere = async () => {
    setProblem(null);
    const here = await hereNow();
    if (!here) setProblem("Couldn't find where you are. Check location is allowed for Focus.");
    else setPin({ lat: here.lat, lon: here.lon, address: 'Where you were standing' });
  };

  const save = async () => {
    if (!pin || !name.trim()) return;
    const place: GeoPlace = { id: existing?.id ?? newId(), name: name.trim(), type, lat: pin.lat, lon: pin.lon, radiusM, address: pin.address, rules };
    await setPlaces(existing ? geo.places.map((p) => (p.id === place.id ? place : p)) : [...geo.places, place]);
    router.navigate('/places');
  };

  const remove = () =>
    Alert.alert(`Delete ${existing?.name}?`, 'Focus stops noticing this place. Past entries stay in the log.', [
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

  const toggleRule = (r: PlaceRule) => {
    touchedRules.current = true;
    setRules((now) => (now.some((x) => same(x, r)) ? now.filter((x) => !same(x, r)) : [...now, r]));
  };
  const nudgeRadius = (by: number) => {
    touchedRadius.current = true;
    setRadius((r) => Math.min(1000, Math.max(50, r + by)));
  };

  return (
    <Screen>
      <Header title={existing ? existing.name : 'Add a place'} kicker="PLACES" fallback="/places" />

      <Section title="Find it">
        <Card>
          <Field value={query} onChangeText={typeQuery} placeholder="Type an address, a postcode or a shop" autoCorrect={false} accessibilityLabel="Search for an address" />
          {searching && <ActivityIndicator color={c.primary} />}
          {hits.map((h, i) => (
            <Pressable
              key={`${h.lat},${h.lon},${i}`}
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
          <Button kind="quiet" small label="Use where I am now" onPress={useHere} />
          {problem && <T v="caption" color={c.cautionInk}>{problem}</T>}
        </Card>
      </Section>

      {pin && (
        <Section title="Check the pin">
          <Card>
            <View onLayout={(e) => setMapWidth(e.nativeEvent.layout.width)}>
              <MapPreview lat={pin.lat} lon={pin.lon} radiusM={radiusM} width={mapWidth} />
            </View>
            {pin.address ? <T v="caption" muted>{pin.address}</T> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
              <T v="body" style={{ flex: 1 }}>{`Circle: ${radiusM} m`}</T>
              <Button kind="soft" small label="Smaller" onPress={() => nudgeRadius(-25)} />
              <Button kind="soft" small label="Bigger" onPress={() => nudgeRadius(25)} />
            </View>
            <T v="caption" muted>Not quite right? Search again, or stand there and tap Use where I am now.</T>
          </Card>
        </Section>
      )}

      <Section title="Name and kind">
        <Card>
          <Field value={name} onChangeText={setName} placeholder="Name, like Home or Sainsbury's" accessibilityLabel="Place name" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }} accessibilityRole="radiogroup">
            {PLACE_TYPES.map((t) => {
              const on = type === t.id;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => chooseType(t.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={t.label}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space[1],
                    minHeight: 40,
                    paddingHorizontal: space[3],
                    borderRadius: radius.pill,
                    backgroundColor: on ? c.primary : 'transparent',
                    borderWidth: on ? 0 : 1,
                    borderColor: c.outline,
                  }}
                >
                  <Icon name={t.icon} size={16} color={on ? c.onPrimary : c.ink} />
                  <T v="label" color={on ? c.onPrimary : c.ink}>{t.label}</T>
                </Pressable>
              );
            })}
          </View>
        </Card>
      </Section>

      <Section title="What happens here">
        <Card>
          {RULES.map(({ rule, label }) => (
            <View key={`${rule.when}-${rule.action}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 48 }}>
              <Check on={rules.some((r) => same(r, rule))} onPress={() => toggleRule(rule)} label={label} />
              <T v="body" style={{ flex: 1 }}>{label}</T>
            </View>
          ))}
          <T v="caption" muted>Arrivals and departures are always kept in the Places log.</T>
        </Card>
      </Section>

      <Button label="Save" onPress={save} disabled={!pin || !name.trim()} />
      {existing && <Button kind="caution" label="Delete this place" onPress={remove} />}
    </Screen>
  );
}
