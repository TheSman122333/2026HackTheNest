import { NativeModule, requireOptionalNativeModule } from 'expo';

import type {
  DiscoveryEntry,
  ScrollSentinelEvents,
  ScrollSession,
  TodaySummary,
  UsageStats,
} from './ScrollSentinel.types';

declare class ScrollSentinelNative extends NativeModule<ScrollSentinelEvents> {
  isSupported(): boolean;
  isAccessibilityEnabled(): boolean;
  openAccessibilitySettings(): void;
  hasUsageAccess(): boolean;
  openUsageAccessSettings(): void;
  setRulesJson(json: string): void;
  setDiscoveryMode(on: boolean): void;
  getDiscoverySnapshot(): Promise<DiscoveryEntry[]>;
  getSessions(sinceMs: number): Promise<ScrollSession[]>;
  getTodaySummary(): Promise<TodaySummary>;
  getUsageStats(startMs: number, endMs: number, packages: string[]): Promise<UsageStats>;
  clearData(): Promise<void>;
}

/** null in Expo Go / web / builds without the module — the facade in index.ts handles that. */
export default requireOptionalNativeModule<ScrollSentinelNative>('ScrollSentinel');
