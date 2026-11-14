# Connecting Old Brine to the game later

This branch stages a working narration prototype under `design/narration/` and a stock script bank under `content/narration/`. It does not change or import the live app, game rules, or server. The prototype lives here to respect repository ownership while the engineering branch continues. The server owner should move and adapt the modules into `server/` when integration is agreed; the mobile owner should add playback and event wiring.

## What is implemented

`engine.mjs` validates structured events, chooses a stable stock-line variant from each event ID, and composes an individual line or a paginated recap. The default optional writer is local Ollama; Claude is a legacy option that requires explicit `NARRATION_WRITER=claude` selection and credentials. `providers.mjs` can send the completed script to ElevenLabs for MP3 synthesis when speech is requested. Only event categories go to the selected writer. Names, amounts, and outcomes are inserted from validated event facts into stock sentences afterward. The writer never decides rewards or changes game state.

The unique AI wording is deliberately limited to the lead-in. Instructions and character validation reduce unwanted output, but cannot prove its meaning; audition generated lines before a public demo. Exact factual event sentences remain in the script even when the writer fails. Stock and AI results identify their source, and provider failures fall back to readable stock text.

The HTTP/CLI sandbox accepts example event facts for auditioning. Its local trust boundary is not a production API contract. Movement, pickup, boss, and arrival examples are fictional fixtures, not events read from the running game. The current engineering baseline has pure island/combat rules, Mongo-persisted islands and explorers, authenticated island and fight routes in `server/src/island.ts`, and mobile board, fight, and log screens. This branch does not connect its narration or subtitles to those routes or screens yet.

## Server wiring

Adapt the prototype behind the existing JWT middleware and enforce current crew membership on every narration, audio, and acknowledgement request. In the deployed app, accept authorized event IDs or a recap cursor from the client; fetch the corresponding facts on the server. Do not accept client-provided rewards, outcomes, actor names, crew IDs, or arbitrary narration scripts as authoritative facts.

Create a durable typed narration-event collection with an immutable event ID, server-assigned ordering timestamp, event type, validated facts, actor/user scope, and crew scope. Couple event creation to the successful game action using a transaction or an idempotent outbox. A retry must not add another copy. Do not reconstruct historical outcomes from the user's current totals.

| Existing path | Hook to add after the authoritative action succeeds |
| --- | --- |
| `POST /activities` | Persist `activity_logged` with the actual returned grant, including capped or zero rewards. Never recalculate from the activity's usual reward. |
| `POST /crews` and `POST /crews/join` | Persist an appropriately scoped `crew_joined` event once membership is committed. |
| Streak folding in `server/src/moves.ts` | Persist milestones and resets once, with an idempotency key such as user, local day, and streak-event type. Repeated calls to `todayMoves` must not duplicate narration. |
| `PUT /moves/today` | This updates device aggregates and returns today's Moves. Emit only newly committed, meaningful milestones; do not narrate every aggregate upload. |
| `POST /moves/spend` | This generic endpoint spends Moves without identifying a destination. It cannot provide destination facts for movement narration. |
| `POST /island/move` | After the Moves charge, loot handling, island save, and explorer save succeed, persist movement/pickup outcomes from the actual response and committed state. The response supplies `events`, `spent`, `explorer`, revealed tiles, and `movesRemaining`. |
| `POST /island/fight` | After the action, inventory use, fight/explorer save, and any victory settlement succeed, persist relevant fight events. The response supplies `events`, updated boss state, explorer state, and remaining Moves. |
| `POST /crew/advance-night` | Persist typed chaos/disaster or island-arrival facts after the nightly board changes or next-island creation commit. The handler currently logs a human-readable night/voyage entry; its response does not retain detailed disaster/spawn events. |

For a successful `moveTo`, use the returned `explorer.pos` to select the actual final terrain from the returned island. Do not use the `moved.to` event as proof the target was reached: that event is created before path traversal, and a hazard can wash the explorer overboard and stop the journey early. Use the authoritative resource ledger for the remaining Moves after all costs and overboard rules resolve. If a later respawn is applied, narrate that final committed outcome rather than a planned destination.

Map committed engine outcomes into narration facts as follows:

| Engine outcome | Narration mapping |
| --- | --- |
| `IslandEvent` with `type: 'found'` | Emit `item_found` using the persisted actor and the found item's validated display label. A spawned item is not yet a pickup. |
| `applyDisaster(island, kind, rng)` with returned `hurricane` or `eruption` event | Emit `chaos` with `disaster: kind` and a server-resolved island display label after the changed board is saved. Retain the typed outcome inside the existing advance-night handler rather than parsing its log prose. Do not invent damage or player losses. |
| `FightEvent` with `type: 'boss_defeated'` | Emit `boss_victory` using the persisted finisher identity, boss name/title, and server-resolved island display label after the victory is committed. The current handler marks conquest and grants participant/finisher Legend; speak reward amounts only if the narration contract includes those actual settled amounts. |

The narration bank has no dedicated hazard or washed-overboard line yet. Add and validate those event contracts before announcing those outcomes; never disguise an interrupted journey as a successful arrival.

The existing `GET /log` returns the newest 100 scoped ledger records as `id`, `text`, `item`, `delta`, `reason`, and `at`. Activity logging still writes a Supplies ledger entry only when its grant is positive. Island handlers now also log material loot, knockouts, conquests, night chaos, and sailing. This is useful readable history, but not a complete typed narration feed: ordinary movement, individual combat actions, gear pickups, crew joins, and streak changes are not all retained there. It has no durable unread cursor. Use durable typed events for complete recaps rather than treating this endpoint as a full history of the voyage.

