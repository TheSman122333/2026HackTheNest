/**
 * Vercel serverless entry: the same API as dev.ts, served under /api, backed by MongoDB Atlas.
 * Bundled by scripts/vercel-build.mjs into .vercel/output/functions/api.func.
 * Env (Vercel project settings): MONGODB_URI, JWT_SECRET, OPENAI_*, ELEVENLABS_*, GM_DEMO_REPEAT.
 */
import { getRequestListener } from '@hono/node-server';
import { Hono } from 'hono';

import { createApp } from './app';
import { connect } from './db';

let ready: Promise<Hono> | null = null;

function getApp(): Promise<Hono> {
  ready ??= (async () => {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI is not set');
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is not set');
    const { c } = await connect(uri, process.env.MONGODB_DB ?? 'last_voyage');
    const api = createApp({ c, jwtSecret: secret, allowDevLogin: process.env.ALLOW_DEV_LOGIN !== 'false' });
    // Mounted at /api (normal) and / (in case the platform strips the prefix).
    return new Hono().route('/api', api).route('/', api);
  })().catch((e: unknown) => {
    ready = null;
    throw e;
  });
  return ready;
}

export default getRequestListener(async (req) => (await getApp()).fetch(req));
