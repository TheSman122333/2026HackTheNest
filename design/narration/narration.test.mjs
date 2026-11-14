import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  composeScript, examples, InputError, MAX_RECAP_EVENTS, normalizeRequest,
  stockLine, validateEvent,
} from './engine.mjs';
import {
  claudeFlavor, createNarrator, listVoices, ProviderError, speechConfig,
} from './providers.mjs';

const at = '2026-11-14T16:00:00.000Z';
const until = '2026-11-14T18:00:00.000Z';
const event = (id = 'event-1', patch = {}) => ({
  id, type: 'item_found', at, facts: { actor: 'Maya', item: 'tonic' }, ...patch,
});
const speechEnv = () => ({ ELEVENLABS_API_KEY: 'test-key-not-real', ELEVENLABS_VOICE_ID: 'test-voice' });
const writerEnv = () => ({ ANTHROPIC_API_KEY: 'test-writer-not-real', ANTHROPIC_MODEL: 'test-model' });
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});
const audio = () => new Response(Buffer.from('mock-mp3-payload'), {
  headers: { 'content-type': 'audio/mpeg' },
});
const completedFlavor = (text = 'Ah, the log has a fine rustle to it today.') => json({
  stop_reason: 'end_turn', content: [{ type: 'text', text }],
});
async function temporaryCache(run) {
  const dir = await mkdtemp(join(tmpdir(), 'last-voyage-narration-test-'));
  try { return await run(dir); }
  finally { await rm(dir, { recursive: true, force: true }); }
}

test('strict validation accepts normalized facts and rejects private or unexpected fields', () => {
  assert.deepEqual(validateEvent(event('ok', { facts: { actor: '  Maya  ', item: 'tonic' } })), event('ok'));
  const invalid = [
    null,
    { ...event(), photo: 'private-photo' },
    { ...event(), facts: { ...event().facts, journal: 'private-entry' } },
    { ...event(), id: '../traversal' },
    { ...event(), type: 'unknown-event' },
    { ...event(), facts: { actor: 'Maya' } },
    { ...event(), facts: { actor: '[whispers] Maya', item: 'tonic' } },
    { ...event(), facts: { actor: 'Maya\u202e', item: 'tonic' } },
    { ...event(), facts: { actor: '<break>', item: 'tonic' } },
    { ...event(), facts: { actor: 'Maya', item: 'a'.repeat(65) } },
    { ...event(), at: '2026-11-14T16:00:00-04:00' },
  ];
  for (const input of invalid) assert.throws(() => validateEvent(input), InputError);
});

test('calendar validation rejects impossible dates instead of shifting cursor chronology', () => {
  assert.throws(() => validateEvent(event('bad-date', { at: '2026-02-31T00:00:00Z' })), InputError);
  assert.equal(validateEvent(event('valid-date', { at: '2028-02-29T00:00:00.1Z' })).at, '2028-02-29T00:00:00.100Z');
});

test('activity narration preserves zero and capped grant amounts in every selected variant', () => {
  for (let i = 0; i < 50; i++) {
    const input = structuredClone(examples.activity.event);
    input.id = `grant-${i}`;
    input.facts = { actor: 'Maya', activity: 'walk', supplies: 0, moves: 0, legend: 0 };
    const line = stockLine(validateEvent(input));
    assert.match(line, /0 Supplies/);
    assert.match(line, /0 Island Moves/);
    assert.match(line, /0 Legend/);
    assert.doesNotMatch(line, /\{\w+\}/);
  }
  for (const bad of [-1, 1.2, NaN, Infinity, 1_000_001, '2']) {
    const input = structuredClone(examples.activity.event);
    input.facts.moves = bad;
    assert.throws(() => validateEvent(input), InputError);
  }
});

test('event variants are stable for replays and use authoritative amounts', async () => {
  const request = normalizeRequest(examples.activity);
  assert.equal(stockLine(request.events[0]), stockLine(structuredClone(request.events[0])));
  const first = await composeScript(request);
  const second = await composeScript(normalizeRequest(examples.activity));
  assert.deepEqual(first, second);
  assert.match(first.text, /2 Supplies/);
  assert.match(first.text, /1 Island Moves/);
});

