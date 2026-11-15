import type { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { Binary, ObjectId } from 'mongodb';
import { createHash } from 'node:crypto';

import type { Collections, UserDoc } from './db';
import { narratorVoiceId, NARRATOR_VOICE_VERSION, synthesizeSpeech } from './voice';

/** The game's fixed original opening story. */
export const OPENING_NARRATION = 'Long ago, a star fell into the Tidewake, and every captain who ever lived has chased it. The greatest of them sailed every sea, and before the waves took him, he left one last word: the Lodestar belongs to whoever lives the boldest life. So raise your sails. Your voyage begins today.';

/** A public, fixed passage: callers cannot submit arbitrary text or choose a voice. */
export function registerOpening(app: Hono<{ Variables: { user: UserDoc } }>, c: Collections, options: { env: NodeJS.ProcessEnv; fetchImpl: typeof fetch }) {
  const { env, fetchImpl } = options;
  const configured = Boolean(env.ELEVENLABS_API_KEY);
  const version = createHash('sha256').update(`${NARRATOR_VOICE_VERSION}:${narratorVoiceId(env)}:${OPENING_NARRATION}`).digest('hex').slice(0, 24);
  const mediaId = `opening:${version}`;
  let generating: Promise<Uint8Array> | null = null;
  const audio = async (): Promise<Uint8Array> => {
    const cached = await c.media.findOne({ _id: mediaId });
    if (cached && (cached.expiresAt?.getTime() ?? 0) > Date.now()) return new Uint8Array(cached.bytes.buffer);
    if (!configured) throw new HTTPException(503, { message: 'opening speech is not configured' });
    if (!generating) {
      generating = (async () => {
        const bytes = await synthesizeSpeech(OPENING_NARRATION, env, fetchImpl);
        if (!bytes?.byteLength || bytes.byteLength > 1024 * 1024) throw new HTTPException(503, { message: 'opening speech is unavailable' });
        const createdAt = new Date();
        await c.media.updateOne({ _id: mediaId }, { $set: {
          userId: new ObjectId('000000000000000000000000'), contentType: 'audio/mpeg', bytes: new Binary(bytes), createdAt,
          expiresAt: new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000),
        } }, { upsert: true });
        return bytes;
      })().finally(() => { generating = null; });
    }
    return generating;
  };
  // The URL carries the version, so a new text or voice can never replay an old cached recording.
  app.get('/opening/narration', (ctx) => ctx.json({ text: OPENING_NARRATION, audioUrl: configured ? `/opening/audio?v=${version}` : null }));
  app.get('/opening/audio', async (ctx) => {
    try {
      const bytes = await audio();
      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      const current = ctx.req.query('v') === version;
      return new Response(buffer, { headers: { 'content-type': 'audio/mpeg', 'content-length': String(bytes.byteLength), 'cache-control': current ? 'public, max-age=604800, immutable' : 'no-store' } });
    } catch (error) {
      if (error instanceof HTTPException) throw error;
      throw new HTTPException(503, { message: 'opening speech is unavailable' });
    }
  });
}
