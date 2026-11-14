# Three-track integration plan

Status: planning spec only. Do not treat this document as permission to edit game/app code or add dependencies before the requests in [requests.md](./requests.md) are approved.

## Storyline and core loop

**The Tidekeeper** is the ship's speaking figurehead: a persistent guide that knows the crew's shared voyage and each player's personal progress. It briefs the crew when they return, answers questions about the live board, and carries out only explicit, validated commands. It does not award Moves or invent progress.

1. **Sign in and return to the voyage.** SSOJet authenticates a person; the server resolves that stable identity to the existing player record, crew, active island, explorer, Moves, and streak. The Tidekeeper gives a short, stateful briefing.
2. **Live life fills the sails.** Activity logs use `grantForActivity` in `packages/game/src/activities.ts`; steps and activity rewards feed `dailyMoves` in `packages/game/src/moves.ts`; the completed day is folded by `packages/game/src/streaks.ts`. The briefing explains the player's Moves and Calm Seas / Shore Leave bonus. Tracking gaps remain neutral.
3. **Explore the crew's hex island.** The player spends earned Moves through the existing movement rules in `packages/game/src/island.ts`: reveal fog, collect loot, and face hazards. Voice questions read the same server-computed state as the board UI; spoken move commands use the same validated move path.
4. **Fight the shared guardian.** A spoken Strike, Cannon, Tonic, or Brace uses the action rules in `packages/game/src/combat.ts`, costs a Move, and updates the crew-persistent boss fight. Typed game events drive both the visual feed and sound cue.
5. **The Game Master makes the world react.** Once per crew/island/day, an authenticated server-side agent reads the live island, relevant aggregate streak context, and recent game events. Exa supplies current sources; OpenAI selects a brief narrative and one permitted effect. The first demo effect is a helpful item appearing on an eligible, already revealed, empty tile. The event is persisted and audited.
6. **The Tidekeeper speaks the result.** ElevenLabs returns the voice response; `expo-audio` records only while the player holds the talk control and plays the response and event SFX. The player can ask a follow-up or continue playing. The app never listens in the background.

The current [docs/GAME.md](./GAME.md) calls the planned narrator Old Brine. This spec uses the requested name Tidekeeper; choose one canonical name before shipping UI copy.

## Sponsor track alignment and guardrails

| Track | Product moment that demonstrates fit | Required behavior and guardrails |
| --- | --- | --- |
| **Best Use of SSOJet** | A returning player signs in and lands in their actual crew voyage, not a blank login or newly created profile. | Exchange a provider authorization code server-side; validate the issuer, audience, signature, and expiry; identify by verified stable `sub` (`ssojetSub`). Mint the existing app JWT for the matched Mongo user. Resume `crewId`, crew island/fight, that user's explorer, and their streak/day totals. Never merge accounts based only on a matching email or accept a client-supplied subject. |
| **Future of Intelligence — OpenAI + Exa** | Without a player asking for a chat response, the daily Game Master searches live sources relevant to the island and creates a real, visible change on the shared board. | Build context from server state, not client-supplied state. Exa returns source records; OpenAI may return only schema-validated narration plus an allowlisted effect. The server chooses/validates the tile and applies the mutation, then records event ID, source URLs, effect, and timestamp. No arbitrary Mongo patches, tool execution, invented citations, or repeated event on retries. |
| **Best Use of ElevenLabs** | The player hears the Tidekeeper's personalized briefing, asks a question or gives a board/combat command by voice, hears the result, and gets sound effects for game events. | Use a real conversational voice turn, not generated speech reading static documentation. The server brokers the agent; voice intent can only call existing game actions and must pass normal game validation. Provide visible push-to-talk, transcript/response, and a text fallback. Play SFX from typed server event keys; use a small pre-generated/cached set rather than generating a new effect on every tap. |

### Non-negotiable rules

