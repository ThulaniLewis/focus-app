import React, { createContext, useContext, useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextProps,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../lib/store';
import { radius, space, type, useColors } from '../theme';
import { router } from 'expo-router';
import { ClockBar, type ClockNote } from './ClockBar';
import { Icon } from './Icon';
import { claimHighlight, useHighlighted } from '../lib/highlight';

/** The screen's scroll view, so a flashed row can scroll itself into view. */
const ScrollCtx = createContext<React.RefObject<any> | null>(null);

type Variant = 'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'label' | 'caption';

// Straight from the theme's type scale (docs/design/focus-tokens.json).
const variants: Record<Variant, TextStyle> = {
  display: type.display,
  title: type.title,
  heading: type.heading,
  body: type.body,
  bodyStrong: type.bodyStrong,
  label: type.label,
  caption: type.caption,
};

export function T({ v = 'body', muted, color, style, ...rest }: TextProps & { v?: Variant; muted?: boolean; color?: string }) {
  const c = useColors();
  return <Text {...rest} style={[variants[v], { color: color ?? (muted ? c.inkMuted : c.ink) }, style]} />;
}

export function Screen({ children, clock = true, clockNote }: { children: React.ReactNode; clock?: boolean; clockNote?: ClockNote | null }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const scroll = useRef<any>(null);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      {clock && <ClockBar note={clockNote} />}
      <ScrollCtx.Provider value={scroll}>
      <ScrollView
        ref={scroll}
        contentContainerStyle={{ padding: space[5], paddingBottom: space[8] * 3, gap: space[4] }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      </ScrollCtx.Provider>
      <UndoBar />
    </View>
  );
}

/**
 * Wraps a job's row. When a notification for that job is tapped, the row scrolls into view and
 * flashes twice, like Samsung Settings search.
 */
export function Flash({ id, children }: { id: string; children: React.ReactNode }) {
  const c = useColors();
  const on = useHighlighted(id);
  const scroll = useContext(ScrollCtx);
  const ref = useRef<any>(null);
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!on) return;
    claimHighlight(id);
    const t = setTimeout(() => {
      try {
        const inner = (scroll?.current as any)?.getInnerViewRef?.();
        if (inner && ref.current)
          ref.current.measureLayout(inner, (_x: number, y: number) => scroll?.current?.scrollTo({ y: Math.max(0, y - 140), animated: true }), () => {});
      } catch {
        // Scrolling is a nicety; the flash still shows.
      }
    }, 250);
    const pulse = () =>
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.15, duration: 320, useNativeDriver: true }),
      ]);
    Animated.sequence([Animated.delay(450), pulse(), pulse(), Animated.timing(anim, { toValue: 0, duration: 600, useNativeDriver: true })]).start();
    return () => clearTimeout(t);
  }, [on]);
  return (
    <View ref={ref} collapsable={false}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.primarySoft, borderRadius: radius.sm, opacity: anim, marginHorizontal: -space[2] }]} />
      {children}
    </View>
  );
}

export function Card({ children, tone = 'surface', style }: { children: React.ReactNode; tone?: 'surface' | 'primary' | 'nudge' | 'soft' | 'sunken'; style?: ViewStyle }) {
  const c = useColors();
  const bg = { surface: c.surface, primary: c.primary, nudge: c.nudgeSoft, soft: c.primarySoft, sunken: c.surfaceSunken }[tone];
  return (
    <View style={[{ backgroundColor: bg, borderRadius: radius.md, padding: space[4], gap: space[2] }, tone === 'surface' && { borderWidth: StyleSheet.hairlineWidth, borderColor: c.line }, style]}>
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
  small,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'soft' | 'quiet' | 'caution' | 'outline';
  disabled?: boolean;
  small?: boolean;
  style?: ViewStyle;
}) {
  const c = useColors();
  const bg = { primary: c.primary, soft: c.primarySoft, quiet: 'transparent', caution: c.cautionSoft, outline: 'transparent' }[kind];
  const fg = { primary: c.onPrimary, soft: c.primaryStrong, quiet: c.primary, caution: c.cautionInk, outline: c.ink }[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          minHeight: small ? 40 : 52,
          paddingHorizontal: small ? space[3] : space[5],
          borderRadius: small ? radius.pill : radius.sm,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
        kind === 'outline' && { borderWidth: 1, borderColor: c.outline },
        style,
      ]}
    >
      <T v={small ? 'label' : 'bodyStrong'} color={fg}>
        {label}
      </T>
    </Pressable>
  );
}

