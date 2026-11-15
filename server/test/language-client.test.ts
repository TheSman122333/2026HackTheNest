/** Exercise the actual client store with local storage/network adapters, without a device. */
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { catalogSourceVersion } from '@last-voyage/game';
import source from '../../content/localization/source.json';

type Store = {
  getState: () => {
    language: string; selected: boolean; status: string; loading: boolean;
    hydrate: () => Promise<void>; chooseLanguage: (language: string) => Promise<void>; retryTranslations: () => Promise<void>;
  };
};
type Harness = {
  preferences: Map<string, string>;
  catalogs: Map<string, string>;
  writes: string[];
  storage: { get: (key: string) => Promise<string | null>; set: (key: string, value: string) => Promise<void> };
};
let clientCode: string;
const require = createRequire(import.meta.url);

beforeAll(async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const result = await build({
    stdin: { contents: "export { useLanguage } from './apps/mobile/src/state/language'; export { getRequestLanguage } from './apps/mobile/src/features/language/requestLanguage';", resolveDir: root, loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', write: false, external: ['react'], logLevel: 'silent',
    plugins: [{ name: 'local-language-adapters', setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/api$/ }, () => ({ path: 'api', namespace: 'language-test' }));
      builder.onResolve({ filter: /^@\/features\/language\/catalogStorage$/ }, () => ({ path: 'cache', namespace: 'language-test' }));
      builder.onResolve({ filter: /^@\/features\/language\/requestLanguage$/ }, () => ({ path: fileURLToPath(new URL('../../apps/mobile/src/features/language/requestLanguage.ts', import.meta.url)) }));
      builder.onLoad({ filter: /.*/, namespace: 'language-test' }, ({ path }) => ({ contents: path === 'api'
        ? "const h = globalThis.__lastVoyageLanguageHarness; export const storage = h.storage; export const API_BASE = 'https://language.test';"
        : "const h = globalThis.__lastVoyageLanguageHarness; export const readCatalog = async (language) => h.catalogs.get(language) ?? null; export const writeCatalog = async (language, value) => { h.catalogs.set(language, value); };", loader: 'js' }));
    } }],
  });
  clientCode = result.outputFiles[0]!.text;
});

afterEach(() => { vi.unstubAllGlobals(); });

function client(savedLanguage?: string) {
  const preferences = new Map<string, string>();
  if (savedLanguage) preferences.set('lv_language_v1', savedLanguage);
  const harness: Harness = {
    preferences, catalogs: new Map(), writes: [],
    storage: { get: async (key) => preferences.get(key) ?? null, set: async (key, value) => { harness.writes.push(value); preferences.set(key, value); } },
  };
  vi.stubGlobal('__lastVoyageLanguageHarness', harness);
  const module = { exports: {} as { useLanguage: Store; getRequestLanguage: () => string } };
  new Function('require', 'module', 'exports', clientCode)(require, module, module.exports);
  return { ...module.exports, harness };
}

const unavailable = (language: string) => new Response(JSON.stringify({ language, available: false, translations: {} }));

describe('client language lifecycle', () => {
  it('hydrates the saved language before network requests and retains it when translation is offline', async () => {
    const { useLanguage, getRequestLanguage, harness } = client('es');
    const fetch = vi.fn(async (url: string) => {
      expect(getRequestLanguage()).toBe('es');
      expect(url).toMatch(/\/localization\/es\?offset=\d+&v=\d+-[a-z0-9]+$/);
      return unavailable('es');
    });
    vi.stubGlobal('fetch', fetch);
    await useLanguage.getState().hydrate();
    await useLanguage.getState().retryTranslations();
    expect(useLanguage.getState()).toMatchObject({ language: 'es', selected: true, loading: false, status: 'fallback' });
    expect(harness.preferences.get('lv_language_v1')).toBe('es');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('persists rapid changes in order and ignores an older language request finishing last', async () => {
    const { useLanguage, getRequestLanguage, harness } = client();
    let finishSpanish!: (response: Response) => void;
    const spanishResponse = new Promise<Response>((resolve) => { finishSpanish = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/es?') ? spanishResponse : unavailable('fr')));
    const spanishChoice = useLanguage.getState().chooseLanguage('es');
    const spanishLoad = useLanguage.getState().retryTranslations();
    await vi.waitFor(() => { expect(harness.writes).toContain('es'); });
    await useLanguage.getState().chooseLanguage('fr');
    await useLanguage.getState().retryTranslations();
    finishSpanish(unavailable('es'));
    await spanishChoice;
    await spanishLoad;
    expect(useLanguage.getState()).toMatchObject({ language: 'fr', selected: true, loading: false, status: 'fallback' });
    expect(getRequestLanguage()).toBe('fr');
    expect(harness.writes).toEqual(['es', 'fr']);
    expect(harness.preferences.get('lv_language_v1')).toBe('fr');
  });

  it('does not trust a complete flag on a partial cached catalog', async () => {
    const { useLanguage, harness } = client();
    harness.catalogs.set('fr', JSON.stringify({ sourceVersion: catalogSourceVersion(source), complete: true, translations: { Continue: 'Continuer' } }));
    const fetch = vi.fn(async () => unavailable('fr'));
    vi.stubGlobal('fetch', fetch);
    await useLanguage.getState().chooseLanguage('fr');
    await useLanguage.getState().retryTranslations();
    expect(fetch).toHaveBeenCalled();
    expect(useLanguage.getState()).toMatchObject({ language: 'fr', status: 'fallback' });
  });
});