- **Never punish life.** An AI event, voice command, or tracking outage cannot remove earned Moves, Supplies, items, Legend, streak shields, or progress. Missing tracking data stays neutral. Streak effects continue to use the rules in `packages/game/src/streaks.ts`.
- Keep device data minimal: the GM needs biome/theme, current island/fight state, and a streak category or aggregate; it does not need a player's name, email, raw activity details, raw screen data, or face photo. Never read other apps' content or send face photos to AI.
- Never put SSOJet, OpenAI, Exa, or ElevenLabs secrets in the mobile bundle. The app sends its app JWT to this server; provider access stays server-side.
- Exa content is untrusted input. Use it as attributed context, not instructions. Do not let a web page or model output expand the effect allowlist.
- A voice action is attributable to the authenticated player. Resolve ambiguity by asking a follow-up; do not guess a hex or spend a Move on a low-confidence transcription.
- Use an idempotency record/unique key for each crew + island + UTC day GM event. Persist the event and world mutation atomically where Mongo deployment supports transactions; otherwise use a recoverable event status and compare-and-set update so a retry cannot duplicate or lose the mutation.
- The game engine remains authoritative. AI does not directly set boss HP, fighter HP, streak state, inventory, Move totals, or crew stores. Quest persistence/endpoints do not exist yet; do not pretend a generated quest is a working quest system.

### Deliberately out of scope

Skip the journal-to-traits flow, life-event cards, ship-room upgrades, rival crews, monthly islands, QR invites, the Lodestar/year-end ceremony, a new quest engine, background/nightly scheduling, always-on microphone access, and iOS-specific work. These are unrelated to proving the three sponsor tracks in one stable demo. Keep IP genre-inspired and use only approved sprites.

## API and data contracts

These are **our app-server contracts**, not claims about the providers' wire formats. The server must adapt each provider's current API behind these routes. All responses are JSON; all routes except `POST /auth/ssojet` require `Authorization: Bearer <app-jwt>`. Validate bodies with Zod, cap request/audio sizes, and return explicit non-2xx errors for invalid state or provider failure.

### `POST /auth/ssojet`

Public route. The mobile app completes SSOJet's configured authorization-code flow and posts the callback code. The app validates OAuth `state`; the server enforces the configured redirect URI and performs the code exchange/identity verification. The server derives `ssojetSub` only from verified provider claims.

**Request**

```json
{
  "authorizationCode": "provider-issued-code",
  "codeVerifier": "pkce-verifier",
  "redirectUri": "lastvoyage://auth/callback",
  "tz": "America/Los_Angeles"
}
```

`redirectUri` must match the configured allowlist. `tz` is an IANA timezone; reject invalid values or use the existing documented UTC default. Do not accept `ssojetSub`, user ID, crew ID, skills, or streak from the request.

**Response: returning player**

```json
{
  "token": "app-jwt",
  "user": {
    "id": "mongo-user-id",
    "name": "Mara",
    "tz": "America/Los_Angeles",
    "crewId": "mongo-crew-id",
    "skills": { "grit": 10, "charm": 10, "lore": 10, "craft": 10, "seacraft": 10 },
    "supplies": 8,
    "legend": 3
  },
  "crew": {
    "id": "mongo-crew-id",
    "name": "The Far Lanterns",
    "stores": { "supplies": 24, "timber": 2 }
  },
  "island": {
    "id": "mongo-island-id",
    "index": 2,
    "theme": "spooky",
    "conquered": false,
    "explorer": {
      "pos": "1,-2",
      "hp": 30,
      "maxHp": 30,
      "inventory": { "tonic": 1 },
      "revealed": ["1,-2"]
    },
    "boss": { "key": "bog_lantern", "hp": 78, "maxHp": 110 },
    "moves": { "total": 9, "spent": 2, "remaining": 7 },
    "streak": {
      "calmDays": 4,
      "best": 6,
      "shields": 1,
      "shoreLeaveBonus": false
    }
  },
  "nextStep": "ship"
}
```

If the verified SSOJet subject has no user yet, create one once with the normal defaults; return `crew: null`, `island: null`, and `"nextStep": "crew_setup"`. A returning user with no crew also gets `nextStep: "crew_setup"`. For existing users, never replace their saved name, timezone, streak, crew, island, or explorer from provider profile data. This response is a compact bootstrap snapshot; subsequent refreshes use the existing `/me` and `/island` APIs and the normal fog-filtered island view.

### `POST /island/gm-event`

Authenticated route. The caller's user and crew are derived from the app JWT. The server loads the active island and current game context; no island, streak, or event effect is accepted from the client.

**Request**

