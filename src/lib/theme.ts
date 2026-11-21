// Tokens from the Focus brand pack: calm teal, soft amber nudges, no red.
import { useColorScheme } from 'react-native';

const light = {
  bg: '#F6F4EF',
  surface: '#FDFCFA',
  surfaceRaised: '#FFFFFF',
  surfaceSunken: '#ECE9E2',
  line: '#E1DDD4',
  ink: '#1F2A2E',
  inkMuted: '#56636A',
  primary: '#35676A',
  onPrimary: '#FFFFFF',
  primarySoft: '#DCE9E7',
  primaryStrong: '#234A4D',
  nudgeSoft: '#F6E7CC',
  nudgeInk: '#5C3D0A',
  caution: '#8F4636',
  cautionSoft: '#F3DFD9',
  cautionInk: '#6E3226',
};

const dark: typeof light = {
  bg: '#161A1C',
  surface: '#1F2528',
  surfaceRaised: '#283033',
  surfaceSunken: '#101314',
  line: '#323A3E',
  ink: '#E8E6E1',
  inkMuted: '#A3ADB1',
  primary: '#8FC1BE',
  onPrimary: '#10201F',
  primarySoft: '#243735',
  primaryStrong: '#B5DAD7',
  nudgeSoft: '#3A2F1C',
  nudgeInk: '#F0D9A8',
  caution: '#E0A394',
  cautionSoft: '#40261F',
  cautionInk: '#F0C4B8',
};

export type Colors = typeof light;

export const font = {
  display: 'Lexend_600SemiBold',
  body: 'AtkinsonHyperlegibleNext_400Regular',
  bodyStrong: 'AtkinsonHyperlegibleNext_600SemiBold',
};

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 };
export const radius = { sm: 12, md: 18, lg: 24, pill: 999 };

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}
