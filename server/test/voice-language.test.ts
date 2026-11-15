import { APP_LANGUAGES } from '@last-voyage/game';
import { describe, expect, it } from 'vitest';

import { askTidekeeper, brainState } from '../src/brain';
import { resolveVoiceIntent, synthesizeSpeech, transcribeAudio } from '../src/voice';
import { localizedVoiceStatus, OPENING_PASSAGES } from '../src/voice-language';

describe('narration languages', () => {
  it('bundles a complete opening and factual outage fallback for every selectable language', () => {
    const view = { movesRemaining: 7, explorer: { hp: 23 }, boss: { name: 'Clawdius', hp: 89 } };
    for (const { code } of APP_LANGUAGES) {
      expect(OPENING_PASSAGES[code].length).toBeGreaterThanOrEqual(100);
      const fallback = localizedVoiceStatus(code, view);
      expect(fallback).toContain('7');
      expect(fallback).toContain('23');
      expect(fallback).toContain('89');
      expect(fallback).toContain('Clawdius');
      if (code !== 'en') expect(fallback).not.toBe(localizedVoiceStatus('en', view));
    }
  });

  it('pins the speech model and output language while retaining the configured captain voice', async () => {
    await synthesizeSpeech('Votre voyage commence.', { ELEVENLABS_API_KEY: 'test-key', ELEVENLABS_NARRATOR_VOICE_ID: 'captain' }, async (url, init) => {
      expect(String(url)).toContain('/text-to-speech/captain');
      expect(JSON.parse(String(init?.body))).toMatchObject({ text: 'Votre voyage commence.', model_id: 'eleven_flash_v2_5', language_code: 'fr' });
      return new Response(new Uint8Array([1, 2, 3]));
    }, 'fr');
  });

  it('hints the selected language for transcription and safely resolves exact localized commands', async () => {
    const transcript = await transcribeAudio({ mimeType: 'audio/webm', base64: Buffer.from([1, 2, 3]).toString('base64') }, 'test-key', async (_url, init) => {
      expect((init?.body as FormData).get('language_code')).toBe('es');
      return Response.json({ text: 'Atacar' });
    }, 'es');
    expect(resolveVoiceIntent(transcript, 'es')).toEqual({ type: 'fight', action: 'strike' });
    expect(resolveVoiceIntent('¿Debo atacar?', 'es')).toEqual({ type: 'question' });
    expect(resolveVoiceIntent('攻击。', 'zh')).toEqual({ type: 'fight', action: 'strike' });
    expect(resolveVoiceIntent('هل أهاجم؟', 'ar')).toEqual({ type: 'question' });
    for (const [language, text] of [['es', 'cómo ataco'], ['fr', 'comment attaquer'], ['de', 'wie greife ich an'], ['zh', '怎么攻击'], ['ja', '攻撃してもいいですか'], ['ko', '공격해도 되나요']] as const) {
      expect(resolveVoiceIntent(text, language)).toEqual({ type: 'question' });
    }
  });

  it('passes the app language to both brain providers and keeps narration actions disabled', async () => {
    const state = brainState('Alex', {
      island: { index: 0, theme: 'tropical', bossAt: '0,0', conquered: false, tiles: {} },
      explorer: { hp: 30, maxHp: 30, pos: '1,0', inventory: {} }, reachable: {}, canFight: true,
      boss: { name: 'Clawdius', title: 'the Tide Crab', hp: 99, maxHp: 120, defeated: false }, movesRemaining: 7,
    }, { calmDays: 2, shields: 0, steps: 1000, crewmates: 2 });
    let calls = 0;
    const answer = await askTidekeeper({
      env: { GEMINI_API_KEY: 'test-gemini', OPENAI_API_KEY: 'test-openai', OPENAI_MODEL: 'test-model' }, language: 'fr', mode: 'narration',
      text: null, state, history: [], narration: { scene: 'island', facts: '7 Moves remain.' },
      fetchImpl: async (_url, init) => {
        calls++;
        const input = JSON.parse(String(init?.body));
        expect(input.messages[0].content).toContain('OUTPUT LANGUAGE: French');
        if (calls === 1) return new Response('down', { status: 503 });
        return Response.json({ choices: [{ message: { content: JSON.stringify({ reply: 'Il vous reste sept déplacements.', action: 'strike' }) } }] });
      },
    });
    expect(calls).toBe(2);
    expect(answer).toEqual({ reply: 'Il vous reste sept déplacements.', action: 'none' });
  });
});
