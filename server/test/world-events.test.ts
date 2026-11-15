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