test('recap paginates identical timestamps using event IDs without skipping unread events', () => {
  const events = Array.from({ length: 19 }, (_, i) => event(`event-${String(i).padStart(2, '0')}`)).reverse();
  const consumed = [];
  let after;
  for (;;) {
    const request = normalizeRequest({ mode: 'recap', events, until, ...(after ? { after } : {}) });
    assert.ok(request.events.length <= MAX_RECAP_EVENTS);
    consumed.push(...request.events.map((entry) => entry.id));
    after = request.nextCursor;
    if (!request.hasMore) break;
  }
  assert.deepEqual(consumed, [...events].reverse().map((entry) => entry.id));
  assert.equal(new Set(consumed).size, events.length);
});

test('recap filters read and future entries, preserves the snapshot, and retains empty cursor', () => {
  const after = { at, id: 'event-1' };
  const request = normalizeRequest({
    mode: 'recap', until, after,
    events: [
      event('event-0'), event('event-1'), event('event-2'),
      event('older', { at: '2026-11-13T16:00:00Z' }),
      event('future', { at: '2026-11-14T19:00:00Z' }),
    ],
  });
  assert.deepEqual(request.events.map((entry) => entry.id), ['event-2']);
  assert.equal(request.until, until);
  const empty = normalizeRequest({ mode: 'recap', events: [], after, until });
  assert.deepEqual(empty.nextCursor, after);
  assert.equal(empty.hasMore, false);
  const byClock = normalizeRequest({ mode: 'recap', events: [event('now'), event('future', { at: until })] }, new Date(at));
  assert.deepEqual(byClock.events.map((entry) => entry.id), ['now']);
});

test('recap rejects duplicates, excessive payloads, bad modes and cursor beyond snapshot', () => {
  for (const input of [
    { mode: 'recap', until, events: [event('same'), event('same')] },
    { mode: 'recap', until, events: Array.from({ length: 101 }, (_, i) => event(`id-${i}`)) },
    { mode: 'recap', until: at, events: [], after: { at: until, id: 'later' } },
    { mode: 'recap', until, events: [], ai: 'yes' },
    { mode: 'event', event: event(), userId: 'untrusted' },
    { mode: 'unrecognized' },
  ]) assert.throws(() => normalizeRequest(input), InputError);
});

test('AI receives categories only and cannot replace the immutable factual suffix', async () => {
  const request = normalizeRequest({ ...examples.activity, ai: true });
  let supplied;
  const result = await composeScript(request, { generateFlavor: async (context) => {
    supplied = context;
    return 'There is a fine creak in the timbers today.';
  } });
  assert.deepEqual(supplied, { mode: 'event', eventTypes: ['activity_logged'] });
  assert.doesNotMatch(JSON.stringify(supplied), /Maya|supplies|walk|2026/);
  assert.equal(result.source, 'ai');
  assert.equal(result.warning, null);
  assert.ok(result.text.endsWith(stockLine(request.events[0])));
  assert.deepEqual(result.eventIds, ['activity-1']);
});

test('missing, failed, truncated or malformed AI falls back to complete factual stock lines', async () => {
  const request = normalizeRequest({ ...examples.activity, ai: true });
  const writers = [
    undefined,
    async () => { throw new DOMException('request timed out', 'TimeoutError'); },
    async () => '', async () => 'A'.repeat(181), async () => 'Earned 999 coins.',
    async () => '[whispers] Ahoy.', async () => 'Line\nTwo',
  ];
  for (const generateFlavor of writers) {
    const result = await composeScript(request, { generateFlavor });
    assert.equal(result.source, 'stock');
    assert.ok(result.warning);
    assert.equal(result.text, stockLine(request.events[0]));
  }
});

test('empty recap does not pay for an AI lead-in', async () => {
  const request = normalizeRequest({ mode: 'recap', events: [], until, ai: true });
  const result = await composeScript(request, { generateFlavor: () => assert.fail('AI should not run for no events') });
  assert.match(result.text, /No new entries/);
  assert.deepEqual(result.eventIds, []);
  assert.equal(result.nextCursor, null);
});

