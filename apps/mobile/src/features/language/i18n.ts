import { interpolateTranslation, lookupTranslation, type AppLanguage, type TranslationDictionary, type TranslationParams } from '@last-voyage/game';
import { useCallback } from 'react';

import { bundledCatalogs, useLanguage } from '@/state/language';
import { cleanText } from '@/ui/text';

function translateWith(source: string, params: TranslationParams | undefined, language: AppLanguage, dictionary?: TranslationDictionary): string {
  const cleaned = cleanText(source);
  const key = cleaned.replace(/\s+/g, ' ').trim();
  const translated = language === 'en' ? undefined : lookupTranslation(bundledCatalogs[language], key) ?? lookupTranslation(dictionary, key);
  const text = translated ? `${cleaned.match(/^\s*/)?.[0] ?? ''}${translated}${cleaned.match(/\s*$/)?.[0] ?? ''}` : cleaned;
  return interpolateTranslation(text, params);
}

/** Only known app copy is translated; arbitrary user content is never sent to a service. */
export function translate(source: string, params?: TranslationParams): string {
  const state = useLanguage.getState();
  return translateWith(source, params, state.language, state.dictionaries[state.language]);
}
export const t = translate;

export function useT() {
  const language = useLanguage((state) => state.language);
  const dictionary = useLanguage((state) => state.dictionaries[state.language]);
  return useCallback((source: string, params?: TranslationParams) => translateWith(source, params, language, dictionary), [language, dictionary]);
}
