import type { EventSubscription } from 'expo';

import Native from './src/ScrollSentinelModule';
import type {
  DiscoveryEntry,
  ScrollSentinelEvents,
  ScrollSession,
  SurfaceRules,
  TodaySummary,
  UsageStats,
} from './src/ScrollSentinel.types';

export * from './src/ScrollSentinel.types';

const noSub: EventSubscription = { remove() {} };

/**
 * Safe facade over the native module. Every method works (returns "unsupported" values) when the
 * native side is missing — Expo Go, web, iOS stub — so screens never crash.
 */
const ScrollSentinel = {
  /** true only on Android dev/prod builds that include the module. */
  isSupported: (): boolean => Native?.isSupported() ?? false,
  isAccessibilityEnabled: (): boolean => Native?.isAccessibilityEnabled() ?? false,
  openAccessibilitySettings: (): void => Native?.openAccessibilitySettings(),
  hasUsageAccess: (): boolean => Native?.hasUsageAccess() ?? false,
  openUsageAccessSettings: (): void => Native?.openUsageAccessSettings(),
  setRules: (rules: SurfaceRules): void => Native?.setRulesJson(JSON.stringify(rules)),
  setDiscoveryMode: (on: boolean): void => Native?.setDiscoveryMode(on),
  getDiscoverySnapshot: async (): Promise<DiscoveryEntry[]> => (await Native?.getDiscoverySnapshot()) ?? [],
  getSessions: async (sinceMs: number): Promise<ScrollSession[]> => (await Native?.getSessions(sinceMs)) ?? [],
  getTodaySummary: async (): Promise<TodaySummary> =>
    (await Native?.getTodaySummary()) ?? { date: '', perApp: {} },
  /** Foreground minutes + opens per package (needs Usage Access). Empty `packages` = all apps. */
  getUsageStats: async (startMs: number, endMs: number, packages: string[] = []): Promise<UsageStats> =>
    (await Native?.getUsageStats(startMs, endMs, packages)) ?? {},
  clearData: async (): Promise<void> => {
    await Native?.clearData();
  },
  addListener<E extends keyof ScrollSentinelEvents>(event: E, cb: ScrollSentinelEvents[E]): EventSubscription {
    return Native ? Native.addListener(event, cb) : noSub;
  },
};

export default ScrollSentinel;