test('Claude HTTP adapter uses server-side credentials, bounded output and abort signal', async () => {
  const env = writerEnv();
  let calls = 0;
  const result = await claudeFlavor({ mode: 'recap', eventTypes: ['streak_reset'] }, {
    env, fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, 'https://api.anthropic.com/v1/messages');
      assert.equal(options.headers['x-api-key'], env.ANTHROPIC_API_KEY);
      assert.equal(options.headers['anthropic-version'], '2023-06-01');
      assert.ok(options.signal instanceof AbortSignal);
      const body = JSON.parse(options.body);
      assert.equal(body.model, env.ANTHROPIC_MODEL);
      assert.equal(body.max_tokens, 120);
      assert.deepEqual(JSON.parse(body.messages[0].content), { mode: 'recap', eventTypes: ['streak_reset'] });
      return completedFlavor();
    },
  });
  assert.equal(calls, 1);
  assert.match(result, /fine rustle/);
  await assert.rejects(() => claudeFlavor({}, { env, fetchImpl: async () => json({ stop_reason: 'max_tokens', content: [] }) }), ProviderError);
  await assert.rejects(() => claudeFlavor({}, { env, fetchImpl: async () => json({ error: 'private-body' }, 429) }), (error) => {
    assert.ok(error instanceof ProviderError);
    assert.doesNotMatch(error.message, /private-body|test-writer/);
    return true;
  });
});

test('concurrent script generations deduplicate and survive a new narrator through disk cache', async () => {
  await temporaryCache(async (cacheDir) => {
    const env = writerEnv();
    let calls = 0;
    const narrator = createNarrator({ env, cacheDir, fetchImpl: async () => {
      calls++;
      await new Promise((resolve) => setImmediate(resolve));
      return completedFlavor();
    } });
    const input = { ...examples.activity, ai: true };
    const [first, second] = await Promise.all([narrator.script(input), narrator.script(input)]);
    assert.deepEqual(first, second);
    assert.equal(calls, 1);
    const restarted = createNarrator({ env, cacheDir, fetchImpl: () => assert.fail('cached script must not call Claude') });
    assert.deepEqual(await restarted.script(input), first);
    const files = await readdir(cacheDir);
    assert.equal(files.filter((file) => file.endsWith('.tmp')).length, 0);
    const stored = await readFile(join(cacheDir, files.find((file) => file.endsWith('.json'))), 'utf8');
    assert.doesNotMatch(stored, /test-writer-not-real/);
  });
});

test('AI fallback is not cached permanently and a later successful request can recover', async () => {
  await temporaryCache(async (cacheDir) => {
    const env = writerEnv();
    let calls = 0;
    const narrator = createNarrator({ env, cacheDir, fetchImpl: async () => {
      calls++;
      if (calls === 1) throw new DOMException('request timed out', 'TimeoutError');
      return completedFlavor();
    } });
    const input = { ...examples.activity, ai: true };
    assert.equal((await narrator.script(input)).source, 'stock');
    assert.deepEqual(await readdir(cacheDir), []);
    assert.equal((await narrator.script(input)).source, 'ai');
    assert.equal(calls, 2);
  });
});

test('ElevenLabs speech is deduplicated, cached on disk, and playable later without a key', async () => {
  await temporaryCache(async (cacheDir) => {
    const env = speechEnv();
    let calls = 0;
    const narrator = createNarrator({ env, cacheDir, fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, 'https://api.elevenlabs.io/v1/text-to-speech/test-voice?output_format=mp3_44100_128');
      assert.equal(options.headers['xi-api-key'], env.ELEVENLABS_API_KEY);
      assert.ok(options.signal instanceof AbortSignal);
      assert.deepEqual(JSON.parse(options.body), {
        text: 'Ahoy, crew.', model_id: 'eleven_flash_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      });
      await new Promise((resolve) => setImmediate(resolve));
      return audio();
    } });
    const [first, second] = await Promise.all([narrator.speech('Ahoy, crew.'), narrator.speech('Ahoy, crew.')]);
    assert.equal(calls, 1);
    assert.deepEqual(first.audio, Buffer.from('mock-mp3-payload'));
    assert.equal(first.key, second.key);
    assert.equal(first.cached, false);
    const restarted = createNarrator({ env: { ELEVENLABS_VOICE_ID: env.ELEVENLABS_VOICE_ID }, cacheDir,
      fetchImpl: () => assert.fail('cached speech must not call ElevenLabs') });
    const cached = await restarted.speech('Ahoy, crew.');
    assert.equal(cached.cached, true);
    assert.equal(cached.key, first.key);
    assert.deepEqual(cached.audio, first.audio);
  });
});

