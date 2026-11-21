// The tablet Dash colours, named for the Dash, following light or dark like the rest of Focus.
// In their own file so sheets can use them without importing the Dash.
import { colors, useScheme, type Colors } from '../theme';

const dashOf = (k: Colors) => ({
  bg: k.bg,
  rail: k.surface,
  tile: k.surface,
  line: k.line,
  ink: k.ink,
  muted: k.inkMuted,
  primary: k.primary,
  onPrimary: k.onPrimary,
  primarySoft: k.primarySoft,
  primaryStrong: k.primaryStrong,
  nudgeSoft: k.nudgeSoft,
  nudgeInk: k.nudgeInk,
  sunken: k.surfaceSunken,
  ghost: k.outline,
  nightBg: k.nightBg,
  nightClock: k.nightClock,
  nightText: k.nightText,
});

export type DashColors = ReturnType<typeof dashOf>;
const dash = { light: dashOf(colors.light), dark: dashOf(colors.dark) };

export function useDash(): DashColors {
  return dash[useScheme()];
}
