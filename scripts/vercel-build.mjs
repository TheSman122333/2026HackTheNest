/**
 * Vercel build (Build Output API v3): one deployment = the Expo web app (static) + the API
 * (one Node function at /api). Run from the repo root: `node scripts/vercel-build.mjs`.
 */
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

import { build } from 'esbuild';

const OUT = '.vercel/output';
rmSync(OUT, { recursive: true, force: true });

// 1) Web app. API lives on the same origin under /api.
console.log('▶ expo export (web)');
rmSync('apps/mobile/dist', { recursive: true, force: true });
execSync('npx expo export --platform web --output-dir dist', {
  cwd: 'apps/mobile',
  stdio: 'inherit',
  env: { ...process.env, EXPO_PUBLIC_API_URL: '/api', CI: '1' },
});
mkdirSync(`${OUT}/static`, { recursive: true });
cpSync('apps/mobile/dist', `${OUT}/static`, { recursive: true });
// Landing page for the apex domain (the game lives on play.).
mkdirSync(`${OUT}/static/_landing`, { recursive: true });
cpSync('site/index.html', `${OUT}/static/_landing/index.html`);
cpSync('apps/mobile/assets/icon.png', `${OUT}/static/_landing/icon.png`);

// 2) API function, bundled to a single file.
console.log('▶ bundle API');
const fn = `${OUT}/functions/api.func`;
await build({
  entryPoints: ['server/src/vercel.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: `${fn}/index.js`,
  // optional native/cloud extras of the mongodb driver we don't use
  external: ['kerberos', '@mongodb-js/zstd', '@aws-sdk/credential-providers', 'gcp-metadata', 'snappy', 'socks', 'aws4', 'mongodb-client-encryption'],
  logLevel: 'info',
});
writeFileSync(
  `${fn}/.vc-config.json`,
  JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.js', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 300 }, null, 2),
);

// 3) Routes: /api/* → function, files as-is, everything else → the SPA.
writeFileSync(
  `${OUT}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/api(/.*)?$', dest: '/api' },
        // lastvoyageplease.work: the landing page at /, every other path forwards to the game.
        { src: '^/$', has: [{ type: 'host', value: 'lastvoyageplease.work' }], dest: '/_landing/index.html' },
        { src: '^/(?!_landing/|favicon\\.ico$)(.+)$', has: [{ type: 'host', value: 'lastvoyageplease.work' }], status: 308, headers: { Location: 'https://play.lastvoyageplease.work/$1' } },
        { handle: 'filesystem' },
        { src: '/(.*)', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
);
console.log('✔ .vercel/output ready');
