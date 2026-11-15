import { MongoClient, ObjectId } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { AVATAR_IDS, collections, ensureIndexes, type Collections } from '../src/db';

let mongod: MongoMemoryServer;
let client: MongoClient;
let c: Collections;
let app: ReturnType<typeof createApp>;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = new MongoClient(mongod.getUri());
  await client.connect();
  c = collections(client.db('avatar-selection'));
  await ensureIndexes(c);
  app = createApp({ c, jwtSecret: 'avatar-test-only', allowDevLogin: true, env: { NODE_ENV: 'test' }, fetchImpl: async () => { throw new Error('avatar selection must not use a provider'); } });
}, 120_000);
afterAll(async () => { await client?.close(); await mongod?.stop(); });
const call = async (method: string, path: string, token?: string, body?: unknown) => {
  const response = await app.request(path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, json: await response.json() as any };
};
const login = async (name: string) => (await call('POST', '/auth/dev', undefined, { name, tz: 'UTC' })).json;

describe('avatar selection', () => {
  it('stores a private MongoDB portrait with fitting, restores it, and deletes it without exposing bytes in profiles', async () => {
    const base64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==';
    const photo = { base64, width: 1, height: 1, zoom: 2, offsetX: 0.2, offsetY: -0.1 };
    const a = await login('Cloud portrait');
    const b = await login('Another private portrait');
    expect((await call('GET', '/me/avatar/photo')).status).toBe(401);
    expect((await call('PUT', '/me/avatar', undefined, { avatarId: 'a2', photo })).status).toBe(401);
    expect((await call('PUT', '/me/avatar', a.token, { avatarId: 'a2', photo })).status).toBe(200);
    const stored = (await c.users.findOne({ _id: new ObjectId(a.user.id) }))!;
    expect(Buffer.from(stored.profilePhoto!.bytes.buffer).toString('base64')).toBe(base64);
    const restored = (await call('GET', '/me/avatar/photo', a.token)).json.photo;
    expect(restored).toEqual({ uri: `data:image/jpeg;base64,${base64}`, width: 1, height: 1, zoom: 2, offsetX: 0.2, offsetY: -0.1 });
    expect((await call('GET', '/me/avatar/photo', b.token)).json.photo).toBeNull();
    expect(JSON.stringify((await call('GET', '/me', a.token)).json)).not.toContain(base64);
    await call('PUT', '/me/avatar', a.token, { avatarId: 'a4' });
    expect((await call('GET', '/me/avatar/photo', a.token)).json.photo).toEqual(restored);
    for (const invalid of [{ ...photo, base64: 'not-an-image' }, { ...photo, width: 2 }, { ...photo, zoom: 5 }, { ...photo, offsetX: 4 }, { ...photo, base64: 'A'.repeat(2_000_004) }]) {
      expect((await call('PUT', '/me/avatar', a.token, { avatarId: 'a5', photo: invalid })).status).toBe(400);
    }
    expect((await call('GET', '/me', a.token)).json.user.avatarId).toBe('a4');
    await call('PUT', '/me/avatar', a.token, { avatarId: 'a4', photo: null });
    expect((await call('GET', '/me/avatar/photo', a.token)).json).toEqual({ photo: null, configured: true });
    expect((await c.users.findOne({ _id: stored._id }))!.profilePhoto).toBeUndefined();
  });
  it('requires authentication and persists every supported outfit without storing a photo', async () => {
    expect((await call('PUT', '/me/avatar', undefined, { avatarId: 'a1' })).status).toBe(401);
    const a = await login('Outfit picker');
    expect((await call('GET', '/me', a.token)).json.user.avatarId).toBeNull();
    for (const avatarId of AVATAR_IDS) {
      expect(await call('PUT', '/me/avatar', a.token, { avatarId })).toMatchObject({ status: 200, json: { avatarId } });
      expect((await call('GET', '/me', a.token)).json.user.avatarId).toBe(avatarId);
    }
    const saved = (await c.users.findOne({ _id: new ObjectId(a.user.id) }))!;
    expect(saved.avatarId).toBe('a12');
    expect(saved).not.toHaveProperty('photo');
    expect(saved).not.toHaveProperty('photoUri');
  });

  it('rejects unknown IDs, photo payloads, and another user ID without changing either outfit', async () => {
    const a = await login('Valid outfit');
    const b = await login('Other outfit');
    await call('PUT', '/me/avatar', a.token, { avatarId: 'a3' });
    await call('PUT', '/me/avatar', b.token, { avatarId: 'a7' });
    for (const body of [
      { avatarId: 'a0' }, { avatarId: 'a13' }, { avatarId: 'A1' }, { avatarId: null },
      { avatarId: 1 }, { avatarId: '../../photo.png' }, {},
      { avatarId: 'a4', photo: 'data:image/jpeg;base64,private-photo' },
      { avatarId: 'a4', photoUri: 'file:///private/photo.jpg' },
      { avatarId: 'a4', userId: b.user.id },
    ]) expect((await call('PUT', '/me/avatar', a.token, body)).status).toBe(400);
    expect((await call('GET', '/me', a.token)).json.user.avatarId).toBe('a3');
    expect((await call('GET', '/me', b.token)).json.user.avatarId).toBe('a7');
  });

  it('shares selected outfit IDs through crew, deck, and island views while retaining old-player defaults', async () => {
    const a = await login('Captain avatar');
    const b = await login('Crew avatar');
    const crew = (await call('POST', '/crews', a.token, { name: 'Portrait crew' })).json.crew;
    await call('POST', '/crews/join', b.token, { code: crew.inviteCode });
    const before = (await call('GET', '/crew', a.token)).json;
    expect(before.members.every((member: any) => member.avatarId === null)).toBe(true);
    await call('PUT', '/me/avatar', b.token, { avatarId: 'a10' });
    const roster = (await call('GET', '/crew', a.token)).json;
    expect(roster.members.find((member: any) => member.id === b.user.id).avatarId).toBe('a10');
    const deck = (await call('GET', '/crew/deck', a.token)).json;
    expect(deck.members.find((member: any) => member.id === b.user.id).avatarId).toBe('a10');
    await call('GET', '/island', b.token);
    const view = (await call('GET', '/island', a.token)).json;
    expect(view.crewmates.find((member: any) => member.userId === b.user.id).avatarId).toBe('a10');
    expect(JSON.stringify({ roster, deck, view })).not.toContain('photoUri');
  });
});
