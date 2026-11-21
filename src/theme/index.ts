// The Focus theme. Colours, type, spacing and radius come from tokens.ts, which is generated from
// docs/design/focus-tokens.json (dusty rose, Lexend and Atkinson Hyperlegible Next). Use only these values.
import { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';
import { darkColors, lightColors, radius, space, type } from './tokens';

export { radius, space, type };

/** Black behind a sheet. */
export const scrim = { phone: 'rgba(0,0,0,0.45)', dash: 'rgba(0,0,0,0.6)' } as const;

export type Scheme = 'light' | 'dark';
export type Colors = { [K in keyof typeof lightColors]: string };
export const colors: Record<Scheme, Colors> = { light: lightColors, dark: darkColors };

export const font = {
  display: type.display.fontFamily,
  body: type.body.fontFamily,
  bodyMedium: type.caption.fontFamily,
  bodyStrong: type.bodyStrong.fontFamily,
};

/** Light or dark right now, set at the root from Settings > Look. Outside it, the system's choice. */
const SchemeContext = createContext<Scheme | null>(null);
export const SchemeProvider = SchemeContext.Provider;

export function useScheme(): Scheme {
  const set = useContext(SchemeContext);
  const system = useColorScheme();
  return set ?? (system === 'dark' ? 'dark' : 'light');
}

export function useColors(): Colors {
  return colors[useScheme()];
}

/** A theme colour with transparency, for tracks and tints. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6);
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
