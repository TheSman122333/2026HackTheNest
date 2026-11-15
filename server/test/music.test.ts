import { EMPTY_STREAK } from '@last-voyage/game';
import { MongoClient, ObjectId } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { collections, ensureIndexes, type Collections } from '../src/db';
import { themePrompt } from '../src/music';

let mongod: MongoMemoryServer;
let client: MongoClient;
let c: Collections;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = new MongoClient(mongod.getUri());
  await client.connect();
  c = collections(client.db('music'));
  await ensureIndexes(c);
}, 120_000);

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe('theme songs', () => {
  it('builds an instrumental prompt from the top skill, island and streak; remix varies it', () => {
    const user = { _id: new ObjectId(), skills: { grit: 10, charm: 10, lore: 40, craft: 10, seacraft: 10 }, streak: { ...EMPTY_STREAK, calmDays: 4 } };
    const p1 = themePrompt(user, 'spooky', 1);
    expect(p1).toContain('harp');
    expect(p1).toContain('music box');
    expect(p1).toContain('triumphant');
    expect(p1).toContain('no vocals');
    expect(themePrompt(user, 'spooky', 1)).toBe(p1);
  });

  it('generates in the background and serves the audio only to its owner', async () => {
    const mp3 = new Uint8Array(4000).fill(7);
    const fetchImpl: typeof fetch = async (url) => {
      expect(String(url)).toContain('/v1/music');
      return new Response(mp3, { headers: { 'content-type': 'audio/mpeg' } });
    };
    const app = createApp({ c, jwtSecret: 'test', allowDevLogin: true, env: { ELEVENLABS_API_KEY: 'k' }, fetchImpl });
    const login = async (name: string) =>
      ((await (await app.request('/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })).json()) as { token: string }).token;
    const a = await login('Ana');
    const b = await login('Ben');
    const auth = (t: string) => ({ authorization: `Bearer ${t}` });

    const start = await (await app.request('/me/theme', { method: 'POST', headers: auth(a) })).json();
    expect(start.status).toBe('pending');
    let view = start;
    for (let i = 0; i < 50 && view.status === 'pending'; i++) {
      await new Promise((r) => setTimeout(r, 20));
      view = await (await app.request('/me/theme', { headers: auth(a) })).json();
    }
    expect(view.status).toBe('ready');
    const audio = await app.request(view.audio, { headers: auth(a) });
    expect(audio.status).toBe(200);
    expect((await audio.arrayBuffer()).byteLength).toBe(4000);
    expect((await app.request('/me/theme/audio', { headers: auth(b) })).status).toBe(404);
  });
});
