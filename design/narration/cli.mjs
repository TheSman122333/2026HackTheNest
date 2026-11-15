import { readFile } from 'node:fs/promises';
import { createNarrator, listVoices } from './providers.mjs';
import { examples, EVENT_TYPES } from './engine.mjs';
import { toSrt, toVtt } from './subtitles.mjs';

const [command, target, ...options] = process.argv.slice(2);
const usage = `the Tidekeeper narration sandbox (Node 22+; no npm install)
  node cli.mjs preview activity|pickup|boss|recap [--ai]
  node cli.mjs preview path/to/event.json [--ai]
  node cli.mjs subtitles recap [--ai] [--format=srt|vtt|json]
  node cli.mjs speak activity|pickup|boss|recap [--ai]  # ElevenLabs credits
  node cli.mjs say path/to/approved-script.txt        # ElevenLabs credits
  node cli.mjs voices
  node cli.mjs types
  node --env-file-if-exists=.env server.mjs          # local audition UI
Use --env-file-if-exists=.env before cli.mjs to load local secrets.`;
try {
  if (command === 'types') console.log(EVENT_TYPES.join('\n'));
  else if (command === 'voices') console.table(await listVoices());
  else if (['preview', 'speak', 'say', 'subtitles'].includes(command)) {
    const formats = options.filter((option) => option.startsWith('--format='));
    const format = formats[0]?.split('=')[1] ?? 'srt';
    if (!target || formats.length > 1 || !['srt', 'vtt', 'json'].includes(format) || options.some((option) => option !== '--ai' && !(command === 'subtitles' && option.startsWith('--format=')))) throw new Error(usage);
    const narrator = createNarrator();
    let script;
    if (command === 'say') script = { text: (await readFile(target, 'utf8')).trim() };
    else {
      const input = examples[target] ? structuredClone(examples[target]) : JSON.parse(await readFile(target, 'utf8'));
      if (options.includes('--ai')) input.ai = true;
      script = await narrator.script(input);
      if (command === 'subtitles') {
        if (script.warning) console.error(script.warning);
        console.log(format === 'srt' ? toSrt(script.subtitles) : format === 'vtt' ? toVtt(script.subtitles) : JSON.stringify(script.subtitles, null, 2));
      } else console.log(JSON.stringify(script, null, 2));
    }
    if (['speak', 'say'].includes(command)) {
      const result = await narrator.speech(script.text);
      console.log(`${result.cached ? 'Cached' : 'Generated'} MP3: ${result.path}`);
    }
  } else console.log(usage);
} catch (error) { console.error(error.message); process.exitCode = 1; }
