// The text box and mic controls shared by "Talk it through" and "Note for Claude".
import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { useDictation } from '../lib/useDictation';
import { font, radius, space, useColors } from '../theme';
import { Icon } from './Icon';
import { IconButton, T } from './ui';

export function DictationBox({ d, placeholder, doneLabel = 'Done talking, keep it' }: { d: ReturnType<typeof useDictation>; placeholder: string; doneLabel?: string }) {
  const c = useColors();
  return (
    <>
      <TextInput
        value={d.shown}
        onChangeText={(t) => !d.listening && d.setText(t)}
        editable={!d.listening}
        multiline
        placeholder={placeholder}
        placeholderTextColor={c.inkMuted}
        textAlignVertical="top"
        style={{
          minHeight: 180,
          backgroundColor: c.surface,
          borderRadius: radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: d.listening ? c.primary : c.line,
          padding: space[4],
          color: c.ink,
          fontFamily: font.body,
          fontSize: 18,
          lineHeight: 26,
        }}
      />
      {d.listening ? (
        <View style={{ backgroundColor: c.surface, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', padding: space[2], gap: space[2], borderWidth: StyleSheet.hairlineWidth, borderColor: c.line }}>
          <IconButton name="x" label="Cancel, throw away what I just said" tone="quiet" onPress={d.cancel} size={48} />
          <View style={{ flex: 1, height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
            {d.levels.map((l, i) => (
              <View key={i} style={{ width: 4, borderRadius: 2, height: 4 + l * 36, backgroundColor: c.primary, opacity: 0.4 + l * 0.6 }} />
            ))}
          </View>
          <IconButton name="check" label={doneLabel} tone="primary" onPress={d.keep} size={48} />
        </View>
      ) : (
        <View style={{ alignItems: 'center', gap: space[2] }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start talking"
            onPress={d.start}
            style={({ pressed }) => ({ width: 84, height: 84, borderRadius: 42, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
          >
            <Icon name="mic" size={34} color={c.onPrimary} />
          </Pressable>
          <T v="caption" muted>{d.text ? 'Tap to add more' : 'Tap to talk'}</T>
        </View>
      )}
    </>
  );
}
