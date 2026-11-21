// Is this the tablet? The tablet is a shared screen on the kitchen wall: it shows the Dash, keeps
// private things off screen, and leaves the buzzing to the phone. Which one this device is comes
// from the role chosen in Settings (kept per device), and from the screen size until one is chosen.
import { Dimensions, useWindowDimensions } from 'react-native';
import { dashFits, roleFromScreen, type DeviceRole } from './deviceLayout';
import { chosenRole, useChosenRole } from './deviceRole';

function screenRole(): DeviceRole {
  const { width, height } = Dimensions.get('screen');
  return roleFromScreen(width, height);
}

/** The kitchen tablet, by the role chosen in Settings or else the screen (shortest side at least 600). */
export function isTabletDevice(): boolean {
  return (chosenRole() ?? screenRole()) === 'tablet';
}

/** This device's role, re-rendering when it's changed in Settings. */
export function useDeviceRole(): DeviceRole {
  const chosen = useChosenRole();
  return chosen ?? screenRole();
}

/** The Dash shows on the kitchen tablet when it's landscape (on the wall mount). */
export function useDashMode(): boolean {
  const { width, height } = useWindowDimensions();
  const chosen = useChosenRole();
  return dashFits(chosen ?? screenRole(), width, height, chosen === 'tablet');
}
