/** Shared, original game audio. Prompts are fixed here; clients never submit generation text. */
import type { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { Binary, ObjectId } from 'mongodb';

import type { Collections, MediaDoc, UserDoc } from './db';

export const EFFECT_IDS = ['move', 'strike', 'cannon', 'heal', 'brace'] as const;
export type EffectId = (typeof EFFECT_IDS)[number];
type ClipId = EffectId | 'music';

const VERSION = 'original-v1';
const SHARED_OWNER = new ObjectId('000000000000000000000000');
const FAILURE_COOLDOWN_MS = 15_000;
const EFFECTS: Record<EffectId, { seconds: number; prompt: string }> = {
  move: { seconds: 0.6, prompt: 'A single light footstep on a wooden ship deck with a tiny soft splash. Clean friendly adventure game sound effect, dry and brief, no voice, no music, no background ambience.' },
  strike: { seconds: 0.7, prompt: 'One quick cartoon sword swish followed by a crisp wooden impact. Friendly adventure game action, punchy but not harsh, no voice, no gore, no music, no background ambience.' },
  cannon: { seconds: 1.4, prompt: 'One playful miniature ship cannon firing: a short low thump and a soft splash, quick decay. Friendly adventure game sound, no voice, no music, no background ambience.' },
  heal: { seconds: 1.0, prompt: 'A brief gentle sparkling recovery chime with three warm ascending notes. Friendly adventure game healing sound effect, delicate and quiet, no voice, no music bed, no background ambience.' },
  brace: { seconds: 0.6, prompt: 'A single short wooden shield block with a soft metal click. Friendly adventure game defensive action, clean and subdued, no voice, no music, no background ambience.' },
};
const MUSIC_PROMPT = 'Original instrumental background music for a relaxed ocean adventure game. Warm marimba, soft pizzicato strings, light hand percussion, and a simple hopeful melody at a gentle steady tempo. Calm and playful, low dynamic range, no dramatic drops, no vocals, no lyrics, no spoken words. A self-contained thirty-second passage with a smooth ending that can repeat comfortably. Do not imitate any existing artist, song, film, or franchise.';

const mediaId = (id: ClipId) => `soundtrack:${VERSION}:${id}`;
const clipUrl = (id: ClipId) => `/audio/clips/${id}?v=${VERSION}`;
const isClipId = (value: string): value is ClipId => value === 'music' || EFFECT_IDS.some((id) => id === value);

async function boundedAudio(response: Response, maximum: number): Promise<Uint8Array> {
  if (!response.ok || !/^audio\/(mpeg|mp3)(?:;|$)/i.test(response.headers.get('content-type') ?? '')) throw new Error('audio provider unavailable');
  const declared = Number(response.headers.get('content-length'));
  if (declared > maximum) throw new Error('audio exceeds size limit');
  if (!response.body) throw new Error('empty audio');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum) { await reader.cancel(); throw new Error('audio exceeds size limit'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (length < 128) throw new Error('empty audio');
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export function registerSoundtrack(
  app: Hono<{ Variables: { user: UserDoc } }>,
  c: Collections,
  { env, fetchImpl }: { env: NodeJS.ProcessEnv; fetchImpl: typeof fetch },
) {
  const pending = new Map<ClipId, Promise<MediaDoc>>();
  const failedAt = new Map<ClipId, number>();

  async function generate(id: ClipId): Promise<MediaDoc> {
    const cached = await c.media.findOne({ _id: mediaId(id), userId: SHARED_OWNER });
    if (cached) return cached;
    const apiKey = env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error('audio is not configured');
    if (Date.now() - (failedAt.get(id) ?? 0) < FAILURE_COOLDOWN_MS) throw new Error('audio is temporarily unavailable');
    const music = id === 'music';
    const response = await fetchImpl(`https://api.elevenlabs.io/v1/${music ? 'music' : 'sound-generation'}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify(music ? {
        prompt: MUSIC_PROMPT, music_length_ms: 30_000, model_id: 'music_v1', force_instrumental: true,
      } : {
        text: EFFECTS[id].prompt, duration_seconds: EFFECTS[id].seconds, model_id: 'eleven_text_to_sound_v3', prompt_influence: 0.7, loop: false,
      }),
      signal: AbortSignal.timeout(music ? 60_000 : 15_000),
    });
    const bytes = await boundedAudio(response, music ? 2_000_000 : 500_000);
    const doc: MediaDoc = { _id: mediaId(id), userId: SHARED_OWNER, contentType: 'audio/mpeg', bytes: new Binary(bytes), createdAt: new Date() };
    await c.media.replaceOne({ _id: doc._id }, doc, { upsert: true });
    failedAt.delete(id);
    return doc;
  }

  function clip(id: ClipId) {
    const active = pending.get(id);
    if (active) return active;
    const promise = generate(id).catch((error) => { failedAt.set(id, Date.now()); throw error; })
      .finally(() => { if (pending.get(id) === promise) pending.delete(id); });
    pending.set(id, promise);
    return promise;
  }

  app.get('/audio/catalog', (ctx) => {
    if (!ctx.get('user')) throw new HTTPException(401, { message: 'unauthorized' });
    const enabled = Boolean(env.ELEVENLABS_API_KEY);
    return ctx.json({ enabled, effects: enabled ? Object.fromEntries(EFFECT_IDS.map((id) => [id, clipUrl(id)])) : {}, music: enabled ? clipUrl('music') : null });
  });

  app.get('/audio/clips/:key', async (ctx) => {
    if (!ctx.get('user')) throw new HTTPException(401, { message: 'unauthorized' });
    const id = ctx.req.param('key');
    if (!isClipId(id)) throw new HTTPException(404, { message: 'unknown game audio' });
    try {
      const doc = await clip(id);
      const bytes = doc.bytes.buffer;
      const body = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(body).set(bytes);
      return new Response(body, { headers: { 'content-type': 'audio/mpeg', 'content-length': String(bytes.byteLength), 'cache-control': 'private, max-age=3600' } });
    } catch {
      ctx.header('retry-after', '15');
      throw new HTTPException(503, { message: 'game audio is temporarily unavailable' });
    }
  });
}
