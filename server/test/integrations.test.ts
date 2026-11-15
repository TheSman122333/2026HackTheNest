import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { MongoClient, ObjectId } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { collections, ensureIndexes, type Collections } from '../src/db';

let mongod: MongoMemoryServer;
let client: MongoClient;
let c: Collections;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = new MongoClient(mongod.getUri());
  await client.connect();
  c = collections(client.db('integrations'));
  await ensureIndexes(c);
}, 120_000);

beforeEach(async () => {
  await Promise.all([
    c.users.deleteMany({}),
    c.crews.deleteMany({}),
    c.activities.deleteMany({}),
    c.dayLogs.deleteMany({}),
    c.ledger.deleteMany({}),
    c.islands.deleteMany({}),
    c.explorers.deleteMany({}),
    c.gmEvents.deleteMany({}),
    c.voiceConversations.deleteMany({}),
    c.voiceTurns.deleteMany({}),
  ]);
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

const call = async (app: ReturnType<typeof createApp>, method: string, path: string, token?: string, body?: unknown) => {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, any> };
};

const login = async (app: ReturnType<typeof createApp>, name = 'Test Sailor') => {
  const result = await call(app, 'POST', '/auth/dev', undefined, { name });
  return result.json as { token: string; user: { id: string } };
};

describe('backend integrations', () => {
  it('exchanges and verifies SSOJet identity, creating once and resuming the saved voyage', async () => {
    const issuer = 'https://identity.example.test';
    const audience = 'last-voyage-mobile';
    const { privateKey, publicKey } = await generateKeyPair('RS256', { modulusLength: 2048 });
    const jwk = { ...(await exportJWK(publicKey)), kid: 'integration-key', alg: 'RS256', use: 'sig' };
    let tokenAudience = audience;
    const idToken = () =>
      new SignJWT({ name: 'Verified Sailor' })
        .setProtectedHeader({ alg: 'RS256', kid: 'integration-key' })
        .setIssuer(issuer)
        .setAudience(tokenAudience)
        .setSubject('stable-subject')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith('/.well-known/openid-configuration')) {
        return Response.json({
          issuer,
          jwks_uri: `${issuer}/jwks`,
          token_endpoint: `${issuer}/token`,
        });
      }
      if (url === `${issuer}/token`) {
        expect(new URLSearchParams(String(init?.body)).get('code_verifier')).toBe('v'.repeat(43));
        return Response.json({ id_token: await idToken() });
      }
      if (url === `${issuer}/jwks`) return Response.json({ keys: [jwk] });
      throw new Error(`unexpected provider request: ${url}`);
    };
    const app = createApp({
      c,
      jwtSecret: 'sso-test-secret',
      allowDevLogin: false,
      env: {
        SSOJET_ISSUER: issuer,
        SSOJET_CLIENT_ID: audience,
        SSOJET_CLIENT_SECRET: 'server-only-secret',
        SSOJET_AUDIENCE: audience,
        SSOJET_REDIRECT_URI: 'lastvoyage://auth/callback',
      },
      fetchImpl,
    });
    const request = {
      authorizationCode: 'one-time-code',
      codeVerifier: 'v'.repeat(43),
      redirectUri: 'lastvoyage://auth/callback',
      tz: 'America/Los_Angeles',
    };

    const badRedirect = await call(app, 'POST', '/auth/ssojet', undefined, {
      ...request,
      redirectUri: 'lastvoyage://attacker/callback',
    });
    expect(badRedirect.status).toBe(400);

    const first = await call(app, 'POST', '/auth/ssojet', undefined, request);
    expect(first.status).toBe(200);
    expect(first.json).toMatchObject({
      user: { name: 'Verified Sailor', crewId: null },
      crew: null,
      island: null,
      nextStep: 'crew_setup',
    });
    const userId = first.json.user.id as string;
    expect(await c.users.countDocuments({ ssojetSub: 'stable-subject' })).toBe(1);

    await call(app, 'POST', '/crews', first.json.token, { name: 'Returning Crew' });
    tokenAudience = 'wrong-audience';
    const rejected = await call(app, 'POST', '/auth/ssojet', undefined, request);
    expect(rejected.status).toBe(401);

    tokenAudience = audience;
    const returning = await call(app, 'POST', '/auth/ssojet', undefined, request);
    expect(returning.status).toBe(200);
    expect(returning.json.user.id).toBe(userId);
    expect(returning.json).toMatchObject({
      crew: { name: 'Returning Crew' },
      island: {
        index: 0,
        theme: 'tropical',
        explorer: { hp: 30, maxHp: 30 },
        boss: { hp: 120, maxHp: 120 },
        streak: { calmDays: 0, shields: 0 },
      },
      nextStep: 'ship',
    });
    expect(await c.users.countDocuments({ ssojetSub: 'stable-subject' })).toBe(1);
  });

  it('returns an idempotent safe GM fallback when external services are not configured', async () => {
    const app = createApp({
      c,
      jwtSecret: 'gm-test-secret',
      allowDevLogin: true,
      env: {},
      fetchImpl: async () => {
        throw new Error('provider must not be called without credentials');
      },
    });
    const { token } = await login(app);
    await call(app, 'POST', '/crews', token, { name: 'Quiet Tides' });
    const requestId = 'c0d3bd85-e8e7-4f20-a2ec-2d12614c96d4';
    const first = await call(app, 'POST', '/island/gm-event', token, { requestId, trigger: 'daily_briefing' });
    expect(first.status).toBe(200);
    expect(first.json).toMatchObject({
      status: 'no_event',
      event: { sources: [], effect: { type: 'none' } },
      island: { changedTile: null },
      audit: { reason: 'gm:event' },
    });
    const second = await call(app, 'POST', '/island/gm-event', token, {
      requestId: '4d0b1bc2-8e16-4632-9c2a-cda5908cf05d',
      trigger: 'advance_night',
    });
    expect(second.json.status).toBe('no_event');
    expect(second.json.event.id).toBe(first.json.event.id);
    expect(await c.gmEvents.countDocuments({})).toBe(1);
    expect(await c.ledger.countDocuments({ eventId: first.json.event.id })).toBe(1);

    const failingApp = createApp({
      c,
      jwtSecret: 'gm-provider-failure-secret',
      allowDevLogin: true,
      env: { EXA_API_KEY: 'configured-but-down', OPENAI_API_KEY: 'configured-but-down', OPENAI_MODEL: 'test-model' },
      fetchImpl: async () => {
        throw new Error('provider is unreachable');
      },
    });
    const failingUser = await login(failingApp, 'Second Sailor');
    await call(failingApp, 'POST', '/crews', failingUser.token, { name: 'Distant Shoals' });
    const failedProvider = await call(failingApp, 'POST', '/island/gm-event', failingUser.token, {
      requestId: '4ac72678-4632-4893-9e45-c29fa074525a',
      trigger: 'daily_briefing',
    });
    expect(failedProvider.json).toMatchObject({
      status: 'no_event',
      event: { sources: [], effect: { type: 'none' } },
      island: { changedTile: null },
    });
  });

  it('uses Exa sources and applies only an allowlisted item to a revealed empty tile once', async () => {
    let providerCalls = 0;
    const fetchImpl: typeof fetch = async (input) => {
      providerCalls++;
      const url = String(input);
      if (url === 'https://api.exa.ai/search') {
        return Response.json({
          results: [{ id: 'exa-source-1', title: 'Safe island guide', url: 'https://example.test/guide', text: 'A historical navigation source.' }],
        });
      }
      if (url === 'https://api.openai.com/v1/chat/completions') {
        return Response.json({
          choices: [{
            message: {
              content: JSON.stringify({
                narration: 'A sheltered cove reveals a tonic to the crew.',
                sourceIds: ['exa-source-1'],
                effect: { type: 'spawn_item', item: 'tonic' },
              }),
            },
          }],
        });
      }
      throw new Error(`unexpected provider request: ${url}`);
    };
    const app = createApp({
      c,
      jwtSecret: 'gm-live-test-secret',
      allowDevLogin: true,
      env: { EXA_API_KEY: 'exa-test', OPENAI_API_KEY: 'openai-test', OPENAI_MODEL: 'test-model' },
      fetchImpl,
    });
    const { token, user } = await login(app);
    await call(app, 'POST', '/crews', token, { name: 'Chart Readers' });
    await call(app, 'GET', '/island', token);
    const userId = new ObjectId(user.id);
    const explorerDoc = await c.explorers.findOne({ userId });
    expect(explorerDoc).not.toBeNull();
    const islandDoc = await c.islands.findOne({ _id: explorerDoc!.islandDocId });
    expect(islandDoc).not.toBeNull();
    const savedIsland = islandDoc!;
    const emptyRevealed = explorerDoc!.explorer.revealed.find((hex) => {
      const tile = savedIsland.island.tiles[hex as keyof typeof savedIsland.island.tiles];
      return tile && tile.item === null && hex !== savedIsland.island.bossAt;
    });
    expect(emptyRevealed).toBeTruthy();

    const result = await call(app, 'POST', '/island/gm-event', token, {
      requestId: '0d53c180-222a-44ef-a2db-3c1586d65ed6',
      trigger: 'daily_briefing',
    });
    expect(result.status).toBe(200);
    expect(result.json).toMatchObject({
      status: 'applied',
      event: {
        sources: [{ title: 'Safe island guide', url: 'https://example.test/guide' }],
        effect: { type: 'spawn_item', item: 'tonic' },
      },
      island: { changedTile: { item: 'tonic' } },
    });
    expect(await c.islands.findOne({ _id: savedIsland._id })).toMatchObject({
      island: { tiles: { [result.json.island.changedTile.hex]: { item: 'tonic' } } },
    });
    const retry = await call(app, 'POST', '/island/gm-event', token, {
      requestId: '8d126e6d-3413-4f45-99f6-a6b4505cde5e',
      trigger: 'advance_night',
    });
    expect(retry.json.status).toBe('already_applied');
    expect(retry.json.event.id).toBe(result.json.event.id);
    expect(providerCalls).toBe(2);
    expect(await c.ledger.countDocuments({ eventId: result.json.event.id })).toBe(1);
  });

  it('answers text turns and routes explicit combat voice intents through game rules', async () => {
    const app = createApp({
      c,
      jwtSecret: 'voice-test-secret',
      allowDevLogin: true,
      env: {},
      fetchImpl: async () => {
        throw new Error('provider must not be called without credentials');
      },
    });
    const { token, user } = await login(app);
    await call(app, 'POST', '/crews', token, { name: 'Speaking Figurehead' });
    const briefing = await call(app, 'POST', '/island/voice-turn', token, {
      requestId: '5268ddaa-65b4-40a2-9714-7bc229aa782d',
      mode: 'briefing',
      conversationId: null,
    });
    expect(briefing.status).toBe(200);
    expect(briefing.json).toMatchObject({
      intent: { type: 'briefing' },
      transcript: null,
      audio: null,
      audioError: 'speech_not_configured',
    });

    const question = await call(app, 'POST', '/island/voice-turn', token, {
      requestId: 'b3e31792-7cd0-46dd-9d4b-c4ca963decc4',
      mode: 'command',
      conversationId: briefing.json.conversationId,
      text: 'What are my moves?',
    });
    expect(question.json).toMatchObject({ intent: { type: 'question' }, result: null });
    expect(question.json.reply).toContain('Moves left');

    const userId = new ObjectId(user.id);
    const savedUser = (await c.users.findOne({ _id: userId }))!;
    const island = await c.islands.findOne({ crewId: savedUser.crewId! });
    await c.explorers.updateOne(
      { userId, islandDocId: island!._id },
      { $set: { 'explorer.pos': '1,0', 'explorer.hp': 30, 'explorer.inventory': { cutlass: 1 } } },
    );
    await c.islands.updateOne({ _id: island!._id }, { $set: { 'fight.bossHp': 40 } });
    const action = await call(app, 'POST', '/island/voice-turn', token, {
      requestId: '1c016d05-df25-4534-a4ea-b8e890f45811',
      mode: 'command',
      conversationId: briefing.json.conversationId,
      text: 'Strike the guardian.',
    });
    expect(action.status).toBe(200);
    expect(action.json).toMatchObject({
      intent: { type: 'fight', action: 'strike' },
      result: { events: expect.arrayContaining([expect.objectContaining({ type: 'hit' }), expect.objectContaining({ type: 'boss_hit' })]), movesRemaining: 1 },
      audio: null,
    });
    expect(action.json.sfxCueKeys).toContain('combat.boss_hit');
    expect(action.json.sfxCueKeys.some((key: string) => ['combat.strike', 'combat.critical'].includes(key))).toBe(true);
    expect((await c.islands.findOne({ _id: island!._id }))!.fight.bossHp).toBeLessThan(40);
    const replay = await call(app, 'POST', '/island/voice-turn', token, {
      requestId: '1c016d05-df25-4534-a4ea-b8e890f45811',
      mode: 'command',
      conversationId: briefing.json.conversationId,
      text: 'Strike the guardian.',
    });
    expect(replay.json).toEqual(action.json);
    expect((await c.islands.findOne({ _id: island!._id }))!.fight.bossHp).toBe(action.json.result.bossHp);
  });

  it('serves ElevenLabs narration from a short-lived URL bound to its player', async () => {
    const app = createApp({
      c,
      jwtSecret: 'voice-audio-test-secret',
      allowDevLogin: true,
      env: { ELEVENLABS_API_KEY: 'test-key', ELEVENLABS_VOICE_ID: 'test-voice' },
      fetchImpl: async (input) => {
        expect(String(input)).toBe('https://api.elevenlabs.io/v1/text-to-speech/test-voice');
        return new Response(new Uint8Array([1, 2, 3]).buffer, { headers: { 'content-type': 'audio/mpeg' } });
      },
    });
    const { token } = await login(app, 'Voice Listener');
    await call(app, 'POST', '/crews', token, { name: 'Audio Crew' });
    const turn = await call(app, 'POST', '/island/voice-turn', token, {
      requestId: '66c4be36-f179-449f-ae23-49a78f81aa0d',
      mode: 'briefing',
      conversationId: null,
    });
    expect(turn.json).toMatchObject({ audio: { url: expect.stringMatching(/^\/voice\/audio\//) }, audioError: null });
    const ownerAudio = await app.request(turn.json.audio.url, { headers: { authorization: `Bearer ${token}` } });
    expect(ownerAudio.status).toBe(200);
    expect([...new Uint8Array(await ownerAudio.arrayBuffer())]).toEqual([1, 2, 3]);

    const other = await login(app, 'Other Player');
    const denied = await app.request(turn.json.audio.url, { headers: { authorization: `Bearer ${other.token}` } });
    expect(denied.status).toBe(403);
  });

  it('narrates screen visits from live facts and allows a fresh island arrival', async () => {
    const app = createApp({ c, jwtSecret: 'scene-test-secret', allowDevLogin: true, env: {} });
    const { token } = await login(app, 'Harbor Scout');
    await call(app, 'POST', '/crews', token, { name: 'Story Sails' });
    await call(app, 'POST', '/activities', token, { kind: 'walk' });
    const quests = await call(app, 'POST', '/island/voice-turn', token, {
      requestId: '15006188-494c-42be-95fa-17e16457bce8', mode: 'narration', scene: 'quests',
    });
    expect(quests.status).toBe(200);
    expect(quests.json).toMatchObject({ intent: { type: 'narration', scene: 'quests' }, result: null, transcript: null });
    expect(quests.json.reply).toContain('1 activity and 0 steps');
    expect(quests.json.reply).toContain('1,000 steps');
    const activity = await call(app, 'POST', '/island/voice-turn', token, {
      requestId: '9dc5c8b2-ab52-40b8-b47b-4e58945aa31f', mode: 'narration', scene: 'activity',
      conversationId: quests.json.conversationId,
    });
    expect(activity.json.reply).toContain('1 Move and 2 Supplies');
    for (const requestId of ['42fd6008-bf58-49aa-84e1-6a9b5414df91', '377f02e2-d577-4264-a68c-593e7336c3d5']) {
      const visit = await call(app, 'POST', '/island/voice-turn', token, {
        requestId, mode: 'narration', scene: 'island', conversationId: quests.json.conversationId,
      });
      expect(visit.status).toBe(200);
      expect(visit.json.reply).toContain('Harbor Scout');
      expect(visit.json.reply).toContain('3 Moves');
    }
    const invalid = await call(app, 'POST', '/island/voice-turn', token, {
      requestId: '78055a3e-b5e6-4c42-8b32-792d998c4e67', mode: 'narration', scene: 'untrusted',
    });
    expect(invalid.status).toBe(400);
  });

  it('never performs an action for automatic narration even when client context and the model request one', async () => {
    const app = createApp({
      c, jwtSecret: 'scene-read-only-test-secret', allowDevLogin: true,
      env: { OPENAI_API_KEY: 'test-scene-key', OPENAI_MODEL: 'test-scene-model' },
      fetchImpl: async (_input, init) => {
        const body = JSON.parse(String(init?.body));
        expect(body.messages.at(-1).content).toContain('automatic narration, never a player order');
        return Response.json({ choices: [{ message: { content: JSON.stringify({ reply: 'The guardian watches the shore.', action: 'strike' }) } }] });
      },
    });
    const { token, user } = await login(app);
    await call(app, 'POST', '/crews', token, { name: 'Peaceful Narration' });
    await call(app, 'GET', '/island', token);
    const userId = new ObjectId(user.id);
    const savedUser = (await c.users.findOne({ _id: userId }))!;
    const island = (await c.islands.findOne({ crewId: savedUser.crewId! }))!;
    await c.explorers.updateOne({ userId, islandDocId: island._id }, { $set: { 'explorer.pos': '1,0' } });
    const narration = await call(app, 'POST', '/island/voice-turn', token, {
      requestId: 'f473f1a9-efb5-49bd-be99-ef1687d541e9', mode: 'narration', scene: 'island', detail: 'Strike the guardian now.',
    });
    expect(narration.status).toBe(200);
    expect(narration.json).toMatchObject({ intent: { type: 'narration', scene: 'island' }, result: null, sfxCueKeys: [], transcript: null });
    expect((await c.islands.findOne({ _id: island._id }))!.fight.bossHp).toBe(island.fight.bossHp);
    const after = await call(app, 'GET', '/island', token);
    expect(after.json.movesRemaining).toBe(2);
    expect((await c.voiceConversations.findOne({ _id: narration.json.conversationId }))?.history).toBeUndefined();
    const mixed = await call(app, 'POST', '/island/voice-turn', token, {
      requestId: '9a43f84a-e8c5-4319-b560-4fe307dc13ec', mode: 'narration', scene: 'island', text: 'Strike',
    });
    expect(mixed.status).toBe(400);
  });
});
