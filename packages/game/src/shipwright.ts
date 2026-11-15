/**
 * The Shipwright steers the ship and keeps it up to speed. Speed = today's Moves.
 * Pure: turns today's numbers into a status report and the best next tips. Never scolds.
 */
import { REWARDS } from './config';
import { stepsToNextMove, type MovesBreakdown } from './moves';
import type { ScreenDay, ScreenLimits, StreakState } from './streaks';

export type ShipSpeed = 'becalmed' | 'slow' | 'steady' | 'swift' | 'flying';

export type ShipwrightInput = {
  moves: MovesBreakdown & { remaining: number };
  steps: number;
  screen: ScreenDay;
  limits: ScreenLimits;
  streak: StreakState;
  /** false on iPhone/web: no steps or scroll tracking, so no tips about them */
  tracking?: boolean;
};

export const activityCapFor = (tracking: boolean) => tracking ? REWARDS.movesFromActivitiesPerDay : REWARDS.movesFromActivitiesPerDayUntracked;

export type ShipwrightReport = { speed: ShipSpeed; knots: number; headline: string; tips: string[] };

const HEADLINE: Record<ShipSpeed, string> = {
  becalmed: "We're barely drifting, Captain. A walk would put wind in her sails.",
  slow: "She's moving, but slow. A little more life and we'll pick up speed.",
  steady: 'Steady as she goes. Good, honest sailing today.',
  swift: "Now we're cutting through the waves! Keep it up.",
  flying: "She's FLYING, Captain! I've never seen her this fast.",
};

export function speedFor(totalMoves: number): ShipSpeed {
  if (totalMoves <= 2) return 'becalmed';
  if (totalMoves <= 6) return 'slow';
  if (totalMoves <= 11) return 'steady';
  if (totalMoves <= 17) return 'swift';
  return 'flying';
}

export function shipwrightReport(i: ShipwrightInput): ShipwrightReport {
  const speed = speedFor(i.moves.total);
  const tips: string[] = [];

  const tracking = i.tracking ?? true;
  const nextStep = stepsToNextMove(i.steps);
  if (tracking && nextStep !== null) tips.push(`${nextStep.toLocaleString('en-US')} more steps and I'll find you another Move.`);

  const questRoom = activityCapFor(tracking) - i.moves.fromActivities;
  if (questRoom > 0) tips.push(`Log a quest in real life: up to ${questRoom} more Moves from quests today.`);

  if (!tracking) {
    // nothing: tracking is not available on this device
  } else if (!i.screen.tracked) {
    tips.push("Turn on the scroll tracker so I can count your Calm Seas days. They're the biggest speed boost.");
  } else if (i.screen.swipes > i.limits.swipes || i.screen.minutes > i.limits.minutes) {
    tips.push("Rough water today: you're past your scroll limit. No harm done, we'll catch the calm tomorrow.");
  } else {
    const left = Math.max(0, i.limits.swipes - i.screen.swipes);
    tips.push(`Calm seas so far. ${left} swipes left before the water gets rough.`);
  }

  if (i.moves.multiplier > 1) {
    tips.unshift(`The Calm Seas streak has us at ×${i.moves.multiplier} speed${i.streak.shoreLeaveBonus ? ', Shore Leave included' : ''}.`);
  }

  return { speed, knots: i.moves.total, headline: HEADLINE[speed], tips: tips.slice(0, 3) };
}
