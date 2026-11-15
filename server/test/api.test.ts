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
  it('legend ranks you in your crew and across crews, and End the Year crowns the top pirate', async () => {
    const a = (await call('POST', '/auth/dev', undefined, { name: 'Lea', tz: 'UTC' })).json;
    const b = (await call('POST', '/auth/dev', undefined, { name: 'Max', tz: 'UTC' })).json;
    const crew = (await call('POST', '/crews', a.token, { name: 'Starfall' })).json.crew;
    await call('POST', '/crews/join', b.token, { code: crew.inviteCode });
    for (let i = 0; i < 5; i++) await call('POST', '/activities', b.token, { kind: 'read' });

    const board = (await call('GET', '/legend', a.token)).json;
    expect(board.crew.map((r: { name: string }) => r.name)).toEqual(['Max', 'Lea']);
    expect(board.me).toMatchObject({ crewRank: 2, crewSize: 2 });
    expect(board.me.globalRank).toBeGreaterThan(1);
    expect(board.global[0].legend).toBeGreaterThanOrEqual(board.global.at(-1).legend);

    const ended = (await call('POST', '/legend/end-year', a.token)).json.season;
    expect(ended.winner.legend).toBe(board.global[0].legend);
    const after = (await call('GET', '/legend', a.token)).json;
    expect(after.lodestar.id).toBe(ended.id);
    expect(after.global[0].lodestar).toBe(true);
  });

  it('leaving a crew needs its name, keeps Legend, and allows joining another', async () => {
    const a = (await call('POST', '/auth/dev', undefined, { name: 'Cy', tz: 'UTC' })).json;
    const b = (await call('POST', '/auth/dev', undefined, { name: 'Di', tz: 'UTC' })).json;
    const first = (await call('POST', '/crews', a.token, { name: 'Salt  Wind' })).json.crew;
    const second = (await call('POST', '/crews', b.token, { name: 'Ember Gulls' })).json.crew;
    await call('POST', '/activities', a.token, { kind: 'walk' });
    const legend = (await call('GET', '/me', a.token)).json.user.legend;

    expect((await call('POST', '/crew/leave', a.token, { confirmName: 'Ember Gulls' })).status).toBe(400);
    expect((await call('GET', '/me', a.token)).json.crew).not.toBeNull();
    expect((await call('POST', '/crew/leave', a.token, { confirmName: '  salt wind ' })).json).toEqual({ left: true });

    const me = (await call('GET', '/me', a.token)).json;
    expect(me.crew).toBeNull();
    expect(me.user.legend).toBe(legend);
    expect((await call('POST', '/crew/leave', a.token, { confirmName: 'Salt Wind' })).status).toBe(409);
    const joined = await call('POST', '/crews/join', a.token, { code: second.inviteCode });
    expect(joined.json.crew.memberIds).toHaveLength(2);
    expect(first.memberIds).toHaveLength(1);
  });

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

    const sailing = (await call('GET', '/crew', a.token)).json.sailing;
    expect(sailing).toEqual({ totalMoves: 10, averageMoves: 5, activities: 1, steps: 4200, activeMembers: 1, members: 2 });

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

  it('combines crew effort across each member’s local day', async () => {
    const a = (await call('POST', '/auth/dev', undefined, { name: 'East', tz: 'Pacific/Kiritimati' })).json;
    const b = (await call('POST', '/auth/dev', undefined, { name: 'West', tz: 'Pacific/Pago_Pago' })).json;
    const crew = (await call('POST', '/crews', a.token, { name: 'Across the Date Line' })).json.crew;
    await call('POST', '/crews/join', b.token, { code: crew.inviteCode });
    await call('POST', '/activities', a.token, { kind: 'workout' });
    await call('POST', '/activities', b.token, { kind: 'walk' });
    const before = (await call('GET', '/crew', a.token)).json.sailing;
    expect(before).toEqual({ totalMoves: 7, averageMoves: 3.5, activities: 2, steps: 0, activeMembers: 2, members: 2 });
    await call('POST', '/moves/spend', b.token, { n: 1 });
    expect((await call('GET', '/crew', b.token)).json.sailing).toEqual(before);
  });
});
