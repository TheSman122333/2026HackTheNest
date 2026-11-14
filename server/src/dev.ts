/** Local server. Phone reaches it via `adb reverse tcp:8787 tcp:8787` → http://localhost:8787 */
import { serve } from '@hono/node-server';

import { createApp } from './app';
import { connect } from './db';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI missing. Copy server/.env.example to server/.env and fill it in.');
  process.exit(1);
}

const { c } = await connect(uri, process.env.MONGODB_DB ?? 'last_voyage');
const app = createApp({
  c,
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  allowDevLogin: process.env.ALLOW_DEV_LOGIN !== 'false',
});
const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' });
console.log(`⚓ Last Voyage API on http://localhost:${port}`);
