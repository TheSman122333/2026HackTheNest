import { interpolateTranslation, type TranslationParams } from '@last-voyage/game';
import { describe, expect, it } from 'vitest';

import { formatLogText, relativeLogTime, type LogTranslator } from '../../apps/mobile/src/features/language/logText';

function translator() {
  const calls: { source: string; params?: TranslationParams }[] = [];
  const dictionary: Record<string, string> = {
    Captain: 'TRANSLATED PLAYER NAME', Legend: 'Légende', Honor: 'Honneur', Supplies: 'Provisions',
    '{name} found {count} {item}': '{name} a trouvé {count} {item}',
    '{name} dealt {damage} damage to {boss}.': '{name} a infligé {damage} dégâts à {boss}.',
  };
  const tx: LogTranslator = (source, params) => {
    calls.push({ source, params });
    return interpolateTranslation(Object.hasOwn(dictionary, source) ? dictionary[source]! : source, params);
  };
  return { calls, tx };
}

describe('localized ledger copy', () => {
  it('uses named parameters and preserves player names that are translation keys', () => {
    const entry = Object.freeze({ text: 'Captain found 2 supplies', reason: 'island:loot', item: 'supplies', delta: 2 });
    const original = { ...entry };
    const { tx, calls } = translator();
    expect(formatLogText(entry, tx)).toBe('Captain a trouvé 2 Provisions');
    expect(calls).toContainEqual({ source: '{name} found {count} {item}', params: { name: 'Captain', count: '2', item: 'Provisions' } });
    expect(calls.some((call) => call.source === 'Captain')).toBe(false);
    expect(entry).toEqual(original);
  });

  it('does not translate actor or boss names in combat messages', () => {
    const { tx, calls } = translator();
    expect(formatLogText({ text: 'Legend dealt 14 damage to Captain.', item: 'boss_damage', delta: 14, reason: 'fight:damage' }, tx)).toBe('Legend a infligé 14 dégâts à Captain.');
    expect(calls).toEqual([{ source: '{name} dealt {damage} damage to {boss}.', params: { name: 'Legend', damage: '14', boss: 'Captain' } }]);
  });

  it('recognizes both API and crew-history activity rewards from structured fields', () => {
    for (const text of ['+2 supplies (activity:walk)', '+2 supplies (Walk)']) {
      const { tx, calls } = translator();
      expect(formatLogText({ text, item: 'supplies', delta: 2, reason: 'activity:walk' }, tx)).toBe('Walk: +2 Provisions');
      expect(calls.at(-1)).toEqual({ source: '{activity}: {amount} {item}', params: { activity: 'Walk', amount: '+2', item: 'Provisions' } });
    }
  });

  it('displays stored legend rewards with current Honor terminology', () => {
    const { tx, calls } = translator();
    expect(formatLogText({ text: '+2 legend (activity:walk)', item: 'legend', delta: 2, reason: 'activity:walk' }, tx)).toBe('Walk: +2 Honneur');
    expect(calls).toContainEqual({ source: 'Honor', params: undefined });
  });

  it('preserves ship names and the one Lodestar award in current season logs', () => {
    const entry = Object.freeze({ text: 'The Honor claimed the Lodestar with 1200 Honor! The only one in all the Tidewake.', item: 'lodestar', delta: 1, reason: 'season:lodestar' });
    const { tx, calls } = translator();
    expect(formatLogText(entry, tx)).toBe('The Honor claimed the Lodestar with 1,200 Honor! The only one in all the Tidewake.');
    expect(calls).toEqual([{ source: 'The {crew} claimed the Lodestar with {honor} Honor! The only one in all the Tidewake.', params: { crew: 'Honor', honor: '1,200' } }]);
    expect(entry.text).toBe('The Honor claimed the Lodestar with 1200 Honor! The only one in all the Tidewake.');
  });

  it.each([
    { text: 'Captain was washed overboard!', reason: 'island:ko', item: 'hp', delta: 0, source: '{name} was washed overboard!', params: { name: 'Captain' } },
    { text: 'Clawdius knocked Captain overboard!', reason: 'fight:ko', item: 'hp', delta: 0, source: '{boss} knocked {name} overboard!', params: { boss: 'Clawdius', name: 'Captain' } },
    { text: 'Captain defeated Clawdius the Tide Crab! The island is ours!', reason: 'island:conquered', item: 'island', delta: 1, source: '{name} defeated {boss}! The island is ours!', params: { name: 'Captain', boss: 'Clawdius the Tide Crab' } },
    { text: 'Captain left the crew to sail with another. Fair winds!', reason: 'crew:leave', item: 'crew', delta: -1, source: '{name} left the crew to sail with another. Fair winds!', params: { name: 'Captain' } },
    { text: "Captain claimed the Lodestar with 1200 Legend! The year's voyage is complete.", reason: 'season:lodestar', item: 'lodestar', delta: 1, source: "{name} claimed the Lodestar with {legend} Legend! The year's voyage is complete.", params: { name: 'Captain', legend: '1,200' } },
    { text: 'Windcatcher sails upgraded to level 2 for 20 Supplies.', reason: 'ship:upgrade:sails', item: 'supplies', delta: -20, source: '{upgrade} upgraded to level {level} for {cost} Supplies.', params: { upgrade: 'Windcatcher sails', level: '2', cost: '20' } },
    { text: 'The ship sailed through the night and reached a winter island!', reason: 'night:sail', item: 'voyage', delta: 1, source: 'The ship sailed through the night and reached a {theme} island!', params: { theme: 'Winter' } },
  ])('renders canonical $reason events without translating names', ({ source, params, ...entry }) => {
    const { tx, calls } = translator();
    formatLogText(entry, tx);
    expect(calls.at(-1)).toEqual({ source, params });
    expect(calls.some((call) => call.source === 'Captain')).toBe(false);
  });

  it.each([
    'Night fell. Strange items washed ashore.',
    'A hurricane tore across the island overnight, scattering everything!',
    'The volcano erupted overnight! The land has changed.',
  ])('translates the exact supported night event: %s', (text) => {
    const { tx, calls } = translator();
    formatLogText({ text, reason: 'night:chaos', item: 'night', delta: 0 }, tx);
    expect(calls).toEqual([{ source: text, params: undefined }]);
  });

  it('retains unrecognized historic text, future events and inconsistent structured values', () => {
    const { tx, calls } = translator();
    const entries = [
      { text: 'Captain', reason: 'future:event', item: 'supplies', delta: 2 },
      { text: 'Captain found a treasure in an old voyage.', reason: 'island:loot', item: 'supplies', delta: 2 },
      { text: 'Captain dealt 99 damage to Clawdius.', reason: 'fight:damage', item: 'boss_damage', delta: 2 },
      { text: 'A new kind of storm arrived.', reason: 'night:chaos', item: 'night', delta: 0 },
      { text: '+2 supplies (activity:constructor)', reason: 'activity:constructor', item: 'supplies', delta: 2 },
      { text: 'Captain found 2 constructor', reason: 'island:loot', item: 'constructor', delta: 2 },
      { text: 'Old custom activity note', reason: 'activity:walk', item: 'supplies', delta: 2 },
    ];
    for (const entry of entries) expect(formatLogText(entry, tx)).toBe(entry.text);
    expect(calls).toEqual([]);
  });

  it('formats event numbers using the selected locale', () => {
    const { tx, calls } = translator();
    formatLogText({ text: 'Captain dealt 1200 damage to Clawdius.', item: 'boss_damage', delta: 1200, reason: 'fight:damage' }, tx, 'ar');
    expect(calls.at(-1)?.params?.damage).toBe((1200).toLocaleString('ar'));
  });
});

describe('relative log dates', () => {
  const now = Date.parse('2026-11-15T12:00:00Z');
  it('uses the selected language and correct elapsed unit', () => {
    const time = new Intl.RelativeTimeFormat('fr', { numeric: 'auto', style: 'short' });
    expect(relativeLogTime('2026-11-15T11:58:00Z', 'fr', now)).toBe(time.format(-2, 'minute'));
    expect(relativeLogTime('2026-11-15T09:00:00Z', 'fr', now)).toBe(time.format(-3, 'hour'));
    expect(relativeLogTime('2026-11-14T12:00:00Z', 'fr', now)).toBe(time.format(-1, 'day'));
  });
  it('handles invalid dates and future timestamps', () => {
    expect(relativeLogTime('not a date', 'en', now)).toBe('');
    expect(relativeLogTime('2026-11-15T13:00:00Z', 'en', now)).toBe(new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' }).format(-0, 'second'));
  });
});
