// What this device is: "This phone" or "Kitchen tablet". Kept under its own AsyncStorage key, so
// signing in, signing out and sync never touch it. Until it's chosen it follows the screen size.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { type DeviceRole, parseRole } from './deviceLayout';

export type { DeviceRole };

export const ROLE_KEY = 'focus.deviceRole';

let chosen: DeviceRole | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Read the saved role. Called once as Focus starts, before anything is shown. */
export async function loadDeviceRole(): Promise<void> {
  try {
    chosen = parseRole(await AsyncStorage.getItem(ROLE_KEY));
  } catch {
    chosen = null;
  }
  emit();
}

/** The role she chose, or null if she never did (then the screen decides). */
export const chosenRole = () => chosen;

export function setDeviceRole(role: DeviceRole) {
  chosen = role;
  emit();
  AsyncStorage.setItem(ROLE_KEY, role).catch(() => {});
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** The chosen role, or null: re-renders when it changes. */
export function useChosenRole(): DeviceRole | null {
  return useSyncExternalStore(subscribe, chosenRole, chosenRole);
}
