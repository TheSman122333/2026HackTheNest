/**
 * Today's step count from Android Health Connect (Pixel records steps on-device on Android 14+).
 * iOS: no HealthKit yet (no Apple dev account) — returns `supported: false`.
 */
import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import type * as HealthConnect from 'react-native-health-connect';

/** Loaded only on Android: the library's native module doesn't exist on iOS / Expo Go. */
const HC: typeof HealthConnect | null =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Platform.OS === 'android' ? (require('react-native-health-connect') as typeof HealthConnect) : null;

export type StepsState = {
  supported: boolean;
  granted: boolean;
  steps: number;
  error?: string;
};

const STEPS_READ = { accessType: 'read', recordType: 'Steps' } as const;

let initPromise: Promise<boolean> | null = null;
async function ensureInit(): Promise<boolean> {
  if (!HC) return false;
  if ((await HC.getSdkStatus()) !== HC.SdkAvailabilityStatus.SDK_AVAILABLE) return false;
  initPromise ??= HC.initialize();
  return initPromise;
}

async function hasStepsPermission(): Promise<boolean> {
  if (!HC) return false;
  const granted = await HC.getGrantedPermissions();
  return granted.some((p) => p.recordType === 'Steps' && p.accessType === 'read');
}

export async function readStepsBetween(start: Date, end: Date): Promise<number> {
  if (!HC) return 0;
  const res = await HC.aggregateRecord({
    recordType: 'Steps',
    timeRangeFilter: { operator: 'between', startTime: start.toISOString(), endTime: end.toISOString() },
  });
  return res.COUNT_TOTAL ?? 0;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Today's steps, or 0 if Health Connect is unavailable or not permitted. Never prompts. */
export async function readTodaySteps(): Promise<number> {
  if (!(await ensureInit())) return 0;
  if (!(await hasStepsPermission())) return 0;
  return readStepsBetween(startOfToday(), new Date());
}

/** Shows the Health Connect permission sheet. Returns true if steps access was granted. */
export async function requestStepsAccess(): Promise<boolean> {
  if (!(await ensureInit())) return false;
  const granted = await HC!.requestPermission([STEPS_READ]);
  return granted.some((p) => p.recordType === 'Steps' && p.accessType === 'read');
}

export const openHealthConnectSettings = () => HC?.openHealthConnectSettings();

/** Today's steps; refreshes on foreground and every `pollMs`. */
export function useTodaySteps(pollMs = 60_000) {
  const [state, setState] = useState<StepsState>({ supported: Platform.OS === 'android', granted: false, steps: 0 });

  const load = useCallback(async (): Promise<StepsState> => {
    try {
      if (!(await ensureInit())) return { supported: false, granted: false, steps: 0 };
      if (!(await hasStepsPermission())) return { supported: true, granted: false, steps: 0 };
      return { supported: true, granted: true, steps: await readStepsBetween(startOfToday(), new Date()) };
    } catch (e) {
      return { supported: true, granted: false, steps: 0, error: String(e) };
    }
  }, []);

  const refresh = useCallback(async () => setState(await load()), [load]);

  useEffect(() => {
    let alive = true;
    const tick = () => load().then((s) => alive && setState(s));
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, pollMs);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && tick());
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(id);
      sub.remove();
    };
  }, [load, pollMs]);

  const request = useCallback(async () => {
    await requestStepsAccess();
    await refresh();
  }, [refresh]);

  return { ...state, refresh, request };
}
