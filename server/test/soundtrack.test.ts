import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { collections, ensureIndexes, type Collections } from '../src/db';
import { EFFECT_IDS } from '../src/soundtrack';
import { narratorVoiceId, responseForScene, synthesizeSpeech } from '../src/voice';

let mongod: MongoMemoryServer;
let client: MongoClient;
let c: Collections;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = new MongoClient(mongod.getUri());
  await client.connect();
  c = collections(client.db('shared-game-audio'));
  await ensureIndexes(c);
}, 120_000);
afterAll(async () => { await client?.close(); await mongod?.stop(); });
beforeEach(async () => { await c.media.deleteMany({ _id: /^soundtrack:/ }); });

const makeApp = (env: NodeJS.ProcessEnv, fetchImpl: typeof fetch) => createApp({ c, jwtSecret: 'soundtrack-test-only', allowDevLogin: true, env, fetchImpl });
const login = async (app: ReturnType<typeof makeApp>, name: string) => {
  const response = await app.request('/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, tz: 'UTC' }) });
  return (await response.json() as { token: string }).token;
};
const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const audio = () => new Response(new Uint8Array(2048).fill(11), { headers: { 'content-type': 'audio/mpeg' } });

describe('shared original game audio', () => {
  it('requires authentication, has a fixed catalog, and degrades without credentials', async () => {
    let calls = 0;
    const app = makeApp({}, async () => { calls++; throw new Error('not configured'); });
    expect((await app.request('/audio/catalog')).status).toBe(401);
    expect((await app.request('/audio/clips/strike')).status).toBe(401);
    const token = await login(app, 'Quiet listener');
    expect(await (await app.request('/audio/catalog', { headers: auth(token) })).json()).toEqual({ enabled: false, effects: {}, music: null });
    expect((await app.request('/audio/clips/strike', { headers: auth(token) })).status).toBe(503);
    expect((await app.request('/audio/clips/arbitrary-prompt', { headers: auth(token) })).status).toBe(404);
    expect(calls).toBe(0);
  });

  it('generates one shared effect for concurrent players and serves its Mongo cache afterward', async () => {
    let calls = 0;
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const fetchImpl: typeof fetch = async (url, options) => {
      calls++;
      expect(String(url)).toBe('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128');
      expect(new Headers(options?.headers).get('xi-api-key')).toBe('server-only-test-key');
      expect(options?.method).toBe('POST');
      const body = JSON.parse(String(options?.body));
      expect(body).toMatchObject({ model_id: 'eleven_text_to_sound_v3', duration_seconds: 0.6, prompt_influence: 0.7, loop: false });
      expect(body.text).toContain('wooden ship deck');
      expect(body.text).toContain('no voice');
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      await blocked;
      return audio();
    };
    const app = makeApp({ ELEVENLABS_API_KEY: 'server-only-test-key' }, fetchImpl);
    const a = await login(app, 'Listener A');
    const b = await login(app, 'Listener B');
    const catalog = await (await app.request('/audio/catalog', { headers: auth(a) })).json() as { enabled: boolean; effects: Record<string, string>; music: string };
    expect(catalog.enabled).toBe(true);
    expect(Object.keys(catalog.effects)).toEqual([...EFFECT_IDS]);
    expect(JSON.stringify(catalog)).not.toContain('server-only-test-key');
    const first = app.request(catalog.effects.move!, { headers: auth(a) });
    const second = app.request(catalog.effects.move!, { headers: auth(b) });
    for (let i = 0; i < 50 && calls === 0; i++) await new Promise((resolve) => setTimeout(resolve, 5));
    release();
    const responses = await Promise.all([first, second]);
    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('audio/mpeg');
      expect(response.headers.get('cache-control')).toContain('private');
      expect((await response.arrayBuffer()).byteLength).toBe(2048);
    }
    expect(calls).toBe(1);
    expect(await c.media.countDocuments({ _id: /^soundtrack:/ })).toBe(1);
    const secondApp = makeApp({ ELEVENLABS_API_KEY: 'server-only-test-key' }, async () => { throw new Error('must use durable cache'); });
    const again = await secondApp.request(catalog.effects.move!, { headers: auth(a) });
    expect(again.status).toBe(200);
    expect((await again.arrayBuffer()).byteLength).toBe(2048);
  });

  it('requests a thirty-second original instrumental from ElevenLabs Music', async () => {
    let calls = 0;
    const app = makeApp({ ELEVENLABS_API_KEY: 'music-test-key' }, async (url, options) => {
      calls++;
      expect(String(url)).toBe('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128');
      const body = JSON.parse(String(options?.body));
      expect(body).toMatchObject({ music_length_ms: 30_000, model_id: 'music_v1', force_instrumental: true });
      expect(body.prompt).toContain('Original instrumental');
      expect(body.prompt).toContain('no spoken words');
      expect(body.prompt).toContain('Do not imitate');
      return audio();
    });
    const token = await login(app, 'Music listener');
    const catalog = await (await app.request('/audio/catalog', { headers: auth(token) })).json() as { music: string };
    expect((await app.request(catalog.music, { headers: auth(token) })).status).toBe(200);
    expect((await app.request(catalog.music, { headers: auth(token) })).status).toBe(200);
    expect(calls).toBe(1);
  });

  it('rejects provider failures, non-audio and oversized data without caching fake audio', async () => {
    for (const provider of [
      () => new Response('quota limit', { status: 429 }),
      () => new Response('{"error":"unavailable"}', { headers: { 'content-type': 'application/json' } }),
      () => new Response(new Uint8Array(500_001), { headers: { 'content-type': 'audio/mpeg' } }),
      () => new Response(new Uint8Array(4), { headers: { 'content-type': 'audio/mpeg' } }),
      () => { throw new Error('network unavailable'); },
    ]) {
      let calls = 0;
      const app = makeApp({ ELEVENLABS_API_KEY: 'test-key' }, async () => { calls++; return provider(); });
      const token = await login(app, 'Audio unavailable');
      for (let i = 0; i < 2; i++) {
        const response = await app.request('/audio/clips/cannon', { headers: auth(token) });
        expect(response.status).toBe(503);
        expect(response.headers.get('retry-after')).toBe('15');
        expect(await response.text()).not.toContain('test-key');
      }
      expect(calls).toBe(1);
      expect(await c.media.countDocuments({ _id: /^soundtrack:/ })).toBe(0);
    }
  });
});

