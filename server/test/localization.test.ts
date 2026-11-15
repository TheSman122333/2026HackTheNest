import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { createCatalogService, registerLocalizationRoutes } from '../src/localization';
import { cleanText } from '../../apps/mobile/src/ui/text';

const completion = (translations: string[]) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ translations }) } }] }), { headers: { 'content-type': 'application/json' } });

describe('static interface catalogs', () => {
  it('removes emoji sequences while preserving meaningful Indic script joiners', () => {
    expect(cleanText('👩🏽‍🚀 Captain')).toBe(' Captain');
    expect(cleanText('क्‍ष')).toBe('क्‍ष');
    expect(cleanText('தமிழ்  text')).toBe('தமிழ் text');
  });
  it('works without an AI provider and rejects unsupported locales', async () => {
    const app = new Hono();
    registerLocalizationRoutes(app, {}, async () => { throw new Error('not configured'); });
    const response = await app.request('/localization/es');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.language).toBe('es');
    expect(body.available).toBe(false);
    expect(body.translations.Continue).toBeTruthy();
    expect((await app.request('/localization/unsupported')).status).toBe(400);
    expect((await app.request('/localization/es?offset=-1')).status).toBe(400);
    expect((await app.request('/localization/es?offset=1')).status).toBe(400);
  });

  it('translates only fixed source lines, single-flights requests and reuses completed catalogs', async () => {
    let calls = 0;
    const service = createCatalogService({ env: { GEMINI_API_KEY: 'test' }, sources: ['Continue', '{count} Moves'], bundled: {}, fetchImpl: async (_url, init) => {
      calls++;
      const request = JSON.parse(String(init?.body));
      expect(JSON.parse(request.messages[1].content)).toEqual(['Continue', '{count} Moves']);
      expect(request.messages[0].content).toContain('Spanish (es)');
      return completion(['Continuar', '{count} movimientos']);
    } });
    const [first, duplicate] = await Promise.all([service('es'), service('es')]);
    expect(first.complete).toBe(true);
    expect(duplicate.translations).toEqual(first.translations);
    expect(first.translations['{count} Moves']).toBe('{count} movimientos');
    expect((await service('es')).complete).toBe(true);
    expect(calls).toBe(1);
  });

  it('rejects dropped placeholders and cools down failures while retaining bundled copy', async () => {
    let calls = 0;
    const service = createCatalogService({ env: { GEMINI_API_KEY: 'test' }, sources: ['Continue', '{count} Moves'], bundled: { es: { Continue: 'Continuar' } }, fetchImpl: async () => { calls++; return completion(['movimientos']); } });
    expect(await service('es')).toMatchObject({ complete: false, translations: { Continue: 'Continuar' } });
    expect(await service('es')).toMatchObject({ complete: false, translations: { Continue: 'Continuar' } });
    expect(calls).toBe(1);
  });

  it('progressively generates catalogs in at most two batches per request', async () => {
    let calls = 0;
    const sources = Array.from({ length: 125 }, (_unused, i) => `Copy ${i}`);
    const service = createCatalogService({ env: { GEMINI_API_KEY: 'test' }, sources, bundled: {}, fetchImpl: async (_url, init) => {
      calls++;
      const request = JSON.parse(String(init?.body));
      const lines = JSON.parse(request.messages[1].content) as string[];
      expect(lines.length).toBeLessThanOrEqual(60);
      return completion(lines.map((line) => `Texte ${line}`));
    } });
    const partial = await service('fr');
    expect(partial.complete).toBe(false);
    expect(Object.keys(partial.translations)).toHaveLength(120);
    expect(calls).toBe(2);
    const complete = await service('fr');
    expect(complete.complete).toBe(true);
    expect(Object.keys(complete.translations)).toHaveLength(125);
    expect(calls).toBe(3);
  });

  it('supports explicit catalog pages across cold server instances', async () => {
    const sources = Array.from({ length: 125 }, (_unused, i) => `Copy ${i}`);
    const options = { env: { GEMINI_API_KEY: 'test' }, sources, bundled: {}, fetchImpl: (async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      return completion((JSON.parse(request.messages[1].content) as string[]).map((line) => `Texte ${line}`));
    }) as typeof fetch };
    const firstInstance = await createCatalogService(options)('fr', 0);
    const secondInstance = await createCatalogService(options)('fr', 120);
    const merged = { ...firstInstance.translations, ...secondInstance.translations };
    expect(Object.keys(merged)).toHaveLength(125);
    expect(merged['Copy 124']).toBe('Texte Copy 124');
  });
});