test('speech cache includes model and voice identity', async () => {
  await temporaryCache(async (cacheDir) => {
    let calls = 0;
    const fetchImpl = async () => { calls++; return audio(); };
    const env = speechEnv();
    const a = await createNarrator({ env, cacheDir, fetchImpl }).speech('Ahoy.');
    const b = await createNarrator({ env: { ...env, ELEVENLABS_VOICE_ID: 'other-voice' }, cacheDir, fetchImpl }).speech('Ahoy.');
    const c = await createNarrator({ env: { ...env, ELEVENLABS_MODEL_ID: 'eleven_v3' }, cacheDir, fetchImpl }).speech('Ahoy.');
    assert.equal(calls, 3);
    assert.equal(new Set([a.key, b.key, c.key]).size, 3);
  });
});

test('speech configuration and invalid text fail before any paid request', async () => {
  assert.throws(() => speechConfig({ ELEVENLABS_VOICE_ID: '../escape' }), ProviderError);
  assert.throws(() => speechConfig({ ELEVENLABS_VOICE_ID: 'voice', ELEVENLABS_MODEL_ID: 'unverified' }), ProviderError);
  await temporaryCache(async (cacheDir) => {
    const narrator = createNarrator({ env: speechEnv(), cacheDir, fetchImpl: () => assert.fail('invalid text must not call ElevenLabs') });
    for (const value of ['', '  ', null, 'a'.repeat(4001)]) await assert.rejects(() => narrator.speech(value), ProviderError);
  });
});

test('ElevenLabs errors are sanitized, never automatically retried, and never cached', async () => {
  await temporaryCache(async (cacheDir) => {
    for (const response of [
      () => json({ error: 'private-provider-body' }, 429),
      () => json({ audio: 'not-an-mp3' }),
      () => new Response('', { headers: { 'content-type': 'audio/mpeg' } }),
      () => { throw new DOMException('request timed out', 'TimeoutError'); },
    ]) {
      let calls = 0;
      const narrator = createNarrator({ env: speechEnv(), cacheDir, fetchImpl: async () => { calls++; return response(); } });
      await assert.rejects(() => narrator.speech('An uncached line.'), (error) => {
        assert.doesNotMatch(error.message, /private-provider-body|test-key-not-real/);
        return true;
      });
      assert.equal(calls, 1);
      assert.deepEqual(await readdir(cacheDir), []);
    }
  });
});

test('voice listing follows pagination and only returns audition metadata', async () => {
  const urls = [];
  const voices = await listVoices({ env: speechEnv(), fetchImpl: async (url, options) => {
    urls.push(String(url));
    assert.equal(options.headers['xi-api-key'], 'test-key-not-real');
    assert.ok(options.signal instanceof AbortSignal);
    return urls.length === 1
      ? json({ voices: [{ voice_id: 'one', name: 'First', private_metadata: 'hidden' }], has_more: true, next_page_token: 'next+page' })
      : json({ voices: [{ voice_id: 'two', name: 'Second' }], has_more: false });
  } });
  assert.equal(urls.length, 2);
  assert.equal(new URL(urls[0]).searchParams.get('page_size'), '100');
  assert.equal(new URL(urls[1]).searchParams.get('next_page_token'), 'next+page');
  assert.deepEqual(voices, [{ voice_id: 'one', name: 'First' }, { voice_id: 'two', name: 'Second' }]);
});

test('voice listing rejects bad pagination and provider failures', async () => {
  await assert.rejects(() => listVoices({ env: {}, fetchImpl: () => assert.fail('no key') }), ProviderError);
  await assert.rejects(() => listVoices({ env: speechEnv(), fetchImpl: async () => json({ voices: [], has_more: true }) }), ProviderError);
  let calls = 0;
  await assert.rejects(() => listVoices({ env: speechEnv(), fetchImpl: async () => {
    calls++;
    return json({ voices: [], has_more: true, next_page_token: 'same-token' });
  } }), ProviderError);
  assert.equal(calls, 2);
  await assert.rejects(() => listVoices({ env: speechEnv(), fetchImpl: async () => json({ error: 'private-provider-body' }, 403) }), (error) => {
    assert.ok(error instanceof ProviderError);
    assert.doesNotMatch(error.message, /private-provider-body|test-key/);
    return true;
  });
});
