import type { AppLanguage } from '@last-voyage/game';

const key = (language: AppLanguage) => `lv_language_catalog_v1_${language}`;
export async function readCatalog(language: AppLanguage): Promise<string | null> {
  return globalThis.localStorage?.getItem(key(language)) ?? null;
}
export async function writeCatalog(language: AppLanguage, serialized: string): Promise<void> {
  globalThis.localStorage?.setItem(key(language), serialized);
}
