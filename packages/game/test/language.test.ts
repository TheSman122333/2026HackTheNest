import { describe, expect, it } from 'vitest';
import { APP_LANGUAGES, catalogSourceVersion, interpolateTranslation, lookupTranslation, normalizeLanguage, validTranslation } from '../src/language';

describe('app languages', () => {
  it('normalizes device regions and supported aliases without accepting unknown languages', () => {
    expect(new Set(APP_LANGUAGES.map((language) => language.code)).size).toBe(32);
    expect(normalizeLanguage('pt_BR')).toBe('pt');
    expect(normalizeLanguage('zh-Hant-TW')).toBe('zh');
    expect(normalizeLanguage('nb-NO')).toBe('no');
    expect(normalizeLanguage('tl-PH')).toBe('fil');
    expect(normalizeLanguage('unknown')).toBe('en');
    expect(normalizeLanguage(null)).toBe('en');
  });

  it('allows translated word order while preserving every interpolation', () => {
    expect(validTranslation('{name}: {count} Moves', '{count} mouvements pour {name}')).toBe(true);
    expect(validTranslation('{name}: {count} Moves', '{name}: mouvements')).toBe(false);
    expect(validTranslation('{name}: {count} Moves', '{name}: {count} {count}')).toBe(false);
    expect(interpolateTranslation('{count} mouvements pour {name}', { name: 'Avery $& {count}', count: 12 })).toBe('12 mouvements pour Avery $& {count}');
    expect(interpolateTranslation('{missing}', {})).toBe('{missing}');
  });

  it('falls back for inherited object keys and malformed cached translations', () => {
    expect(lookupTranslation({}, 'constructor')).toBeUndefined();
    expect(lookupTranslation({}, 'toString')).toBeUndefined();
    expect(lookupTranslation({ '{count} Moves': 'movimientos' }, '{count} Moves')).toBeUndefined();
    expect(lookupTranslation({ '{count} Moves': '{count} movimientos' }, '{count} Moves')).toBe('{count} movimientos');
  });

  it('changes the cache revision when source copy is added or changed', () => {
    expect(catalogSourceVersion(['Continue'])).toBe(catalogSourceVersion(['Continue']));
    expect(catalogSourceVersion(['Continue'])).not.toBe(catalogSourceVersion(['Save']));
    expect(catalogSourceVersion(['Continue'])).not.toBe(catalogSourceVersion(['Continue', 'Save']));
  });
});
