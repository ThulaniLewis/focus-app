import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { AccountCard, Field } from '../../components/Account';
import { Button, Card, Header, Screen, Section, T } from '../../components/ui';
import { calendarAllowed, writeCalendarName } from '../../lib/calendar';
import { FEATURES, featureOn, switchFeature } from '../../lib/features';
import { LOOKS } from '../../lib/look';
import type { Floor, Room } from '../../lib/types';
import { useStore } from '../../lib/store';
import { font, radius, space, useColors } from '../../theme';
import { estimateRatio, isValidHHMM, slug } from '../../lib/time';


function NumberRow({ label, value, onSave, suffix = 'min' }: { label: string; value: number; onSave: (n: number) => void; suffix?: string }) {
  const [v, setV] = useState(String(value));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
      <T v="body" style={{ flex: 1 }}>{label}</T>
      <Field
        value={v}
        onChangeText={setV}
        keyboardType="number-pad"
        style={{ width: 72, textAlign: 'center' }}
        onEndEditing={() => {
          const n = parseInt(v, 10);
          if (Number.isFinite(n) && n >= 0 && n <= 600) onSave(n);
          else setV(String(value));
        }}
      />
      <T v="body" muted style={{ width: 32 }}>{suffix}</T>
    </View>
  );
}

export default function Settings() {
  const { state, updateSettings, setTravel, setRooms } = useStore();
  const c = useColors();
  const s = state.settings;
  const [dayEnd, setDayEnd] = useState(s.dayEnd);
  const [placeName, setPlaceName] = useState('');
  const [placeMin, setPlaceMin] = useState('');
  const [roomNew, setRoomNew] = useState('');
  const [firstName, setFirstName] = useState(s.firstName);
  const [away, setAway] = useState(s.awayWords.join(', '));
  const [calName, setCalName] = useState<string | null>(null);
  useEffect(() => {
    writeCalendarName().then(setCalName);
  }, [s.writeCalendar, s.readCalendar]);
  const ratio = estimateRatio(state.tasks);
  const timed = state.tasks.filter((t) => t.done && t.actualMin && t.estimateMin).length;

  const row = { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line, paddingVertical: space[2] };

  return (
    <Screen>
      <Header title="Settings" />

      <Section title="Look">
        <Card>
          <T v="bodyStrong">Light or dark</T>
          <View style={{ flexDirection: 'row', gap: space[2] }} accessibilityRole="radiogroup">
            {LOOKS.map((l) => {
              const on = (s.look ?? 'match') === l.id;
              return (
                <Pressable
                  key={l.id}
                  onPress={() => updateSettings({ look: l.id })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={l.label}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    borderRadius: radius.sm,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: on ? c.primary : 'transparent',
                    borderWidth: on ? 0 : 1,
                    borderColor: c.outline,
                  }}
                >
                  <T v="label" color={on ? c.onPrimary : c.ink}>{l.label}</T>
                </Pressable>
              );
            })}
          </View>
          <T v="caption" muted>Match phone goes dark from wind down.</T>
        </Card>
      </Section>

      <Section title="Account">
        <AccountCard />
      </Section>

      <Section title="You">
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <T v="body" style={{ flex: 1 }}>What Focus calls you</T>
            <Field value={firstName} onChangeText={setFirstName} style={{ width: 150 }} onEndEditing={() => updateSettings({ firstName: firstName.trim() })} />
          </View>
        </Card>
      </Section>

      <Section title="Diary">
        <Card>
          <Toggle label="Show my phone calendar in Focus" value={s.readCalendar} onChange={async (v) => { if (v) await calendarAllowed(true); updateSettings({ readCalendar: v }); }} />
          <Toggle label="Put dated things in my calendar" value={s.writeCalendar} onChange={async (v) => { if (v) await calendarAllowed(true); updateSettings({ writeCalendar: v }); }} />
          <T v="caption" muted>
            {s.writeCalendar ? (calName ? `Adding to: ${calName}` : 'Allow calendar access to choose where things go.') : 'Dated things stay in Focus only.'}
          </T>
          <View style={{ gap: space[2], paddingTop: space[2] }}>
            <T v="body">Sav is with her dad when a Saturday diary entry says</T>
            <Field
              value={away}
              onChangeText={setAway}
              placeholder="dad, Niall"
              autoCapitalize="none"
              onEndEditing={() => updateSettings({ awayWords: away.split(',').map((w) => w.trim()).filter(Boolean) })}
            />
            <T v="caption" muted>Separate words with commas. A diary entry always wins over the pattern.</T>
          </View>
          <Toggle
            label="Sav's with her dad every other Saturday"
            value={!!s.savPattern}
            onChange={(v) => updateSettings({ savPattern: v ? { anchor: '2026-11-21', weeks: 2 } : null })}
          />
          {s.savPattern ? <T v="caption" muted>Counting from Saturday 21 November.</T> : null}
        </Card>
      </Section>

      <Section title="Time">
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <T v="body" style={{ flex: 1 }}>Day ends at</T>
            <Field
              value={dayEnd}
              onChangeText={setDayEnd}
              style={{ width: 88, textAlign: 'center' }}
              placeholder="21:30"
              onEndEditing={() => (isValidHHMM(dayEnd) ? updateSettings({ dayEnd }) : setDayEnd(s.dayEnd))}
            />
            <View style={{ width: 32 }} />
          </View>
          <NumberRow label="Getting ready (wake to out the door)" value={s.readyMin} onSave={(readyMin) => updateSettings({ readyMin })} />
          <NumberRow label="Buffer before leaving" value={s.bufferMin} onSave={(bufferMin) => updateSettings({ bufferMin })} />
          <T v="caption" muted>
            Leave-by = start time minus travel minus buffer. Wake-by = first leave-by minus getting ready.
          </T>
        </Card>
      </Section>

      <Section title="Places" hint="door to door">
        <Card>
          {s.places.map((p) => (
            <View key={p.id} style={[row, { flexDirection: 'row', alignItems: 'center', gap: space[3] }]}>
              <T v="body" style={{ flex: 1 }}>{p.name}</T>
              <NumberRowInline value={p.travelMin} onSave={(m) => setTravel(p.name, m)} />
              <Button small kind="quiet" label="Remove" onPress={() => updateSettings({ places: s.places.filter((x) => x.id !== p.id) })} />
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            <Field value={placeName} onChangeText={setPlaceName} placeholder="Place" style={{ flex: 1 }} />
            <Field value={placeMin} onChangeText={setPlaceMin} placeholder="min" keyboardType="number-pad" style={{ width: 64, textAlign: 'center' }} />
            <Button
              small
              label="Add"
              disabled={!placeName.trim() || !(parseInt(placeMin, 10) > 0)}
              onPress={() => { setTravel(placeName, parseInt(placeMin, 10)); setPlaceName(''); setPlaceMin(''); }}
            />
          </View>
        </Card>
      </Section>

      <Section title="Rooms" hint="tap the floor to change it">
        <Card>
          {s.rooms.map((r, i) => (
            <View key={r.name} style={[row, { flexDirection: 'row', alignItems: 'center', gap: space[2] }]}>
              <T v="body" style={{ flex: 1 }}>{r.name}</T>
              <Pressable
                onPress={() => setRooms(s.rooms.map((x, j) => (j === i ? { ...x, floor: nextFloor(x.floor) } : x)))}
                style={{ minHeight: 40, minWidth: 104, borderRadius: radius.pill, backgroundColor: c.surfaceSunken, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[3] }}
                accessibilityRole="button"
                accessibilityLabel={`${r.name} is ${floorLabel(r.floor)}. Tap to change`}
              >
                <T v="label" muted>{floorLabel(r.floor)}</T>
              </Pressable>
              <Pressable
                hitSlop={8}
                accessibilityLabel={`Remove ${r.name}`}
                style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
                onPress={() =>
                  Alert.alert(`Remove ${r.name}?`, 'Tasks in it keep their room tag.', [
                    { text: 'Keep', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: () => setRooms(s.rooms.filter((_, j) => j !== i)) },
                  ])
                }
              >
                <Icon name="x" size={18} color={c.inkMuted} />
              </Pressable>
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            <Field value={roomNew} onChangeText={setRoomNew} placeholder="New room" style={{ flex: 1 }} />
            <Button
              small
              label="Add"
              disabled={!roomNew.trim() || s.rooms.some((r) => slug(r.name) === slug(roomNew))}
              onPress={() => { setRooms([...s.rooms, { name: roomNew.trim(), floor: '' }]); setRoomNew(''); }}
            />
          </View>
        </Card>
      </Section>

      <Section title="How long things really take">
        <Card tone="sunken">
          <T v="body">
            {ratio
              ? `Across your last ${Math.min(timed, 20)} timed tasks, things take about ${ratio.toFixed(1)}× the estimate. Focus shows the realistic time next to each estimate.`
              : `Time ${3 - Math.min(timed, 3)} more task${3 - timed === 1 ? '' : 's'} with an estimate and Focus will start showing how long things really take you.`}
          </T>
        </Card>
      </Section>

      <Section title="Focus notes" hint={`${state.notes.length}`}>
        {state.notes.length ? (
          <Card>
            {state.notes.map((n) => (
              <View key={n.id} style={row}>
                <T v="body">{n.text}</T>
                <T v="caption" muted>{new Date(n.createdAt).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</T>
              </View>
            ))}
          </Card>
        ) : (
          <T v="body" muted>Say "Focus note: …" in a dump and your test week feedback collects here.</T>
        )}
      </Section>

      <Section title="Features" hint="on this device">
        <Card>
          {FEATURES.map((f) => (
            <View key={f.id} style={{ gap: space[1] }}>
              <Toggle
                label={f.name}
                value={featureOn(s, f.id)}
                onChange={(v) =>
                  updateSettings({
                    ...switchFeature(s, f.id, v),
                    // Switched off: drop questions already waiting, so nothing old pops up when it comes back on.
                    ...(f.id === 'punctuality' && !v ? { punctualityAsk: [] } : {}),
                  })
                }
              />
              <T v="caption" muted>{f.about}</T>
            </View>
          ))}
          <T v="caption" muted>{"Turning one off hides it; nothing you've saved is deleted."}</T>
        </Card>
      </Section>

      <Section title="NFC sticker addresses">
        <NfcAddresses rooms={s.rooms} />
      </Section>
    </Screen>
  );
}

const nextFloor = (f: Floor): Floor => (f === 'up' ? 'down' : f === 'down' ? '' : 'up');
const floorLabel = (f: Floor) => (f === 'up' ? 'Upstairs' : f === 'down' ? 'Downstairs' : 'Either / other');

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  // Drawn by hand rather than React Native's Switch, which crashed this screen on the phone.
  const c = useColors();
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 48 }}
    >
      <T v="body" style={{ flex: 1 }}>{label}</T>
      <View style={{ width: 48, height: 28, borderRadius: 14, padding: 3, backgroundColor: value ? c.primary : c.line, alignItems: value ? 'flex-end' : 'flex-start' }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: value ? c.onPrimary : c.inkMuted }} />
      </View>
    </Pressable>
  );
}

function NumberRowInline({ value, onSave }: { value: number; onSave: (n: number) => void }) {
  const [v, setV] = useState(String(value));
  return (
    <Field
      value={v}
      onChangeText={setV}
      keyboardType="number-pad"
      style={{ width: 60, textAlign: 'center' }}
      onEndEditing={() => {
        const n = parseInt(v, 10);
        if (n > 0 && n <= 300) onSave(n);
        else setV(String(value));
      }}
    />
  );
}


function NfcAddresses({ rooms }: { rooms: Room[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Card tone="sunken">
      {open ? (
        <>
          <T v="body" muted>In NFC Tools: Write, Add a record, Custom URL / URI. One address per sticker.</T>
          {rooms.map((r) => (
            <T key={r.name} v="label" selectable>
              {r.name}: focus://room/{slug(r.name)}
            </T>
          ))}
          <Button small kind="quiet" label="Hide" onPress={() => setOpen(false)} style={{ alignSelf: 'flex-start' }} />
        </>
      ) : (
        <Button small kind="soft" label="Show addresses" onPress={() => setOpen(true)} style={{ alignSelf: 'flex-start' }} />
      )}
    </Card>
  );
}
