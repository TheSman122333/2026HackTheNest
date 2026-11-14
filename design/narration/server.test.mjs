import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { get } from 'node:http';
import { createPreviewServer } from './server.mjs';
import { examples } from './engine.mjs';

async function fixture(t, options = {}) {
  const cacheDir = await mkdtemp(join(tmpdir(), 'old-brine-http-'));
  const server = createPreviewServer({ env: {}, cacheDir, ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await rm(cacheDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, value) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
  return { base, post };
}

test('local preview and config are usable without keys; configs never expose secrets', async (t) => {
  const { base } = await fixture(t, { env: { ELEVENLABS_API_KEY: 'secret-tts', ANTHROPIC_API_KEY: 'secret-writer' } });
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.match(await page.text(), /Old Brine/);
  const config = await (await fetch(`${base}/api/config`)).json();
  assert.equal(config.speechReady, false);
  assert.equal(config.writerReady, false);
  assert.doesNotMatch(JSON.stringify(config), /secret-tts|secret-writer/);
});

test('cross-origin and unexpected Host requests cannot access the preview', async (t) => {
  const { base } = await fixture(t);
  assert.equal((await fetch(`${base}/api/config`, { headers: { origin: 'https://example.com' } })).status, 403);
  // fetch owns Host; use raw HTTP to actually exercise a rebinding request.
  const status = await new Promise((resolve, reject) => {
    get(`${base}/api/config`, { headers: { host: 'attacker.example' } }, (response) => {
      response.resume(); response.on('end', () => resolve(response.statusCode));
    }).on('error', reject);
  });
  assert.equal(status, 403);
});

test('request parsing rejects non-JSON, malformed JSON and oversized payloads', async (t) => {
  const { base } = await fixture(t);
  assert.equal((await fetch(`${base}/api/script`, { method: 'POST', body: '{}' })).status, 415);
  assert.equal((await fetch(`${base}/api/script`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' })).status, 400);
  assert.equal((await fetch(`${base}/api/script`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: ' '.repeat(66_000) })).status, 413);
});

test('text works offline and speech requires a script generated in this session', async (t) => {
  const { post } = await fixture(t);
  const response = await post('/api/script', examples.activity);
  assert.equal(response.status, 200);
  const script = await response.json();
  assert.match(script.text, /Maya/);
  assert.equal((await post('/api/speech', { scriptId: 'fake' })).status, 400);
  const speech = await post('/api/speech', { scriptId: script.id });
  assert.equal(speech.status, 502);
  assert.match((await speech.json()).error, /ELEVENLABS_VOICE_ID/);
  assert.equal((await post('/api/script', { mode: 'event', event: { ...examples.activity.event, photo: 'private' } })).status, 400);
});

test('speech generation, replay cache and audio delivery work with a mocked provider', async (t) => {
  let paidCalls = 0;
  const { base, post } = await fixture(t, {
    env: { ELEVENLABS_API_KEY: 'fake-key', ELEVENLABS_VOICE_ID: 'test-voice' },
    fetchImpl: async () => { paidCalls++; return new Response(Buffer.from('fake-mp3-for-http-test'), { headers: { 'content-type': 'audio/mpeg' } }); },
  });
  const script = await (await post('/api/script', examples.activity)).json();
  const first = await (await post('/api/speech', { scriptId: script.id })).json();
  const replay = await (await post('/api/speech', { scriptId: script.id })).json();
  assert.equal(first.cached, false);
  assert.equal(replay.cached, true);
  assert.equal(paidCalls, 1);
  const audio = await fetch(base + first.audioUrl);
  assert.equal(audio.headers.get('content-type'), 'audio/mpeg');
  assert.equal(await audio.text(), 'fake-mp3-for-http-test');
  assert.equal((await fetch(`${base}/api/audio/${'0'.repeat(64)}.mp3`)).status, 404);
  assert.equal((await fetch(`${base}/.env`)).status, 404);
});
