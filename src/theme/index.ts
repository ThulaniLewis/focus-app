// The Focus theme. Colours, type, spacing and radius come from tokens.ts, which is generated from
// docs/design/focus-tokens.json (dusty rose, Lexend and Atkinson Hyperlegible Next). Use only these values.
import { useColorScheme } from 'react-native';
import { darkColors, lightColors, radius, space, type } from './tokens';

export { radius, space, type };

/**
 * Values the v0.6 mockups use that the tokens file doesn't name yet. Taken straight from
 * docs/design/focus-mockups-v0.6.html; they should move into focus-tokens.json.
 */
export const mockupExtras = {
  /** Edge of outline buttons and plain chips (the tokens say `line` is never a control's only edge). */
  outline: { light: '#B3A2A7', dark: '#5A4A50' },
  /** Tablet "Night, dimmed (dark only)". */
  night: { bg: '#08090A', clock: '#9A8A8F', text: '#7E6E73' },
} as const;

/** Black behind a sheet. */
export const scrim = { phone: 'rgba(0,0,0,0.45)', dash: 'rgba(0,0,0,0.6)' } as const;

export type Colors = { [K in keyof typeof lightColors | 'outline']: string };

const light: Colors = { ...lightColors, outline: mockupExtras.outline.light };
const dark: Colors = { ...darkColors, outline: mockupExtras.outline.dark };
export const colors: { light: Colors; dark: Colors } = { light, dark };

export const font = {
  display: type.display.fontFamily,
  body: type.body.fontFamily,
  bodyMedium: type.caption.fontFamily,
  bodyStrong: type.bodyStrong.fontFamily,
};

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

/** A theme colour with transparency, for tracks and tints. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6);
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
