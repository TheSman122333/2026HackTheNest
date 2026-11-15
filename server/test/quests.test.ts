import { ACTIVITY_KINDS } from '@last-voyage/game';
import { MongoClient, ObjectId } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app';
import { awardActivity } from '../src/activities';
import { collections, ensureIndexes, type Collections } from '../src/db';
import { generateQuests, questWeek, type VoyagePreferences } from '../src/quests';

let mongod: MongoMemoryServer;
let client: MongoClient;
let c: Collections;
const prefs = { interests: ['read', 'hobby'], goals: ['learn', 'create'], dailyMinutes: 5, pace: 'gentle', setting: 'indoors', company: 'solo', timeOfDay: 'evening', avoid: ['outdoors', 'workout'] } as const;
const preferences = { ...prefs, interests: [...prefs.interests], goals: [...prefs.goals], avoid: [...prefs.avoid], completedAt: '2026-11-15T12:00:00Z' } satisfies VoyagePreferences;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = new MongoClient(mongod.getUri());
  await client.connect();
  c = collections(client.db('personalized-quests'));
  await ensureIndexes(c);
}, 120_000);
afterAll(async () => { await client?.close(); await mongod?.stop(); });
const call = async (app: ReturnType<typeof createApp>, method: string, path: string, token?: string, body?: unknown, language = 'en') => {
  const response = await app.request(path, { method, headers: { 'content-type': 'application/json', 'X-App-Language': language, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, json: await response.json() as any };
};
const login = async (app: ReturnType<typeof createApp>, name: string, tz = 'UTC') => (await call(app, 'POST', '/auth/dev', undefined, { name, tz })).json;
const setup = () => {
  let at = new Date('2026-11-15T12:00:00Z');
  const app = createApp({ c, jwtSecret: 'quests-test-only', allowDevLogin: true, env: { NODE_ENV: 'test' }, now: () => at });
  return { app, setTime: (value: string) => { at = new Date(value); } };
};
const action = (app: ReturnType<typeof createApp>, token: string, questId: string, type: 'skip' | 'complete', requestId = randomUUID()) => call(app, 'POST', `/quests/${questId}/${type}`, token, { requestId });

describe('voyage preferences and personalized quests', () => {
  it('changes quest copy without replacing quests, resetting completion, or issuing new rewards', async () => {
    let translations = 0;
    const app = createApp({ c, jwtSecret: 'translated-quest-test', allowDevLogin: true, now: () => new Date('2026-11-15T12:00:00Z'),
      env: { NODE_ENV: 'test', OPENAI_API_KEY: 'test-key', OPENAI_MODEL: 'test-model' },
      fetchImpl: async (_url, init) => {
        translations++;
        const input = JSON.parse(String(init?.body));
        expect(input.messages[0].content).toContain('OUTPUT LANGUAGE: French');
        const quests = JSON.parse(input.messages[1].content) as { title: string; description: string }[];
        return Response.json({ choices: [{ message: { content: JSON.stringify({ quests: quests.map((quest) => ({ title: `FR ${quest.title}`, description: `FR ${quest.description}` })) }) } }] });
      },
    });
    const user = await login(app, 'Translated quests');
    await call(app, 'PUT', '/me/preferences', user.token, prefs);
    const original = (await call(app, 'GET', '/quests', user.token)).json;
    const french = (await call(app, 'GET', '/quests', user.token, undefined, 'fr')).json;
    expect(french.quests.map((quest: any) => quest.id)).toEqual(original.quests.map((quest: any) => quest.id));
    expect(french.quests[0].title).toBe(`FR ${original.quests[0].title}`);
    const completed = await call(app, 'POST', `/quests/${original.quests[0].id}/complete`, user.token, { requestId: randomUUID() }, 'fr');
    expect(completed.json.board.quests[0]).toMatchObject({ id: original.quests[0].id, status: 'completed', title: french.quests[0].title });
    const englishAgain = (await call(app, 'GET', '/quests', user.token)).json;
    expect(englishAgain.quests[0]).toMatchObject({ id: original.quests[0].id, status: 'completed', title: original.quests[0].title });
    expect(translations).toBe(1);
  });

  it('requires auth, validates the profile, isolates accounts, and never accepts photos', async () => {
    const { app } = setup();
    const a = await login(app, 'Questionnaire');
    const b = await login(app, 'Private preferences');
    expect((await call(app, 'GET', '/quests')).status).toBe(401);
    expect((await call(app, 'PUT', '/me/preferences', undefined, prefs)).status).toBe(401);
    expect((await call(app, 'GET', '/quests', a.token)).status).toBe(409);
    for (const invalid of [
      { ...prefs, interests: [] }, { ...prefs, dailyMinutes: 7 }, { ...prefs, goals: ['pirate_king'] },
      { ...prefs, interests: ['read', 'read'] }, { ...prefs, avoid: ['read'] }, { ...prefs, photo: 'data:image/jpeg;base64,private' },
      { ...prefs, interests: ['outdoors'], avoid: ACTIVITY_KINDS.filter((kind) => kind !== 'outdoors'), setting: 'indoors' },
    ]) expect((await call(app, 'PUT', '/me/preferences', a.token, invalid)).status).toBe(400);
    const saved = await call(app, 'PUT', '/me/preferences', a.token, prefs);
    expect(saved).toMatchObject({ status: 200, json: { preferences: { ...prefs, completedAt: '2026-11-15T12:00:00.000Z' } } });
    expect((await call(app, 'GET', '/me', a.token)).json.user.preferences).toEqual(saved.json.preferences);
    expect((await call(app, 'GET', '/me', b.token)).json.user.preferences).toBeNull();
  });

  it('keeps today’s three slots and weekly allowance when preferences change, while respecting the total budget', async () => {
    const { app } = setup();
    const a = await login(app, 'Five minute sailor');
    await call(app, 'PUT', '/me/preferences', a.token, prefs);
    const original = (await call(app, 'GET', '/quests', a.token)).json;
    expect(original).toMatchObject({ source: 'fallback', skips: { limit: 5, remaining: 5 } });
    expect(original.quests).toHaveLength(3);
    expect(original.quests.reduce((total: number, quest: any) => total + quest.minutes, 0)).toBeLessThanOrEqual(5);
    expect(original.quests.every((quest: any) => !['outdoors', 'friends', 'workout'].includes(quest.kind))).toBe(true);
    const completed = await action(app, a.token, original.quests[0].id, 'complete');
    expect(completed.status).toBe(200);
    const skipped = (await action(app, a.token, original.quests[1].id, 'skip')).json.board;
    await call(app, 'PUT', '/me/preferences', a.token, { ...prefs, dailyMinutes: 60 });
    const reread = (await call(app, 'GET', '/quests', a.token)).json;
    expect(reread).toEqual(skipped);
    expect(reread.quests[0].status).toBe('completed');
    expect(reread.quests.reduce((total: number, quest: any) => total + quest.minutes, 0)).toBeLessThanOrEqual(5);
    const foreign = await login(app, 'Other board');
    await call(app, 'PUT', '/me/preferences', foreign.token, prefs);
    expect((await action(app, foreign.token, original.quests[2].id, 'complete')).status).toBe(409);
  });

  it('enforces five successful weekly skips, idempotent retries, concurrent claims, and local Monday reset', async () => {
    const { app, setTime } = setup();
    const a = await login(app, 'Weekly allowance', 'America/New_York');
    await call(app, 'PUT', '/me/preferences', a.token, prefs);
    let board = (await call(app, 'GET', '/quests', a.token)).json;
    const id = randomUUID();
    const oldId = board.quests[0].id;
    const attempts = await Promise.all([action(app, a.token, oldId, 'skip', id), action(app, a.token, oldId, 'skip', id)]);
    expect(attempts.every((result) => result.status === 200)).toBe(true);
    board = attempts[0]!.json.board;
    expect(board.skips.remaining).toBe(4);
    expect((await action(app, a.token, oldId, 'skip', id)).json.board.skips.remaining).toBe(4);
    expect((await action(app, a.token, board.quests[0].id, 'complete', id)).status).toBe(409);
    for (let n = 0; n < 4; n++) board = (await action(app, a.token, board.quests[0].id, 'skip')).json.board;
    expect(board.skips.remaining).toBe(0);
    expect(board.skips.resetsAt).toBe('2026-11-16T05:00:00.000Z');
    expect((await action(app, a.token, board.quests[0].id, 'skip')).status).toBe(409);
    expect((await action(app, a.token, board.quests[0].id, 'complete')).status).toBe(200);
    setTime('2026-11-16T04:59:59Z');
    expect((await call(app, 'GET', '/quests', a.token)).json.skips.remaining).toBe(0);
    setTime('2026-11-16T05:00:00Z');
    expect((await call(app, 'GET', '/quests', a.token)).json.skips.remaining).toBe(5);
  });

  it('does not charge losing concurrent skips or skip a completed quest', async () => {
    const { app } = setup();
    const a = await login(app, 'Concurrent detours');
    await call(app, 'PUT', '/me/preferences', a.token, prefs);
    const initial = (await call(app, 'GET', '/quests', a.token)).json;
    const results = await Promise.all(Array.from({ length: 6 }, () => action(app, a.token, initial.quests[0].id, 'skip')));
    expect(results.filter((result) => result.status === 200)).toHaveLength(1);
    const board = (await call(app, 'GET', '/quests', a.token)).json;
    expect(board.skips.remaining).toBe(4);
    await action(app, a.token, board.quests[0].id, 'complete');
    expect((await action(app, a.token, board.quests[0].id, 'skip')).status).toBe(409);
    expect((await call(app, 'GET', '/quests', a.token)).json.skips.remaining).toBe(4);
  });

  it('awards a completed quest once, including concurrent retries, and shares manual activity caps', async () => {
    const { app } = setup();
    const a = await login(app, 'Honest rewards');
    const crew = (await call(app, 'POST', '/crews', a.token, { name: 'One reward per quest' })).json.crew;
    await call(app, 'PUT', '/me/preferences', a.token, { ...prefs, dailyMinutes: 15 });
    const board = (await call(app, 'GET', '/quests', a.token)).json;
    const requestId = randomUUID();
    const results = await Promise.all(Array.from({ length: 6 }, (_, index) => action(app, a.token, board.quests[0].id, 'complete', index < 3 ? requestId : randomUUID())));
    expect(results.every((result) => result.status === 200)).toBe(true);
    const first = results[0]!.json.grant;
    expect(results.every((result) => JSON.stringify(result.json.grant) === JSON.stringify(first))).toBe(true);
    expect(await c.activities.countDocuments({ userId: new ObjectId(a.user.id) })).toBe(1);
    expect((await c.users.findOne({ _id: new ObjectId(a.user.id) }))!.supplies).toBe(first.supplies);
    expect((await c.crews.findOne({ _id: new ObjectId(crew.id) }))!.stores.supplies).toBe(first.supplies);
    await Promise.all(Array.from({ length: 10 }, () => call(app, 'POST', '/activities', a.token, { kind: 'workout' })));
    for (const quest of board.quests.slice(1)) expect((await action(app, a.token, quest.id, 'complete')).status).toBe(200);
    const activities = await c.activities.find({ userId: new ObjectId(a.user.id) }).toArray();
    expect(activities.reduce((total, activity) => total + activity.supplies, 0)).toBe(10);
    expect(activities.reduce((total, activity) => total + activity.moves, 0)).toBeLessThanOrEqual(6);
    expect(activities.reduce((total, activity) => total + activity.legend, 0)).toBe(2);
    expect((await c.crews.findOne({ _id: new ObjectId(crew.id) }))!.stores.supplies).toBe(10);
    expect((await c.users.findOne({ _id: new ObjectId(a.user.id) }))!.activityReceipts).toHaveLength(0);
  });

  it('repairs a completion interrupted before awarding after the day and week roll over', async () => {
    const { app, setTime } = setup();
    const a = await login(app, 'Survives a restart');
    await call(app, 'PUT', '/me/preferences', a.token, prefs);
    const board = (await call(app, 'GET', '/quests', a.token)).json;
    const quest = board.quests[0];
    const key = `${a.user.id}:2026-11-09`;
    await c.questWeeks.updateOne({ _id: key }, { $set: { 'days.2026-11-15.0.status': 'completed', 'days.2026-11-15.0.completedAt': new Date('2026-11-15T12:00Z') }, $push: { pendingCompletions: { questId: quest.id, kind: quest.kind, at: new Date('2026-11-15T12:00Z') } } });
    setTime('2026-11-16T12:00:00Z');
    expect((await call(app, 'GET', '/quests', a.token)).status).toBe(200);
    expect((await c.activities.findOne({ eventId: `quest:${quest.id}` }))!.day).toBe('2026-11-15');
    expect((await c.questWeeks.findOne({ _id: key }))!.pendingCompletions).toHaveLength(0);
    await call(app, 'GET', '/quests', a.token);
    expect(await c.activities.countDocuments({ eventId: `quest:${quest.id}` })).toBe(1);
  });

  it('recovers a partial reward projection without double-crediting user or crew', async () => {
    const { app } = setup();
    const a = await login(app, 'Projection recovery');
    const crew = (await call(app, 'POST', '/crews', a.token, { name: 'Durable rewards' })).json.crew;
    const user = (await c.users.findOne({ _id: new ObjectId(a.user.id) }))!;
    const update = c.ledger.updateOne.bind(c.ledger);
    const spy = vi.spyOn(c.ledger, 'updateOne').mockRejectedValueOnce(new Error('simulated database interruption'));
    await expect(awardActivity(c, user, 'read', new Date('2026-11-15T12:00Z'), 'quest:interrupted')).rejects.toThrow('simulated');
    spy.mockImplementation(update);
    const retried = await awardActivity(c, user, 'read', new Date('2026-11-15T12:00Z'), 'quest:interrupted');
    spy.mockRestore();
    expect(retried.grant.supplies).toBe(2);
    expect((await c.users.findOne({ _id: user._id }))!.supplies).toBe(2);
    expect((await c.crews.findOne({ _id: new ObjectId(crew.id) }))!.stores.supplies).toBe(2);
    expect(await c.activities.countDocuments({ eventId: 'quest:interrupted' })).toBe(1);
    expect(await c.ledger.countDocuments({ eventId: 'quest:interrupted' })).toBe(1);
  });
});

describe('Gemini quest generation', () => {
  const response = (quests: unknown[]) => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ quests }) }] } }] }));
  const tasks = [
    { kind: 'read', title: 'One useful paragraph', description: 'Read a paragraph from something you already own and remember one idea.', minutes: 2 },
    { kind: 'hobby', title: 'A tiny creative spark', description: 'Make a quick sketch with whatever materials you already have.', minutes: 2 },
    { kind: 'journal', title: 'Keep a quiet note', description: 'Think privately about one thing that went well today.', minutes: 1 },
  ];
  it('uses server-only key, structured JSON, bounded requests, safe preferences, and the total daily budget', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response(tasks));
    const generated = await generateQuests(preferences, 3, 0, [], { env: { GEMINI_API_KEY: 'test-key-only' }, fetchImpl });
    expect(generated.every((quest) => quest.source === 'gemini')).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    expect(String(url)).not.toContain('test-key');
    expect(init!.headers).toMatchObject({ 'x-goog-api-key': 'test-key-only' });
    expect(init!.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(init!.body as string);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseJsonSchema.properties.quests.maxItems).toBe(3);
    expect(body.contents[0].parts[0].text).toContain('TOTAL time');
    expect(JSON.stringify(body)).not.toMatch(/photo|avatarId|userId|completedAt|ssojetSub/);
  });
  it('uses honest, valid fallback for missing key, outages, invalid categories, oversized time, and repeated titles', async () => {
    const variants = [
      new Response('unavailable', { status: 503 }), response([{ ...tasks[0], kind: 'outdoors' }, ...tasks.slice(1)]),
      response(tasks.map((quest) => ({ ...quest, minutes: 5 }))), response([tasks[0], tasks[0], tasks[2]]), new Response('not json'),
    ];
    for (const providerResponse of variants) {
      const fetchImpl = vi.fn<typeof fetch>(async () => providerResponse);
      const generated = await generateQuests(preferences, 3, 0, [], { env: { GEMINI_API_KEY: 'test-key-only' }, fetchImpl });
      expect(generated.every((quest) => quest.source === 'fallback')).toBe(true);
      expect(generated.reduce((total, quest) => total + quest.minutes, 0)).toBeLessThanOrEqual(5);
      expect(generated.every((quest) => !['outdoors', 'friends', 'workout'].includes(quest.kind))).toBe(true);
    }
    const unused = vi.fn<typeof fetch>();
    expect((await generateQuests(preferences, 3, 0, [], { env: {}, fetchImpl: unused })).every((quest) => quest.source === 'fallback')).toBe(true);
    expect(unused).not.toHaveBeenCalled();
  });
  it('shares concurrent initial generation, with one durable board', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetchImpl = vi.fn<typeof fetch>(async () => { await gate; return response(tasks); });
    const app = createApp({ c, jwtSecret: 'quests-test-only', allowDevLogin: true, env: { NODE_ENV: 'test', GEMINI_API_KEY: 'test-key-only' }, fetchImpl });
    const a = await login(app, 'One AI request');
    await call(app, 'PUT', '/me/preferences', a.token, prefs);
    const calls = Array.from({ length: 5 }, () => call(app, 'GET', '/quests', a.token));
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    release();
    const boards = await Promise.all(calls);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(new Set(boards.map((result) => result.json.quests[0].id)).size).toBe(1);
  });
});

it('uses the correct local week across DST and date-line boundaries', () => {
  expect(questWeek(new Date('2026-03-08T12:00Z'), 'America/New_York')).toMatchObject({ week: '2026-03-02', resetsAt: '2026-03-09T04:00:00.000Z' });
  expect(questWeek(new Date('2026-11-15T12:00Z'), 'Pacific/Kiritimati')).toMatchObject({ day: '2026-11-16', week: '2026-11-16', resetsAt: '2026-11-22T10:00:00.000Z' });
});
