# The Tidekeeper narration sandbox

A working, isolated prototype for The Last Voyage. The Expo app, Hono server, game rules, root config, dependencies and lockfile are untouched by this feature. All narration changes stay in `design/` and `content/`; engineering can integrate them later using [INTEGRATION.md](INTEGRATION.md).

Merged into `main` from `codex/narration`. Still a sandbox: nothing here is wired into the app or server yet.

## How it works

```text
Confirmed game event → validated facts → varied stock sentence ─┐
Event categories only → local Ollama → fresh lead-in ───────────┤
                                                              ↓
                                        transcript → estimated subtitles
                                                   → optional ElevenLabs → MP3
```

ElevenLabs speaks the script; it does not decide game outcomes. At the user's request, this branch uses **local Ollama by default** instead of the originally planned Claude writer. No Anthropic key is needed. `docs/GAME.md` is not modified. The narrator remains **the Tidekeeper**, and the game backend remains MongoDB.

Included:

- 33 original stock lines across introductions, activities, movement, pickups, chaos, bosses, streaks, crew joins, arrivals and empty recaps.
- Stable variation by event ID. Different events can select different lines; replaying one event preserves its line.
- Optional fresh local AI lead-ins, with exact factual sentences preserved afterward. Only event categories go to Ollama, not player names or private journal data. Claude is a legacy explicit opt-in only.
- Chronological return recaps, timestamp/ID cursors, eight-event pages, and a fixed snapshot bound. No database cursor is changed by this tool.
- Real ElevenLabs REST integration, voice listing, configurable model, MP3 caching and in-process duplicate-request suppression.
- CLI and local browser audition tool with editable event fixtures, transcripts, silent subtitle playback, scrubbing, SRT/VTT export, and optional audio playback.
- Offline tests using mocked providers. No npm dependencies are needed for the sandbox.

AI adds personality to the opening rather than rewriting the factual body. The generated lead-in still needs review for meaning and tone; length/markup validation cannot prove that AI prose is accurate. See [VOICE_DIRECTION.md](../../content/narration/VOICE_DIRECTION.md).

## 1. Try it without API keys

PowerShell, using the installed Node 22+:

```powershell
cd design\narration
node cli.mjs preview activity
node cli.mjs preview recap
node server.mjs
```

Open **http://127.0.0.1:8790**. Choose a scene and click **Write subtitles**, then **Play subtitles**. Local AI is selected by default; start Ollama with `qwen3:4b` installed. Uncheck the AI box for instant stock narration. Text and subtitle export need no ElevenLabs key. Ctrl+C stops the server. This loopback-only tool is for this computer; it is not a deployed game API.

The silent preview uses estimated reading times, not audio-synchronized captions. It has Play/Pause, Restart, a position slider, and SRT/VTT downloads. Full text stays visible for reading at your own pace. It pauses when the tab is hidden.

CLI subtitle export:

```powershell
node cli.mjs subtitles recap
node cli.mjs subtitles recap --ai --format=vtt
New-Item -ItemType Directory -Force output | Out-Null
node cli.mjs subtitles recap --ai | Set-Content -Encoding utf8 output/recap.srt
```

Timings should later be replaced with ElevenLabs character alignment when voice generation is enabled. The current plain MP3 speech adapter does not return alignment. See [INTEGRATION.md](INTEGRATION.md).

## 2. Choose the Tidekeeper's voice

In your ElevenLabs account, audition voices in the voice library or design an original voice. Aim for a warm, weathered storyteller with clear diction, dry humor, and an occasional smile. Save a voice that your account can use. You do not need to train or clone a model for narration.

Create an API key with Text to Speech permission and voice-read permission for the listing command. Set a spending/credit limit in the provider dashboard. Copy the template:

```powershell
Copy-Item config.example .env
```

Edit the ignored `.env` locally:

```dotenv
ELEVENLABS_API_KEY=your_key_here
ELEVENLABS_VOICE_ID=your_saved_voice_id
ELEVENLABS_MODEL_ID=eleven_flash_v2_5
```

To find IDs through the API:

```powershell
node --env-file-if-exists=.env cli.mjs voices
```

