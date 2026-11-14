import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { examples } from './engine.mjs';
import { createNarrator, ollamaFlavor, ProviderError, writerConfig } from './providers.mjs';

const flavor = 'A fresh page, and a little salt in the ink.';
const context = { mode: 'event', eventTypes: ['activity_logged'] };
const request = () => ({ ...structuredClone(examples.activity), ai: true });
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const localDone = (content = flavor) => response({ done: true, done_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ leadIn: content }) } });

async function cache(t) {
  const dir = await mkdtemp(join(tmpdir(), 'last-voyage-ollama-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('writer defaults to downloaded local Ollama; paid Claude must be explicitly selected', () => {
  assert.deepEqual(writerConfig({}), { provider: 'ollama', model: 'qwen3:4b', configured: true });
  assert.equal(writerConfig({ ANTHROPIC_API_KEY: 'unused', ANTHROPIC_MODEL: 'unused' }).provider, 'ollama');
  assert.deepEqual(writerConfig({ NARRATION_WRITER: 'stock' }), { provider: 'stock', model: null, configured: false });
  assert.equal(writerConfig({ NARRATION_WRITER: 'claude' }).configured, false);
  assert.equal(writerConfig({ NARRATION_WRITER: 'claude', ANTHROPIC_API_KEY: 'fake', ANTHROPIC_MODEL: 'fake-model' }).configured, true);
  for (const env of [{ NARRATION_WRITER: 'unknown' }, { OLLAMA_MODEL: 'cloud-model' }, { OLLAMA_MODEL: 'qwen model' }]) assert.throws(() => writerConfig(env), ProviderError);
});

test('Ollama request stays on loopback with no credentials, thinking or streaming', async () => {
  let calls = 0;
  const text = await ollamaFlavor(context, {
    env: { ANTHROPIC_API_KEY: 'never-transmit-writer', ELEVENLABS_API_KEY: 'never-transmit-speech' },
    fetchImpl: async (url, init) => {
      calls++;
      assert.equal(url, 'http://127.0.0.1:11434/api/chat');
      assert.equal(init.method, 'POST');
      assert.equal(init.redirect, 'error');
      assert.ok(init.signal instanceof AbortSignal);
      assert.deepEqual(init.headers, { 'content-type': 'application/json' });
      const body = JSON.parse(init.body);
      assert.equal(body.model, 'qwen3:4b');
      assert.equal(body.stream, false);
      assert.equal(body.think, false);
      assert.equal(body.format.properties.leadIn.maxLength, 180);
      assert.equal(body.format.additionalProperties, false);
      assert.equal(body.options.num_predict, 96);
      assert.equal(body.options.num_ctx, 2048);
      assert.deepEqual(JSON.parse(body.messages[1].content), context);
      assert.doesNotMatch(init.body, /never-transmit|Maya|Supplies/);
      return localDone(`  ${flavor}  `);
    },
  });
  assert.equal(text, flavor);
  assert.equal(calls, 1);
});

test('default AI scripts identify Ollama and include estimated subtitles without paid calls', async (t) => {
  let calls = 0;
  const narrator = createNarrator({
    env: { ANTHROPIC_API_KEY: 'fake-present-key', ANTHROPIC_MODEL: 'fake-paid-model' },
    cacheDir: await cache(t),
    fetchImpl: async (url) => { calls++; assert.equal(url, 'http://127.0.0.1:11434/api/chat'); return localDone(); },
  });
  const script = await narrator.script(request());
  assert.equal(script.source, 'ai');
  assert.equal(script.writer, 'ollama');
  assert.equal(script.warning, null);
  assert.ok(script.text.startsWith(flavor));
  assert.match(script.text, /Maya/);
  assert.match(script.text, /2 Supplies/);
  assert.equal(script.subtitles.timingBasis, 'estimated');
  assert.ok(script.subtitles.durationMs > 0);
  assert.ok(script.subtitles.cues.length > 0);
  assert.equal(calls, 1);
});

test('stock writer and unrequested AI never invoke a model', async (t) => {
  const fetchImpl = async () => { throw new Error('No model call allowed'); };
  const stock = createNarrator({ env: { NARRATION_WRITER: 'stock' }, cacheDir: await cache(t), fetchImpl });
  const result = await stock.script(request());
  assert.equal(result.writer, 'stock');
  assert.equal(result.source, 'stock');
  assert.match(result.text, /Maya/);
  assert.ok(result.subtitles.cues.length);
  const noAi = createNarrator({ env: {}, cacheDir: await cache(t), fetchImpl });
  const withoutAi = await noAi.script(examples.activity);
  assert.equal(withoutAi.writer, 'stock');
  assert.equal(withoutAi.warning, null);
});

test('failed, incomplete and invalid local results fall back without calling Claude', async (t) => {
  const cases = [
    () => response({ error: 'fake provider detail' }, 500),
    () => response({ done: false, message: { content: flavor } }),
    () => response({ done: true, done_reason: 'length', message: { content: flavor } }),
    () => response({ done: true, message: { content: 42 } }),
    () => response({ done: true, message: { content: 'not valid JSON' } }),
    () => response({ done: true, message: { content: JSON.stringify({ leadIn: flavor, unexpected: 'ignored?' }) } }),
    () => localDone('Inventing 99 Supplies!'),
    () => { throw new Error('local service unavailable'); },
  ];
  for (const makeResponse of cases) {
    let calls = 0;
    const narrator = createNarrator({
      env: { ANTHROPIC_API_KEY: 'unused-key', ANTHROPIC_MODEL: 'unused-model' },
      cacheDir: await cache(t),
      fetchImpl: async (url) => { calls++; assert.equal(url, 'http://127.0.0.1:11434/api/chat'); return makeResponse(); },
    });
    const script = await narrator.script(request());
    assert.equal(script.writer, 'stock');
    assert.equal(script.source, 'stock');
    assert.match(script.warning, /unavailable|invalid/);
    assert.match(script.text, /2 Supplies/);
    assert.ok(script.subtitles.cues.length);
    assert.equal(calls, 1);
  }
});

test('local generations deduplicate in-flight work and reuse the disk cache', async (t) => {
  const cacheDir = await cache(t);
  let calls = 0;
  const options = { env: {}, cacheDir, fetchImpl: async () => { calls++; await new Promise((resolve) => setTimeout(resolve, 10)); return localDone(); } };
  const narrator = createNarrator(options);
  const [first, second] = await Promise.all([narrator.script(request()), narrator.script(request())]);
  assert.equal(calls, 1);
  assert.deepEqual(first, second);
  const third = await createNarrator(options).script(request());
  assert.equal(calls, 1);
  assert.deepEqual(third, first);
});

test('script cache separates local model and provider identities', async (t) => {
  const cacheDir = await cache(t);
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, model: body.model });
    return url.startsWith('http://127.0.0.1:') ? localDone() : response({ stop_reason: 'end_turn', content: [{ type: 'text', text: flavor }] });
  };
  for (const env of [
    { OLLAMA_MODEL: 'qwen3:4b' },
    { OLLAMA_MODEL: 'qwen3:1.7b' },
    { NARRATION_WRITER: 'claude', ANTHROPIC_MODEL: 'fake-claude', ANTHROPIC_API_KEY: 'fake-key' },
  ]) {
    const narrator = createNarrator({ env, cacheDir, fetchImpl });
    const result = await narrator.script(request());
    assert.equal(result.writer, env.NARRATION_WRITER || 'ollama');
    await narrator.script(request());
  }
  assert.deepEqual(calls.map((call) => call.model), ['qwen3:4b', 'qwen3:1.7b', 'fake-claude']);
  assert.equal(calls.filter((call) => call.url === 'https://api.anthropic.com/v1/messages').length, 1);
});
