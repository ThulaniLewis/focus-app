import { isTabletDevice } from '../../lib/device';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { Button, Card, Chip, IconButton, Screen, T } from '../../components/ui';
import { useStore } from '../../lib/store';
import { font, radius, space, useColors } from '../../lib/theme';
import type { Space } from '../../lib/types';
import { openIn } from '../../lib/views';

const KIND_HINT: Record<Space['kind'], string> = {
  general: 'Things to do',
  home: 'Rooms, upstairs and down',
  shopping: 'Food in aisle order, plus other bits',
  private: 'Notes only, no to-dos',
};

export default function Spaces() {
  const { state } = useStore();
  const [editing, setEditing] = useState(false);
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T v="title">Spaces</T>
        <IconButton
          name={editing ? 'check' : 'edit-2'}
          label={editing ? 'Done editing spaces' : 'Edit spaces'}
          tone={editing ? 'primary' : 'soft'}
          onPress={() => setEditing(!editing)}
        />
      </View>
      <T v="body" muted>
        {editing ? 'Rename, add or remove spaces. Nothing is lost if you rename one.' : 'Everything you dump lands in one of these.'}
      </T>
      {/* The tablet is a shared screen: phone-only spaces don't show on it at all. */}
      {state.spaces
        .filter((sp) => !isTabletDevice() || sp.privacy === 'everywhere')
        .map((sp) => (editing ? <EditRow key={sp.id} sp={sp} /> : <SpaceRow key={sp.id} sp={sp} />))}
      {editing && <AddSpace />}
    </Screen>
  );
}

function SpaceRow({ sp }: { sp: Space }) {
  const { state } = useStore();
  const c = useColors();
  const open = openIn(state, sp).length;
  const label = sp.kind === 'private' ? `${open} note${open === 1 ? '' : 's'}` : sp.kind === 'shopping' ? `${open} to get` : `${open} open`;
  return (
    <Pressable onPress={() => router.navigate(`/space/${sp.id}`)}>
      {({ pressed }) => (
        <Card tone={sp.kind === 'private' ? 'sunken' : 'surface'} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], opacity: pressed ? 0.8 : 1 }}>
          <View style={{ width: 44, height: 44, borderRadius: radius.sm, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={sp.icon} color={c.primaryStrong} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="heading">{sp.name}</T>
            <T v="caption" muted>{KIND_HINT[sp.kind]}</T>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <T v="label" muted>{label}</T>
            {sp.privacy === 'phone' ? <Chip tone="private" label="Phone only" /> : null}
          </View>
          <Icon name="chevron-right" color={c.inkMuted} />
        </Card>
      )}
    </Pressable>
  );
}

function EditRow({ sp }: { sp: Space }) {
  const { state, updateSpace, deleteSpace } = useStore();
  const c = useColors();
  const [name, setName] = useState(sp.name);
  const open = openIn(state, sp).length;
  const commit = () => name.trim() && name.trim() !== sp.name && updateSpace(sp.id, { name: name.trim() });
  const del = () =>
    Alert.alert(`Remove ${sp.name}?`, open ? `${open} open thing${open === 1 ? '' : 's'} in here will move to "No space" so nothing is lost.` : 'It is empty.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deleteSpace(sp.id) },
    ]);
  return (
    <Card style={{ gap: space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <Icon name={sp.icon} color={c.primary} />
        <TextInput
          value={name}
          onChangeText={setName}
          onBlur={commit}
          onSubmitEditing={commit}
          accessibilityLabel={`Name for ${sp.name}`}
          style={{ flex: 1, fontFamily: font.bodyStrong, fontSize: 17, color: c.ink, backgroundColor: c.surfaceSunken, borderRadius: radius.sm, paddingHorizontal: space[3], minHeight: 46 }}
        />
        {sp.kind === 'general' ? <IconButton name="trash-2" label={`Remove ${sp.name}`} tone="quiet" onPress={del} /> : null}
      </View>
      {sp.kind === 'private' ? (
        <T v="caption" muted>Always phone only. Never shown on a tablet or read aloud.</T>
      ) : (
        <Pressable
          onPress={() => updateSpace(sp.id, { privacy: sp.privacy === 'phone' ? 'everywhere' : 'phone' })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 40 }}
          accessibilityRole="switch"
          accessibilityState={{ checked: sp.privacy === 'phone' }}
        >
          <Icon name={sp.privacy === 'phone' ? 'lock' : 'unlock'} size={18} color={sp.privacy === 'phone' ? c.primary : c.inkMuted} />
          <T v="label" muted style={{ flex: 1 }}>
            {sp.privacy === 'phone' ? 'Phone only. Tap to show on tablets too' : 'Shows on tablets too. Tap to keep on phone only'}
          </T>
        </Pressable>
      )}
    </Card>
  );
}

function AddSpace() {
  const { addSpace } = useStore();
  const c = useColors();
  const [name, setName] = useState('');
  const add = () => {
    if (!name.trim()) return;
    addSpace(name);
    setName('');
  };
  return (
    <Card tone="soft" style={{ gap: space[3] }}>
      <T v="bodyStrong">New space</T>
      <TextInput
        value={name}
        onChangeText={setName}
        onSubmitEditing={add}
        placeholder="e.g. Work, Allotment, Garden"
        placeholderTextColor={c.inkMuted}
        style={{ fontFamily: font.body, fontSize: 17, color: c.ink, backgroundColor: c.surface, borderRadius: radius.sm, paddingHorizontal: space[3], minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line }}
      />
      <Button label="Add space" onPress={add} disabled={!name.trim()} />
    </Card>
  );
}