describe('brief neutral narration', () => {
  it('uses a neutral default voice and explicit narrator override rather than a legacy character voice', async () => {
    expect(narratorVoiceId({ ELEVENLABS_VOICE_ID: 'old-pirate' })).toBe('21m00Tcm4TlvDq8ikWAM');
    let called = false;
    const bytes = await synthesizeSpeech('Your next quest is ready.', { ELEVENLABS_API_KEY: 'test-key', ELEVENLABS_NARRATOR_VOICE_ID: 'neutral-test' }, async (url, options) => {
      called = true;
      expect(String(url)).toBe('https://api.elevenlabs.io/v1/text-to-speech/neutral-test');
      expect(JSON.parse(String(options?.body)).voice_settings).toMatchObject({ style: 0, stability: 0.75, speed: 1, use_speaker_boost: false });
      return audio();
    });
    expect(called).toBe(true);
    expect(bytes?.byteLength).toBe(2048);
  });

  it('keeps automatic scene replies short and free of pirate performance', () => {
    const view = { island: { theme: 'tropical', index: 0, conquered: false }, explorer: { hp: 30, maxHp: 30, pos: '1,0' }, boss: { name: 'Tide Crab', hp: 100, maxHp: 120, defeated: false }, movesRemaining: 3, canFight: false };
    const today = { steps: 2000, activities: [], moves: { total: 3, remaining: 3 }, streak: { calmDays: 2, shields: 0 } };
    for (const scene of ['arrival', 'ship', 'island', 'quests', 'log', 'me', 'activity', 'move', 'fight', 'night'] as const) {
      const reply = responseForScene(scene, 'Alex', view, today);
      expect(reply.split(/\s+/).length).toBeLessThanOrEqual(24);
      expect(reply).not.toMatch(/ahoy|sailor|ye\b|arrr|fine pirate/i);
    }
  });
});
