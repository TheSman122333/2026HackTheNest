export type ShortFormApp = 'tiktok' | 'instagram' | 'youtube' | (string & {});

/** Per-package rule. View-id patterns are JS regex source strings (matched case-insensitively against `pkg:id/name`). */
export type SurfaceRule = {
  app: ShortFormApp;
  surface: string;
  /** 'all' = every scroll in the package counts; 'match' = only scrolls on a view whose id matches idPatterns. */
  mode: 'all' | 'match';
  idPatterns?: string[];
  excludePatterns?: string[];
};

/** Keyed by Android package name. */
export type SurfaceRules = Record<string, SurfaceRule>;

export type SwipeEvent = { app: ShortFormApp; pkg: string; surface: string; ts: number };

export type ScrollSession = {
  app: ShortFormApp;
  pkg: string;
  surface: string;
  startMs: number;
  endMs: number;
  swipes: number;
  /** true when this is the still-running session */
  live?: boolean;
};

export type DiscoveryEntry = {
  ts: number;
  pkg: string;
  kind: 'scroll' | 'window';
  className: string | null;
  viewId: string | null;
  fromIndex?: number;
  toIndex?: number;
  itemCount?: number;
  scrollDeltaY?: number | null;
};

export type TodaySummary = {
  date: string;
  perApp: Record<string, { swipes: number; minutes: number; sessions: number }>;
};

export type UsageStats = Record<string, { minutes: number; opens: number }>;

export type ScrollSentinelEvents = {
  onSwipe: (e: SwipeEvent) => void;
  onSessionEnd: (e: ScrollSession) => void;
};
