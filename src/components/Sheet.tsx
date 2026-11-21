// A simple bottom sheet of choices. Android's Alert only shows three buttons,
// so anything with more choices (moving to a space, travel times) goes here.
// tone "dash" is the tablet's dark Dash style: bigger, readable from across the room.
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, radius, space, useColors } from '../lib/theme';
import { D } from './dashPalette';
import { Icon } from './Icon';
import { T } from './ui';

export type SheetOption = { label: string; icon?: string; destructive?: boolean; onPress: () => void };
type SheetSpec = { title: string; message?: string; options: SheetOption[]; tone?: 'dash' };

let show: ((s: SheetSpec) => void) | null = null;

/** Open the sheet from anywhere. */
export function showSheet(spec: SheetSpec) {
  show?.(spec);
}

export function SheetHost() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [spec, setSpec] = useState<SheetSpec | null>(null);
  useEffect(() => {
    show = setSpec;
    return () => {
      show = null;
    };
  }, []);
  const close = () => setSpec(null);
  const dash = spec?.tone === 'dash';
  const ink = dash ? D.ink : c.ink;
  const muted = dash ? D.muted : c.inkMuted;
  return (
    <Modal visible={!!spec} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: dash ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.45)' }} onPress={close} accessibilityLabel="Close" />
      {spec && (
        <View
          style={{
            backgroundColor: dash ? D.tile : c.surfaceRaised,
            borderTopLeftRadius: dash ? 28 : radius.lg,
            borderTopRightRadius: dash ? 28 : radius.lg,
            borderWidth: dash ? 1 : 0,
            borderColor: D.line,
            paddingTop: dash ? 28 : space[4],
            paddingHorizontal: dash ? 36 : space[4],
            paddingBottom: insets.bottom + (dash ? 24 : space[4]),
            maxHeight: '75%',
            gap: dash ? 12 : space[2],
          }}
        >
          {dash ? (
            <>
              <Text style={{ color: ink, fontFamily: font.display, fontSize: 32, lineHeight: 38 }}>{spec.title}</Text>
              {spec.message ? <Text style={{ color: muted, fontFamily: font.body, fontSize: 20, lineHeight: 26 }}>{spec.message}</Text> : null}
            </>
          ) : (
            <>
              <T v="heading">{spec.title}</T>
              {spec.message ? <T v="body" muted>{spec.message}</T> : null}
            </>
          )}
          <ScrollView>
            {spec.options.map((o, i) => (
              <Pressable
                key={o.label + i}
                accessibilityRole="button"
                onPress={() => {
                  close();
                  o.onPress();
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: dash ? 16 : space[3],
                  minHeight: dash ? 72 : 52,
                  borderTopWidth: i ? (dash ? 1 : StyleSheet.hairlineWidth) : 0,
                  borderTopColor: dash ? D.line : c.line,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                {o.icon ? <Icon name={o.icon} size={dash ? 28 : 20} color={o.destructive ? c.caution : dash ? D.teal : c.inkMuted} /> : null}
                {dash ? (
                  <Text style={{ color: o.destructive ? c.caution : ink, fontFamily: font.bodyStrong, fontSize: 24 }}>{o.label}</Text>
                ) : (
                  <T v="body" color={o.destructive ? c.caution : c.ink}>{o.label}</T>
                )}
              </Pressable>
            ))}
          </ScrollView>
          <Pressable onPress={close} style={{ minHeight: dash ? 64 : 48, alignItems: 'center', justifyContent: 'center' }}>
            {dash ? <Text style={{ color: D.teal, fontFamily: font.bodyStrong, fontSize: 20 }}>Cancel</Text> : <T v="label" color={c.primary}>Cancel</T>}
          </Pressable>
        </View>
      )}
    </Modal>
  );
}
