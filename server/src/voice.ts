import { ACTIVITIES, NARRATOR, REWARDS, type ActivityKind, type FightAction, type FightEvent, type IslandEvent } from '@last-voyage/game';

export class VoiceProviderError extends Error {}

export const NARRATION_SCENES = ['arrival', 'ship', 'island', 'quests', 'log', 'me', 'activity', 'move', 'fight', 'night'] as const;
export type NarrationScene = (typeof NARRATION_SCENES)[number];

export type VoiceIntent =
  | { type: 'briefing' }
  | { type: 'narration'; scene: NarrationScene }
  | { type: 'question' }
  | { type: 'island.move'; to: string }
  | { type: 'fight'; action: FightAction };

const AUDIO_MIME_TYPES = new Set(['audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/webm']);
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;

/** A short, factual story still works when speech or the language provider is unavailable. */
export function responseForScene(
  scene: NarrationScene,
  name: string,
  view: {
    island: { theme: string; index: number; conquered: boolean };
    explorer: { hp: number; maxHp: number; pos: string };
    boss: { name: string; hp: number; maxHp: number; defeated: boolean };
    movesRemaining: number;
    canFight: boolean;
  },
  today: {
    steps: number;
    activities: { kind: ActivityKind; moves: number; supplies: number; at: Date }[];
    moves: { total: number; remaining: number };
    streak: { calmDays: number; shields: number };
  },
): string {
  const moves = `${view.movesRemaining} Move${view.movesRemaining === 1 ? '' : 's'}`;
  const island = `island ${view.island.index + 1}`;
  const completed = view.island.conquered || view.boss.defeated;
  const latest = [...today.activities].sort((a, b) => b.at.getTime() - a.at.getTime())[0];
  switch (scene) {
    case 'arrival':
      return completed
        ? `Welcome back, ${name}. Your crew completed ${island}. You have ${moves} left today.`
        : `Welcome back, ${name}. You have ${moves}. ${view.boss.name} has ${view.boss.hp} health remaining.`;
    case 'ship':
      return `You've earned ${today.moves.total} Moves today. Real-life quests help your ship progress.`;
    case 'island':
      if (view.explorer.hp <= 0) return `${name}, you're out of health. You'll recover tomorrow, and your crew's progress is saved.`;
      if (completed) return `${name}, ${island} is complete. Your next destination opens at nightfall.`;
      return view.canFight
        ? `${name}, you can challenge ${view.boss.name}. You have ${moves} and ${view.explorer.hp} health.`
        : `${name}, you have ${moves} and ${view.explorer.hp} health. Explore toward ${view.boss.name}.`;
    case 'quests':
      return `You logged ${today.activities.length} ${today.activities.length === 1 ? 'activity' : 'activities'} and ${today.steps} steps today. Every ${REWARDS.stepsPerMove.toLocaleString('en-US')} steps earns a Move.`;
    case 'log':
      return `Your crew's activities, discoveries, and rewards are recorded here.`;
    case 'me':
      return `${name}, your Calm Seas streak is ${today.streak.calmDays} days. You have ${today.streak.shields} shields.`;
    case 'activity':
      return latest
        ? `${ACTIVITIES[latest.kind].label}: ${latest.moves} ${latest.moves === 1 ? 'Move' : 'Moves'} and ${latest.supplies} Supplies earned. ${moves} remain.`
        : `Complete a real-life quest, then claim its rewards here.`;
    case 'move':
      return view.explorer.hp <= 0
        ? `You're out of health. You'll recover tomorrow.`
        : `${moves} and ${view.explorer.hp} health remain${view.canFight ? `. ${view.boss.name} is within reach` : ''}.`;
    case 'fight':
      if (completed) return `${view.boss.name} is defeated. Your crew completed ${island}.`;
      return view.explorer.hp <= 0
        ? `You'll recover tomorrow. ${view.boss.name} remains at ${view.boss.hp} health.`
        : `${view.boss.name} has ${view.boss.hp} health. You have ${view.explorer.hp} health and ${moves}.`;
    case 'night':
      return `Your crew reached ${island}, a ${view.island.theme} island. You have ${moves} ready.`;
  }
}

export function resolveVoiceIntent(text: string): VoiceIntent | null {
  const command = text.trim().toLowerCase().replace(/[.!]+$/g, '');
  if (!command) return null;
  if (/^(what|where|when|why|how|who|tell me|can you|could you|should i)\b/.test(command) || command.endsWith('?')) {
    return { type: 'question' };
  }
  if (/^(strike|attack)(?:\s|$)/.test(command)) return { type: 'fight', action: 'strike' };
  if (/^(fire\s+)?cannon(?:\s|$)/.test(command)) return { type: 'fight', action: 'cannon' };
  if (/^(use\s+)?tonic(?:\s|$)|^heal(?:\s|$)/.test(command)) return { type: 'fight', action: 'tonic' };
  if (/^(brace|defend)(?:\s|$)/.test(command)) return { type: 'fight', action: 'brace' };
  const move = /^(?:move|walk|go|head|sail)(?:\s+to)?\s+([+-]?\d+,[+-]?\d+)$/.exec(command);
  if (move) return { type: 'island.move', to: move[1]! };
  return null;
}

