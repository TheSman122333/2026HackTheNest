/**
 * Pushes today's real-life numbers (steps + short-form totals) to the server.
 * Runs on app foreground and every 2 minutes while the game screens are open.
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';
import ScrollSentinel from 'scroll-sentinel';

import { TRACKED_PACKAGES } from '@/features/scroll/rules';
import { toScreenDay } from '@/features/scroll/useScrollSentinel';
import { readTodaySteps } from '@/features/steps/steps';
import { api } from '@/lib/api';
import type { Today } from '@/lib/types';
import { useSession } from '@/state/session';

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export async function syncToday(): Promise<Today | null> {
  const perms = {
    supported: ScrollSentinel.isSupported(),
    accessibility: ScrollSentinel.isAccessibilityEnabled(),
    usageAccess: ScrollSentinel.hasUsageAccess(),
  };
  const [steps, summary, usage] = await Promise.all([
    readTodaySteps().catch(() => 0),
    ScrollSentinel.getTodaySummary(),
    ScrollSentinel.getUsageStats(startOfToday(), Date.now(), TRACKED_PACKAGES),
  ]);
  const screen = toScreenDay(summary, usage, perms);
  const r = await api<{ today: Today }>('PUT', '/moves/today', { steps: Math.round(steps), screen });
  useSession.getState().setMe({ today: r.today });
  return r.today;
}

export function useDeviceSync(intervalMs = 120_000) {
  useEffect(() => {
    const run = () => syncToday().catch((e) => console.warn('[sync]', e));
    const first = setTimeout(run, 500);
    const id = setInterval(run, intervalMs);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && run());
    return () => {
      clearTimeout(first);
      clearInterval(id);
      sub.remove();
    };
  }, [intervalMs]);
}