```json
{
  "requestId": "8c2f2c6e-91ce-4d58-a4fd-7b35c578f212",
  "trigger": "daily_briefing"
}
```

`trigger` is `daily_briefing` or `advance_night`. Enforce one event per crew/island/UTC day regardless of `requestId`; request IDs are for tracing, not a way to bypass idempotency.

**Response: applied**

```json
{
  "requestId": "8c2f2c6e-91ce-4d58-a4fd-7b35c578f212",
  "status": "applied",
  "event": {
    "id": "crew-island-day-event-id",
    "narration": "A lantern-beetle drifts over the old stones. It leaves a tonic where the crew can see it.",
    "sources": [
      {
        "title": "Example field guide",
        "url": "https://example.org/field-guide",
        "publishedAt": "2026-10-12T00:00:00.000Z"
      }
    ],
    "effect": {
      "type": "spawn_item",
      "at": "2,-1",
      "item": "tonic"
    },
    "createdAt": "2026-11-14T20:00:00.000Z"
  },
  "island": {
    "id": "mongo-island-id",
    "changedTile": { "hex": "2,-1", "terrain": "ruins", "item": "tonic" }
  },
  "audit": {
    "id": "crew-island-day-event-id",
    "reason": "gm:event",
    "text": "The Tidekeeper placed a tonic on a revealed ruins tile."
  }
}
```

The internal model output is narrower than the response: `{ "narration": "string", "sourceIds": ["exa-result-id"], "effect": { "type": "spawn_item", "item": "tonic" } }`. The server verifies each source ID came from its Exa query, validates narration length and item enum, selects an empty passable **already revealed** tile, then writes the item and an auditable event record. Do not allow arbitrary coordinates or destructive effects. The response `status` is `applied`, `already_applied`, or `no_event`. For `already_applied`, return the original event, changed tile, and audit record unchanged. For `no_event`, return `event.effect: { "type": "none" }`, `island.changedTile: null`, and an audit record explaining that no safe effect was available.

**Response: safe no-op**

```json
{
  "requestId": "8c2f2c6e-91ce-4d58-a4fd-7b35c578f212",
  "status": "no_event",
  "event": {
    "id": "crew-island-day-event-id",
    "narration": "The old stones are quiet today. The Tidekeeper keeps watch.",
    "sources": [],
    "effect": { "type": "none" },
    "createdAt": "2026-11-14T20:00:00.000Z"
  },
  "island": { "id": "mongo-island-id", "changedTile": null },
  "audit": {
    "id": "crew-island-day-event-id",
    "reason": "gm:event",
    "text": "No safe world effect was applied."
  }
}
```

### `POST /island/voice-turn`

Authenticated route. The app records audio only during a visible, user-started push-to-talk action. For a briefing, omit `audio`; for a command, include a short audio clip. The server brokers transcription/agent turn with ElevenLabs, fetches current state itself, and dispatches any action only through the same move/fight validation and resource charging used by the game routes.

**Request: spoken command**

```json
{
  "requestId": "c86530fc-61ef-4f2e-8e11-6ead7a4be1d2",
  "mode": "command",
  "conversationId": "server-issued-opaque-id",
  "audio": {
    "mimeType": "audio/mp4",
    "base64": "base64-encoded-short-recording"
  }
}
```

**Request: login/return briefing**

```json
{
  "requestId": "771e8364-411e-4e8d-81cf-5185c39e12a6",
  "mode": "briefing",
  "conversationId": null
}
```

For the first command, `conversationId` may be omitted or `null`; later turns send the opaque ID returned by the server. Audio is limited to 15 seconds and 2 MiB decoded, and the app deletes the temporary recording after upload.

**Response**

```json
{
  "requestId": "c86530fc-61ef-4f2e-8e11-6ead7a4be1d2",
  "conversationId": "server-issued-opaque-id",
  "transcript": "Strike the bog lantern.",
  "reply": "A clean strike! Wispwick is weakening, but the lantern hits back.",
  "intent": { "type": "fight", "action": "strike" },
  "result": {
    "events": [
      { "type": "hit", "by": "mongo-user-id", "damage": 8, "crit": false, "weapon": "cutlass" },
      { "type": "boss_hit", "target": "mongo-user-id", "damage": 6, "enraged": false, "braced": false }
    ],
    "movesRemaining": 6,
    "playerHp": 24,
    "bossHp": 70
  },
  "audio": {
    "url": "/voice/audio/voice-turn-id",
    "expiresAt": "2026-11-14T20:47:00.000Z"
  },
  "sfxCueKeys": ["combat.strike", "combat.boss_hit"]
}
```

