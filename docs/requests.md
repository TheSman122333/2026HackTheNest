# Requests from engineering (Claude) to design (Codex)

Format: `- [ ] <request> — why`

- [ ] Mobile dependencies: add `expo-auth-session` (`~58.0.18`), `expo-crypto` (`~58.0.8`), and `expo-web-browser` (`~58.0.8`) with `npx expo install expo-auth-session expo-crypto expo-web-browser` — use the SDK 58 browser OAuth/PKCE flow for SSOJet and return through the app deep link; `expo-linking` is already installed.
- [ ] Mobile dependency: add `expo-audio` (`~58.0.12`) with `npx expo install expo-audio` — SDK 58's supported Expo package provides foreground push-to-talk recording and playback for ElevenLabs speech and sound cues; do not add `expo-av`.
- [ ] Mobile dependency: add `expo-file-system` (`~58.0.13`) with `npx expo install expo-file-system` — read the short foreground recording for the authenticated voice-turn upload and clean up its temporary cache file after the request.
- [ ] Server dependencies: no new npm packages for the first integration — Node's built-in `fetch` can call SSOJet, OpenAI, Exa, and ElevenLabs; existing `jose` and `zod` cover JWT verification and request/response validation.
- [ ] Server environment: configure `SSOJET_ISSUER`, `SSOJET_CLIENT_ID`, `SSOJET_CLIENT_SECRET`, `SSOJET_AUDIENCE`, and `SSOJET_REDIRECT_URI` — needed to exchange the OAuth authorization code and verify the returned identity; obtain issuer/discovery values from the project's SSOJet tenant, never from client input.
- [ ] Server environment: configure `OPENAI_API_KEY` and `OPENAI_MODEL` — the Game Master uses OpenAI to select a structured, allowlisted event from the live game context and Exa results.
- [ ] Server environment: configure `EXA_API_KEY` — the Game Master searches current, attributable web sources for biome- and streak-relevant context.
- [ ] Server environment: configure `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` — the authenticated voice-turn service uses ElevenLabs speech-to-text for uploaded turns and text-to-speech for Tidekeeper replies; keep both values on the server.
- [ ] App configuration: add the `expo-audio` config plugin with a clear microphone permission message and foreground-only recording, and configure the registered SSOJet redirect scheme — voice is user-initiated; do not enable background recording or always-on listening.

Store server values only in the server's ignored local environment or deployment secret store. Never add provider keys to `EXPO_PUBLIC_*`, app config, source control, or the mobile bundle. `EXPO_PUBLIC_API_URL` is an existing mobile setting, not a provider secret.

## Personalized quests and crew invitations

- [ ] Server environment: configure `GEMINI_API_KEY` in the ignored `server/.env` or deployment secret store. Optionally set `GEMINI_QUEST_MODEL` to a supported Gemini text model. The quest writer calls Gemini on the server; no key belongs in the mobile build. Without a working key, players receive clearly labeled suggestions based on their questionnaire answers.
- [ ] Public app configuration: set `EXPO_PUBLIC_APP_URL` to the deployed HTTPS app origin for native QR invitations, for example `https://your-voyage-app.example`. Web invitations use the current app origin. Without a public origin, native invitations use the installed app's `lastvoyage://join` deep link.
- [ ] SSOJet deployment configuration: keep the existing server tenant/client secret settings and mobile public issuer/client ID configured. Register the exact web `/auth/callback` URL and the native server `/auth/ssojet/callback` bridge URL with SSOJet. Crew codes are preserved separately from OAuth state while friends sign in and answer the preference questions.

No additional npm dependencies are required for the questionnaire, Gemini quest generation, or local QR rendering.

- [ ] Server audio: configure `ELEVENLABS_API_KEY` with Sound Effects and Music access for the cached game soundtrack. The Tidekeeper speaks with the custom captain voice in `ELEVENLABS_VOICE_ID` (`ELEVENLABS_NARRATOR_VOICE_ID` overrides it; a neutral stock voice is used only when neither is set). Keys stay on the server.

