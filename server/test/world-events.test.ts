import { describe, expect, it } from 'vitest';

import { isWorldEventDay } from '../src/gm';

const weekOf = (monday: string) =>
  Array.from({ length: 7 }, (_, i) => new Date(Date.parse(`${monday}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));

describe('world event schedule', () => {
  it('fires on exactly 3 days of every Mon–Sun week', () => {
    for (const crew of ['a1', '665f0c2b9d3e4a0012345678', 'crew-x']) {
      for (let w = 0; w < 30; w++) {
        const monday = new Date(Date.parse('2026-11-09T00:00:00Z') + w * 7 * 86_400_000).toISOString().slice(0, 10);
        expect(weekOf(monday).filter((d) => isWorldEventDay(crew, d))).toHaveLength(3);
      }
    }
  });

  it('is stable for a crew and differs between crews', () => {
    const days = weekOf('2026-11-09');
    const a = days.map((d) => isWorldEventDay('crew-a', d));
    expect(days.map((d) => isWorldEventDay('crew-a', d))).toEqual(a);
    const patterns = new Set(['crew-a', 'crew-b', 'crew-c', 'crew-d', 'crew-e'].map((c) => days.map((d) => +isWorldEventDay(c, d)).join('')));
    expect(patterns.size).toBeGreaterThan(1);
  });
});

describe('tidekeeper brain providers', () => {
  it('tries Gemini first, then OpenAI', async () => {
    const { brainProviders } = await import('../src/brain');
    expect(brainProviders({ GEMINI_API_KEY: 'g', OPENAI_API_KEY: 'o', OPENAI_MODEL: 'm' }).map((p) => p.name)).toEqual(['gemini', 'openai']);
    expect(brainProviders({ OPENAI_API_KEY: 'o', OPENAI_MODEL: 'm' }).map((p) => p.name)).toEqual(['openai']);
    expect(brainProviders({})).toEqual([]);
  });
});

describe('franchise guard', () => {
  it('rewrites other franchises names into this game', async () => {
    const { scrubFranchise } = await import('../src/voice-style');
    const out = scrubFranchise('Gol D. Roger, the Pirate King, hid the One Piece past the Grand Line. Whitebeard laughed.');
    expect(out).not.toMatch(/roger|pirate king|one piece|grand line|whitebeard/i);
    expect(out).toContain('Lodestar');
    expect(scrubFranchise('Gold coins and a golden sunset.')).toBe('Gold coins and a golden sunset.');
  });

  it('the opening narration is original', async () => {
    const { OPENING_NARRATION } = await import('../src/opening');
    expect(OPENING_NARRATION).toBe((await import('../src/voice-style')).scrubFranchise(OPENING_NARRATION));
    expect(OPENING_NARRATION).not.toMatch(/wealth, fame|roger|one piece|grand line/i);
  });
});

describe('ssojet display name', () => {
  it('uses the best claim and never falls back to the raw email', async () => {
    const { displayNameFromClaims } = await import('../src/ssojet');
    expect(displayNameFromClaims({ name: 'Ada Lovelace' })).toBe('Ada Lovelace');
    expect(displayNameFromClaims({ given_name: 'Ada', family_name: 'King' })).toBe('Ada King');
    expect(displayNameFromClaims({ email: 'sam.lee09@example.com' })).toBe('Sam Lee');
    expect(displayNameFromClaims({ preferred_username: 'ada@example.com', email: 'ada_k@example.com' })).toBe('Ada K');
    expect(displayNameFromClaims({})).toBeNull();
  });
});
