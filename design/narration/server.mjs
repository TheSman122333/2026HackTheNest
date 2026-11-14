/** Local audition server ONLY; never expose this development tool to the network. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNarrator, DEFAULT_CACHE, ProviderError, writerConfig } from './providers.mjs';
import { examples, InputError } from './engine.mjs';
import { toSrt, toVtt } from './subtitles.mjs';

const page = fileURLToPath(new URL('./preview.html', import.meta.url));
export function createPreviewServer({ env = process.env, cacheDir = DEFAULT_CACHE, fetchImpl = fetch } = {}) {
  const narrator = createNarrator({ env, cacheDir, fetchImpl });
  const writer = writerConfig(env);
  const scripts = new Map();
  let active = 0;
  return createServer(async (req, res) => {
    const port = req.socket.localPort;
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('content-security-policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; media-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    const json = (status, data) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    if (!hosts.includes(req.headers.host) || (req.headers.origin && !hosts.some((host) => req.headers.origin === `http://${host}`))) return json(403, { error: 'Use the local preview origin.' });
    const path = req.url;
    if (req.method === 'GET' && path === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(await readFile(page));
    }
    if (req.method === 'GET' && path === '/subtitles.mjs') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      return res.end(await readFile(new URL('./subtitles.mjs', import.meta.url)));
    }
    if (req.method === 'GET' && path === '/api/config') return json(200, {
      speechReady: Boolean(env.ELEVENLABS_API_KEY && env.ELEVENLABS_VOICE_ID),
      writerReady: writer.configured, writer,
      model: env.ELEVENLABS_MODEL_ID || 'eleven_flash_v2_5', examples,
    });
    const subtitleFile = /^\/api\/subtitles\/([a-f0-9]{64})\.(srt|vtt)$/.exec(path);
    if (req.method === 'GET' && subtitleFile) {
      const script = scripts.get(subtitleFile[1]);
      if (!script) return json(404, { error: 'Generate the script in this session before exporting subtitles.' });
      const format = subtitleFile[2];
      res.writeHead(200, {
        'content-type': format === 'vtt' ? 'text/vtt; charset=utf-8' : 'application/x-subrip; charset=utf-8',
        'content-disposition': `attachment; filename="old-brine-estimated.${format}"`,
      });
      return res.end(format === 'srt' ? toSrt(script.subtitles) : toVtt(script.subtitles));
    }
    if (req.method === 'GET' && /^\/api\/audio\/[a-f0-9]{64}\.mp3$/.test(path)) {
      try { const audio = await readFile(join(cacheDir, path.split('/').at(-1))); res.writeHead(200, { 'content-type': 'audio/mpeg', 'content-length': audio.length }); return res.end(audio); }
      catch { return json(404, { error: 'Audio not found.' }); }
    }
    if (req.method !== 'POST' || !['/api/script', '/api/speech'].includes(path)) return json(404, { error: 'Not found.' });
    if (req.headers['content-type']?.split(';')[0] !== 'application/json') return json(415, { error: 'Use application/json.' });
    if (active >= 4) return json(429, { error: 'Preview busy; wait for the current requests.' });
    if (Number(req.headers['content-length']) > 64 * 1024) return json(413, { error: 'Request too large.' });
    active++;
    try {
      const chunks = [];
      let length = 0;
      for await (const chunk of req) { length += chunk.length; if (length > 64 * 1024) throw new InputError('Request too large.'); chunks.push(chunk); }
      let input;
      try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw new InputError('Invalid JSON.'); }
      if (path === '/api/script') {
        const result = await narrator.script(input);
        scripts.set(result.id, result);
        if (scripts.size > 64) scripts.delete(scripts.keys().next().value);
        return json(200, result);
      }
      if (!input || typeof input !== 'object' || Object.keys(input).some((key) => key !== 'scriptId') || !scripts.has(input.scriptId)) throw new InputError('Generate a script in this session first.');
      const result = await narrator.speech(scripts.get(input.scriptId).text);
      return json(200, { audioUrl: `/api/audio/${result.key}.mp3`, cached: result.cached });
    } catch (error) {
      const status = error instanceof InputError ? 400 : error instanceof ProviderError ? 502 : 500;
      return json(status, { error: status === 500 ? 'Preview failed; check the local terminal.' : error.message });
    } finally { active--; }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.NARRATION_PORT || 8790);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('NARRATION_PORT must be 1024-65535.');
  const server = createPreviewServer();
  server.on('error', (error) => { console.error(`Preview could not start: ${error.code ?? 'unknown'}`); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Old Brine preview: http://127.0.0.1:${port} (Ctrl+C to stop)`));
}
