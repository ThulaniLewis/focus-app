// Focus's wake-up alarm (Android). Groundwork for Phase 6: nothing schedules an alarm yet.
// Missing on the web, in Expo Go and on builds before 0.7.0, so every call checks first.
import { requireOptionalNativeModule } from 'expo-modules-core';

type FocusAlarmNative = {
  schedule(id: string, atMs: number, title: string, body: string): Promise<boolean>;
  cancel(id: string): Promise<void>;
  stopRinging(id: string): Promise<void>;
  scheduledIds(): string[];
  takeFiring(): string | null;
  canScheduleExact(): boolean;
  canUseFullScreenIntent(): boolean;
  openExactAlarmSettings(): Promise<void>;
  openFullScreenSettings(): Promise<void>;
  showOverLockScreen(on: boolean): Promise<boolean>;
  /** From 0.8.0: a notice that pops up full screen when allowed. Missing on older builds. */
  showPlacePopup?(id: string, title: string, body: string, uri: string): Promise<boolean>;
  /** From 0.8.0: battery use is Unrestricted for Focus. */
  batteryUnrestricted?(): boolean;
};

const native = requireOptionalNativeModule<FocusAlarmNative>('FocusAlarm');

/** True on a build that has the alarm (0.7.0 and later, Android). */
export const alarmAvailable = !!native;

export const FocusAlarm = native;
