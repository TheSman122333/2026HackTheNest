import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { collections, ensureIndexes } from '../src/db';

let mongod: MongoMemoryServer;
let client: MongoClient;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = new MongoClient(mongod.getUri());
  await client.connect();
  const c = collections(client.db('test'));
  await ensureIndexes(c);
  app = createApp({ c, jwtSecret: 'test-secret', allowDevLogin: true });
}, 120_000);

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

const call = async (method: string, path: string, token?: string, body?: unknown) => {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as any };
};

describe('api', () => {
  it('rejects unauthenticated', async () => {
    expect((await call('GET', '/me')).status).toBe(401);
  });

  it('full real-life loop: login, crew, activity, moves, spend', async () => {
    const a = (await call('POST', '/auth/dev', undefined, { name: 'Ana', tz: 'America/Detroit' })).json;
    const b = (await call('POST', '/auth/dev', undefined, { name: 'Ben', tz: 'America/Detroit' })).json;

    const crew = (await call('POST', '/crews', a.token, { name: 'Gullwing' })).json.crew;
    expect(crew.inviteCode).toHaveLength(6);
    const joined = await call('POST', '/crews/join', b.token, { code: crew.inviteCode.toLowerCase() });
    expect(joined.json.crew.memberIds).toHaveLength(2);

    const act = await call('POST', '/activities', a.token, { kind: 'workout' });
    expect(act.status).toBe(200);
    expect(act.json.grant).toMatchObject({ supplies: 3, moves: 2 });

    const day = await call('PUT', '/moves/today', a.token, {
      steps: 4200,
      screen: { swipes: 12, minutes: 4, opens: 1, tracked: true },
    });
    // base 2 + steps 4 + activity 2 = 8, ×1.0
    expect(day.json.today.moves).toMatchObject({ total: 8, remaining: 8 });

    const spent = await call('POST', '/moves/spend', a.token, { n: 5 });
    expect(spent.json.today.moves.remaining).toBe(3);
    expect((await call('POST', '/moves/spend', a.token, { n: 5 })).status).toBe(409);

    const me = (await call('GET', '/me', a.token)).json;
    expect(me.crew.stores.supplies).toBe(3);
    expect(me.user.skills.grit).toBe(15);

    const log = (await call('GET', '/log', b.token)).json;
    expect(log.entries[0]).toMatchObject({ item: 'supplies', delta: 3 });
  });

  it('validates input', async () => {
    const a = (await call('POST', '/auth/dev', undefined, { name: 'Cy' })).json;
    expect((await call('POST', '/activities', a.token, { kind: 'doomscroll' })).status).toBe(400);
  });
});
