# Mobile Integration Handoff: Three-Track Demo Slice

**Author:** Zayan (`@QMWN034`)
**Target Branch:** `feat/three-track-mobile` (already merged with `main` + `feat/three-track-backend`)
**Primary Spec Reference:** `docs/THREE_TRACK_INTEGRATION.md` & `docs/requests.md`

---

## 1. What Is Already Built & Verified (Backend & Content)

All server-side endpoints, database schemas, and event templates are implemented and passing `npm --prefix server run typecheck` and `npm --prefix server test` (9/9 passing):

* **`content/island-events.json`**: Curated biome/streak event templates, allowlisted tile/item mutations (strictly enforcing the "never punish life" rule), SFX cue keys (`discovery_chime`, `storm_warning`, `calm_waves`, `boss_drum`), and fallback Tidekeeper narration lines.
* **`server/src/ssojet.ts` & `server/src/app.ts` (`POST /auth/ssojet`)**: Verifies SSOJet OIDC tokens/codes, maps `ssojetSub` to persistent users in `server/src/db.ts`, and returns the app JWT alongside resumed `crew`, `island`, `explorer`, and `streak` state.
* **`server/src/gm.ts` & `server/src/island.ts` (`POST /island/gm-event`)**: Builds live context from the crew's island/biome/streak state, queries **Exa** for maritime/survival lore, uses **OpenAI** structured outputs to select an allowlisted tile/item mutation, applies it through server rules, and persists an auditable daily event log.
* **`server/src/voice.ts` & `server/src/app.ts` (`POST /island/voice-turn`)**: Handles both initial crew login briefings and push-to-talk player voice/text turns, resolves typed intents against live island state, and returns **ElevenLabs** narration audio + matching SFX cue keys (with graceful text fallbacks when keys are unset).

---

## 2. Remaining Work for Claude & Team Captain (`apps/mobile`)

To complete the end-to-end demo across **Best Use of SSOJet**, **Future of Intelligence (OpenAI + Exa)**, and **Best Use of ElevenLabs**, wire up the Expo frontend as follows:

### Step A: Install Expo SDK 58 Dependencies
Install the packages logged in `docs/requests.md` inside `apps/mobile` (leave the root `package-lock.json` clean unless updated by Expo):
```bash
npx expo install expo-audio expo-auth-session expo-web-browser expo-crypto expo-file-system
```

### Step B: API Client & Session State
* **`apps/mobile/src/lib/api.ts`**: Add typed client helpers matching the JSON contracts in `docs/THREE_TRACK_INTEGRATION.md` for:
  * `POST /auth/ssojet`
  * `POST /island/gm-event`
  * `POST /island/voice-turn`
* **`apps/mobile/src/state/session.ts` & `apps/mobile/src/state/island.ts`**: Store the resumed crew/island/streak payload returned after SSOJet sign-in and update local island state when GM events or voice commands mutate tiles.

### Step C: SSOJet Login Screen (`apps/mobile/src/app/welcome.tsx`)
* Replace the placeholder name-only login with an **SSOJet Sign-In** flow using `expo-auth-session` / `expo-web-browser` that exchanges the code/token via `POST /auth/ssojet`.
* Keep a secondary **"Dev Quick Join"** fallback button so local/offline demo testing still works if OAuth redirects are unavailable on venue Wi-Fi.

### Step D: In-Game Voice & World Event Controls (`apps/mobile/src/app/(tabs)/island.tsx`)
* **Login Briefing Playback**: Automatically fetch and play the Tidekeeper's state-aware crew recap (`POST /island/voice-turn` in briefing mode) when entering the island screen.
* **Push-to-Talk Tidekeeper Control**: Add an explicit **Hold-to-Speak / Push-to-Talk** button (never always-on listening) plus a quick text fallback input that sends audio/text to `POST /island/voice-turn`, plays the returned ElevenLabs audio, and triggers cached SFX cues on discoveries, hazards, and combat.
* **Live GM World Event Button**: Add a **"Trigger GM World Event"** action button calling `POST /island/gm-event` so judges can watch OpenAI + Exa search live lore and mutate a tile/item on the hex board in real time.

---

## 3. Environment Setup & Guardrails

* **Environment Variables**: Copy `server/.env.example` to `server/.env` and populate `SSOJET_*`, `OPENAI_API_KEY`, `EXA_API_KEY`, and `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID`. Keep all vendor secrets strictly on `server/`.
* **Scope Guardrails (Do Not Build)**: Per `docs/THREE_TRACK_INTEGRATION.md`, skip journal-to-traits, life-event cards, ship-room upgrades, rival crews, monthly islands, QR invites, Lodestar ceremony, and scheduled nightly cron jobs.
* **Verification Before Merge**: Run `npm --prefix apps/mobile run typecheck` (or `npx tsc --noEmit`) and `npm --prefix server test` before merging into `main`.
