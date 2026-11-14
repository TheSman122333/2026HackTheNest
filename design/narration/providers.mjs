/** Server/CLI only: built-in fetch, no SDK install and no secrets in the app bundle. */
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeScript, hash, normalizeRequest, VERSION } from './engine.mjs';
import { createSubtitles } from './subtitles.mjs';

export const DEFAULT_CACHE = fileURLToPath(new URL('./.cache/', import.meta.url));
export class ProviderError extends Error {}
const MODEL_IDS = new Set(['eleven_flash_v2_5', 'eleven_multilingual_v2', 'eleven_v3']);
const WRITER_PROMPT = 'You are Old Brine, an original warm, wry pirate figurehead spirit. Write ONE short atmospheric lead-in, at most 180 characters, for game narration. Plain spoken text only. No digits, names, places, speech tags, quotes, lists, shame, or references to existing fiction. Do not assert events, rewards, losses or outcomes: authoritative event sentences follow your lead-in. For streak_reset be reassuring. For recap invite the player to hear the log. Event categories are tone cues only. Return only the lead-in.';

export function writerConfig(env = process.env) {
  const provider = env.NARRATION_WRITER || 'ollama';
  if (!['ollama', 'claude', 'stock'].includes(provider)) throw new ProviderError('NARRATION_WRITER must be ollama, stock or claude.');
  const model = provider === 'ollama' ? (env.OLLAMA_MODEL || 'qwen3:4b') : provider === 'claude' ? env.ANTHROPIC_MODEL : null;
  if (provider === 'ollama' && (typeof model !== 'string' || !/^[A-Za-z0-9_./:-]{1,120}$/.test(model) || /cloud/i.test(model))) throw new ProviderError('Choose a downloaded local Ollama model.');
  return { provider, model: model ?? null, configured: provider === 'ollama' || (provider === 'claude' && Boolean(env.ANTHROPIC_API_KEY && model)) };
}

export async function ollamaFlavor(context, { env = process.env, fetchImpl = fetch } = {}) {
  const { model } = writerConfig({ ...env, NARRATION_WRITER: 'ollama' });
  const response = await fetchImpl('http://127.0.0.1:11434/api/chat', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60_000),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model, stream: false, think: false, keep_alive: '5m',
      format: { type: 'object', properties: { leadIn: { type: 'string', maxLength: 180 } }, required: ['leadIn'], additionalProperties: false },
      options: { temperature: 0.8, num_predict: 96, num_ctx: 2048 },
      messages: [{ role: 'system', content: `${WRITER_PROMPT} Return JSON with a leadIn field containing only the spoken sentence, never analysis.` }, { role: 'user', content: JSON.stringify(context) }],
    }),
  });
  if (!response.ok) throw new ProviderError(`Local Ollama request failed (${response.status}); start Ollama and check OLLAMA_MODEL.`);
  const data = await response.json();
  if (!data.done || (data.done_reason && data.done_reason !== 'stop') || typeof data.message?.content !== 'string') throw new ProviderError('Ollama did not finish the lead-in.');
  let parsed;
  try { parsed = JSON.parse(data.message.content); }
  catch { throw new ProviderError('Ollama returned invalid narration JSON.'); }
  if (!parsed || typeof parsed.leadIn !== 'string' || Object.keys(parsed).some((key) => key !== 'leadIn')) throw new ProviderError('Ollama returned an invalid lead-in.');
  return parsed.leadIn.trim();
}

async function atomicWrite(path, value) {
  const temp = `${path}.${randomUUID()}.tmp`;
  try { await writeFile(temp, value, { mode: 0o600 }); await rename(temp, path); }
  finally { await rm(temp, { force: true }); }
}

export async function claudeFlavor(context, { env = process.env, fetchImpl = fetch } = {}) {
  if (!env.ANTHROPIC_API_KEY || !env.ANTHROPIC_MODEL) throw new ProviderError('Set ANTHROPIC_API_KEY and ANTHROPIC_MODEL.');
  const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: AbortSignal.timeout(20_000),
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': env.ANTHROPIC_VERSION || '2023-06-01' },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL, max_tokens: 120,
      system: 'You are Old Brine, an original warm, wry, gravelly pirate figurehead spirit. Write ONE fresh atmospheric lead-in of at most 180 characters for game narration. Plain spoken text only. No digits, names, places, speech tags, quotes, lists, real-world health advice, shame, or references to existing fiction. Do not assert events, rewards, losses or outcomes: authoritative event sentences will follow your lead-in. For streak_reset be reassuring. For recap invite the player to hear the log. Use the supplied event categories only as a tone cue. Return only the lead-in.',
      messages: [{ role: 'user', content: JSON.stringify(context) }],
    }),
  });
  if (!response.ok) throw new ProviderError(`Claude request failed (${response.status}); check model access, key and quota.`);
  const data = await response.json();
  if (data.stop_reason !== 'end_turn') throw new ProviderError('Claude did not finish the lead-in.');
  return data.content?.filter((block) => block.type === 'text').map((block) => block.text).join(' ').trim();
}

