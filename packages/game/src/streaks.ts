import { SCREEN, STREAK } from './config';
import { daysBetween, type DayKey } from './date';

/** One day of short-form screen data from Scroll Sentinel (aggregates only). */
export type ScreenDay = {
  /** short-form swipes (TikTok feed, Reels, Shorts) */
  swipes: number;
  /** minutes on short-form surfaces (or foreground minutes in tracked apps as fallback) */
  minutes: number;
  /** times a tracked app was opened */
  opens: number;
  /** false when tracking wasn't active that day (permission off / iOS): the day is neutral */
  tracked: boolean;
};

export type ScreenLimits = { swipes: number; minutes: number };

export const DEFAULT_LIMITS: ScreenLimits = {
  swipes: SCREEN.defaultSwipeLimit,
  minutes: SCREEN.defaultMinuteLimit,
};

export function clampLimits(l: ScreenLimits): ScreenLimits {
  const c = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));
  return {
    swipes: c(l.swipes, SCREEN.minSwipeLimit, SCREEN.maxSwipeLimit),
    minutes: c(l.minutes, SCREEN.minMinuteLimit, SCREEN.maxMinuteLimit),
  };
}

export type DayVerdict = 'calm' | 'stormy' | 'unknown';

export type JudgedDay = { verdict: DayVerdict; shoreLeave: boolean };

/** Calm Seas = stayed within BOTH limits. Shore Leave = never opened a tracked app. */
export function judgeDay(screen: ScreenDay, limits: ScreenLimits): JudgedDay {
  if (!screen.tracked) return { verdict: 'unknown', shoreLeave: false };
  const calm = screen.swipes <= limits.swipes && screen.minutes <= limits.minutes;
  return { verdict: calm ? 'calm' : 'stormy', shoreLeave: screen.opens === 0 };
}

export type StreakState = {
  calmDays: number;
  best: number;
  shields: number;
  /** last day folded into this state */
  lastDay: DayKey | null;
  /** bonus for the day after a Shore Leave day */
  shoreLeaveBonus: boolean;
};

export const EMPTY_STREAK: StreakState = {
  calmDays: 0,
  best: 0,
  shields: 0,
  lastDay: null,
  shoreLeaveBonus: false,
};

export type StreakEvent =
  | { type: 'calm_day'; calmDays: number }
  | { type: 'shield_earned'; shields: number }
  | { type: 'shield_used'; shields: number }
  | { type: 'streak_reset'; was: number }
  | { type: 'shore_leave' }
  | { type: 'new_best'; best: number };

/**
 * Fold one finished day into the streak. Idempotent: days at or before `lastDay` are ignored.
 * Days with no data (gaps, 'unknown') pause the streak and never break it.
 * Breaking a streak only resets the multiplier; nothing earned is ever taken away.
 */
export function advanceStreak(
  state: StreakState,
  day: DayKey,
  judged: JudgedDay,
): { state: StreakState; events: StreakEvent[] } {
  if (state.lastDay !== null && daysBetween(state.lastDay, day) <= 0) return { state, events: [] };

  const events: StreakEvent[] = [];
  const next: StreakState = { ...state, lastDay: day, shoreLeaveBonus: false };

  if (judged.verdict === 'calm') {
    next.calmDays += 1;
    events.push({ type: 'calm_day', calmDays: next.calmDays });
    if (next.calmDays % STREAK.shieldEvery === 0 && next.shields < STREAK.maxShields) {
      next.shields += 1;
      events.push({ type: 'shield_earned', shields: next.shields });
    }
    if (next.calmDays > next.best) {
      next.best = next.calmDays;
      events.push({ type: 'new_best', best: next.best });
    }
  } else if (judged.verdict === 'stormy') {
    if (next.shields > 0) {
      next.shields -= 1;
      events.push({ type: 'shield_used', shields: next.shields });
    } else if (next.calmDays > 0) {
      events.push({ type: 'streak_reset', was: next.calmDays });
      next.calmDays = 0;
    }
  }

  if (judged.shoreLeave) {
    next.shoreLeaveBonus = true;
    events.push({ type: 'shore_leave' });
  }

  return { state: next, events };
}

/** Multiplier applied to TODAY's Island Moves, based on the streak carried into today. */
export function streakMultiplier(state: StreakState): number {
  const calm = Math.min(state.calmDays, STREAK.calmMaxDays) * STREAK.calmStepBonus;
  const shore = state.shoreLeaveBonus ? STREAK.shoreLeaveBonus : 0;
  return round2(1 + calm + shore);
}

/** Live "how am I doing today" for the HUD. */
export function todayProgress(screen: ScreenDay, limits: ScreenLimits) {
  return {
    swipesLeft: Math.max(0, limits.swipes - screen.swipes),
    minutesLeft: Math.max(0, limits.minutes - screen.minutes),
    onTrack: screen.swipes <= limits.swipes && screen.minutes <= limits.minutes,
    shoreLeaveSoFar: screen.opens === 0,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
