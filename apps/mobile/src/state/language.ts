import { catalogSourceVersion, isAppLanguage, lookupTranslation, normalizeLanguage, validTranslation, type AppLanguage, type TranslationDictionary } from '@last-voyage/game';
import { create } from 'zustand';

import bundled from '../../../../content/localization/bundled.json';
import source from '../../../../content/localization/source.json';
import { readCatalog, writeCatalog } from '@/features/language/catalogStorage';
import { setRequestLanguage } from '@/features/language/requestLanguage';
import { API_BASE, storage } from '@/lib/api';

const PREFERENCE_KEY = 'lv_language_v1';
const knownSources = new Set<string>(source);
const sourceVersion = catalogSourceVersion(source);
const inflight = new Map<AppLanguage, Promise<void>>();
let hydration: Promise<void> | null = null;
let persistence = Promise.resolve();
let revision = 0;

export const bundledCatalogs = bundled as Partial<Record<AppLanguage, TranslationDictionary>>;
const hasTranslation = (language: AppLanguage, line: string) => Boolean(lookupTranslation(bundledCatalogs[language], line) || lookupTranslation(useLanguage.getState().dictionaries[language], line));
const hasCompleteCatalog = (language: AppLanguage) => source.every((line) => hasTranslation(language, line));

function validatedDictionary(value: unknown): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const [key, translated] of Object.entries(value)) {
    if (knownSources.has(key) && validTranslation(key, translated)) result[key] = translated;
  }
  return result;
}

type LanguageState = {
  language: AppLanguage;
  ready: boolean;
  selected: boolean;
  loading: boolean;
  status: 'idle' | 'loading' | 'ready' | 'fallback';
  error: string | null;
  dictionaries: Partial<Record<AppLanguage, TranslationDictionary>>;
  hydrate: () => Promise<void>;
  chooseLanguage: (language: AppLanguage) => Promise<void>;
  retryTranslations: () => Promise<void>;
};

export const useLanguage = create<LanguageState>((set, get) => ({
  language: 'en', ready: false, selected: false, loading: false, status: 'idle', error: null, dictionaries: {},
  hydrate: async () => {
    if (get().ready) return;
    if (hydration) return hydration;
    const version = revision;
    hydration = (async () => {
      let language: AppLanguage = 'en';
      let selected = false;
      try {
        language = normalizeLanguage(Intl.DateTimeFormat().resolvedOptions().locale);
        const saved = await storage.get(PREFERENCE_KEY);
        if (isAppLanguage(saved)) { language = saved; selected = true; }
      } catch { /* The selector remains available when local storage is unavailable. */ }
      if (revision === version) {
        setRequestLanguage(language);
        set({ language, selected, ready: true });
        if (selected) void loadTranslations(language);
      } else set({ ready: true });
    })().finally(() => { hydration = null; });
    return hydration;
  },
  chooseLanguage: async (language) => {
    if (!isAppLanguage(language)) return;
    ++revision;
    setRequestLanguage(language);
    set({ language, selected: true, ready: true, error: null, loading: language !== 'en', status: language === 'en' ? 'ready' : 'loading' });
    // Serialize preference writes so rapid changes cannot restore an older selection.
    persistence = persistence.catch(() => {}).then(async () => { await storage.set(PREFERENCE_KEY, language); }).catch(() => {
      if (get().language === language) set({ error: 'Your language will change for this session. Device storage is unavailable.' });
    });
    void loadTranslations(language);
    await persistence;
  },
  retryTranslations: async () => { await loadTranslations(get().language); },
}));

async function loadTranslations(language: AppLanguage): Promise<void> {
  if (language === 'en') return;
  const existing = inflight.get(language);
  if (existing) return existing;
  const active = (patch: Partial<LanguageState>) => { if (useLanguage.getState().language === language) useLanguage.setState(patch); };
  const merge = (translations: TranslationDictionary) => {
    useLanguage.setState((state) => ({ dictionaries: { ...state.dictionaries, [language]: { ...state.dictionaries[language], ...translations } } }));
  };
  const operation = (async () => {
    active({ loading: true, status: 'loading', error: null });
    let complete = false;
    try {
      try {
        const saved = JSON.parse(await readCatalog(language) ?? 'null') as { sourceVersion?: string; translations?: unknown; complete?: boolean } | null;
        if (saved) {
          merge(validatedDictionary(saved.translations));
          // Validate actual coverage after dropping corrupt entries; do not trust a saved flag.
          complete = hasCompleteCatalog(language);
        }
      } catch { /* Bundled translations work even if the optional cache is missing or corrupt. */ }
      if (complete) { active({ loading: false, status: 'ready' }); return; }
      // Explicit pages also advance when successive requests reach different server instances.
      for (let offset = 0; offset < source.length; offset += 120) {
        if (useLanguage.getState().language !== language) break;
        const missing = source.slice(offset, offset + 120).filter((line) => !hasTranslation(language, line));
        if (!missing.length) continue;
        const response = await fetch(`${API_BASE}/localization/${language}?offset=${offset}&v=${sourceVersion}`, { signal: AbortSignal.timeout(35_000) });
        if (!response.ok) throw new Error('Translation service unavailable');
        const result = await response.json() as { language?: unknown; translations?: unknown; complete?: boolean; available?: boolean };
        if (result.language !== language) throw new Error('Translation language mismatch');
        const translations = validatedDictionary(result.translations);
        merge(translations);
        complete = hasCompleteCatalog(language);
        try { await writeCatalog(language, JSON.stringify({ sourceVersion, translations: useLanguage.getState().dictionaries[language], complete })); }
        catch { /* A full disk must not interrupt a language change. */ }
        if (complete || result.available === false || !missing.some((line) => Boolean(translations[line]))) break;
      }
      complete = hasCompleteCatalog(language);
      active({ loading: false, status: complete ? 'ready' : 'fallback', error: complete ? null : 'Some text is in English. Retry translations when you are online.' });
    } catch {
      active({ loading: false, status: 'fallback', error: 'Some text is in English. Retry translations when you are online.' });
    }
  })().finally(() => { if (inflight.get(language) === operation) inflight.delete(language); });
  inflight.set(language, operation);
  return operation;
}
