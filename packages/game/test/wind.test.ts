import { describe, expect, it } from 'vitest';

import {
  EMPTY_STREAK,
  WIND,
  advanceStreak,
  dailyMoves,
  daysBetween,
  grantForActivity,
  judgeDay,
  stepsToMoves,
  stepsToNextMove,
  streakMultiplier,
  type ActivityLog,
  type StreakState,
} from '../src';

const log = (g: ReturnType<typeof grantForActivity>): ActivityLog => ({ ...g, at: 0 });

describe('activities', () => {
  it('grants supplies, moves, xp and legend', () => {
    const g = grantForActivity([], 'workout');
    expect(g).toMatchObject({ supplies: 3, moves: 2, legend: 1, reduced: false });
    expect(g.xp).toEqual({ grit: WIND.xpPerActivity });
  });

  it('diminishes the 3rd log of the same kind', () => {
    const day: ActivityLog[] = [];
    day.push(log(grantForActivity(day, 'read')));
    day.push(log(grantForActivity(day, 'read')));
    const third = grantForActivity(day, 'read');
    expect(third).toMatchObject({ supplies: 1, moves: 0, reduced: true });
  });

  it('never exceeds daily caps', () => {
    const day: ActivityLog[] = [];
    const kinds = ['workout', 'outdoors', 'friends', 'hobby', 'study', 'walk', 'chores'] as const;
    for (let i = 0; i < 20; i++) day.push(log(grantForActivity(day, kinds[i % kinds.length]!)));
    const total = (k: 'supplies' | 'moves' | 'legend') => day.reduce((n, l) => n + l[k], 0);
    expect(total('supplies')).toBe(WIND.suppliesPerDay);
    expect(total('moves')).toBe(WIND.movesFromActivitiesPerDay);
    expect(total('legend')).toBe(WIND.legendFromActivitiesPerDay);
  });
});

describe('steps', () => {
  it('converts and caps', () => {
    expect(stepsToMoves(0)).toBe(0);
    expect(stepsToMoves(999)).toBe(0);
    expect(stepsToMoves(4500)).toBe(4);
    expect(stepsToMoves(1e9)).toBe(WIND.movesFromStepsPerDay);
    expect(stepsToMoves(Number.NaN)).toBe(0);
    expect(stepsToNextMove(4500)).toBe(500);
    expect(stepsToNextMove(1e9)).toBeNull();
  });
});

describe('streaks', () => {
  const limits = { swipes: 60, minutes: 20 };
  const calm = judgeDay({ swipes: 10, minutes: 5, opens: 2, tracked: true }, limits);
  const stormy = judgeDay({ swipes: 200, minutes: 50, opens: 9, tracked: true }, limits);
  const shore = judgeDay({ swipes: 0, minutes: 0, opens: 0, tracked: true }, limits);
  const unknown = judgeDay({ swipes: 0, minutes: 0, opens: 0, tracked: false }, limits);

  const run = (days: [string, ReturnType<typeof judgeDay>][], s: StreakState = EMPTY_STREAK) =>
    days.reduce((acc, [d, j]) => advanceStreak(acc, d, j).state, s);

  it('judges days', () => {
    expect(calm).toEqual({ verdict: 'calm', shoreLeave: false });
    expect(stormy.verdict).toBe('stormy');
    expect(shore).toEqual({ verdict: 'calm', shoreLeave: true });
    expect(unknown.verdict).toBe('unknown');
  });

  it('builds, then resets without shields', () => {
    const s = run([
      ['2026-11-01', calm],
      ['2026-11-02', calm],
      ['2026-11-03', stormy],
    ]);
    expect(s).toMatchObject({ calmDays: 0, best: 2 });
  });

  it('earns a shield at 7 and spends it on a stormy day', () => {
    const days = Array.from({ length: 7 }, (_, i) => [`2026-11-0${i + 1}`, calm] as [string, typeof calm]);
    let s = run(days);
    expect(s).toMatchObject({ calmDays: 7, shields: 1 });
    s = run([['2026-11-08', stormy]], s);
    expect(s).toMatchObject({ calmDays: 7, shields: 0 });
  });

  it('unknown days and gaps pause, never break', () => {
    const s = run([
      ['2026-11-01', calm],
      ['2026-11-02', unknown],
      ['2026-11-05', calm],
    ]);
    expect(s.calmDays).toBe(2);
  });

  it('is idempotent for already-folded days', () => {
    const s1 = run([['2026-11-01', calm]]);
    const s2 = advanceStreak(s1, '2026-11-01', calm);
    expect(s2.state).toBe(s1);
    expect(s2.events).toEqual([]);
  });

  it('multiplier grows, caps, and adds shore leave', () => {
    expect(streakMultiplier(EMPTY_STREAK)).toBe(1);
    expect(streakMultiplier({ ...EMPTY_STREAK, calmDays: 3 })).toBe(1.3);
    expect(streakMultiplier({ ...EMPTY_STREAK, calmDays: 99 })).toBe(2);
    expect(streakMultiplier({ ...EMPTY_STREAK, calmDays: 3, shoreLeaveBonus: true })).toBe(1.55);
  });
});

describe('daily moves', () => {
  it('combines base, steps, activities and streak', () => {
    const m = dailyMoves({ steps: 6200, activityMoves: 3, streak: { ...EMPTY_STREAK, calmDays: 5 } });
    expect(m).toMatchObject({ base: 2, fromSteps: 6, fromActivities: 3, multiplier: 1.5, total: 16 });
  });
});

describe('dates', () => {
  it('counts days across month boundaries', () => {
    expect(daysBetween('2026-10-31', '2026-11-01')).toBe(1);
    expect(daysBetween('2026-11-05', '2026-11-01')).toBe(-4);
  });
});
