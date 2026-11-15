import { Directory, File, Paths } from 'expo-file-system';
import type { AppLanguage } from '@last-voyage/game';

const directory = () => new Directory(Paths.document, 'language-catalogs');
const file = (language: AppLanguage) => new File(directory(), `${language}.json`);

/** Catalogs exceed SecureStore's payload limit; only the small preference goes there. */
export async function readCatalog(language: AppLanguage): Promise<string | null> {
  const stored = file(language);
  return stored.exists ? stored.text() : null;
}
export async function writeCatalog(language: AppLanguage, serialized: string): Promise<void> {
  directory().create({ intermediates: true, idempotent: true });
  file(language).write(serialized);
}
