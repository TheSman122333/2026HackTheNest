# App languages

The app asks for a language before its first opening story. Players can change it from **Me → Language**, or from the sign-in screen. The device remembers the choice across restarts and sign-outs; it does not change another crewmate's language.

There are 32 choices: English, Spanish, French, German, Italian, Portuguese, Dutch, Polish, Russian, Ukrainian, Czech, Slovak, Romanian, Bulgarian, Croatian, Greek, Swedish, Danish, Finnish, Norwegian, Hungarian, Turkish, Arabic, Hindi, Tamil, Chinese, Japanese, Korean, Indonesian, Malay, Filipino and Vietnamese. These match ElevenLabs Flash v2.5's supported languages. Arabic text uses right-to-left writing; scripts outside the bundled fonts use the system font.

The opening story and core interface phrases are bundled for every language. Additional static interface copy is translated in bounded batches by the server's existing Gemini/OpenAI providers, checked for matching interpolation tokens, and cached on the device. Without a text provider or connection, missing translations appear in English; Me → Language offers a retry. Known crew log events use translated templates; unrecognized historical entries retain their original text. Player names, crew names, invite codes and entered text are preserved. The catalog service accepts only language/offset parameters and never receives player-authored content or photos.

`X-App-Language` selects the language for narrator prompts, ElevenLabs transcription and speech, world-event narration, and personalized quest text. Speech uses `eleven_flash_v2_5` with `language_code`; the configured narrator voice remains the same character. Opening audio is cached separately per language. Switching language clears the old narration queue and conversation. Per-reader translations preserve canonical events, quest identifiers, completion and rewards. Dynamic event/quest translations fall back to English when text providers are unavailable; opening passages and narrator status fallbacks remain translated.

The existing server variables configure providers: `GEMINI_API_KEY` and/or the existing OpenAI settings for text, `ELEVENLABS_API_KEY` for speech, and optional `ELEVENLABS_NARRATOR_VOICE_ID` (or `ELEVENLABS_VOICE_ID`). No credentials are included in the app and no new dependencies are required.

When adding copy, use the localized kit components or `LocalizedText`, and `useT()` with named placeholders for interpolated sentences. Mark player-authored content `translatable={false}`. Refresh the source catalog with `node scripts/extract-localization.mjs`, then run `npm run check`. Curated offline dictionaries live in `content/localization/bundled.json`, and opening passages in `content/localization/opening.json`.

Provider references: [ElevenLabs models](https://elevenlabs.io/docs/overview/models), [speech language parameter](https://elevenlabs.io/docs/api-reference/text-to-speech/convert).
