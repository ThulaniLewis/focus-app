// Is this the tablet? The tablet is a shared screen on the kitchen wall: it shows the Dash, keeps
// private things off screen, and leaves the buzzing to the phone.
import { Dimensions } from 'react-native';
import { useWindowDimensions } from 'react-native';

/** A big screen: the shortest side is at least 600 (any Android tablet). Fixed for the device. */
export function isTabletDevice(): boolean {
  const { width, height } = Dimensions.get('screen');
  return Math.min(width, height) >= 600;
}

/** The Dash shows on the tablet when it's landscape (on the wall mount). */
export function useDashMode(): boolean {
  const { width, height } = useWindowDimensions();
  // Wide enough for the rail and the tiles; split screen with YouTube makes it narrower.
  return isTabletDevice() && width > height && width >= 900;
}
