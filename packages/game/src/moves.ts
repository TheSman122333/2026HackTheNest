import { REWARDS } from './config';
import { streakMultiplier, type StreakState } from './streaks';

export type MovesBreakdown = {
  base: number;
  fromSteps: number;
  fromActivities: number;
  multiplier: number;
  /** floor((base + steps + activities) × multiplier) */
  total: number;
};

/** Island Moves earned today = (base + steps + activities) × streak multiplier. */
export function dailyMoves(input: {
  steps: number;
  activityMoves: number;
  streak: StreakState;
  /** Quest-Move cap: higher on devices that can't track steps (see REWARDS). */
  activityCap?: number;
}): MovesBreakdown {
  const base = REWARDS.baseMovesPerDay;
  const fromSteps = stepsToMoves(input.steps);
  const fromActivities = Math.max(0, Math.min(input.activityMoves, input.activityCap ?? REWARDS.movesFromActivitiesPerDay));
  const multiplier = streakMultiplier(input.streak);
  return {
    base,
    fromSteps,
    fromActivities,
    multiplier,
    total: Math.floor((base + fromSteps + fromActivities) * multiplier),
  };
}

export function stepsToMoves(steps: number): number {
  if (!Number.isFinite(steps) || steps <= 0) return 0;
  return Math.min(Math.floor(steps / REWARDS.stepsPerMove), REWARDS.movesFromStepsPerDay);
}

/** Steps still needed for the next Move (for a progress ring). null when capped. */
export function stepsToNextMove(steps: number): number | null {
  if (stepsToMoves(steps) >= REWARDS.movesFromStepsPerDay) return null;
  const s = Math.max(0, Math.floor(steps));
  return REWARDS.stepsPerMove - (s % REWARDS.stepsPerMove);
}

/** Moves left to spend on the island today. */
export function movesRemaining(earned: number, spent: number): number {
  return Math.max(0, earned - spent);
}