The implementation uses the official [voice listing endpoint](https://elevenlabs.io/docs/api-reference/voices/search) and [text-to-speech endpoint](https://elevenlabs.io/docs/api-reference/text-to-speech/convert). Keys stay in the local Node process. Do not put them in mobile code or `EXPO_PUBLIC_` variables.

## 3. Generate and hear speech

```powershell
node --env-file-if-exists=.env server.mjs
```

In the preview, write subtitles, review the transcript, click **Generate voice**, then press Play. Nothing autoplays. Generation can use provider credits; cached replay uses the existing MP3.

CLI alternative:

```powershell
node --env-file-if-exists=.env cli.mjs speak activity
node --env-file-if-exists=.env cli.mjs speak recap
```

The CLI prints the generated file's full path under `.cache/`. Open that MP3 in your usual player. The cache is ignored by Git. Text, model, voice, voice settings and the stock-bank version participate in cache keys. Editing a stock line invalidates old entries automatically.

The default is **Flash v2.5** for frequent short action clips. Try **`eleven_v3`** for dramatic introductions and victories, or **`eleven_multilingual_v2`** for longer recaps, using the same sample script to compare. Those are the prototype's supported models; check current [ElevenLabs model guidance](https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech) before expanding the allowlist. These are starting choices, not a measured latency or quality guarantee for your selected voice.

## 4. Add fresh AI wording with your local model

Ollama is now the default writer. With your installed model running, no API key or `.env` is required. To select another downloaded model, set these in `.env`:

```dotenv
NARRATION_WRITER=ollama
OLLAMA_MODEL=qwen3:4b
```

The writer calls only `http://127.0.0.1:11434/api/chat`, disables thinking output for this short writing task, and has a bounded timeout. This is your computer's Ollama, not on-device inference inside the mobile app. See the official [Ollama chat API](https://docs.ollama.com/api/chat).

Restart the preview and select **Add a fresh local Ollama lead-in**, or:

```powershell
node --env-file-if-exists=.env cli.mjs preview recap --ai
node --env-file-if-exists=.env cli.mjs speak recap --ai
```

The first command generates text/subtitles only; the second also generates paid speech. Identical event batches reuse the written script. New event IDs/batches can produce fresh wording. An unavailable local model, timeout, or invalid output falls back to stock narration. Speech failures keep the transcript available and do not automatically retry a potentially billed request.

`NARRATION_WRITER=stock` disables model calls. The legacy Claude adapter runs only with explicit `NARRATION_WRITER=claude` plus `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`; existing Anthropic keys alone never enable it. Cache keys separate writer providers and model IDs.

## 5. Customize lines and events

Edit [old-brine.json](../../content/narration/old-brine.json) to add stock variants. Keep placeholders unchanged. The engine uses actual event rewards, including zero rewards from daily caps. It never awards points or changes state.

For your own event, save JSON such as:

```json
{
  "mode": "event",
  "event": {
    "id": "my-activity-42",
    "type": "activity_logged",
    "at": "2026-11-14T19:00:00.000Z",
    "facts": {
      "actor": "Captain Ash",
      "activity": "read",
      "supplies": 2,
      "moves": 1,
      "legend": 1
    }
  }
}
```

```powershell
node cli.mjs preview my-event.json
node --env-file-if-exists=.env cli.mjs speak my-event.json --ai
node cli.mjs types
```

Use `ai: true` in JSON or pass `--ai`. Extra fields, unknown event types, missing facts, invalid dates, negative amounts and speech markup in names are rejected. All facts in this sandbox are fixtures supplied by you; the production version must load them from authorized backend events.

For a longer fully AI-written intro, write/review a plain text file using your preferred writing tool, then synthesize it directly:

```powershell
node --env-file-if-exists=.env cli.mjs say my-script.txt
```

This path reads your text exactly (up to 4,000 characters), so it can also handle model-specific delivery tags you deliberately include. It bypasses the event-fact composition. Pre-generate introductions and reusable announcements this way before the demo. Generated MP3s remain local until you intentionally add an asset/integrate them.

## 6. Verify and hand off

From the worktree root:

```powershell
node --test design/narration/narration.test.mjs design/narration/server.test.mjs design/narration/subtitles.test.mjs design/narration/ollama.test.mjs
npm run check
```

The first command is standalone with mocked providers and no external requests. The second is the repository's existing gate and needs its normal workspace dependencies installed. Local Ollama can be smoke-tested separately. No paid speech or music generation is performed by the subtitle workflow; audition the voice later when you enable your keys.

Read [INTEGRATION.md](INTEGRATION.md) for the exact backend/mobile hooks. The existing ledger is incomplete for full recaps, and `expo-audio` is not installed. Engineering still needs to add durable events, authenticated narration/audio routes, playback and explicit unread acknowledgements. Future spoken quest negotiation needs an ElevenLabs Agent plus a real authenticated quest-update tool; this prototype does not implement conversational voice or change quests.

## Situational music later

ElevenLabs has a separate Music API. [MUSIC.md](MUSIC.md) describes the proposed cached soundtrack and links seven original instrumental briefs in [music-cues.json](../../content/narration/music-cues.json). No music is generated by this sandbox. Generate and audition tracks first, then switch/crossfade the saved cues when the situation changes rather than generating a new song on each action.