The existing middleware authenticates `/island`, `/island/*`, `/crew`, and `/crew/*`, and the island handlers require the user's current crew. New narration routes must apply equivalent checks and filter both user-private and crew-visible events appropriately. An event ID or audio URL by itself must not grant another crew access.

## Recaps and unread progress

Keep a separate acknowledged cursor for each user and applicable crew scope. Opening the app, generating text, and generating audio must not mark events as heard. Acknowledge only after playback completes, or after the player explicitly marks the transcript as read. Pausing or a failed download should leave the batch available.

The prototype orders events by UTC `at`, then by stable `id`, and uses an exclusive `{ at, id }` cursor. The ID tie-breaker prevents two events sharing a timestamp from being skipped. Capture `until` once for the recap session, and reuse that snapshot bound on subsequent pages so new arrivals do not continually move the finish line.

Each prototype recap request accepts at most 100 candidate events and returns up to eight events. `nextCursor` points only to the last returned event; `hasMore` signals another page. Continue from the acknowledged `nextCursor` until the snapshot is consumed. Do not advance straight to `until`, discard excess events, or silently slice a larger history to its latest 100 entries. The production server must query and paginate the durable history itself. Ensure insertion ordering and snapshot consistency account for concurrent commits; a server-managed monotonic sequence is another option when adapting this contract.

Store or sign each issued batch on the server so an acknowledgement can advance only through events actually issued to that user. Keep acknowledgement updates monotonic and idempotent. A crash between generation and playback should replay an available batch rather than erase it.

## Mobile playback

Before voice integration, the sandbox can display timed subtitles and export SRT/VTT without calling ElevenLabs. These cue times are estimated from reading speed, not aligned to speech. Subtitle playback or export does not acknowledge real game events. Preserve an explicit read action when wiring subtitles to the app, and add its durable acknowledgement only through the authenticated backend.

When speech is added, use ElevenLabs character timestamps from its [speech-with-timing endpoint](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps) to build audio-aligned subtitle cues. Estimated subtitle times must remain visibly identified as estimates until replaced with real alignment; drive aligned cues from the audio player's current position, rather than a separate wall-clock timer.

`expo-audio` is not installed in the current mobile package. The mobile owner should read the [Expo SDK 58 audio documentation](https://docs.expo.dev/versions/v58.0.0/sdk/audio/) and install the compatible package from `apps/mobile` with `npx expo install expo-audio`. The documentation was checked for SDK 58; no mobile audio code or dependency change is included here.

The latest mobile app already has an island board, a fight screen, a Log tab, and transient human-readable action lines in `apps/mobile/src/state/island.ts`. Those response handlers are future live subtitle/narration hook points; their in-memory action feed is not durable unread history. Expose a transcript alongside Play/Pause, Replay, and Mute. Keep narration optional and preserve the transcript when audio is unavailable. Use one player and a bounded priority queue: milestone, arrival, chaos, and boss moments should take precedence; collapse repeated low-priority movement announcements. Avoid overlapping speech or an unbounded autoplay backlog. Stop or pause cleanly when the app leaves the foreground, according to the chosen product behavior, and release playback resources on unmount.

Fetch narration through the authenticated backend. Keep provider API keys on the server. Serve private crew audio through authorized routes or short-lived scoped URLs. Protect generated scripts and cached audio with the same visibility rules as their source events. The current single-process cache and in-flight deduplication are useful for auditions; multiple server instances need shared deduplication and storage, retention limits, and per-user spending/rate limits before public use.

## Voice and writing choices

ElevenLabs supplies the voice; the game supplies the facts; the optional local Ollama writer supplies a small amount of original personality. Selecting AI wording defaults to local generation and does not require Claude tokens. Keep Claude behind explicit `NARRATION_WRITER=claude` opt-in if retaining that legacy adapter. Select a voice available to the project's ElevenLabs account, audition the same script across models, and keep one consistent Old Brine identity. The prototype supports `eleven_flash_v2_5`, `eleven_multilingual_v2`, and `eleven_v3`; its default is Flash v2.5. See the official [speech endpoint](https://elevenlabs.io/docs/api-reference/text-to-speech/convert) and [voice listing endpoint](https://elevenlabs.io/docs/api-reference/voices/search) for the request contracts. The model allowlist can be extended by engineering after checking compatibility.

Keep face photos, private journal text, calendar descriptions, raw screen data, and credentials out of narration inputs. Player and crew names in the final script are sent to the speech provider when speech is generated; use display aliases if needed. Follow [Old Brine's voice direction](../../content/narration/VOICE_DIRECTION.md) when expanding the stock bank or prompts.

## Future interactive dungeon master

Voice negotiation is a separate feature, not implemented by this narration sandbox. A future ElevenLabs Agent could call a server tool such as `negotiate_quest({ questId, availableMinutes, requestedDifficulty })`. The authenticated server must verify quest ownership or crew membership, validate allowed difficulty and duration, apply game rules, and commit the accepted change. Return the actual updated quest to both the agent and the screen. The voice must describe success only after that response confirms it.

The official [ElevenLabs webhook-tool documentation](https://elevenlabs.io/docs/eleven-agents/customization/tools/webhook-tools) describes connecting an agent to external APIs. Add this after a real quest model and update endpoint exist; a spoken promise alone cannot update a quest.
