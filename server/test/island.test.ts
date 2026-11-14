import { MongoClient, ObjectId } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { collections, ensureIndexes, type Collections } from '../src/db';

let mongod: MongoMemoryServer;
let client: MongoClient;
let c: Collections;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = new MongoClient(mongod.getUri());
  await client.connect();
  c = collections(client.db('island'));
  await ensureIndexes(c);
  app = createApp({ c, jwtSecret: 's', allowDevLogin: true });
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

describe('island', () => {
  it('explore → reach boss → fight → conquer → sail', async () => {
    const { token, user } = (await call('POST', '/auth/dev', undefined, { name: 'Ana' })).json;
    expect((await call('GET', '/island', token)).status).toBe(409); // no crew yet
    await call('POST', '/crews', token, { name: 'Gulls' });

    // plenty of moves for the test
    await call('PUT', '/moves/today', token, { steps: 50_000, screen: { swipes: 0, minutes: 0, opens: 0, tracked: true } });
    for (const kind of ['workout', 'outdoors', 'friends']) await call('POST', '/activities', token, { kind });

    let v = (await call('GET', '/island', token)).json;
    expect(v.explorer.pos).toBe(v.island.start);
    expect(Object.keys(v.island.tiles).length).toBeLessThan(v.island.allHexes.length); // fog
    const startMoves = v.movesRemaining;

    // walk toward the boss: always pick the reachable hex closest to the center
    const dist = (k: string) => {
      const [q, r] = k.split(',').map(Number) as [number, number];
      return (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
    };
    for (let i = 0; i < 12 && !v.canFight; i++) {
      const next = Object.keys(v.reachable).sort((a, b) => dist(a) - dist(b) || v.reachable[a] - v.reachable[b])[0];
      if (!next) break;
      const r = await call('POST', '/island/move', token, { to: next });
      expect(r.status).toBe(200);
      v = r.json;
      if (v.explorer.hp <= 0) break;
    }
    expect(v.movesRemaining).toBeLessThan(startMoves);

    // force the encounter for determinism: stand next to the boss with a cannon stash
    const isle = await c.islands.findOne({ crewId: new ObjectId(v.boss && (await c.users.findOne({ _id: new ObjectId(user.id) }))!.crewId!) });
    await c.explorers.updateOne(
      { userId: new ObjectId(user.id), islandDocId: isle!._id },
      { $set: { 'explorer.pos': '1,0', 'explorer.hp': 999, 'explorer.inventory': { cannon: 20, cutlass: 1 } } },
    );
    await c.islands.updateOne({ _id: isle!._id }, { $set: { 'fight.bossHp': 20 } });
    // top up moves
    await c.dayLogs.updateMany({ userId: new ObjectId(user.id) }, { $set: { movesSpent: 0 } });

    const f1 = await call('POST', '/island/fight', token, { action: 'cannon' });
    expect(f1.status).toBe(200);
    expect(f1.json.explorer.inventory.cannon).toBe(19);
    const f2 = await call('POST', '/island/fight', token, { action: 'cannon' });
    expect(f2.json.events.some((e: any) => e.type === 'boss_defeated')).toBe(true);
    expect(f2.json.island.conquered).toBe(true);
    expect((await call('POST', '/island/fight', token, { action: 'strike' })).status).toBe(409);

    const me = (await call('GET', '/me', token)).json;
    expect(me.user.legend).toBeGreaterThanOrEqual(8);

    const night = await call('POST', '/crew/advance-night', token);
    expect(night.json.sailed).toBe(true);
    expect(night.json.island.index).toBe(1);
    expect(night.json.island.theme).toBe('spooky');

    const log = (await call('GET', '/log', token)).json.entries;
    expect(log.some((e: any) => /defeated/.test(e.text))).toBe(true);
    expect(log.some((e: any) => /sailed/.test(e.text))).toBe(true);
  });
});
