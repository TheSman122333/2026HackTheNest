/** Languages shared by the app, catalog service and ElevenLabs Flash v2.5. */
export const APP_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English', direction: 'ltr' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', direction: 'ltr' },
  { code: 'fr', name: 'French', nativeName: 'Français', direction: 'ltr' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', direction: 'ltr' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', direction: 'ltr' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', direction: 'ltr' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', direction: 'ltr' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', direction: 'ltr' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', direction: 'ltr' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', direction: 'ltr' },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština', direction: 'ltr' },
  { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina', direction: 'ltr' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română', direction: 'ltr' },
  { code: 'bg', name: 'Bulgarian', nativeName: 'Български', direction: 'ltr' },
  { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski', direction: 'ltr' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', direction: 'ltr' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska', direction: 'ltr' },
  { code: 'da', name: 'Danish', nativeName: 'Dansk', direction: 'ltr' },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi', direction: 'ltr' },
  { code: 'no', name: 'Norwegian', nativeName: 'Norsk', direction: 'ltr' },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar', direction: 'ltr' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', direction: 'ltr' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', direction: 'rtl' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', direction: 'ltr' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', direction: 'ltr' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', direction: 'ltr' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', direction: 'ltr' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', direction: 'ltr' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', direction: 'ltr' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu', direction: 'ltr' },
  { code: 'fil', name: 'Filipino', nativeName: 'Filipino', direction: 'ltr' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', direction: 'ltr' },
] as const;

export type AppLanguage = (typeof APP_LANGUAGES)[number]['code'];
export type TranslationParams = Readonly<Record<string, string | number>>;
export type TranslationDictionary = Readonly<Record<string, string>>;

export function isAppLanguage(value: unknown): value is AppLanguage {
  return typeof value === 'string' && APP_LANGUAGES.some((language) => language.code === value);
}

/** Accept device regional tags, but keep all network/cache language keys canonical. */
export function normalizeLanguage(input: unknown): AppLanguage {
  if (typeof input !== 'string') return 'en';
  const base = input.trim().toLowerCase().replace(/_/g, '-').split('-')[0];
  const code = base === 'nb' || base === 'nn' ? 'no' : base === 'tl' ? 'fil' : base;
  return isAppLanguage(code) ? code : 'en';
}

export function translationPlaceholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!).sort();
}

/** A malformed provider response must never remove a number or rename an interpolation. */
export function validTranslation(source: string, translated: unknown): translated is string {
  return typeof translated === 'string' && translated.trim().length > 0 && translated.length <= Math.max(2000, source.length * 8) &&
    JSON.stringify(translationPlaceholders(source)) === JSON.stringify(translationPlaceholders(translated));
}

/** Plain JSON objects inherit keys such as constructor; those are never translations. */
export function lookupTranslation(dictionary: TranslationDictionary | undefined, source: string): string | undefined {
  const value = dictionary && Object.hasOwn(dictionary, source) ? dictionary[source] : undefined;
  return validTranslation(source, value) ? value : undefined;
}

/** Short stable cache key that changes when app-owned source strings change. */
export function catalogSourceVersion(sources: readonly string[]): string {
  const serialized = JSON.stringify(sources);
  let hash = 2166136261;
  for (let i = 0; i < serialized.length; i++) hash = Math.imul(hash ^ serialized.charCodeAt(i), 16777619);
  return `${sources.length}-${(hash >>> 0).toString(36)}`;
}

export function interpolateTranslation(source: string, params: TranslationParams = {}): string {
  return source.replace(/\{(\w+)\}/g, (placeholder, name: string) => Object.hasOwn(params, name) ? String(params[name]) : placeholder);
}
