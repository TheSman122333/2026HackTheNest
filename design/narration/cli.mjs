import { readFile } from 'node:fs/promises';
import { createNarrator, listVoices } from './providers.mjs';
import { examples, EVENT_TYPES } from './engine.mjs';

const [command, target, ...options] = process.argv.slice(2);
const usage = `Old Brine narration sandbox (Node 22+; no npm install)
  node cli.mjs preview activity|pickup|boss|recap [--ai]
  node cli.mjs preview path/to/event.json [--ai]
  node cli.mjs speak activity|pickup|boss|recap [--ai]  # ElevenLabs credits
  node cli.mjs say path/to/approved-script.txt        # ElevenLabs credits
  node cli.mjs voices
  node cli.mjs types
  node --env-file-if-exists=.env server.mjs          # local audition UI
Use --env-file-if-exists=.env before cli.mjs to load local secrets.`;
try {
  if (command === 'types') console.log(EVENT_TYPES.join('\n'));
  else if (command === 'voices') console.table(await listVoices());
  else if (['preview', 'speak', 'say'].includes(command)) {
    if (!target || options.some((option) => option !== '--ai')) throw new Error(usage);
    const narrator = createNarrator();
    let script;
    if (command === 'say') script = { text: (await readFile(target, 'utf8')).trim() };
    else {
      const input = examples[target] ? structuredClone(examples[target]) : JSON.parse(await readFile(target, 'utf8'));
      if (options.includes('--ai')) input.ai = true;
      script = await narrator.script(input);
      console.log(JSON.stringify(script, null, 2));
    }
    if (command !== 'preview') {
      const result = await narrator.speech(script.text);
      console.log(`${result.cached ? 'Cached' : 'Generated'} MP3: ${result.path}`);
    }
  } else console.log(usage);
} catch (error) { console.error(error.message); process.exitCode = 1; }
