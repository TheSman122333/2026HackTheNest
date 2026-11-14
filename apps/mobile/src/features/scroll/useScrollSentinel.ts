import {
  DEFAULT_LIMITS,
  judgeDay,
  todayProgress,
  type ScreenDay,
  type ScreenLimits,
} from '@last-voyage/game';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import ScrollSentinel, { type TodaySummary, type UsageStats } from 'scroll-sentinel';

import { SURFACE_RULES, TRACKED_PACKAGES, appForPackage } from './rules';

/** Push the JS-side rules to the native service once on startup. */
export function useApplySurfaceRules() {
  useEffect(() => {
    try {
      ScrollSentinel.setRules(SURFACE_RULES);
    } catch (e) {
      console.warn('[scroll-sentinel] setRules failed', e);
    }
  }, []);
}

export type SentinelPermissions = {
  supported: boolean;
  accessibility: boolean;
  usageAccess: boolean;
};

const readPermissions = (): SentinelPermissions => ({
  supported: ScrollSentinel.isSupported(),
  accessibility: ScrollSentinel.isAccessibilityEnabled(),
  usageAccess: ScrollSentinel.hasUsageAccess(),
});

/** Permission state, re-read whenever the app comes back to the foreground (e.g. from Settings). */
export function useSentinelPermissions(): SentinelPermissions {
  const [perms, setPerms] = useState(readPermissions);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setPerms(readPermissions());
    });
    return () => sub.remove();
  }, []);
  return perms;
}

/** Live swipe counts per app since this hook mounted. */
export function useLiveSwipes(): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    const sub = ScrollSentinel.addListener('onSwipe', (e) => {
      setCounts((c) => ({ ...c, [e.app]: (c[e.app] ?? 0) + 1 }));
    });
    return () => sub.remove();
  }, []);
  return counts;
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const fetchToday = () =>
  Promise.all([
    ScrollSentinel.getTodaySummary(),
    ScrollSentinel.getUsageStats(startOfToday(), Date.now(), TRACKED_PACKAGES),
  ]);

/** Combine the accessibility aggregate + UsageStats into one ScreenDay for game rules. */
export function toScreenDay(
  summary: TodaySummary,
  usage: UsageStats,
  perms: SentinelPermissions,
): ScreenDay {
  const perApp = Object.values(summary.perApp);
  const swipes = perApp.reduce((n, a) => n + a.swipes, 0);
  const sessionMinutes = perApp.reduce((n, a) => n + a.minutes, 0);
  const tracked = TRACKED_PACKAGES.map((p) => usage[p]).filter((u) => u !== undefined);
  const opens = tracked.reduce((n, u) => n + u.opens, 0);
  // Without the accessibility service, fall back to foreground minutes in the tracked apps.
  const minutes = perms.accessibility
    ? sessionMinutes
    : tracked.reduce((n, u) => n + u.minutes, 0);
  return {
    swipes,
    minutes: Math.round(minutes * 10) / 10,
    opens,
    tracked: perms.supported && (perms.accessibility || perms.usageAccess),
  };
}

/** Polls today's numbers and derives the Calm Seas verdict. */
export function useTodayScreen(perms: SentinelPermissions, limits: ScreenLimits = DEFAULT_LIMITS, pollMs = 3000) {
  const [summary, setSummary] = useState<TodaySummary>({ date: '', perApp: {} });
  const [usage, setUsage] = useState<UsageStats>({});

  const refresh = useCallback(async () => {
    const [s, u] = await fetchToday();
    setSummary(s);
    setUsage(u);
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = () =>
      fetchToday()
        .then(([s, u]) => {
          if (!alive) return;
          setSummary(s);
          setUsage(u);
        })
        .catch(() => {});
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, pollMs);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(id);
    };
  }, [pollMs]);

  const day = toScreenDay(summary, usage, perms);
  return {
    summary,
    usage,
    day,
    verdict: judgeDay(day, limits),
    progress: todayProgress(day, limits),
    refresh,
    appForPackage,
  };
}