export async function transcribeAudio(
  audio: { mimeType: string; base64: string },
  apiKey: string | undefined,
  fetchImpl: typeof fetch,
): Promise<string> {
  if (!apiKey) throw new VoiceProviderError('voice transcription is not configured; use a text turn');
  if (!AUDIO_MIME_TYPES.has(audio.mimeType)) throw new VoiceProviderError('unsupported audio format');
  const bytes = Buffer.from(audio.base64, 'base64');
  if (!bytes.length || bytes.length > MAX_AUDIO_BYTES || bytes.toString('base64').replace(/=+$/, '') !== audio.base64.replace(/=+$/, '')) {
    throw new VoiceProviderError('audio payload is invalid or too large');
  }
  const form = new FormData();
  form.append('model_id', 'scribe_v1');
  form.append('file', new Blob([bytes], { type: audio.mimeType }), 'voice-turn');
  let response: Response;
  try {
    response = await fetchImpl('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: form,
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new VoiceProviderError('ElevenLabs transcription service is unavailable');
  }
  if (!response.ok) throw new VoiceProviderError('ElevenLabs transcription failed');
  const body = (await response.json()) as { text?: unknown };
  if (typeof body.text !== 'string' || !body.text.trim()) throw new VoiceProviderError('ElevenLabs returned no transcript');
  return body.text.trim().slice(0, 400);
}

export const NARRATOR_VOICE_VERSION = 'captain-short-v1';
/** The project lead's custom captain voice; a neutral stock voice only if none is configured. */
export const narratorVoiceId = (env: NodeJS.ProcessEnv) => env.ELEVENLABS_NARRATOR_VOICE_ID || env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

export async function synthesizeSpeech(
  text: string,
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch,
): Promise<Uint8Array | null> {
  const apiKey = env.ELEVENLABS_API_KEY;
  const voiceId = narratorVoiceId(env);
  if (!apiKey) return null;
  const response = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({
      text: text.slice(0, 1200),
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.75, similarity_boost: 0.75, style: 0, speed: 1, use_speaker_boost: false },
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return null;
  return new Uint8Array(await response.arrayBuffer());
}

export function responseForQuestion(
  text: string,
  view: {
    island: { theme: string; index: number };
    boss: { name: string; hp: number; maxHp: number };
    movesRemaining: number;
    explorer: { hp: number; maxHp: number };
  },
  calmDays: number,
): string {
  const query = text.toLowerCase();
  if (/\b(move|moves)\b/.test(query)) return `You have ${view.movesRemaining} Moves left today.`;
  if (/\b(boss|guardian|enemy)\b/.test(query)) {
    return `${view.boss.name} has ${view.boss.hp} of ${view.boss.maxHp} health remaining.`;
  }
  if (/\b(streak|calm|shore leave|shield)\b/.test(query)) {
    return `Your Calm Seas streak is ${calmDays} ${calmDays === 1 ? 'day' : 'days'}.`;
  }
  if (/\b(health|hp|hurt)\b/.test(query)) return `You have ${view.explorer.hp} of ${view.explorer.maxHp} health.`;
  return `You are exploring island ${view.island.index + 1}, a ${view.island.theme} island. You have ${view.movesRemaining} Moves, and ${view.boss.name} has ${view.boss.hp} health left.`;
}

export function sfxCueKeys(events: readonly (IslandEvent | FightEvent)[]): string[] {
  const keys: string[] = [];
  for (const event of events) {
    let key: string | null = null;
    switch (event.type) {
      case 'moved':
        key = 'island.move';
        break;
      case 'found':
        key = 'island.loot_found';
        break;
      case 'hazard':
        key = 'island.hazard';
        break;
      case 'boss_in_sight':
        key = 'island.boss_in_sight';
        break;
      case 'hit':
        key = event.weapon === 'cannon' ? 'combat.cannon' : event.crit ? 'combat.critical' : 'combat.strike';
        break;
      case 'boss_hit':
        key = 'combat.boss_hit';
        break;
      case 'boss_defeated':
        key = 'combat.boss_defeated';
        break;
      case 'heal':
        key = 'combat.heal';
        break;
      case 'brace':
        key = 'combat.brace';
        break;
      case 'enraged':
        key = 'combat.enraged';
        break;
      case 'washed_overboard':
        key = 'island.washed_overboard';
        break;
      case 'revealed':
        break;
    }
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

export function voiceCommandReply(intent: VoiceIntent, view: { boss: { name: string }; explorer: { hp: number } }): string {
  if (intent.type === 'island.move') return `${NARRATOR.withThe.replace(/^t/, 'T')} records your move to ${intent.to}.`;
  if (intent.type === 'fight') {
    if (intent.action === 'strike') return `Strike complete. ${view.boss.name} answers with a counterattack.`;
    if (intent.action === 'cannon') return `Cannon fired. ${view.boss.name} answers with a counterattack.`;
    if (intent.action === 'tonic') return `Tonic used. ${view.explorer.hp} health remains.`;
    return `You braced for ${view.boss.name}'s counterattack.`;
  }
  return '';
}
