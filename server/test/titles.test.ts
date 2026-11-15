import { describe, expect, it } from 'vitest';

import { sanitizeCustomTitle, unlockedTitles } from '../src/titles';

describe('titles', () => {
  it('unlocks rungs by Honor', () => {
    expect(unlockedTitles(0)).toEqual([]);
    expect(unlockedTitles(30)).toEqual(['Deckhand', 'Lookout', 'First Mate']);
  });

  it('accepts clean custom titles and tidies them', () => {
    expect(sanitizeCustomTitle('  tide   whisperer ')).toEqual({ ok: true, title: 'Tide Whisperer' });
    expect(sanitizeCustomTitle("Storm-Born O'Reilly")).toMatchObject({ ok: true });
    expect(sanitizeCustomTitle('Dickens Reader')).toMatchObject({ ok: true });
    expect(sanitizeCustomTitle('Cumulus Chaser')).toMatchObject({ ok: true });
  });

  it('blocks profanity, disguised spellings, junk characters and other franchises', () => {
    for (const bad of ['Sh1t Captain', 'F u c k er', 'a$$hole Admiral', 'Big Dick', 'Pirate King', 'Grand Line Rider']) {
      expect(sanitizeCustomTitle(bad).ok, bad).toBe(false);
    }
    expect(sanitizeCustomTitle('<script>')).toMatchObject({ ok: false });
    expect(sanitizeCustomTitle('x')).toMatchObject({ ok: false });
    expect(sanitizeCustomTitle('A'.repeat(25))).toMatchObject({ ok: false });
  });
});
