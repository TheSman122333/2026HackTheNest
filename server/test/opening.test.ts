import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { collections, type Collections } from '../src/db';
import { OPENING_NARRATION } from '../src/opening';
import { OPENING_PASSAGES } from '../src/voice-language';

let mongod: MongoMemoryServer;
let client: MongoClient;
let c: Collections;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = new MongoClient(mongod.getUri());
  await client.connect();
  c = collections(client.db('opening'));
}, 120_000);
afterAll(async () => { await client?.close(); await mongod?.stop(); });

describe('opening cutscene narration', () => {
  it('serves translated opening text before sign-in and keeps audio caches separate by language', async () => {
    const calls: string[] = [];
    const app = createApp({ c, jwtSecret: 'localized-opening-test', allowDevLogin: true,
      env: { ELEVENLABS_API_KEY: 'test-key', ELEVENLABS_NARRATOR_VOICE_ID: 'localized-captain' },
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        calls.push(body.language_code);
        expect(body.text).toBe(OPENING_PASSAGES[body.language_code as keyof typeof OPENING_PASSAGES]);
        return new Response(new Uint8Array([calls.length, 2, 3]));
      },
    });
    const spanish = await (await app.request('/opening/narration?language=es-MX')).json();
    const french = await (await app.request('/opening/narration', { headers: { 'X-App-Language': 'fr' } })).json();
    expect(spanish.text).toBe(OPENING_PASSAGES.es);
    expect(french.text).toBe(OPENING_PASSAGES.fr);
    expect(spanish.audioUrl).toContain('language=es&v=');
    expect(french.audioUrl).toContain('language=fr&v=');
    expect((await app.request(spanish.audioUrl)).status).toBe(200);
    expect((await app.request(french.audioUrl)).status).toBe(200);
    expect((await app.request(spanish.audioUrl)).status).toBe(200);
    expect(calls).toEqual(['es', 'fr']);
  });

  it('offers the supplied passage before sign-in and works without a speech provider', async () => {
    const app = createApp({ c, jwtSecret: 'opening-test', allowDevLogin: true, env: {}, fetchImpl: async () => { throw new Error('must not call a provider'); } });
    const response = await app.request('/opening/narration?text=untrusted');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: OPENING_NARRATION, audioUrl: null });
    expect((await app.request('/opening/audio')).status).toBe(503);
  });

  it('synthesizes only the fixed passage and reuses its audio across requests and server instances', async () => {
    let calls = 0;
    const env = { ELEVENLABS_API_KEY: 'test-key', ELEVENLABS_NARRATOR_VOICE_ID: 'test-opening-voice' };
    const fetchImpl: typeof fetch = async (url, init) => {
      calls++;
      expect(String(url)).toBe('https://api.elevenlabs.io/v1/text-to-speech/test-opening-voice');
      expect(JSON.parse(String(init?.body)).text).toBe(OPENING_NARRATION);
      return new Response(new Uint8Array([11, 22, 33]).buffer);
    };
    const app = createApp({ c, jwtSecret: 'opening-test', allowDevLogin: true, env, fetchImpl });
    expect(await (await app.request('/opening/narration')).json()).toEqual({ text: OPENING_NARRATION, audioUrl: expect.stringMatching(/^\/opening\/audio\?v=[0-9a-f]{24}$/) });
    const results = await Promise.all([app.request('/opening/audio'), app.request('/opening/audio?text=ignored')]);
    for (const response of results) {
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('audio/mpeg');
      expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([11, 22, 33]);
    }
    expect(calls).toBe(1);
    const anotherInstance = createApp({ c, jwtSecret: 'opening-test', allowDevLogin: true, env, fetchImpl: async () => { throw new Error('cached audio must survive an instance restart'); } });
    expect((await anotherInstance.request('/opening/audio')).status).toBe(200);
  });
});
