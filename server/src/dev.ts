/**
 * Local server. Phone reaches it via `adb reverse tcp:8787 tcp:8787` → http://localhost:8787
 * No MONGODB_URI? A persistent local MongoDB starts automatically (data in server/.data/).
 */
import { serve } from '@hono/node-server';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createApp } from './app';
import { connect } from './db';

async function localMongo(): Promise<string> {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const dbPath = fileURLToPath(new URL('../.data', import.meta.url));
  mkdirSync(dbPath, { recursive: true });
  const mongod = await MongoMemoryServer.create({
    instance: { port: 27018, dbPath, storageEngine: 'wiredTiger' },
  });
  const stop = () => mongod.stop({ doCleanup: false }).finally(() => process.exit(0));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  console.log(`🗄️  Local MongoDB at ${mongod.getUri()} (data: server/.data)`);
  return mongod.getUri();
}

const uri = process.env.MONGODB_URI || (await localMongo());
const { c } = await connect(uri, process.env.MONGODB_DB ?? 'last_voyage');
const app = createApp({
  c,
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  allowDevLogin: process.env.ALLOW_DEV_LOGIN !== 'false',
});
const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' });
console.log(`⚓ Last Voyage API on http://localhost:${port}`);
