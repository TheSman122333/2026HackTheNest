import { describe, expect, it } from 'vitest';

import { DEFAULT_LIMITS, EMPTY_STREAK, shipwrightReport, speedFor } from '../src';

const base = {
  moves: { base: 2, fromSteps: 0, fromActivities: 0, multiplier: 1, total: 2, remaining: 2 },
  steps: 0,
  screen: { swipes: 0, minutes: 0, opens: 0, tracked: true },
  limits: DEFAULT_LIMITS,
  streak: EMPTY_STREAK,
};

describe('shipwright', () => {
  it('maps Moves to speed', () => {
    expect(speedFor(2)).toBe('becalmed');
    expect(speedFor(6)).toBe('slow');
    expect(speedFor(10)).toBe('steady');
    expect(speedFor(16)).toBe('swift');
    expect(speedFor(25)).toBe('flying');
  });

  it('suggests steps and quests when there is room, max 3 tips', () => {
    const r = shipwrightReport(base);
    expect(r.speed).toBe('becalmed');
    expect(r.tips[0]).toContain('1,000 more steps');
    expect(r.tips.length).toBeLessThanOrEqual(3);
  });

  it('never scolds when over the scroll limit', () => {
    const r = shipwrightReport({ ...base, screen: { ...base.screen, swipes: 999 } });
    expect(r.tips.join(' ')).toContain('No harm done');
  });

  it('leads with the streak multiplier when boosted', () => {
    const r = shipwrightReport({ ...base, moves: { ...base.moves, multiplier: 1.5, total: 15 } });
    expect(r.tips[0]).toContain('×1.5');
    expect(r.speed).toBe('swift');
  });
});