The intent is a tagged union: `{ "type": "briefing" }`, `{ "type": "question" }`, `{ "type": "island.move", "to": "2,-1" }`, or `{ "type": "fight", "action": "strike" }` (with the other `FightAction` values). For a question, `result` is `null` and state is read-only. For a briefing, `transcript` is `null`, `result` is `null`, and the reply summarizes crew/island/Moves/streak state. Supported mutation intents are limited to legal `island.move` and `fight` actions. If speech is ambiguous or an action is invalid/unaffordable, ask a follow-up or explain the game error; do not mutate state. The server issues the opaque `conversationId`, binds it to the authenticated user, and returns it for the next turn; reject IDs owned by another user. `audio.url` is an authenticated, short-lived server proxy URL, not a provider credential or permanent public URL. Cue keys are a closed enum, for example `island.move`, `island.loot_found`, `island.hazard`, `combat.strike`, `combat.cannon`, `combat.boss_hit`, `combat.boss_defeated`, `streak.calm_day`, `streak.shield_earned`, and `gm.event_applied`.

The JSON is our app contract. If the selected ElevenLabs conversational-agent transport requires WebSocket or a different media encoding, keep that provider-specific protocol behind the server/mobile adapter rather than exposing provider tokens or changing game mutation rules.

## File ownership and checklist

| File | Owner | Checklist |
| --- | --- | --- |
| `content/island-events.json` | Content teammates | Author a small, original, reviewed event set with biome tags, streak-category context, short voice-ready narration, source/query hints, and allowed effect IDs. No unlicensed myth text copied verbatim; source URLs are evidence, not content to reproduce. |
| `server/src/app.ts` | Server engineering | Add public `POST /auth/ssojet` before auth middleware; verify/exchange code and mint the normal app JWT. Register the authenticated island endpoints. Keep dev login behind its existing dev-only flag. |
| `server/src/island.ts` | Server engineering | Add GM and voice-turn routes using authenticated state. Keep effects allowlisted, dispatch movement/combat through existing rule paths, apply event mutations once, and return structured events for logging/audio. |
| `apps/mobile/src/app/welcome.tsx` | Mobile engineering | Start SSOJet sign-in, handle the configured callback/state safely, send only the authorization code/PKCE verifier to the server, store only the returned app JWT in SecureStore, then route to crew setup or the resumed ship/island. Never bundle provider secrets. |
| `apps/mobile/src/app/(tabs)/island.tsx` | Mobile engineering | Add visible hold-to-talk, permission/error states, transcript and response, audio playback, SFX cue playback, and a text fallback. Refresh from server after actions; do not mutate client game state optimistically as authoritative state. |
| `server/src/db.ts` | Server engineering; supporting change | `ssojetSub` and its unique sparse index already exist. Add the durable GM event/idempotency record and unique key/index required by the contract; use the existing ledger for the human-readable crew feed. Keep provider payloads/raw voice recordings out of persistent player data. |

### Ready-to-demo checklist

- [ ] SSOJet first sign-in creates one player; sign-out/sign-in returns the same Mongo user and app JWT subject.
- [ ] A returning player resumes the same crew, island, explorer position/inventory, boss HP, Moves, and streak; a player with no crew is routed to crew setup.
- [ ] GM event uses live Exa results, cites only returned sources, mutates one legal revealed tile, and writes one auditable record. Replaying the same crew/island/day request does not duplicate it.
- [ ] Exa/OpenAI outages return an explicit safe no-event/error result and never damage or erase game state.
- [ ] Voice briefing works on return; push-to-talk can ask a state question and issue a valid move/fight command. Invalid commands spend nothing.
- [ ] ElevenLabs audio and typed SFX cues play; mic capture stops on release, has a text fallback, and never runs in the background.
- [ ] No vendor secret is present in app code, Expo public config, committed environment files, or client responses.
- [ ] Update `docs/GAME.md` narrator naming/status only with the project lead's approval; keep story content and game rules consistent.
