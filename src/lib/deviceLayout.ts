// Which device this is and when the Dash fits: plain logic, no phone code, so it can be tested.
export type DeviceRole = 'phone' | 'tablet';

/** What the screen says, used until a role has been chosen: shortest side 600 or more is a tablet. */
export const roleFromScreen = (width: number, height: number): DeviceRole => (Math.min(width, height) >= 600 ? 'tablet' : 'phone');

export const parseRole = (raw: string | null | undefined): DeviceRole | null => (raw === 'phone' || raw === 'tablet' ? raw : null);

/** Wide enough for the rail and tiles. A role she chose herself gets a little more room to fit (smaller tablets). */
export const DASH_MIN_WIDTH = 900;
export const DASH_MIN_WIDTH_CHOSEN = 720;

/** Whether the Dash fits this window: the kitchen tablet, landscape, wide enough. */
export function dashFits(role: DeviceRole, width: number, height: number, chosen = false): boolean {
  return role === 'tablet' && width > height && width >= (chosen ? DASH_MIN_WIDTH_CHOSEN : DASH_MIN_WIDTH);
}
