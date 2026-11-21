// Reads last nights' sleep from Health Connect (Samsung Health and her tracker write there).
// Phone only: never on the tablet, never synced. Asks for sleep only, nothing else.
import { Platform } from 'react-native';
import { isTabletDevice } from './device';
import { dayKey } from './time';
import { nightFor, type SleepNight, type SleepSessionIn } from './sleep';

type HC = typeof import('react-native-health-connect');
const SDK_AVAILABLE = 3;
const SLEEP = [{ accessType: 'read' as const, recordType: 'SleepSession' as const }];

/** The library, only where it can work (Android phone, a build that has it). */
function hc(): HC | null {
  if (Platform.OS !== 'android' || isTabletDevice()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-health-connect') as HC;
  } catch {
    return null;
  }
}

/** Is Health Connect on this phone, and ready? */
export async function sleepAvailable(): Promise<boolean> {
  const lib = hc();
  if (!lib) return false;
  try {
    if ((await lib.getSdkStatus()) !== SDK_AVAILABLE) return false;
    return await lib.initialize();
  } catch {
    return false;
  }
}

const hasSleep = (granted: { recordType?: string; accessType?: string }[]) => granted.some((p) => p.recordType === 'SleepSession' && p.accessType === 'read');

/** Ask to read sleep (only sleep). True if allowed. */
export async function askForSleep(): Promise<boolean> {
  const lib = hc();
  if (!lib || !(await sleepAvailable())) return false;
  try {
    return hasSleep((await lib.requestPermission(SLEEP)) as any[]);
  } catch {
    return false;
  }
}

/** Last night and the night before, if she's allowed it. Never throws: no data is just no card. */
export async function readRecentNights(now = new Date()): Promise<SleepNight[]> {
  const lib = hc();
  if (!lib || !(await sleepAvailable())) return [];
  try {
    if (!hasSleep((await lib.getGrantedPermissions()) as any[])) return [];
    const from = new Date(now);
    from.setDate(from.getDate() - 3);
    from.setHours(15, 0, 0, 0);
    const res = await lib.readRecords('SleepSession', {
      timeRangeFilter: { operator: 'between', startTime: from.toISOString(), endTime: now.toISOString() },
    });
    const sessions: SleepSessionIn[] = (res.records ?? []).map((r: any) => ({ startTime: r.startTime, endTime: r.endTime, stages: r.stages }));
    const nights: SleepNight[] = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const n = nightFor(sessions, dayKey(d));
      if (n) nights.push(n);
    }
    return nights;
  } catch {
    return [];
  }
}
