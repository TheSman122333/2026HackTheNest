import { MongoClient, ObjectId } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { collections, ensureIndexes, type Collections } from '../src/db';
import { currentIsland } from '../src/island';
import { nextMonthIsland, shipDeck } from '../src/ship';

let mongod: MongoMemoryServer;
let client: MongoClient;
let c: Collections;
let app: ReturnType<typeof createApp>;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = new MongoClient(mongod.getUri());
  await client.connect();
  c = collections(client.db('ship-deck'));
  await ensureIndexes(c);
  app = createApp({ c, jwtSecret: 'ship-test-only', allowDevLogin: true, env: { NODE_ENV: 'test' } });
}, 120_000);
afterAll(async () => { await client?.close(); await mongod?.stop(); });
const call = async (method: string, path: string, token?: string, body?: unknown) => {
  const response = await app.request(path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, json: await response.json() as any };
};
async function sailor(name: string, tz = 'UTC', createCrew = true) {
  const login = (await call('POST', '/auth/dev', undefined, { name, tz })).json;
  if (createCrew) await call('POST', '/crews', login.token, { name: `${name}'s ship` });
  return { token: login.token as string, user: (await c.users.findOne({ _id: new ObjectId(login.user.id) }))! };
}

describe('crew deck', () => {
  it('requires authentication and current crew membership', async () => {
    expect((await call('GET', '/crew/deck')).status).toBe(401);
    expect((await call('POST', '/crew/upgrades', undefined, { key: 'sails', expectedLevel: 0 })).status).toBe(401);
    const alone = await sailor('Alone', 'UTC', false);
    expect((await call('GET', '/crew/deck', alone.token)).status).toBe(409);
    const captain = await sailor('Captain');
    await c.crews.updateOne({ _id: captain.user.crewId! }, { $set: { memberIds: [] } });
    expect((await call('GET', '/crew/deck', captain.token)).status).toBe(403);
    expect((await call('POST', '/crew/upgrades', captain.token, { key: 'sails', expectedLevel: 0 })).status).toBe(409);
  });

  it('buys one level atomically under duplicate taps, caps levels, and never overspends', async () => {
    const { token, user } = await sailor('Rigging');
    expect((await call('POST', '/crew/upgrades', token, { key: 'sails', expectedLevel: 0 })).status).toBe(409);
    await c.crews.updateOne({ _id: user.crewId! }, { $set: { 'stores.supplies': 100 } });
    const duplicate = await Promise.all([call('POST', '/crew/upgrades', token, { key: 'sails', expectedLevel: 0 }), call('POST', '/crew/upgrades', token, { key: 'sails', expectedLevel: 0 })]);
    expect(duplicate.map((r) => r.status).sort()).toEqual([200, 409]);
    const deck = duplicate.find((r) => r.status === 200)!.json;
    expect(deck.crew.stores.supplies).toBe(90);
    expect(deck.members[0].monthly).toMatchObject({ upgrades: 1, suppliesInvested: 10, coins: 0 });
    expect(await c.ledger.countDocuments({ crewId: user.crewId, reason: 'ship:upgrade:sails' })).toBe(1);
    expect((await call('POST', '/crew/upgrades', token, { key: 'sails', expectedLevel: 1 })).status).toBe(200);
    expect((await call('POST', '/crew/upgrades', token, { key: 'sails', expectedLevel: 2 })).status).toBe(200);
    expect((await call('POST', '/crew/upgrades', token, { key: 'sails', expectedLevel: 3 })).status).toBe(400);
    const crew = (await c.crews.findOne({ _id: user.crewId! }))!;
    expect(crew.stores.supplies).toBe(40);
    expect(crew.upgradeLog).toHaveLength(3);
    expect((await call('GET', '/crew', token)).json.sailing.averageMoves).toBeCloseTo(2.6);
    expect((await call('GET', '/crew/deck', token)).json.upgrades.find((upgrade: any) => upgrade.key === 'sails')).toMatchObject({ level: 3, cost: null, nextEffect: null });
  });

  it('uses real activity and dated damage, discloses old damage, and respects month/year boundaries', async () => {
    const { user } = await sailor('Monthkeeper', 'America/Toronto');
    const now = new Date('2027-01-01T00:30:00Z'); // Still December 2026 for this captain.
    const crewId = user.crewId!;
    await c.activities.insertMany([
      { userId: user._id, crewId, day: '2026-12-31', kind: 'workout', moves: 2, supplies: 3, legend: 1, xp: {}, at: new Date('2027-01-01T00:15:00Z') },
      { userId: user._id, crewId, day: '2026-11-30', kind: 'walk', moves: 1, supplies: 2, legend: 1, xp: {}, at: new Date('2026-11-30T18:00:00Z') },
    ]);
    await c.ledger.insertMany([
      { crewId, userId: user._id, item: 'supplies', delta: 3, reason: 'activity:workout', at: new Date('2027-01-01T00:15:00Z') },
      { crewId, userId: user._id, item: 'supplies', delta: 5, reason: 'island:loot', at: new Date('2026-12-15T12:00:00Z') },
      { crewId, userId: user._id, item: 'boss_damage', delta: 7, reason: 'fight:damage', at: new Date('2026-12-15T12:00:00Z') },
    ]);
    const isle = await currentIsland(c, crewId);
    await c.islands.updateOne({ _id: isle._id }, { $set: { [`fight.damageBy.${user._id.toHexString()}`]: 20, 'fight.bossHp': 60 } });
    const original = await shipDeck(c, user, now);
    expect(original.month.key).toBe('2026-12');
    expect(original.map.next).toMatchObject({ month: '2027-01', monthLabel: 'January 2027', name: 'Dawnfrost Cay' });
    expect(original.members[0]!.monthly).toMatchObject({ quests: 1, coins: 8, moves: 2, bossDamage: 7 });
    expect(original.members[0]!.overall).toMatchObject({ quests: 2, coins: 10, moves: 3, bossDamage: 20 });
    expect(original.members[0]!.damageNote).toContain('older island records');
    expect(original.map.preparation).toMatchObject({ earnedMoves: 2, effectiveMoves: 2, targetMoves: 120 });
    expect(original.map.current.conquestProgress).toBeCloseTo(0.5);
    await c.crews.updateOne({ _id: crewId }, { $set: { upgrades: { helm: 2, sails: 1 } } });
    const upgraded = await shipDeck(c, user, now);
    expect(upgraded.map.preparation).toMatchObject({ earnedMoves: 2, effectiveMoves: 2.2, targetMoves: 96 });
    expect(upgraded.map.preparation.progress).toBeGreaterThan(original.map.preparation.progress);
    expect(nextMonthIsland('2026-12').month).toBe('2027-01');
  });

  it('timestamps new fight damage and isolates another crew’s contributions', async () => {
    const own = await sailor('Swordhand');
    const other = await sailor('Other crew');
    await call('POST', '/activities', other.token, { kind: 'workout' });
    await call('GET', '/island', own.token);
    const isle = await currentIsland(c, own.user.crewId!);
    await c.explorers.updateOne({ userId: own.user._id, islandDocId: isle._id }, { $set: { 'explorer.pos': '1,0' } });
    const fight = await call('POST', '/island/fight', own.token, { action: 'strike' });
    expect(fight.status).toBe(200);
    const hit = fight.json.events.find((event: any) => event.type === 'hit');
    const deck = (await call('GET', '/crew/deck', own.token)).json;
    expect(deck.members).toHaveLength(1);
    expect(deck.members[0].monthly.bossDamage).toBe(hit.damage);
    expect(deck.members[0].overall.bossDamage).toBe(hit.damage);
    expect(deck.members[0].overall.quests).toBe(0);
    expect(deck.members[0].history[0].reason).toBe('fight:damage');
  });
});
