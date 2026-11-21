// The tablet Dash colours: the theme's dark set (the Dash is dark today). In their own file so sheets
// can use them without importing the Dash.
import { colors } from '../theme';

const k = colors.dark;

export const D = {
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
};