export function Chip({ label, tone = 'soft' }: { label: string; tone?: 'soft' | 'nudge' | 'plain' | 'private' }) {
  const c = useColors();
  const bg = { soft: c.primarySoft, nudge: c.nudgeSoft, plain: c.surfaceSunken, private: c.ink }[tone];
  const fg = { soft: c.primaryStrong, nudge: c.nudgeInk, plain: c.inkMuted, private: c.bg }[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
      <T v="caption" color={fg}>
        {label}
      </T>
    </View>
  );
}

export function Check({ on, onPress, label }: { on: boolean; onPress: () => void; label: string }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={12}
      style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: on ? c.primary : c.inkMuted,
        backgroundColor: on ? c.primary : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {on && <T v="label" color={c.onPrimary}>✓</T>}
    </Pressable>
  );
}

export function Section({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <View style={{ gap: space[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <T v="heading">{title}</T>
        {hint ? <T v="caption" muted>{hint}</T> : null}
      </View>
      {children}
    </View>
  );
}

export function UndoBar() {
  const { canUndo, undoRev, undo } = useStore();
  const c = useColors();
  const [shownFor, setShownFor] = React.useState<string | null>(null);
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    if (!canUndo) return setVisible(false);
    setShownFor(canUndo);
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 6000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoRev]);
  if (!visible || !shownFor) return null;
  return (
    <View
      style={{
        position: 'absolute',
        left: space[5],
        right: space[5],
        bottom: space[4],
        backgroundColor: c.surfaceRaised,
        borderRadius: radius.pill,
        paddingLeft: space[5],
        paddingRight: space[2],
        paddingVertical: space[1],
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        elevation: 4,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.line,
      }}
    >
      <T v="label">{shownFor}</T>
      <Button small kind="quiet" label="Undo" onPress={() => { undo(); setVisible(false); }} />
    </View>
  );
}

/** Back arrow. Goes back, or to `fallback` when there is nowhere to go back to (opened from a sticker). */
export function BackButton({ fallback = '/' }: { fallback?: string }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={8}
      onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback as any))}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: -10,
        backgroundColor: pressed ? c.surfaceRaised : 'transparent',
      })}
    >
      <Icon name="arrow-left" size={24} color={c.ink} />
    </Pressable>
  );
}

/** Title row for screens opened from somewhere else: back arrow, title, optional right side. */
export function Header({ title, kicker, right, fallback }: { title: string; kicker?: string; right?: React.ReactNode; fallback?: string }) {
  return (
    <View style={{ gap: space[1] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <BackButton fallback={fallback} />
        {right}
      </View>
      {kicker ? <T v="label" muted>{kicker}</T> : null}
      <T v="title">{title}</T>
    </View>
  );
}

export function IconButton({ name, label, onPress, tone = 'soft', size = 44 }: { name: string; label: string; onPress: () => void; tone?: 'soft' | 'nudge' | 'primary' | 'quiet'; size?: number }) {
  const c = useColors();
  const bg = { soft: c.primarySoft, nudge: c.nudgeSoft, primary: c.primary, quiet: 'transparent' }[tone];
  const fg = { soft: c.primaryStrong, nudge: c.nudgeInk, primary: c.onPrimary, quiet: c.inkMuted }[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}
    >
      <Icon name={name} size={size * 0.45} color={fg} />
    </Pressable>
  );
}