export function speechConfig(env = process.env) {
  const model = env.ELEVENLABS_MODEL_ID || 'eleven_flash_v2_5';
  if (!MODEL_IDS.has(model)) throw new ProviderError('Supported models: eleven_flash_v2_5, eleven_multilingual_v2, eleven_v3.');
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(env.ELEVENLABS_VOICE_ID ?? '')) throw new ProviderError('Set ELEVENLABS_VOICE_ID to a voice from your ElevenLabs account.');
  return { voice: env.ELEVENLABS_VOICE_ID, model, format: 'mp3_44100_128', settings: { stability: 0.5, similarity_boost: 0.75 } };
}

export async function listVoices({ env = process.env, fetchImpl = fetch } = {}) {
  if (!env.ELEVENLABS_API_KEY) throw new ProviderError('Set ELEVENLABS_API_KEY.');
  const voices = [];
  let next;
  for (let page = 0; page < 20; page++) {
    const url = new URL('https://api.elevenlabs.io/v2/voices');
    url.searchParams.set('page_size', '100');
    if (next) url.searchParams.set('next_page_token', next);
    const response = await fetchImpl(url, { headers: { 'xi-api-key': env.ELEVENLABS_API_KEY }, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new ProviderError(`Voice listing failed (${response.status}); check key permissions.`);
    const data = await response.json();
    voices.push(...data.voices.map(({ voice_id, name }) => ({ voice_id, name })));
    if (!data.has_more) return voices;
    if (!data.next_page_token || data.next_page_token === next) throw new ProviderError('Invalid voice pagination response.');
    next = data.next_page_token;
  }
  throw new ProviderError('Voice list exceeds 2000 results; select a voice in the ElevenLabs dashboard.');
}

/** Single-process cache + in-flight dedupe. No automatic retries of paid requests. */
export function createNarrator({ env = process.env, cacheDir = DEFAULT_CACHE, fetchImpl = fetch } = {}) {
  const inFlight = new Map();
  const once = (key, work) => {
    if (!inFlight.has(key)) inFlight.set(key, Promise.resolve().then(work).finally(() => inFlight.delete(key)));
    return inFlight.get(key);
  };
  async function script(input) {
    const request = normalizeRequest(input);
    const writer = writerConfig(env);
    const key = hash([VERSION, 'subtitles-2', request, request.ai ? writer : null, request.ai && writer.provider === 'claude' ? env.ANTHROPIC_VERSION : null]);
    return once(`script:${key}`, async () => {
      await mkdir(cacheDir, { recursive: true });
      const path = join(cacheDir, `${key}.json`);
      try { return JSON.parse(await readFile(path, 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      const generateFlavor = writer.configured
        ? (context) => writer.provider === 'ollama' ? ollamaFlavor(context, { env, fetchImpl }) : claudeFlavor(context, { env, fetchImpl }) : undefined;
      const composed = await composeScript(request, { generateFlavor });
      const result = { ...composed, writer: composed.source === 'ai' ? writer.provider : 'stock', subtitles: createSubtitles(composed.text) };
      // A temporary provider failure must not permanently suppress future AI attempts.
      if (!result.warning) await atomicWrite(path, JSON.stringify(result));
      return result;
    });
  }
  async function speech(text) {
    if (typeof text !== 'string' || !text.trim() || text.length > 4000) throw new ProviderError('Speech text must contain 1-4000 characters.');
    const config = speechConfig(env);
    const key = hash([VERSION, text, config]);
    return once(`speech:${key}`, async () => {
      await mkdir(cacheDir, { recursive: true });
      const path = join(cacheDir, `${key}.mp3`);
      try { const audio = await readFile(path); return { key, path, audio, cached: true }; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (!env.ELEVENLABS_API_KEY) throw new ProviderError('Set ELEVENLABS_API_KEY to generate speech. Text previews work without it.');
      const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(config.voice)}?output_format=${config.format}`;
      const response = await fetchImpl(url, {
        method: 'POST', signal: AbortSignal.timeout(45_000),
        headers: { 'content-type': 'application/json', 'xi-api-key': env.ELEVENLABS_API_KEY },
        body: JSON.stringify({ text, model_id: config.model, voice_settings: config.settings }),
      });
      if (!response.ok) throw new ProviderError(`ElevenLabs request failed (${response.status}); check key, voice access and credit balance. No retry was made.`);
      if (!/audio\/(mpeg|mp3)/i.test(response.headers.get('content-type') ?? '')) throw new ProviderError('ElevenLabs returned an unexpected audio format.');
      const audio = Buffer.from(await response.arrayBuffer());
      if (!audio.length || audio.length > 10_000_000) throw new ProviderError('Invalid speech response size.');
      await atomicWrite(path, audio);
      return { key, path, audio, cached: false };
    });
  }
  return { script, speech };
}
