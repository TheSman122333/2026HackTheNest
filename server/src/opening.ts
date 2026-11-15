import { normalizeLanguage, type AppLanguage } from '@last-voyage/game';
import type { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { Binary, ObjectId } from 'mongodb';
import { createHash } from 'node:crypto';

import type { Collections, UserDoc } from './db';
import { narratorVoiceId, NARRATOR_VOICE_VERSION, synthesizeSpeech } from './voice';
import { OPENING_PASSAGES } from './voice-language';

/** The game's fixed original opening story. */
export const OPENING_NARRATION = OPENING_PASSAGES.en;

/** A public, fixed passage: callers cannot submit arbitrary text or choose a voice. */
export function registerOpening(app: Hono<{ Variables: { user: UserDoc } }>, c: Collections, options: { env: NodeJS.ProcessEnv; fetchImpl: typeof fetch }) {
  const { env, fetchImpl } = options;
  const configured = Boolean(env.ELEVENLABS_API_KEY);
  const versionFor = (language: AppLanguage) => createHash('sha256').update(`${NARRATOR_VOICE_VERSION}:${narratorVoiceId(env)}:${language}:${OPENING_PASSAGES[language]}`).digest('hex').slice(0, 24);
  const generating = new Map<AppLanguage, Promise<Uint8Array>>();
  const audio = async (language: AppLanguage): Promise<Uint8Array> => {
    const mediaId = `opening:${language}:${versionFor(language)}`;
    const cached = await c.media.findOne({ _id: mediaId });
    if (cached && (cached.expiresAt?.getTime() ?? 0) > Date.now()) return new Uint8Array(cached.bytes.buffer);
    if (!configured) throw new HTTPException(503, { message: 'opening speech is not configured' });
    if (!generating.has(language)) {
      generating.set(language, (async () => {
        const bytes = await synthesizeSpeech(OPENING_PASSAGES[language], env, fetchImpl, language);
        if (!bytes?.byteLength || bytes.byteLength > 1024 * 1024) throw new HTTPException(503, { message: 'opening speech is unavailable' });
        const createdAt = new Date();
        await c.media.updateOne({ _id: mediaId }, { $set: {
          userId: new ObjectId('000000000000000000000000'), contentType: 'audio/mpeg', bytes: new Binary(bytes), createdAt,
          expiresAt: new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000),
        } }, { upsert: true });
        return bytes;
      })().finally(() => { generating.delete(language); }));
    }
    return generating.get(language)!;
  };
  // The URL carries the version, so a new text or voice can never replay an old cached recording.
  app.get('/opening/narration', (ctx) => {
    const language = normalizeLanguage(ctx.req.query('language') ?? ctx.req.header('X-App-Language'));
    return ctx.json({ text: OPENING_PASSAGES[language], audioUrl: configured ? `/opening/audio?${language === 'en' ? '' : `language=${language}&`}v=${versionFor(language)}` : null });
  });
  app.get('/opening/audio', async (ctx) => {
    const language = normalizeLanguage(ctx.req.query('language') ?? ctx.req.header('X-App-Language'));
    try {
      const bytes = await audio(language);
      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      const current = ctx.req.query('v') === versionFor(language);
      return new Response(buffer, { headers: { 'content-type': 'audio/mpeg', 'content-length': String(bytes.byteLength), 'cache-control': current ? 'public, max-age=604800, immutable' : 'no-store', vary: 'X-App-Language' } });
    } catch (error) {
      if (error instanceof HTTPException) throw error;
      throw new HTTPException(503, { message: 'opening speech is unavailable' });
    }
  });
}
