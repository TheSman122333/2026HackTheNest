import { ACTIVITIES, NARRATOR, REWARDS, type ActivityKind, type AppLanguage, type FightAction, type FightEvent, type IslandEvent } from '@last-voyage/game';

import { localizedVoiceStatus } from './voice-language';

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
  language: AppLanguage = 'en',
): string {
  if (language !== 'en') return localizedVoiceStatus(language, view);
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

const LOCAL_COMMANDS: Partial<Record<AppLanguage, readonly string[]>> = {
  es: ['atacar', 'cañón', 'tónico', 'defender'], fr: ['attaquer', 'canon', 'tonique', 'défendre'], de: ['angreifen', 'kanone', 'heiltrank', 'verteidigen'],
  it: ['attacca', 'cannone', 'tonico', 'difendi'], pt: ['atacar', 'canhão', 'tônico', 'defender'], nl: ['aanvallen', 'kanon', 'tonicum', 'verdedigen'],
  pl: ['atakuj', 'armata', 'tonik', 'broń się'], ru: ['атаковать', 'пушка', 'тоник', 'защищаться'], uk: ['атакувати', 'гармата', 'тонік', 'захищатися'],
  cs: ['zaútočit', 'dělo', 'tonikum', 'bránit'], sk: ['zaútočiť', 'delo', 'tonikum', 'brániť'], ro: ['atacă', 'tun', 'tonic', 'apără'],
  bg: ['атакувай', 'оръдие', 'тоник', 'защитавай'], hr: ['napadni', 'top', 'tonik', 'obrani'], el: ['επίθεση', 'κανόνι', 'τονωτικό', 'άμυνα'],
  sv: ['attackera', 'kanon', 'tonikum', 'försvara'], da: ['angrib', 'kanon', 'tonikum', 'forsvar'], fi: ['hyökkää', 'tykki', 'rohto', 'puolusta'],
  no: ['angrip', 'kanon', 'tonikum', 'forsvar'], hu: ['támadj', 'ágyú', 'gyógyital', 'védekezz'], tr: ['saldır', 'top', 'iksir', 'savun'],
  ar: ['هاجم', 'مدفع', 'جرعة', 'دافع'], hi: ['हमला करो', 'तोप', 'औषधि', 'बचाव करो'], ta: ['தாக்கு', 'பீரங்கி', 'மருந்து', 'தற்காப்பு'],
  zh: ['攻击', '大炮', '药水', '防御'], ja: ['攻撃', '大砲', '回復薬', '防御'], ko: ['공격', '대포', '물약', '방어'],
  id: ['serang', 'meriam', 'tonik', 'bertahan'], ms: ['serang', 'meriam', 'tonik', 'bertahan'], fil: ['umatake', 'kanyon', 'gamot', 'dumepensa'],
  vi: ['tấn công', 'đại bác', 'thuốc bổ', 'phòng thủ'],
};

/** Transcribers often omit question marks. Ambiguous questions must never spend a Move. */
const LOCAL_QUESTIONS: Partial<Record<AppLanguage, RegExp>> = {
  es: /^[¿\s]*(?:qué|que|cómo|como|cuándo|cuando|dónde|donde|por qué|quién|cuánto|puedo|podría|debo|debería|puedes|podrías|dime)(?:\s|$)/u,
  fr: /^(?:comment|pourquoi|où|quand|qui|quel|quelle|quels|quelles|combien|est-ce|puis-je|dois-je|peux-tu|pourrais-tu|dis-moi)(?:\s|$)/u,
  de: /^(?:wie|was|wo|wann|warum|wer|welche|welcher|welches|kann|könnte|soll|sollte|erkläre|sag)(?:\s|$)/u,
  it: /^(?:come|cosa|che|quando|dove|perché|chi|quanti|quanto|posso|potrei|devo|dovrei|puoi|dimmi)(?:\s|$)/u,
  pt: /^(?:como|o que|quando|onde|por que|por quê|quem|quanto|posso|poderia|devo|deveria|podes|pode|diga)(?:\s|$)/u,
  nl: /^(?:hoe|wat|waar|wanneer|waarom|wie|welke|hoeveel|kan|kun|zou|moet|vertel)(?:\s|$)/u,
  pl: /^(?:jak|co|gdzie|kiedy|dlaczego|kto|który|która|ile|czy|powiedz)(?:\s|$)/u,
  ru: /^(?:как|что|где|когда|почему|зачем|кто|какой|какая|сколько|могу|можно|стоит|должен|расскажи)(?:\s|$)/u,
  uk: /^(?:як|що|де|коли|чому|навіщо|хто|який|яка|скільки|чи|можна|розкажи)(?:\s|$)/u,
  cs: /^(?:jak|co|kde|kdy|proč|kdo|který|kolik|mohu|můžu|mám|řekni)(?:\s|$)/u,
  sk: /^(?:ako|čo|kde|kedy|prečo|kto|ktorý|koľko|môžem|mám|povedz)(?:\s|$)/u,
  ro: /^(?:cum|ce|unde|când|de ce|cine|care|cât|pot|trebuie|ar trebui|spune)(?:\s|$)/u,
  bg: /^(?:как|какво|къде|кога|защо|кой|коя|колко|мога|може|трябва|кажи)(?:\s|$)/u,
  hr: /^(?:kako|što|gdje|kada|zašto|tko|koji|koliko|mogu|trebam|reci)(?:\s|$)/u,
  el: /^(?:πώς|πως|τι|πού|που|πότε|γιατί|ποιος|ποια|πόσο|μπορώ|πρέπει|πες)(?:\s|$)/u,
  sv: /^(?:hur|vad|var|när|varför|vem|vilken|vilka|kan|ska|borde|berätta)(?:\s|$)/u,
  da: /^(?:hvordan|hvad|hvor|hvornår|hvorfor|hvem|hvilken|kan|skal|burde|fortæl)(?:\s|$)/u,
  fi: /^(?:miten|mitä|missä|milloin|miksi|kuka|mikä|kuinka|voinko|pitäisikö|kerro)(?:\s|$)/u,
  no: /^(?:hvordan|hva|hvor|når|hvorfor|hvem|hvilken|kan|skal|bør|fortell)(?:\s|$)/u,
  hu: /^(?:hogyan|hogy|mi|mit|hol|mikor|miért|ki|melyik|mennyi|lehet|kell|mondd)(?:\s|$)/u,
  tr: /^(?:nasıl|ne|nerede|nereye|ne zaman|neden|niçin|kim|hangi|kaç|söyle)(?:\s|$)|(?:mıyım|miyim|muyum|müyüm|mısın|misin|musun|müsün)$/u,
  ar: /^(?:كيف|ما|ماذا|أين|متى|لماذا|من|أي|كم|هل|يمكنني|أستطيع|أخبرني)(?:\s|$)/u,
  hi: /^(?:कैसे|क्या|कहाँ|कहां|कब|क्यों|कौन|कितने|कितना|मुझे बताओ)(?:\s|$)|(?:सकता हूँ|सकती हूँ|चाहिए)$/u,
  ta: /^(?:எப்படி|என்ன|எங்கே|எப்போது|ஏன்|யார்|எத்தனை)|(?:முடியுமா|வேண்டுமா)$/u,
  zh: /^(?:怎么|怎樣|怎样|如何|什么|什麼|哪|何时|何時|为什么|為什麼|谁|誰|多少|能否|是否|可以|我该|我該|告诉我|告訴我)|[吗嗎呢么麼]$/u,
  ja: /^(?:どう|なぜ|何|どこ|いつ|誰|だれ|どれ|どの|いくつ|教えて)|(?:か|かな|でしょうか)$/u,
  ko: /^(?:어떻게|무엇|뭐|어디|언제|왜|누구|어느|얼마|몇|알려)|(?:까|나요|가요|까요|니|는지)$/u,
  id: /^(?:bagaimana|apa|di mana|dimana|kapan|mengapa|kenapa|siapa|berapa|bisakah|bolehkah|haruskah|jelaskan)(?:\s|$)/u,
  ms: /^(?:bagaimana|apa|di mana|bila|mengapa|kenapa|siapa|berapa|bolehkah|perlukah|terangkan)(?:\s|$)/u,
  fil: /^(?:paano|ano|saan|kailan|bakit|sino|alin|ilan|maaari|pwede|puwede|dapat|sabihin)(?:\s|$)/u,
  vi: /^(?:làm sao|làm thế nào|cái gì|gì|ở đâu|khi nào|tại sao|vì sao|ai|bao nhiêu|có nên|có thể|tôi nên|cho tôi biết)(?:\s|$)/u,
};

export function resolveVoiceIntent(text: string, language: AppLanguage = 'en'): VoiceIntent | null {
  const command = text.trim().normalize('NFKC').toLowerCase().replace(/[.!。！]+$/g, '');
  if (!command) return null;
  if (/^(what|where|when|why|how|who|tell me|can you|could you|should i)\b/.test(command) || /[?？؟]$/.test(command) || LOCAL_QUESTIONS[language]?.test(command)) {
    return { type: 'question' };
  }
  const localized = LOCAL_COMMANDS[language]?.indexOf(command);
  if (localized !== undefined && localized >= 0) return { type: 'fight', action: (['strike', 'cannon', 'tonic', 'brace'] as const)[localized]! };
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
  language: AppLanguage = 'en',
): Promise<string> {
  if (!apiKey) throw new VoiceProviderError('voice transcription is not configured; use a text turn');
  if (!AUDIO_MIME_TYPES.has(audio.mimeType)) throw new VoiceProviderError('unsupported audio format');
  const bytes = Buffer.from(audio.base64, 'base64');
  if (!bytes.length || bytes.length > MAX_AUDIO_BYTES || bytes.toString('base64').replace(/=+$/, '') !== audio.base64.replace(/=+$/, '')) {
    throw new VoiceProviderError('audio payload is invalid or too large');
  }
  const form = new FormData();
  form.append('model_id', 'scribe_v1');
  form.append('language_code', language);
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

export const NARRATOR_VOICE_VERSION = 'captain-flash-localized-v2';
/** The project lead's custom captain voice; a neutral stock voice only if none is configured. */
export const narratorVoiceId = (env: NodeJS.ProcessEnv) => env.ELEVENLABS_NARRATOR_VOICE_ID || env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

export async function synthesizeSpeech(
  text: string,
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch,
  language: AppLanguage = 'en',
): Promise<Uint8Array | null> {
  const apiKey = env.ELEVENLABS_API_KEY;
  const voiceId = narratorVoiceId(env);
  if (!apiKey) return null;
  const response = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({
      text: text.slice(0, 1200),
      model_id: 'eleven_flash_v2_5',
      language_code: language,
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
  language: AppLanguage = 'en',
): string {
  if (language !== 'en') return localizedVoiceStatus(language, view);
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
