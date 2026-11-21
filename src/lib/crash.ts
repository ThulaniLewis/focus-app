// If something in Focus crashes, keep what went wrong so Today can show it next time.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'focus.lastCrash';

export function installCrashLog() {
  const g = globalThis as any;
  const EU = g.ErrorUtils;
  if (!EU?.setGlobalHandler || g.__focusCrashLog) return;
  g.__focusCrashLog = true;
  const previous = EU.getGlobalHandler?.();
  EU.setGlobalHandler((error: any, isFatal?: boolean) => {
    const text = `${isFatal ? 'Crash' : 'Error'}: ${String(error?.message ?? error)}\n${String(error?.stack ?? '').split('\n').slice(0, 6).join('\n')}`;
    AsyncStorage.setItem(KEY, JSON.stringify({ at: new Date().toISOString(), text })).catch(() => {});
    previous?.(error, isFatal);
  });
}

export async function readLastCrash(): Promise<{ at: string; text: string } | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const clearLastCrash = () => AsyncStorage.removeItem(KEY).catch(() => {});

/** Note a problem so the card on Today shows it (without crashing). */
export const noteProblem = (text: string) =>
  AsyncStorage.setItem(KEY, JSON.stringify({ at: new Date().toISOString(), text })).catch(() => {});
